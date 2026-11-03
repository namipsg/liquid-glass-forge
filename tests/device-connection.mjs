// Private connection repair. No renderer, page content, navigation or benchmark
// behavior changes. Only pre-existing uninitialized blank pages are skipped.
export function filteredTransport(socket, { timeoutMs = 5000 } = {}) {
  const internalBase = 1_000_000_000, pending = new Map(), excludedTargets = new Set(), excludedSessions = new Set();
  let nextId = internalBase, closed = false, initialized = false;
  const metadata = { excludedExistingEmptyPages: 0, resumed: 0, detached: 0, failures: [] };
  const transport = {
    onmessage: undefined, onclose: undefined, metadata,
    send(message) {
      if (closed) throw new Error('Device transport closed');
      if (message.id >= internalBase) throw new Error('Protocol request ID overlaps private range');
      socket.send(JSON.stringify(message));
    },
    close() {
      if (closed) return; closed = true;
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Device transport closed')); }
      pending.clear(); socket.close(); transport.onclose?.();
    },
    async initialize() {
      if (initialized) throw new Error('Target inventory already consumed');
      initialized = true;
      const { targetInfos } = await internal('Target.getTargets');
      for (const t of targetInfos) if (t.type === 'page' && (t.url === '' || t.url === ':')) excludedTargets.add(t.targetId);
      metadata.excludedExistingEmptyPages = excludedTargets.size;
    }
  };
  function internal(method, params, sessionId) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(new Error('Device transport closed')); return; }
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' deadline exceeded')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params, sessionId })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  socket.onmessage = event => {
    const message = JSON.parse(event.data), own = pending.get(message.id);
    if (own) {
      clearTimeout(own.timer); pending.delete(message.id);
      if (message.error) own.reject(new Error('Private CDP command failed: ' + message.error.code)); else own.resolve(message.result);
      return;
    }
    if (message.id >= internalBase || excludedSessions.has(message.sessionId)) return;
    if (message.method === 'Target.attachedToTarget' && excludedTargets.has(message.params.targetInfo.targetId)) {
      const { sessionId, waitingForDebugger } = message.params;
      excludedSessions.add(sessionId);
      void (async () => {
        if (waitingForDebugger) { await internal('Runtime.runIfWaitingForDebugger', {}, sessionId); metadata.resumed++; }
        await internal('Target.detachFromTarget', { sessionId }); metadata.detached++;
      })().catch(() => { metadata.failures.push('Excluded session cleanup failed'); transport.close(); });
      return;
    }
    if (message.method === 'Target.detachedFromTarget' && excludedSessions.has(message.params.sessionId)) return;
    transport.onmessage?.(message);
  };
  socket.onclose = () => transport.close();
  socket.onerror = () => { metadata.failures.push('Device socket failed'); transport.close(); };
  return transport;
}

export async function openDeviceTransport(endpoint) {
  const response = await fetch(new URL('/json/version', endpoint), { signal: AbortSignal.timeout(5000) });
  const info = await response.json();
  if (!response.ok || typeof info.webSocketDebuggerUrl !== 'string') throw new Error('Invalid CDP endpoint');
  const socket = new WebSocket(info.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Device WebSocket open deadline')), 5000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Device WebSocket open failed')); };
    });
    const transport = filteredTransport(socket);
    try { await transport.initialize(); return transport; }
    catch (error) { transport.close(); throw error; }
  } catch (error) { socket.close(); throw error; }
}

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { open } from 'node:fs/promises';

/** Native WebDriver only. Never enable automation or change Safari settings. */
export async function safariSession(capabilities, logFile) {
  const reserve = createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port; await new Promise(r => reserve.close(r));
  const log = await open(logFile, 'w'), driver = spawn('/usr/bin/safaridriver', ['-p', String(port)], { stdio: ['ignore', log.fd, log.fd] });
  let session, closed = false;
  async function request(route, method = 'GET', body) {
    const response = await fetch('http://127.0.0.1:' + port + route, { method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
    const value = (await response.json()).value;
    if (!response.ok || value?.error) throw Error(value?.error + ': ' + value?.message);
    return value;
  }
  async function close() {
    if (closed) return; closed = true;
    try { if (session) await request('/session/' + session, 'DELETE'); }
    finally { driver.kill('SIGTERM'); await log.close(); }
  }
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) { try { await request('/status'); ready = true; break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    if (!ready) throw Error('Owned Safari driver did not become ready');
    const created = await request('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'safari', ...capabilities } } });
    session = created.sessionId; await request('/session/' + session + '/timeouts', 'POST', { script: 30000, pageLoad: 30000 });
    return { capabilities: created.capabilities, close,
      navigate: url => request('/session/' + session + '/url', 'POST', { url }),
      async evaluate(script) {
        const out = await request('/session/' + session + '/execute/async', 'POST', { script: 'const done=arguments[arguments.length-1];Promise.resolve().then(async()=>{' + script + '}).then(value=>done({value}),error=>done({error:String(error.stack||error)}));', args: [] });
        if (out.error) throw Error(out.error); return out.value;
      },
      screenshot: () => request('/session/' + session + '/screenshot'),
      async fill(selector,text) { const element=await request('/session/'+session+'/element','POST',{using:'css selector',value:selector});return request('/session/'+session+'/element/'+element['element-6066-11e4-a52e-4f735466cecf']+'/value','POST',{text}); },
      async click(selector) { const element=await request('/session/'+session+'/element','POST',{using:'css selector',value:selector});return request('/session/'+session+'/element/'+element['element-6066-11e4-a52e-4f735466cecf']+'/click','POST',{}); },
    };
  } catch (error) { await close(); throw error; }
}

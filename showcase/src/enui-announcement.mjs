import { attachOptics } from './example-optics.mjs';

export function mountEnuiAnnouncement({ localCandidate }) {
  const root = document.querySelector('#enui-preview');
  if (!root) return { dispose() {} };

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const controller = new AbortController();
  let layer, mounting = false, visible = false, disposed = false, error;

  const backdrop = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  backdrop.addColorStop(0, '#e4eef5');
  backdrop.addColorStop(.5, '#a7c0d1');
  backdrop.addColorStop(1, '#6c91ab');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f7fbff88';
  ctx.font = '750 365px system-ui';
  ctx.fillText('N', canvas.width * .16, canvas.height * .08 + 350);
  ctx.strokeStyle = '#f5faff44';
  for (let i = 0; i < 11; i++) {
    ctx.beginPath();
    ctx.moveTo(-40, 260 + i * 13);
    ctx.bezierCurveTo(150, 120 + i * 12, 300, 480 + i * 5, canvas.width + 60, 300 + i * 9);
    ctx.stroke();
  }

  async function mount() {
    if (disposed || mounting || layer) return;
    mounting = true;
    try {
      const mounted = await attachOptics(root, canvas, {
        signal: controller.signal,
        localCandidate,
        onError: reason => { error = String(reason); },
      });
      if (disposed) {
        mounted.dispose();
        return;
      }
      layer = mounted;
      if (!visible) layer.pause();
    } catch (reason) {
      if (!disposed) error = String(reason);
    } finally {
      mounting = false;
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      void mount();
      layer?.resume();
    } else {
      layer?.pause();
    }
  }, { threshold: .1 });
  observer.observe(root);

  const api = {
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      observer.disconnect();
      layer?.dispose();
    },
    get diagnostics() {
      return { palette: 'sierra', visible, mounting, disposed, error, layer: layer?.diagnostics ?? null };
    },
  };
  window.lgfEnui = api;
  return api;
}

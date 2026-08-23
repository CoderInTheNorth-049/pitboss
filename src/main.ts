import { Game } from './core/game';

function surfaceError(message: string): void {
  console.error('[PITBOSS]', message);
  let el = document.getElementById('boot-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'boot-error';
    el.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:99;max-width:70vw;' +
      'background:#2a0e14;color:#ff8a9a;border:1px solid #ff3355;padding:8px 12px;' +
      'font:12px/1.5 monospace;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent = message.slice(0, 300);
}

window.addEventListener('error', e => surfaceError(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', e => surfaceError(`Rejected: ${String(e.reason)}`));

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
void new Game(canvas).init();

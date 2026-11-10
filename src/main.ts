import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/base.css';
import { Game } from './game/Game';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const ui = document.getElementById('ui')!;
if (!webglAvailable()) {
  ui.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;pointer-events:auto">
    <div><h1 style="font-family:var(--display)">WebGL 2 is not available</h1>
    <p style="color:var(--muted)">Ejected Cube needs a browser with WebGL 2 and hardware acceleration turned on.</p></div></div>`;
} else {
  const game = new Game(document.getElementById('scene') as HTMLCanvasElement);
  void game.boot();
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
}

// Offline support in production builds only (dev uses hot reload).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode is optional */
    });
  });
}

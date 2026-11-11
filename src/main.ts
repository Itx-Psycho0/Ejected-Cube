import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/nunito-sans';
import '@fontsource-variable/sora';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/big-shoulders-display/wght';
// Only the Latin subsets are bundled; the game's text is English.
import '@fontsource-variable/josefin-sans';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/architects-daughter/latin-400.css';
import '@fontsource/m-plus-rounded-1c/latin-500.css';
import '@fontsource/m-plus-rounded-1c/latin-800.css';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/shippori-mincho/latin-500.css';
import '@fontsource/shippori-mincho/latin-800.css';
import './styles/base.css';
import { Game } from './game/Game';

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
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
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = game;
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode is optional */
    });
  });
}

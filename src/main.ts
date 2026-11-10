import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/base.css';
import { Scene } from 'three';
import { Renderer } from './core/Renderer';
import { QUALITY, detectQuality } from './core/Quality';
import { Loop } from './core/Loop';
import { ZONES } from './game/zones';
import { Atmosphere } from './world/Atmosphere';
import { Seabed } from './world/Seabed';
import { Fauna } from './world/Fauna';

// Environment preview (temporary until the game wiring lands).
const params = new URLSearchParams(location.search);
const zone = ZONES[Number(params.get('zone') ?? 0)];
const q = QUALITY[(params.get('q') as 'low' | 'medium' | 'high') ?? detectQuality()];
const scene = new Scene();
const renderer = new Renderer(document.getElementById('scene') as HTMLCanvasElement, scene, q);
const atmo = new Atmosphere(scene, zone, q);
const seabed = new Seabed(scene, zone, atmo, q);
const fauna = new Fauna(scene, atmo, q);
fauna.setZone(zone);
renderer.camera.lookAt(0, -12, 0);
window.addEventListener('resize', () => renderer.resize());
let t = 0;
new Loop((dt) => {
  t += dt;
  atmo.update(dt, 90, 10);
  seabed.update(dt, 90);
  fauna.update(dt, t, 90);
  renderer.render(dt);
}).start();

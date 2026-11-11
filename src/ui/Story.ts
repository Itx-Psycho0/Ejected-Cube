import '../styles/story.css';
import { THEMES, THEME_IDS } from '../themes/themes';
import { audio } from '../audio/AudioEngine';

/**
 * The story, told as an animated paper cut-out book. Every scene is inline
 * SVG layers with CSS motion, so it is crisp at any resolution, weighs a few
 * kilobytes and can be skipped at any time.
 */

const NAVY = '#23305a';
const TOMATO = '#e2583e';
const MUSTARD = '#e9a93a';
const TEAL = '#3f8f8a';
const PAPER = '#f6f1e6';

function gear(cx: number, cy: number, r: number, teeth: number, fill: string, cls = '') {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.16;
    pts.push(`${cx + Math.cos(a0) * rr},${cy + Math.sin(a0) * rr}`, `${cx + Math.cos(a1) * rr},${cy + Math.sin(a1) * rr}`);
  }
  return `<g class="${cls}"><polygon points="${pts.join(' ')}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="${PAPER}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="${fill}"/></g>`;
}

function cube(x: number, y: number, s: number, cls = '') {
  const h = s / 2;
  const q = s / 4;
  return `<g class="${cls}" transform="translate(${x} ${y})">
    <circle r="${s * 1.3}" fill="${MUSTARD}" opacity=".28" class="glow"/>
    <polygon points="0,${-h} ${h},${-q} 0,0 ${-h},${-q}" fill="#fffaf0"/>
    <polygon points="${-h},${-q} 0,0 0,${h} ${-h},${q}" fill="#f3c46a"/>
    <polygon points="${h},${-q} 0,0 0,${h} ${h},${q}" fill="${MUSTARD}"/></g>`;
}

function cloud(x: number, y: number, s: number, delay = 0) {
  return `<g class="drift cut" style="animation-delay:-${delay}s"><g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 40 Q0 10 30 12 Q40 -10 70 4 Q100 -6 112 22 Q140 22 138 40 Z" fill="#fffdf7"/></g></g>`;
}

function page(x: number, y: number, w: number, h: number, colors: string[], rot: number, cls = '', extra = '') {
  const [a, b, c] = colors;
  return `<g class="${cls}" style="--r:${rot}deg" ${extra}><g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${PAPER}" class="cut"/>
    <rect x="${-w / 2 + 8}" y="${-h / 2 + 8}" width="${w - 16}" height="${h * 0.55}" fill="${a}"/>
    <path d="M${-w / 2 + 8} ${h * 0.12} Q${-w / 6} ${-h * 0.12} ${w / 8} ${h * 0.06} T${w / 2 - 8} ${-h * 0.02} V${h / 2 - 8} H${-w / 2 + 8} Z" fill="${b}"/>
    <circle cx="${w * 0.2}" cy="${-h * 0.22}" r="${w * 0.08}" fill="${c}"/></g></g>`;
}

interface Scene {
  text: string;
  bg: string;
  svg: string;
  /** Extra class on the scene root. */
  cls?: string;
}

function introScenes(): Scene[] {
  const pages = THEME_IDS.map((id, i) => {
    const sw = THEMES[id].swatches;
    const x = 140 + (i % 5) * 330 + (i >= 5 ? 160 : 0);
    const y = i < 5 ? 230 : 560;
    return page(x, y, 190, 140, [sw[1], sw[3] ?? sw[2], sw[2]], (i % 3) - 1 * 4, 'bob', `style="animation-delay:-${i * 0.7}s;--r:${(i % 2 ? -1 : 1) * 3}deg"`);
  }).join('');
  return [
    {
      text: 'Before there were maps, there was the Atlas: a book where every page was a whole world.',
      bg: '#bcd9e6',
      svg: `
        ${cloud(160, 120, 1.4, 1)}${cloud(1180, 90, 1.1, 3)}${cloud(760, 170, 0.8, 5)}
        <g class="cut"><path d="M200 900 L240 560 Q520 500 800 600 Q1080 500 1360 560 L1400 900 Z" fill="${PAPER}"/>
        <path d="M800 600 L800 900" stroke="rgba(35,48,90,.25)" stroke-width="4"/></g>
        <g class="pop cut" style="animation-delay:.3s"><path d="M300 640 L420 400 L520 520 L620 360 L760 620 Z" fill="#9bb0c8"/></g>
        <g class="pop cut" style="animation-delay:.6s"><path d="M860 640 Q980 420 1100 520 Q1180 440 1300 620 Z" fill="#7fae6e"/></g>
        <g class="pop cut" style="animation-delay:.9s"><path d="M280 660 Q520 560 790 650 Z" fill="#5e8f5a"/><path d="M820 660 Q1060 560 1330 650 Z" fill="#5e8f5a"/></g>
        <g class="pop cut" style="animation-delay:1.2s">
          <rect x="1010" y="520" width="70" height="60" fill="${TOMATO}"/><path d="M1000 522 L1045 480 L1090 522 Z" fill="${NAVY}"/></g>
        <g class="pop" style="animation-delay:1.4s"><circle cx="1240" cy="250" r="56" fill="${MUSTARD}"/></g>`,
    },
    {
      text: 'At its heart turned the Atlas Engine, and one small cube of light kept every page turning.',
      bg: NAVY,
      svg: `
        <g opacity=".9">${gear(560, 470, 210, 16, '#3a4a7a', 'spin')}${gear(1010, 330, 140, 12, '#4c5f96', 'spin rev')}${gear(1060, 640, 110, 10, '#2f3d68', 'spin')}</g>
        <g class="spin" style="animation-duration:30s">${[0, 1, 2, 3, 4, 5]
          .map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return `<rect x="${800 + Math.cos(a) * 330 - 40}" y="${450 + Math.sin(a) * 250 - 28}" width="80" height="56" fill="${PAPER}" opacity=".9"/>`;
          })
          .join('')}</g>
        ${cube(800, 450, 130, 'pop')}`,
    },
    {
      text: 'Then a single drop of ink fell. The Blot spread from page to page, swallowing colour and shape.',
      bg: '#e8e2d4',
      svg: `
        <g class="grey">${page(330, 520, 280, 210, ['#bcd9e6', '#7fae6e', MUSTARD], -4)}${page(800, 560, 280, 210, ['#f2c9b1', '#a7c4a0', TOMATO], 2)}${page(1270, 520, 280, 210, ['#9cc8dc', '#eef6f9', TEAL], -2)}</g>
        <g class="spread"><path d="M800 -40 C 1020 -30 1100 140 1010 260 C 1180 300 1230 520 1040 560 C 1100 700 900 760 820 640 C 760 820 560 760 600 600 C 380 640 330 420 520 360 C 380 240 520 40 800 -40 Z" fill="#141418"/>
          <path d="M700 600 Q690 720 712 820" stroke="#141418" stroke-width="22" stroke-linecap="round" fill="none"/>
          <path d="M960 560 Q970 660 950 760" stroke="#141418" stroke-width="16" stroke-linecap="round" fill="none"/>
          <circle cx="1110" cy="420" r="26" fill="#141418"/><circle cx="470" cy="300" r="18" fill="#141418"/></g>`,
    },
    {
      text: 'With its last turn, the Engine did the only thing it could. It threw the cube out into the pages.',
      bg: '#2b2f45',
      svg: `
        <g class="shake">${gear(520, 500, 200, 16, '#3a4a7a')}${gear(900, 360, 120, 12, '#4c5f96')}
        <path d="M430 330 L520 470 L470 560 L560 700" stroke="#141418" stroke-width="10" fill="none"/>
        <path d="M0 0 H1600 V140 C1300 190 1100 60 900 130 C700 200 400 80 0 160 Z" fill="#141418" opacity=".85"/></g>
        <g class="fly">${cube(600, 480, 110)}<path d="M480 470 H330 M490 510 H360 M500 440 H380" stroke="${MUSTARD}" stroke-width="8" stroke-linecap="round"/></g>
        ${[0, 1, 2, 3, 4].map((i) => `<rect class="drift" x="${700 + i * 150}" y="${200 + (i % 3) * 140}" width="40" height="28" fill="${PAPER}" transform="rotate(${i * 23} ${720 + i * 150} ${214 + (i % 3) * 140})"/>`).join('')}`,
    },
    {
      text: 'Now the pages are scattered. Every world you cross gives back a little light. Gather enough, and the cube can find its way home.',
      bg: '#d8dfe6',
      svg: `${pages}<g class="travel">${cube(800, 420, 70)}</g>`,
    },
  ];
}

function endingScenes(): Scene[] {
  return [
    {
      text: 'Fifteen pages later, the cube found the Engine. It was quiet, and very dark.',
      bg: NAVY,
      svg: `<g opacity=".7">${gear(560, 470, 210, 16, '#3a4a7a')}${gear(1010, 330, 140, 12, '#4c5f96')}</g><g class="travel">${cube(800, 450, 110)}</g>`,
    },
    {
      text: 'The gears caught. The pages flew home. The Atlas is whole again, for now. Ink never quite dries.',
      bg: '#bcd9e6',
      svg: `<g opacity=".95">${gear(560, 470, 210, 16, '#3a4a7a', 'spin')}${gear(1010, 330, 140, 12, '#4c5f96', 'spin rev')}</g>${cube(800, 450, 130, 'pop')}
        ${THEME_IDS.map((id, i) => page(200 + i * 130, 120 + (i % 2) * 60, 110, 80, [THEMES[id].swatches[1], THEMES[id].swatches[3] ?? THEMES[id].swatches[2], THEMES[id].swatches[2]], i * 7 - 30, 'bob')).join('')}`,
    },
  ];
}

export class StoryPlayer {
  private root: HTMLElement;
  private index = -1;
  private timer = 0;
  private scenes: Scene[];
  private done = false;

  constructor(
    private host: HTMLElement,
    kind: 'intro' | 'ending',
    private onFinish: () => void,
  ) {
    this.scenes = kind === 'intro' ? introScenes() : endingScenes();
    this.root = document.createElement('div');
    this.root.id = 'story';
    this.root.innerHTML = `<div class="layer" data-s></div><div class="grain"></div>
      <div class="controls"><div class="dots">${this.scenes.map(() => '<i></i>').join('')}<i></i></div>
      <button data-skip>Skip story</button></div>`;
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) this.finish();
      else this.next();
    });
    window.addEventListener('keydown', this.onKey);
    this.next();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.finish();
    else if (['Space', 'Enter', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      this.next();
    }
  };

  private next() {
    if (this.done) return;
    clearTimeout(this.timer);
    this.index++;
    const layer = this.root.querySelector<HTMLElement>('[data-s]')!;
    this.root.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i === this.index));
    if (this.index >= this.scenes.length) {
      // Title card, then wait for a final tap.
      if (this.index > this.scenes.length) return this.finish();
      layer.innerHTML = `<div class="title-card"><h1>Ejected<span>Cube</span></h1><p>Tap to begin the journey</p></div>`;
      this.root.style.background = '#e8e2d4';
      audio.chime();
      return;
    }
    const s = this.scenes[this.index];
    this.root.style.background = s.bg;
    const words = s.text
      .split(' ')
      .map((w, i) => `<span style="animation-delay:${0.3 + i * 0.07}s">${w} </span>`)
      .join('');
    layer.innerHTML = `<svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">${s.svg}</svg><div class="caption">${words}</div>`;
    audio.pageFlip();
    const read = 2600 + s.text.split(' ').length * 260;
    this.timer = window.setTimeout(() => this.next(), read);
  }

  /** Tear the page in two and reveal the game underneath. */
  finish() {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.timer);
    window.removeEventListener('keydown', this.onKey);
    audio.tear();
    const snapshot = this.root.innerHTML;
    const bg = this.root.style.background;
    this.root.remove();
    const jag: string[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const y = (i / steps) * 100;
      const x = 50 + Math.sin(i * 2.3) * 4 + (i % 2 ? 2.5 : -2.5);
      jag.push(`${x}% ${y}%`);
    }
    const left = `polygon(0 0, ${jag.join(', ')}, 0 100%)`;
    const right = `polygon(100% 0, ${jag.join(', ')}, 100% 100%)`;
    const halves = [left, right].map((clip, i) => {
      const d = document.createElement('div');
      d.className = 'tear';
      d.style.background = bg;
      d.style.clipPath = clip;
      d.innerHTML = snapshot;
      d.querySelector('.controls')?.remove();
      this.host.appendChild(d);
      const dir = i === 0 ? -1 : 1;
      d.animate(
        [
          { transform: 'translate(0,0) rotate(0)' },
          { transform: `translate(${dir * 2}%, ${dir * -1}%) rotate(${dir * 0.6}deg)`, offset: 0.25 },
          { transform: `translate(${dir * 70}%, ${dir * 18}%) rotate(${dir * 9}deg)` },
        ],
        { duration: 1300, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
      ).onfinish = () => d.remove();
      return d;
    });
    void halves;
    setTimeout(() => this.onFinish(), 250);
  }
}

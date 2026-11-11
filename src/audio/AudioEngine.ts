/**
 * Procedural audio: every sound and the adaptive soundtrack are synthesized
 * with WebAudio at runtime, so the game ships zero audio files.
 *
 * Graph:
 *   sfx ─────────────┐
 *   music ─► lowpass ┼─► master ─► compressor ─► out
 *   ambience ────────┘        ▲
 *   (reverb send) ─► convolver┘
 */

export interface MusicMood {
  /** Root note frequency in Hz. */
  root: number;
  /** Scale as semitone offsets. */
  scale: number[];
  bpm: number;
  /** 0..1 how busy the arpeggio is. */
  density: number;
  /** Lowpass cutoff for the whole music bus (deeper = darker). */
  cutoff: number;
}

const semis = (root: number, s: number) => root * Math.pow(2, s / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private ambience!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private ambFilter!: BiquadFilterNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private droneOsc: OscillatorNode[] = [];
  private droneGain!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineTrem!: OscillatorNode;
  private engineBase = 60;
  private schedTimer = 0;
  private nextNote = 0;
  private step = 0;
  private mood: MusicMood = { root: 55, scale: [0, 3, 5, 7, 10], bpm: 64, density: 0.3, cutoff: 900 };
  private bossMode = false;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private lastPlay = new Map<string, number>();
  muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(3.2, 2.6);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    reverb.connect(revOut).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(reverb);

    // Effects pass through a gentle lowpass so nothing sounds harsh or clicky.
    this.sfx = ctx.createGain();
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5200;
    soften.Q.value = 0.3;
    this.sfx.connect(soften).connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.music = ctx.createGain();
    this.music.connect(this.musicFilter).connect(this.master);
    this.musicFilter.connect(this.reverbSend);

    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 380;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.5;
    this.ambFilter.connect(this.ambience).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
    this.applyVolumes();
    this.nextNote = ctx.currentTime + 0.1;
    this.schedTimer = window.setInterval(() => this.schedule(), 60);
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.3);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  /** Suspend everything while the tab is hidden or the game is paused. */
  setPaused(p: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(p ? this.volumes.music * 0.15 : this.volumes.music * 0.5, t, 0.2);
    this.musicFilter.frequency.setTargetAtTime(p ? 400 : this.mood.cutoff, t, 0.2);
  }

  setMood(m: MusicMood) {
    this.mood = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(m.cutoff, t, 1.5);
    this.ambFilter.frequency.setTargetAtTime(200 + m.cutoff * 0.35, t, 2);
    const base = m.root / 2;
    this.droneOsc.forEach((o, i) => o.frequency.setTargetAtTime(base * (i === 2 ? 1.5 : 1) * (1 + i * 0.003), t, 2));
  }

  setBossMode(on: boolean) {
    this.bossMode = on;
  }

  // ---------- building blocks ----------

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private canPlay(key: string, minGap: number) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(key) ?? -1) < minGap) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    opts: { attack?: number; dest?: AudioNode; reverb?: number; when?: number; detune?: number } = {},
  ) {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = opts.detune ?? 0;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.sfx);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'lowpass', reverb = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    if (reverb) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------- ambience + music ----------

  private startAmbience() {
    const ctx = this.ctx!;
    // Filtered noise "ocean pressure" bed with a slow swell.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const swell = ctx.createGain();
    swell.gain.value = 0.35;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.15;
    lfo.connect(lfoAmt).connect(swell.gain);
    src.connect(swell).connect(this.ambFilter);
    src.start();
    lfo.start();

    // Low drone, three detuned voices.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.06;
    this.droneGain.connect(this.ambFilter);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sine';
      o.frequency.value = 27.5 * (i === 2 ? 1.5 : 1) * (1 + i * 0.003);
      o.connect(this.droneGain);
      o.start();
      this.droneOsc.push(o);
    }

    // Engine hum: one oscillator through a lowpass, with a tremolo for propellers.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'triangle';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineTrem = ctx.createOscillator();
    this.engineTrem.frequency.value = 18;
    const tremAmt = ctx.createGain();
    tremAmt.gain.value = 0.012;
    this.engineTrem.connect(tremAmt).connect(this.engineGain.gain);
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.sfx);
    this.engineOsc.start();
    this.engineTrem.start();
  }

  /** Pick the engine voice for the craft: submarine hum, propeller buzz or ion whine. */
  setEngine(kind: 'water' | 'sky' | 'space' | 'off') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'off') {
      this.engineGain.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    this.engineOsc.type = kind === 'sky' ? 'sawtooth' : kind === 'space' ? 'sine' : 'triangle';
    this.engineBase = kind === 'sky' ? 82 : kind === 'space' ? 120 : 55;
    this.engineTrem.frequency.setTargetAtTime(kind === 'sky' ? 26 : 5, t, 0.2);
    this.engineFilter.frequency.setTargetAtTime(kind === 'sky' ? 420 : kind === 'space' ? 900 : 260, t, 0.3);
    this.engineGain.gain.setTargetAtTime(kind === 'sky' ? 0.03 : 0.045, t, 0.6);
  }

  /** 0..1 how hard the craft is moving; raises the engine pitch a little. */
  setThrust(v: number) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(this.engineBase * (1 + v * 0.35), this.ctx.currentTime, 0.12);
  }

  /**
   * Generative music: a slow four-chord loop of soft pads, a bass note on
   * each bar and a rolling arpeggio through the chord. `density` thins the
   * arpeggio out for calmer worlds.
   */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const m = this.mood;
    const spb = 60 / m.bpm / 2; // eighth notes
    const L = m.scale.length;
    const note = (deg: number) => m.scale[((deg % L) + L) % L] + 12 * Math.floor(deg / L);
    while (this.nextNote < ctx.currentTime + 0.25) {
      const t = this.nextNote;
      const s = this.step;
      const bar = Math.floor(s / 8);
      const deg = [0, 3, 4, 2][bar % 4];
      if (s % 8 === 0) {
        for (const k of [0, 2, 4]) {
          const f = semis(m.root * 2, note(deg + k));
          this.tone('sine', f, f, spb * 8.5, 0.045, { attack: spb * 2.5, dest: this.music, when: t, detune: (k - 2) * 3 });
          this.tone('triangle', f, f, spb * 8.5, 0.012, { attack: spb * 3, dest: this.music, when: t, detune: 5 });
        }
        const bf = semis(m.root, note(deg));
        this.tone('sine', bf, bf, spb * 6, 0.09, { attack: 0.03, dest: this.music, when: t });
      }
      const pattern = [0, 2, 4, 7, 4, 2, 4, 2];
      const play = s % 2 === 0 ? m.density + 0.35 : m.density * 0.8;
      // A fixed pattern per bar keeps it musical; the hash decides which steps rest.
      const hash = ((bar * 7 + (s % 8) * 13) % 10) / 10;
      if (hash < play) {
        const f = semis(m.root * 4, note(deg + pattern[s % 8]));
        this.tone('sine', f, f, spb * 2.6, 0.035, { attack: 0.012, dest: this.music, when: t });
      }
      if (this.bossMode && s % 2 === 0) {
        this.tone('triangle', m.root, m.root, spb * 0.9, 0.09, { dest: this.music, when: t });
        if (s % 8 === 0) this.tone('sine', 84, 42, 0.32, 0.22, { dest: this.music, when: t });
      }
      this.nextNote += spb;
      this.step++;
    }
  }

  // ---------- sound effects ----------

  shoot() {
    if (!this.canPlay('shoot', 0.06)) return;
    this.tone('sine', 920, 480, 0.11, 0.07);
    this.tone('triangle', 460, 240, 0.08, 0.03);
  }
  pickup(combo: number) {
    if (!this.canPlay('pickup', 0.035)) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = semis(587, scale[Math.min(combo, scale.length - 1)]);
    this.tone('sine', f, f, 0.32, 0.085, { reverb: 0.35, attack: 0.004 });
    this.tone('sine', f * 2.01, f * 2.01, 0.16, 0.022);
  }
  powerup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone('sine', semis(440, n), semis(440, n), 0.45, 0.07, { when: t + i * 0.065, reverb: 0.4 }));
  }
  hit() {
    if (!this.canPlay('hit', 0.1)) return;
    this.noise(0.28, 0.28, 1200, 140, 0.7);
    this.tone('sine', 150, 58, 0.34, 0.3);
  }
  shieldHit() {
    if (!this.canPlay('shield', 0.08)) return;
    this.tone('sine', 880, 1500, 0.22, 0.09, { reverb: 0.5 });
  }
  enemyHit() {
    if (!this.canPlay('ehit', 0.05)) return;
    this.tone('triangle', 330, 190, 0.06, 0.04);
  }
  explode(size = 1) {
    if (!this.canPlay('explode', 0.06)) return;
    this.noise(0.35 + size * 0.4, 0.2 + size * 0.1, 900, 70, 0.6, 'lowpass', 0.25);
    this.tone('sine', 120, 36, 0.35 + size * 0.3, 0.3);
  }
  /** Soft whoosh for the dodge roll. */
  dash() {
    if (!this.ctx) return;
    this.noise(0.36, 0.2, 500, 2400, 2.2, 'bandpass');
    this.tone('sine', 300, 620, 0.2, 0.04);
  }
  flare() {
    if (!this.ctx) return;
    this.noise(1.4, 0.26, 3600, 220, 0.5, 'lowpass', 0.7);
    this.tone('sine', 220, 880, 0.8, 0.12, { reverb: 0.8 });
  }
  bossRoar() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) this.tone('triangle', 74 + i * 3, 40, 2, 0.11, { attack: 0.3, reverb: 0.6, detune: i * 10 });
    this.noise(1.8, 0.12, 420, 80, 1, 'lowpass', 0.5);
  }
  bossCharge() {
    if (!this.canPlay('bcharge', 0.3)) return;
    this.tone('triangle', 70, 260, 0.9, 0.09, { attack: 0.6 });
  }
  alarm() {
    if (!this.canPlay('alarm', 1.2)) return;
    this.tone('sine', 740, 740, 0.14, 0.05);
    this.tone('sine', 554, 554, 0.16, 0.05, { when: this.ctx!.currentTime + 0.17 });
  }
  zoneEnter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 19].forEach((n, i) => this.tone('sine', semis(this.mood.root * 4, n), semis(this.mood.root * 4, n), 1.6, 0.05, { when: t + i * 0.12, reverb: 0.9, attack: 0.05 }));
  }
  death() {
    if (!this.ctx) return;
    this.noise(2.2, 0.3, 700, 40, 0.5, 'lowpass', 0.8);
    this.tone('sine', 220, 32, 2.4, 0.2, { reverb: 0.8 });
  }
  pageFlip() {
    if (!this.ctx) return;
    this.noise(0.35, 0.2, 3200, 900, 0.7, 'bandpass', 0.2);
  }
  tear() {
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) setTimeout(() => this.noise(0.12, 0.16, 2600, 1200, 1.4, 'bandpass'), i * 45);
  }
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7].forEach((n, i) => this.tone('sine', semis(660, n), semis(660, n), 0.9, 0.06, { when: t + i * 0.09, reverb: 0.6 }));
  }
  setAmbience(cutoff: number) {
    if (!this.ctx) return;
    this.ambFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 1.2);
  }
  uiHover() {
    if (!this.canPlay('uih', 0.05)) return;
    this.tone('sine', 1500, 1500, 0.04, 0.018);
  }
  uiClick() {
    if (!this.ctx) return;
    this.tone('sine', 880, 587, 0.1, 0.06, { reverb: 0.2 });
  }

  dispose() {
    clearInterval(this.schedTimer);
    void this.ctx?.close();
  }
}

export const audio = new AudioEngine();

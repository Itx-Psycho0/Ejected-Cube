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

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

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
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const m = this.mood;
    const spb = 60 / m.bpm / 2; // eighth notes
    while (this.nextNote < ctx.currentTime + 0.25) {
      const t = this.nextNote;
      const s = this.step;
      // Pad chord every 16 eighths.
      if (s % 16 === 0) {
        const deg = [0, 3, 1, 4][(s / 16) % 4];
        for (const k of [0, 2, 4]) {
          const n = m.scale[(deg + k) % m.scale.length] + (deg + k >= m.scale.length ? 12 : 0);
          this.tone('triangle', semis(m.root * 2, n), semis(m.root * 2, n), spb * 15, 0.035, {
            attack: spb * 5,
            dest: this.music,
            when: t,
            detune: (k - 2) * 4,
          });
        }
      }
      // Sparse plucked arpeggio.
      if (Math.random() < m.density * (s % 2 === 0 ? 1 : 0.5)) {
        const n = m.scale[Math.floor(Math.random() * m.scale.length)] + 12 * Math.floor(Math.random() * 2);
        this.tone('sine', semis(m.root * 4, n), semis(m.root * 4, n), spb * 3, 0.05, { dest: this.music, when: t });
      }
      // Boss pulse bass.
      if (this.bossMode && s % 2 === 0) {
        this.tone('sawtooth', m.root, m.root * 0.98, spb * 0.9, 0.07, { dest: this.music, when: t });
        if (s % 8 === 0) this.tone('sine', 90, 40, 0.35, 0.3, { dest: this.music, when: t });
      }
      this.nextNote += spb;
      this.step++;
    }
    // Rare hull creak for atmosphere.
    if (Math.random() < 0.004) this.creak();
  }

  // ---------- sound effects ----------

  shoot() {
    if (!this.canPlay('shoot', 0.05)) return;
    this.tone('sine', 1300, 420, 0.16, 0.12, { reverb: 0.15 });
    this.tone('square', 220, 120, 0.06, 0.03);
  }
  torpedo() {
    if (!this.canPlay('torp', 0.1)) return;
    this.noise(0.5, 0.25, 1800, 300, 2, 'bandpass');
  }
  ping() {
    if (!this.ctx) return;
    this.tone('sine', 1480, 1470, 1.6, 0.22, { reverb: 0.9, attack: 0.004 });
    this.tone('sine', 2960, 2950, 0.4, 0.04, { reverb: 0.6 });
  }
  pickup(combo: number) {
    if (!this.canPlay('pickup', 0.03)) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = scale[Math.min(combo, scale.length - 1)];
    const f = semis(660, n);
    this.tone('sine', f, f * 1.01, 0.25, 0.1, { reverb: 0.3 });
    this.tone('sine', f * 2, f * 2, 0.12, 0.03);
  }
  ammo() {
    if (!this.canPlay('ammo', 0.05)) return;
    this.tone('triangle', 420, 840, 0.12, 0.12);
    this.tone('triangle', 630, 1260, 0.15, 0.08, { when: this.ctx!.currentTime + 0.07 });
  }
  powerup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone('sine', semis(440, n), semis(440, n), 0.4, 0.09, { when: t + i * 0.06, reverb: 0.4 }));
  }
  hit() {
    if (!this.canPlay('hit', 0.08)) return;
    this.noise(0.35, 0.5, 2400, 180, 0.8);
    this.tone('sine', 140, 50, 0.3, 0.35);
  }
  shieldHit() {
    if (!this.canPlay('shield', 0.08)) return;
    this.tone('sine', 900, 1800, 0.2, 0.12, { reverb: 0.5 });
  }
  enemyHit() {
    if (!this.canPlay('ehit', 0.04)) return;
    this.tone('square', 300, 150, 0.06, 0.04);
  }
  explode(size = 1) {
    if (!this.canPlay('explode', 0.04)) return;
    this.noise(0.4 + size * 0.5, 0.35 + size * 0.2, 1600, 60, 0.7, 'lowpass', 0.3);
    this.tone('sine', 110, 30, 0.4 + size * 0.4, 0.4);
  }
  dash() {
    if (!this.ctx) return;
    this.noise(0.45, 0.35, 400, 3000, 3, 'bandpass');
  }
  flare() {
    if (!this.ctx) return;
    this.noise(1.6, 0.4, 6000, 200, 0.5, 'lowpass', 0.8);
    this.tone('sine', 220, 880, 0.8, 0.15, { reverb: 0.8 });
  }
  bossRoar() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) this.tone('sawtooth', 70 + i * 3, 38, 2.2, 0.12, { attack: 0.3, reverb: 0.6, detune: i * 12 });
    this.noise(2, 0.2, 500, 80, 1, 'lowpass', 0.5);
  }
  bossCharge() {
    if (!this.canPlay('bcharge', 0.3)) return;
    this.tone('sawtooth', 60, 240, 0.9, 0.08, { attack: 0.6 });
  }
  alarm() {
    if (!this.canPlay('alarm', 0.9)) return;
    this.tone('square', 880, 880, 0.12, 0.05);
    this.tone('square', 660, 660, 0.12, 0.05, { when: this.ctx!.currentTime + 0.15 });
  }
  creak() {
    if (!this.ctx) return;
    this.tone('sawtooth', 70 + Math.random() * 40, 50, 1.2, 0.03, { attack: 0.4, reverb: 0.7 });
  }
  zoneEnter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 19].forEach((n, i) => this.tone('sine', semis(this.mood.root * 4, n), semis(this.mood.root * 4, n), 1.6, 0.06, { when: t + i * 0.12, reverb: 0.9, attack: 0.05 }));
  }
  death() {
    if (!this.ctx) return;
    this.noise(2.5, 0.5, 900, 40, 0.5, 'lowpass', 0.8);
    this.tone('sine', 220, 30, 2.5, 0.25, { reverb: 0.8 });
  }
  surface() {
    if (!this.ctx) return;
    this.noise(1.8, 0.6, 8000, 400, 0.3, 'highpass', 0.4);
    const t = this.ctx.currentTime;
    [0, 4, 7, 11, 14].forEach((n, i) => this.tone('triangle', semis(523, n), semis(523, n), 2.4, 0.06, { when: t + 0.4 + i * 0.1, reverb: 0.9 }));
  }
  launch() {
    if (!this.ctx) return;
    this.noise(1.4, 0.55, 300, 4000, 1.5, 'bandpass', 0.4);
    this.tone('sine', 60, 30, 1.2, 0.5);
  }
  uiHover() {
    if (!this.canPlay('uih', 0.04)) return;
    this.tone('sine', 1800, 1800, 0.04, 0.025);
  }
  uiClick() {
    if (!this.ctx) return;
    this.tone('sine', 1200, 600, 0.09, 0.08, { reverb: 0.2 });
  }

  dispose() {
    clearInterval(this.schedTimer);
    void this.ctx?.close();
  }
}

export const audio = new AudioEngine();

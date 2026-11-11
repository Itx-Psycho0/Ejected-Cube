/**
 * Procedural audio. Music and sound effects are synthesized with WebAudio
 * at runtime; only the voice-over is recorded (see ./voice).
 *
 *   sfx ─► soften ───────────────────┐
 *   music ─► pump ─► lowpass ─► delay ┼─► master ─► compressor ─► out
 *   voice ───────────────────────────┤
 *   ambience ────────────────────────┘
 */

export type DrumStyle = 'four' | 'break' | 'half' | 'march' | 'none';

export interface MusicMood {
  /** Root note frequency in Hz (bass register). */
  root: number;
  /** Scale as semitone offsets. */
  scale: number[];
  bpm: number;
  /** 0..1 how busy the lead arpeggio is. */
  density: number;
  /** Lowpass cutoff for the music bus. */
  cutoff: number;
  drums?: DrumStyle;
  lead?: OscillatorType;
  bass?: OscillatorType;
  /** Chord roots as scale degrees, one per bar. */
  chords?: number[];
}

const semis = (root: number, s: number) => root * Math.pow(2, s / 12);

const VOICE_URLS = import.meta.glob('./voice/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const voiceUrl = (key: string) => VOICE_URLS[`./voice/${key}.mp3`];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private pump!: GainNode;
  private voice!: GainNode;
  private duck!: GainNode;
  private ambience!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private ambFilter!: BiquadFilterNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private schedTimer = 0;
  private nextStep = 0;
  private step = 0;
  private mood: MusicMood = { root: 55, scale: [0, 3, 5, 7, 10], bpm: 90, density: 0.3, cutoff: 1200, drums: 'none' };
  private baseMood: MusicMood = this.mood;
  private bossMood: MusicMood | null = null;
  private musicCut = false;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 };
  private lastPlay = new Map<string, number>();
  private voiceBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private voiceSrc: AudioBufferSourceNode | null = null;
  private engineOsc!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineTrem!: OscillatorNode;
  private engineBase = 60;
  muted = false;

  /** Must be called from a user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3.5;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.6, 2.4);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.45;
    reverb.connect(revOut).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(reverb);

    // Everything except the voice ducks while the narrator talks.
    this.duck = ctx.createGain();
    this.duck.connect(this.master);

    this.sfx = ctx.createGain();
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 6500;
    soften.Q.value = 0.3;
    this.sfx.connect(soften).connect(this.duck);

    this.music = ctx.createGain();
    this.pump = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1200;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.18;
    this.music.connect(this.pump).connect(this.musicFilter).connect(this.duck);
    this.musicFilter.connect(delay).connect(fb).connect(delay);
    delay.connect(delayOut).connect(this.duck);
    this.musicFilter.connect(this.reverbSend);

    this.voice = ctx.createGain();
    this.voice.connect(this.master);
    const voiceVerb = ctx.createGain();
    voiceVerb.gain.value = 0.12;
    this.voice.connect(voiceVerb).connect(this.reverbSend);

    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 600;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.35;
    this.ambFilter.connect(this.ambience).connect(this.duck);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
    this.applyVolumes();
    this.nextStep = ctx.currentTime + 0.1;
    this.schedTimer = window.setInterval(() => this.schedule(), 50);
  }

  setVolumes(master: number, music: number, sfx: number, voice = this.volumes.voice) {
    this.volumes = { master, music, sfx, voice };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicCut ? 0 : this.volumes.music * 0.55, t, this.musicCut ? 0.08 : 0.3);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
    this.voice.gain.setTargetAtTime(this.volumes.voice * 1.1, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  setPaused(p: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(p ? this.volumes.music * 0.12 : this.volumes.music * 0.55, t, 0.2);
    this.musicFilter.frequency.setTargetAtTime(p ? 400 : this.mood.cutoff, t, 0.2);
  }

  /** The world's track. Kept underneath while a boss track plays. */
  setMood(m: MusicMood) {
    this.baseMood = m;
    if (!this.bossMood) this.switchTo(m);
  }

  /** Boss track on top of the world track; `null` returns to the world. */
  setBossMood(m: MusicMood | null) {
    this.bossMood = m;
    this.switchTo(m ?? this.baseMood);
  }

  /** Back-compat: boss mode with a generic boss track. */
  setBossMode(on: boolean) {
    this.setBossMood(on ? { ...BOSS_MOODS.water } : null);
  }

  private switchTo(m: MusicMood) {
    const tempoChanged = m.bpm !== this.mood.bpm;
    this.mood = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(m.cutoff, t, 0.8);
    // Restart on a bar line so a new track starts with its downbeat.
    if (tempoChanged) this.step = Math.ceil(this.step / 16) * 16;
  }

  /** Silence the music (boss warning), and bring it back. */
  cutMusic(cut: boolean) {
    this.musicCut = cut;
    this.applyVolumes();
  }

  setAmbience(cutoff: number) {
    if (!this.ctx) return;
    this.ambFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 1.2);
  }

  // ---------- voice ----------

  private loadVoice(key: string): Promise<AudioBuffer | null> {
    let p = this.voiceBuffers.get(key);
    if (!p) {
      const url = voiceUrl(key);
      const ctx = this.ctx;
      p =
        url && ctx
          ? fetch(url)
              .then((r) => r.arrayBuffer())
              .then((b) => ctx.decodeAudioData(b))
              .catch(() => null)
          : Promise.resolve(null);
      this.voiceBuffers.set(key, p);
    }
    return p;
  }

  /** Warm the cache so lines start on cue. */
  preloadVoice(keys: string[]) {
    if (this.ctx) for (const k of keys) void this.loadVoice(k);
  }

  /**
   * Play a recorded line; music and effects duck underneath it. Resolves when
   * the line ends (or right away if audio is unavailable).
   */
  async speak(key: string): Promise<number> {
    if (!this.ctx) return 0;
    const buf = await this.loadVoice(key);
    if (!buf || !this.ctx) return 0;
    this.stopVoice();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voice);
    const t = ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.4, t, 0.08);
    src.start();
    this.voiceSrc = src;
    return new Promise<number>((resolve) => {
      src.onended = () => {
        if (this.voiceSrc === src) {
          this.voiceSrc = null;
          this.duck.gain.setTargetAtTime(1, ctx.currentTime, 0.35);
        }
        resolve(buf.duration);
      };
    });
  }

  stopVoice() {
    if (!this.voiceSrc || !this.ctx) return;
    try {
      this.voiceSrc.onended = null;
      this.voiceSrc.stop();
    } catch {
      /* already stopped */
    }
    this.voiceSrc = null;
    this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.3);
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
    opts: { attack?: number; dest?: AudioNode; reverb?: number; when?: number; detune?: number; cutoff?: number } = {},
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
    let out: AudioNode = g;
    if (opts.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.cutoff;
      g.connect(f);
      out = f;
    }
    o.connect(g);
    out.connect(opts.dest ?? this.sfx);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      out.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'lowpass', reverb = 0, dest?: AudioNode, when?: number) {
    const ctx = this.ctx!;
    const t = when ?? ctx.currentTime;
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
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    if (reverb) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------- ambience + engine ----------

  private startAmbience() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const swell = ctx.createGain();
    swell.gain.value = 0.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.12;
    lfo.connect(lfoAmt).connect(swell.gain);
    src.connect(swell).connect(this.ambFilter);
    src.start();
    lfo.start();

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
    tremAmt.gain.value = 0.01;
    this.engineTrem.connect(tremAmt).connect(this.engineGain.gain);
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.sfx);
    this.engineOsc.start();
    this.engineTrem.start();
  }

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
    this.engineGain.gain.setTargetAtTime(kind === 'sky' ? 0.025 : 0.035, t, 0.6);
  }

  setThrust(v: number) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(this.engineBase * (1 + v * 0.35), this.ctx.currentTime, 0.12);
  }

  // ---------- music ----------

  private kick(t: number, vol = 0.5) {
    this.tone('sine', 150, 42, 0.26, vol, { dest: this.music, when: t, attack: 0.002 });
    this.noise(0.02, 0.12, 4000, 2000, 1, 'highpass', 0, this.music, t);
    // Sidechain-style pump: the rest of the mix dips under each kick.
    const g = this.pump.gain;
    g.setValueAtTime(0.62, t);
    g.linearRampToValueAtTime(1, t + 0.17);
  }
  private snare(t: number, vol = 0.22) {
    this.noise(0.18, vol, 5200, 1800, 0.8, 'bandpass', 0.15, this.music, t);
    this.tone('triangle', 190, 140, 0.1, vol * 0.6, { dest: this.music, when: t });
  }
  private hat(t: number, vol = 0.06, open = false) {
    this.noise(open ? 0.16 : 0.04, vol, 9000, 7000, 0.7, 'highpass', 0, this.music, t);
  }
  private tom(t: number, f: number, vol = 0.3) {
    this.tone('sine', f, f * 0.55, 0.32, vol, { dest: this.music, when: t, attack: 0.003 });
  }

  /**
   * 16th-note sequencer. Chord per bar; bass on eighths with octave jumps;
   * a deterministic arpeggio (density decides how many steps play); drums
   * from the mood's style.
   */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const m = this.mood;
    const s16 = 60 / m.bpm / 4;
    const L = m.scale.length;
    const note = (deg: number) => m.scale[((deg % L) + L) % L] + 12 * Math.floor(deg / L);
    const chords = m.chords ?? [0, 5, 3, 4];
    while (this.nextStep < ctx.currentTime + 0.2) {
      const t = this.nextStep;
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16);
      const deg = chords[bar % chords.length];
      const drums = m.drums ?? 'none';

      if (s === 0) {
        for (const k of [0, 2, 4]) {
          const f = semis(m.root * 4, note(deg + k));
          this.tone('sawtooth', f, f, s16 * 15, 0.012, { attack: s16 * 3, dest: this.music, when: t, detune: (k - 2) * 6, cutoff: 1400 });
          this.tone('sine', f, f, s16 * 15, 0.02, { attack: s16 * 2, dest: this.music, when: t });
        }
      }
      // Bass: eighths, root with an octave jump on the off-beat.
      if (s % 2 === 0 && drums !== 'none') {
        const oct = s % 4 === 2 ? 12 : 0;
        const bf = semis(m.root, note(deg) + oct);
        this.tone(m.bass ?? 'sawtooth', bf, bf, s16 * 1.8, 0.075, { dest: this.music, when: t, cutoff: 700 });
      } else if (drums === 'none' && s === 0) {
        const bf = semis(m.root, note(deg));
        this.tone('sine', bf, bf, s16 * 12, 0.09, { dest: this.music, when: t, attack: 0.05 });
      }
      // Lead arpeggio.
      const pattern = [0, 2, 4, 7, 4, 2, 4, 9, 0, 4, 7, 9, 7, 4, 2, 4];
      const keep = ((bar * 5 + s * 7) % 16) / 16 < m.density;
      if (keep && (drums !== 'none' || s % 2 === 0)) {
        const f = semis(m.root * 4, note(deg + pattern[s]));
        this.tone(m.lead ?? 'triangle', f, f, s16 * 1.6, 0.03, { dest: this.music, when: t, cutoff: 3200 });
      }
      // Drums.
      switch (drums) {
        case 'four':
          if (s % 4 === 0) this.kick(t);
          if (s === 4 || s === 12) this.snare(t);
          if (s % 4 === 2) this.hat(t, 0.07, true);
          else if (s % 2 === 1) this.hat(t, 0.035);
          break;
        case 'break':
          if (s === 0 || s === 7 || s === 10) this.kick(t);
          if (s === 4 || s === 12) this.snare(t);
          if (s % 2 === 0) this.hat(t, 0.05);
          if (s === 15 && bar % 2 === 1) this.snare(t, 0.12);
          break;
        case 'half':
          if (s === 0 || s === 11) this.kick(t, 0.45);
          if (s === 8) this.snare(t, 0.24);
          if (s % 2 === 0) this.hat(t, 0.04);
          break;
        case 'march':
          if ([0, 3, 6, 8, 11, 14].includes(s)) this.kick(t, 0.55);
          if (s === 4 || s === 12) this.snare(t, 0.26);
          this.hat(t, s % 2 ? 0.03 : 0.06);
          if (bar % 4 === 3 && s >= 12) this.tom(t, [220, 180, 150, 120][s - 12], 0.32);
          break;
      }
      this.nextStep += s16;
      this.step++;
    }
  }

  // ---------- sound effects ----------

  shoot() {
    if (!this.canPlay('shoot', 0.05)) return;
    this.tone('square', 980, 420, 0.07, 0.035, { cutoff: 3000 });
    this.tone('sine', 520, 260, 0.08, 0.04);
  }
  pickup(combo: number) {
    if (!this.canPlay('pickup', 0.03)) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = semis(587, scale[Math.min(combo, scale.length - 1)]);
    this.tone('sine', f, f, 0.28, 0.08, { reverb: 0.3, attack: 0.003 });
    this.tone('triangle', f * 2.01, f * 2.01, 0.12, 0.02);
  }
  /** Combo milestones: a rising three-note flourish. */
  comboMilestone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', semis(784, n), semis(784, n), 0.22, 0.05, { when: t + i * 0.05, reverb: 0.3 }));
  }
  /** Near miss: a quick airy whoosh with a bright tick. */
  graze() {
    if (!this.canPlay('graze', 0.12)) return;
    this.noise(0.16, 0.14, 1800, 5200, 2.5, 'bandpass');
    this.tone('sine', 1760, 2400, 0.06, 0.04);
  }
  gatePass() {
    if (!this.canPlay('gate', 0.2)) return;
    this.tone('sine', 660, 990, 0.18, 0.06, { reverb: 0.3 });
  }
  powerup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone('sine', semis(440, n), semis(440, n), 0.45, 0.07, { when: t + i * 0.06, reverb: 0.4 }));
  }
  hit() {
    if (!this.canPlay('hit', 0.1)) return;
    this.noise(0.28, 0.3, 1400, 140, 0.7);
    this.tone('sine', 160, 55, 0.34, 0.32);
  }
  shieldHit() {
    if (!this.canPlay('shield', 0.08)) return;
    this.tone('sine', 880, 1500, 0.22, 0.09, { reverb: 0.5 });
  }
  enemyHit() {
    if (!this.canPlay('ehit', 0.045)) return;
    this.tone('triangle', 360, 200, 0.05, 0.04);
  }
  explode(size = 1) {
    if (!this.canPlay('explode', 0.05)) return;
    this.noise(0.3 + size * 0.4, 0.22 + size * 0.1, 1200, 70, 0.6, 'lowpass', 0.25);
    this.tone('sine', 130, 36, 0.3 + size * 0.3, 0.32);
  }
  dash() {
    if (!this.ctx) return;
    this.noise(0.32, 0.22, 500, 2600, 2.2, 'bandpass');
    this.tone('sine', 300, 640, 0.18, 0.04);
  }
  flare() {
    if (!this.ctx) return;
    this.noise(1.4, 0.28, 3600, 220, 0.5, 'lowpass', 0.7);
    this.tone('sine', 220, 880, 0.8, 0.12, { reverb: 0.8 });
  }
  /** Air-raid style siren for the boss warning. */
  siren() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      this.tone('sawtooth', 420, 760, 0.42, 0.05, { when: t + i * 0.48, cutoff: 1800, reverb: 0.3 });
      this.tone('sawtooth', 760, 420, 0.06, 0.03, { when: t + i * 0.48 + 0.42, cutoff: 1800 });
    }
  }
  /** Cinematic hit as the boss name lands: sub boom, brass-like chord, timpani roll. */
  stinger(dark = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 70, 28, 1.6, 0.5, { when: t });
    this.noise(1.2, 0.3, 900, 60, 0.7, 'lowpass', 0.5, undefined, t);
    const root = dark ? 49 : 55;
    for (const [n, d] of [
      [0, 0],
      [7, 4],
      [12, -4],
      [dark ? 13 : 15, 6],
    ] as const)
      this.tone('sawtooth', semis(root * 2, n), semis(root * 2, n), 1.8, 0.05, { when: t, attack: 0.03, detune: d, cutoff: 1100, reverb: 0.5 });
    for (let i = 0; i < 10; i++) this.tone('sine', 98, 60, 0.18, 0.08 + i * 0.02, { when: t - 0.9 + i * 0.09, attack: 0.002 });
  }
  bossRoar() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) this.tone('sawtooth', 74 + i * 3, 40, 2, 0.08, { attack: 0.3, reverb: 0.6, detune: i * 10, cutoff: 900 });
    this.noise(1.8, 0.12, 420, 80, 1, 'lowpass', 0.5);
  }
  bossCharge() {
    if (!this.canPlay('bcharge', 0.3)) return;
    this.tone('triangle', 70, 260, 0.9, 0.09, { attack: 0.6 });
  }
  /** Low whisper texture when the Blot's eye appears. */
  whisper() {
    if (!this.ctx) return;
    this.noise(2.4, 0.08, 900, 300, 6, 'bandpass', 0.8);
    this.tone('sine', 55, 52, 2.4, 0.08, { attack: 0.8, reverb: 0.6 });
  }
  alarm() {
    if (!this.canPlay('alarm', 1.2)) return;
    this.tone('sine', 740, 740, 0.14, 0.05);
    this.tone('sine', 554, 554, 0.16, 0.05, { when: this.ctx!.currentTime + 0.17 });
  }
  zoneEnter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 19].forEach((n, i) => this.tone('sine', semis(this.mood.root * 4, n), semis(this.mood.root * 4, n), 1.4, 0.045, { when: t + i * 0.1, reverb: 0.8, attack: 0.03 }));
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

const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** Boss tracks per world family, plus the Blot's own. */
export const BOSS_MOODS: Record<'water' | 'sky' | 'space' | 'blot', MusicMood> = {
  water: { root: 46, scale: PHRYGIAN, bpm: 148, density: 0.6, cutoff: 2600, drums: 'march', lead: 'sawtooth', bass: 'sawtooth', chords: [0, 1, 0, 5] },
  sky: { root: 49, scale: MINOR, bpm: 156, density: 0.65, cutoff: 3600, drums: 'march', lead: 'square', bass: 'sawtooth', chords: [0, 5, 6, 4] },
  space: { root: 44, scale: PHRYGIAN, bpm: 160, density: 0.7, cutoff: 4200, drums: 'break', lead: 'sawtooth', bass: 'square', chords: [0, 1, 5, 4] },
  blot: { root: 41, scale: HARMONIC, bpm: 142, density: 0.55, cutoff: 2400, drums: 'march', lead: 'sawtooth', bass: 'sawtooth', chords: [0, 5, 1, 4] },
};

export const MENU_MOOD: MusicMood = { root: 55, scale: [0, 2, 4, 7, 9], bpm: 96, density: 0.35, cutoff: 2200, drums: 'half', lead: 'triangle', bass: 'sine', chords: [0, 3, 4, 2] };

export const audio = new AudioEngine();

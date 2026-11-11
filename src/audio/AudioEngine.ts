/**
 * Procedural audio. Music and sound effects are synthesized with WebAudio
 * at runtime; only the voice-over is recorded (see ./voice).
 *
 *   sfx ─► soften ───────────────────┐
 *   music ─► pump ─► lowpass ─► delay ┼─► master ─► compressor ─► out
 *   voice ───────────────────────────┤
 *   ambience ────────────────────────┘
 */

export type DrumStyle = 'four' | 'break' | 'half' | 'march' | 'lofi' | 'none';

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
  /** 0..0.5: delays every other sixteenth (chill groove). */
  swing?: number;
  /** Pads add the seventh. */
  sevenths?: boolean;
}

interface HookNote {
  step: number;
  deg: number;
  len: number;
}

/** Music bus level relative to the Music slider. */
const MUSIC_LEVEL = 0.95;

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
  private style: 'fast' | 'chill' = 'fast';
  private menuMode = false;
  /** 0..1, raised by the game in tense moments (ink surges): extra layers. */
  private intensity = 0;
  /** Bar the current track started on, for its arrangement. */
  private barBase = 0;
  private hooks = new Map<string, HookNote[]>();
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
    // Glue and safety limiter: louder overall, but peaks never clip.
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
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
    this.ambience.gain.value = 0.14;
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
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master * 1.5, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicCut ? 0 : this.volumes.music * MUSIC_LEVEL, t, this.musicCut ? 0.08 : 0.3);
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
    this.music.gain.setTargetAtTime(p ? this.volumes.music * 0.2 : this.musicCut ? 0 : this.volumes.music * MUSIC_LEVEL, t, 0.2);
    this.musicFilter.frequency.setTargetAtTime(p ? 400 : this.mood.cutoff, t, 0.2);
  }

  /** The world's track. Kept underneath while a boss track plays. */
  setMood(m: MusicMood) {
    this.baseMood = m;
  }

  /** Boss track on top of the world track; `null` returns to the world. */
  setBossMood(m: MusicMood | null) {
    this.bossMood = m;
  }

  /** Back-compat: boss mode with a generic boss track. */
  setBossMode(on: boolean) {
    this.setBossMood(on ? { ...BOSS_MOODS.water } : null);
  }

  private switchTo(m: MusicMood) {
    const changed = m.bpm !== this.mood.bpm || m.root !== this.mood.root || m.drums !== this.mood.drums;
    this.mood = m;
    if (!this.ctx || !changed) return;
    // Restart on a bar line so a new track starts with its downbeat and its intro.
    this.step = Math.ceil(this.step / 16) * 16;
    this.barBase = this.step / 16;
  }

  /** Gameplay soundtrack style (Settings). */
  setStyle(s: 'fast' | 'chill') {
    this.style = s;
  }

  /** Menus always get the chill version of the world's track. */
  setMenu(on: boolean) {
    this.menuMode = on;
  }

  setIntensity(v: number) {
    this.intensity = v;
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
    this.engineGain.gain.setTargetAtTime(kind === 'sky' ? 0.012 : 0.018, t, 0.6);
  }

  setThrust(v: number) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(this.engineBase * (1 + v * 0.35), this.ctx.currentTime, 0.12);
  }

  // ---------- music ----------

  private kick(t: number, vol = 0.7) {
    this.tone('sine', 160, 44, 0.28, vol, { dest: this.music, when: t, attack: 0.002 });
    this.noise(0.02, 0.14, 4000, 2000, 1, 'highpass', 0, this.music, t);
    // Sidechain-style pump: the rest of the mix dips under each kick.
    const g = this.pump.gain;
    g.setValueAtTime(0.62, t);
    g.linearRampToValueAtTime(1, t + 0.17);
  }
  private snare(t: number, vol = 0.3, soft = false) {
    this.noise(soft ? 0.24 : 0.18, vol, soft ? 3200 : 5200, 1800, 0.8, 'bandpass', soft ? 0.4 : 0.18, this.music, t);
    this.tone('triangle', 190, 140, 0.1, vol * 0.6, { dest: this.music, when: t });
  }
  private crash(t: number) {
    this.noise(1.6, 0.12, 9000, 3000, 0.6, 'highpass', 0.4, this.music, t);
  }
  private hat(t: number, vol = 0.06, open = false) {
    this.noise(open ? 0.16 : 0.04, vol, 9000, 7000, 0.7, 'highpass', 0, this.music, t);
  }
  private tom(t: number, f: number, vol = 0.3) {
    this.tone('sine', f, f * 0.55, 0.32, vol, { dest: this.music, when: t, attack: 0.003 });
  }

  /** A two-bar hook per mood, generated once from its key so each world has its own tune. */
  private hookFor(m: MusicMood) {
    const key = `${m.root}:${m.bpm}:${m.scale.join(',')}`;
    let hk = this.hooks.get(key);
    if (hk) return hk;
    let seed = Math.floor(m.root * 1000 + m.bpm * 7 + m.scale.length * 131) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    hk = [];
    let deg = [0, 2, 4][Math.floor(rnd() * 3)];
    for (let st = 0; st < 32; ) {
      // Mostly eighths, some sixteenths and dotted notes; a breath at the end of each bar.
      const len = st % 16 >= 12 && rnd() < 0.5 ? 4 : rnd() < 0.2 ? 1 : rnd() < 0.75 ? 2 : 3;
      if (st % 16 === 14 && rnd() < 0.6) {
        st += len;
        continue;
      }
      if (rnd() < 0.86) hk.push({ step: st, deg, len });
      // Step-wise motion with the odd leap, pulled back toward the chord.
      const r = rnd();
      deg += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
      if (deg > 7) deg -= 3;
      if (deg < -2) deg += 3;
      st += len;
    }
    this.hooks.set(key, hk);
    return hk;
  }

  /** The laid-back version of any world's track. */
  private chillOf(m: MusicMood): MusicMood {
    return {
      ...m,
      bpm: Math.round(Math.min(92, Math.max(78, m.bpm * 0.64))),
      density: m.density * 0.7,
      cutoff: Math.min(m.cutoff, 2400),
      drums: 'lofi',
      lead: 'triangle',
      bass: 'sine',
      swing: 0.2,
      sevenths: true,
    };
  }

  private current(): MusicMood {
    if (this.bossMood) return this.bossMood;
    return this.menuMode || this.style === 'chill' ? this.chillOf(this.baseMood) : this.baseMood;
  }

  /**
   * 16th-note sequencer with a 16-bar arrangement:
   *   0-1 intro (filter opens) · 2-9 groove + hook · 10-11 breakdown + riser · 12-15 drop
   * Chord per bar; bass on eighths with octave jumps; arpeggio; a melody hook;
   * drums from the mood's style. Boss tracks skip the intro.
   */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const want = this.current();
    if (want.bpm !== this.mood.bpm || want.drums !== this.mood.drums || want.root !== this.mood.root || want.lead !== this.mood.lead) this.switchTo(want);
    else this.mood = want;
    const m = this.mood;
    const s16 = 60 / m.bpm / 4;
    const L = m.scale.length;
    const note = (deg: number) => m.scale[((deg % L) + L) % L] + 12 * Math.floor(deg / L);
    const chords = m.chords ?? [0, 5, 3, 4];
    const hook = this.hookFor(m);
    const boss = !!this.bossMood;
    while (this.nextStep < ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16);
      const arr = (bar - this.barBase + (boss ? 2 : 0)) % 16;
      const swing = s % 2 === 1 ? s16 * (m.swing ?? 0) : 0;
      const t = this.nextStep + swing;
      const deg = chords[bar % chords.length];
      const drums = m.drums ?? 'none';
      const intro = arr < 2;
      const breakdown = arr === 10 || arr === 11;
      const drop = arr >= 12 || (boss && arr >= 2);
      const hot = this.intensity > 0.7;

      if (s === 0) {
        // Filter: closed in the intro and breakdown, wide open on the drop.
        const cut = intro ? m.cutoff * (arr === 0 ? 0.3 : 0.6) : breakdown ? m.cutoff * 0.5 : m.cutoff * (drop || hot ? 1.25 : 1);
        this.musicFilter.frequency.setTargetAtTime(Math.min(9000, cut), t, s16 * 4);
        // Pads: a held chord each bar (sevenths in chill).
        const tones = m.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
        for (const k of tones) {
          const f = semis(m.root * 4, note(deg + k));
          this.tone('sawtooth', f, f, s16 * 15.5, breakdown ? 0.03 : 0.022, { attack: s16 * 3, dest: this.music, when: t, detune: (k - 2) * 7, cutoff: 1600 });
          this.tone('sine', f, f, s16 * 15.5, 0.04, { attack: s16 * 2, dest: this.music, when: t });
        }
        if (arr === 12 || (boss && arr === 2)) this.crash(t);
      }

      // Bass: eighths with an octave jump (fast) or long notes (chill and breakdown).
      if (!breakdown) {
        if (drums !== 'none' && drums !== 'lofi' && s % 2 === 0 && !(intro && arr === 0 && s >= 8)) {
          const oct = s % 4 === 2 ? 12 : 0;
          const bf = semis(m.root, note(deg) + oct);
          this.tone(m.bass ?? 'sawtooth', bf, bf, s16 * 1.7, 0.15, { dest: this.music, when: t, cutoff: 900 });
          if (oct === 0) this.tone('sine', bf, bf, s16 * 1.8, 0.14, { dest: this.music, when: t });
        } else if ((drums === 'lofi' || drums === 'none') && (s === 0 || s === 10)) {
          const bf = semis(m.root, note(deg) + (s === 10 ? 7 : 0));
          this.tone('sine', bf, bf, s16 * (s === 0 ? 9 : 5), 0.2, { dest: this.music, when: t, attack: 0.02 });
        }
      }

      // Arpeggio.
      const pattern = [0, 2, 4, 7, 4, 2, 4, 9, 0, 4, 7, 9, 7, 4, 2, 4];
      const keep = ((bar * 5 + s * 7) % 16) / 16 < m.density + (drop || hot ? 0.2 : 0);
      if (keep && !intro && (drums !== 'lofi' || s % 2 === 0)) {
        const f = semis(m.root * 4, note(deg + pattern[s]) + (drop && s % 4 === 3 ? 12 : 0));
        this.tone(m.lead === 'sine' ? 'sine' : 'triangle', f, f, s16 * 1.5, breakdown ? 0.03 : 0.05, { dest: this.music, when: t, cutoff: 3600 });
      }

      // Melody hook: in the groove and the drop (an octave up on the drop), softly in the breakdown.
      if (!intro) {
        const hs = (this.step - this.barBase * 16 + (boss ? 32 : 0)) % 32;
        for (const n of hook) {
          if (n.step !== hs) continue;
          const f = semis(m.root * 8, note(deg + n.deg) + (drop ? 12 : 0) - (m.drums === 'lofi' ? 12 : 0));
          const vol = breakdown ? 0.035 : 0.06;
          const dur = s16 * n.len * 0.95;
          const wave = m.lead ?? 'triangle';
          this.tone(wave, f, f, dur, vol, { dest: this.music, when: t, cutoff: wave === 'sawtooth' || wave === 'square' ? 2800 : 5000, detune: -6, attack: 0.008 });
          this.tone(wave, f, f, dur, vol * 0.7, { dest: this.music, when: t, cutoff: 2800, detune: 7, attack: 0.008 });
        }
      }

      // Riser into the drop.
      if (arr === 11 && s === 0) this.noise(s16 * 16, 0.08, 400, 7000, 2, 'bandpass', 0.3, this.music, t);

      // Drums.
      if (!(breakdown && drums !== 'lofi')) {
        const lite = intro && arr === 0;
        switch (drums) {
          case 'four':
            if (s % 4 === 0 && !lite) this.kick(t);
            if ((s === 4 || s === 12) && !lite) this.snare(t);
            if (s % 4 === 2) this.hat(t, 0.08, true);
            else if (s % 2 === 1 || drop) this.hat(t, 0.04);
            break;
          case 'break':
            if ((s === 0 || s === 7 || s === 10) && !lite) this.kick(t);
            if ((s === 4 || s === 12) && !lite) this.snare(t);
            if (s % 2 === 0 || drop) this.hat(t, 0.055);
            if (s === 15 && bar % 2 === 1) this.snare(t, 0.16);
            break;
          case 'half':
            if ((s === 0 || s === 11) && !lite) this.kick(t, 0.7);
            if (s === 8 && !lite) this.snare(t, 0.34);
            if (s % 2 === 0) this.hat(t, 0.05);
            break;
          case 'march':
            if ([0, 3, 6, 8, 11, 14].includes(s) && !lite) this.kick(t, 0.75);
            if ((s === 4 || s === 12) && !lite) this.snare(t, 0.36);
            this.hat(t, s % 2 ? 0.035 : 0.07);
            if (bar % 4 === 3 && s >= 12) this.tom(t, [220, 180, 150, 120][s - 12], 0.4);
            break;
          case 'lofi':
            if ((s === 0 || s === 10 || (s === 7 && bar % 2 === 1)) && !breakdown) this.kick(t, 0.6);
            if ((s === 4 || s === 12) && !lite) this.snare(t, 0.22, true);
            if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.045 : 0.03);
            // Vinyl crackle.
            if (Math.random() < 0.35) this.noise(0.006, 0.05 + Math.random() * 0.05, 3000, 2500, 0.8, 'highpass', 0, this.music, t + Math.random() * s16);
            break;
        }
        // Snare roll into the drop; extra hats when things heat up.
        if (arr === 11 && s >= 8 && drums !== 'lofi') this.snare(t, 0.1 + (s - 8) * 0.03);
        if (hot && s % 2 === 1 && drums !== 'lofi') this.hat(t, 0.035);
      } else if (arr === 11 && s >= 8) this.snare(t, 0.1 + (s - 8) * 0.03);

      this.nextStep += s16;
      this.step++;
    }
  }

  // ---------- sound effects ----------

  shoot() {
    // Fires 12 times a second, so it stays soft and short, with a little pitch drift.
    if (!this.canPlay('shoot', 0.07)) return;
    const f = 1150 + Math.random() * 140;
    this.tone('square', f, f * 0.45, 0.055, 0.012, { cutoff: 2600 });
    this.tone('sine', f * 0.5, f * 0.22, 0.06, 0.018);
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
  /** Level number slamming in: a whoosh into a low impact. */
  slam() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(0.35, 0.18, 600, 4800, 1.6, 'bandpass', 0.2, undefined, t);
    this.tone('sine', 120, 40, 0.5, 0.35, { when: t + 0.3, attack: 0.002 });
    this.noise(0.4, 0.2, 2400, 200, 0.7, 'lowpass', 0.4, undefined, t + 0.3);
  }
  /** Low-energy heartbeat: lub-dub. */
  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 62, 44, 0.16, 0.3, { when: t, attack: 0.004 });
    this.tone('sine', 58, 40, 0.14, 0.22, { when: t + 0.17, attack: 0.004 });
  }
  /** Boss killing blow: a bright major chord swelling out of the explosion. */
  victoryHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.25;
    for (const [n, d] of [
      [0, -5],
      [4, 5],
      [7, -3],
      [12, 4],
    ] as const)
      this.tone('sawtooth', semis(220, n), semis(220, n), 2.4, 0.05, { when: t, attack: 0.05, detune: d, cutoff: 2400, reverb: 0.7 });
    this.tone('sine', 880, 880, 2, 0.05, { when: t + 0.1, reverb: 0.9 });
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

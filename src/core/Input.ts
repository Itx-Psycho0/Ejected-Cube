import { Vector2 } from 'three';

export type Action = 'fire' | 'dash' | 'ping' | 'flare' | 'pause';
export type Device = 'pointer' | 'keys' | 'touch';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'fire',
  KeyJ: 'fire',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyK: 'dash',
  KeyE: 'ping',
  KeyL: 'ping',
  KeyQ: 'flare',
  KeyI: 'flare',
  Escape: 'pause',
  KeyP: 'pause',
};

/**
 * Unifies mouse, keyboard and touch into one control scheme:
 * - `aim` is a target position in normalized screen space (-1..1).
 * - `axis` is a direct movement vector for keyboard play.
 * - actions are tracked as held + pressed-this-frame.
 */
export class Input {
  readonly aim = new Vector2(0, 0);
  readonly axis = new Vector2();
  device: Device = 'pointer';
  autoFire = false;
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private keys = new Set<string>();
  private touchId: number | null = null;
  private touchStart = new Vector2();
  private aimStart = new Vector2();
  enabled = true;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a) {
      this.press(a);
      if (a !== 'pause') e.preventDefault();
    }
    if (/^(Key[WASD]|Arrow)/.test(e.code)) {
      this.device = 'keys';
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a) this.held.delete(a);
  };

  private toNdc(e: PointerEvent, out: Vector2) {
    return out.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== this.touchId) return;
      // Relative drag: the pod follows the finger's movement, not its position,
      // so your thumb never covers the pod.
      const cur = this.toNdc(e, new Vector2());
      this.aim.copy(this.aimStart).add(cur.sub(this.touchStart).multiplyScalar(1.6));
      this.aim.clampScalar(-1, 1);
      return;
    }
    this.device = 'pointer';
    this.toNdc(e, this.aim);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.device = 'touch';
      this.autoFire = true;
      if (this.touchId === null) {
        this.touchId = e.pointerId;
        this.toNdc(e, this.touchStart);
        this.aimStart.copy(this.aim);
      }
      return;
    }
    this.device = 'pointer';
    this.toNdc(e, this.aim);
    if (e.button === 0) this.press('fire');
    if (e.button === 2) this.press('ping');
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId === this.touchId) this.touchId = null;
      return;
    }
    if (e.button === 0) this.held.delete('fire');
    if (e.button === 2) this.held.delete('ping');
  };

  /** Also used by on-screen touch buttons. */
  press(a: Action) {
    this.held.add(a);
    this.pressed.add(a);
  }
  release(a: Action) {
    this.held.delete(a);
  }

  isHeld(a: Action) {
    if (a === 'fire' && this.autoFire && this.device === 'touch') return true;
    return this.enabled && this.held.has(a);
  }

  /** True once per press. */
  consume(a: Action) {
    if (!this.pressed.has(a)) return false;
    this.pressed.delete(a);
    return this.enabled || a === 'pause';
  }

  /** Call at the end of every frame. */
  endFrame() {
    this.pressed.clear();
  }

  releaseAll() {
    this.held.clear();
    this.pressed.clear();
    this.keys.clear();
  }

  update() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    this.axis.set(x, y);
    if (this.axis.lengthSq() > 1) this.axis.normalize();
  }

  get isTouch() {
    return this.device === 'touch' || matchMedia('(pointer: coarse)').matches;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el.removeEventListener('pointermove', this.onPointerMove);
  }
}

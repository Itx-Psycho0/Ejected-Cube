import { Vector2 } from 'three';

export type Action = 'fire' | 'dash' | 'flare' | 'pause';
export type Device = 'pointer' | 'touch';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'fire',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyQ: 'flare',
  KeyE: 'flare',
  Escape: 'pause',
  KeyP: 'pause',
};

/**
 * One control scheme for mouse and touch: `aim` is where the craft should
 * go, in normalized screen space (-1..1). Actions are tracked as held and
 * pressed-this-frame.
 */
export class Input {
  readonly aim = new Vector2(0, 0);
  device: Device = 'pointer';
  /** Fire continuously without holding anything (setting, on by default). */
  autoFire = true;
  /** Last mouse button bitmask, to catch chorded presses the browser reports as moves. */
  private buttons = 0;
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
    this.syncButtons(e.buttons);
  };

  /**
   * Browsers send pointerdown/pointerup only for the first button pressed and
   * the last one released; a second button pressed or released in between
   * arrives as a pointermove. Diffing the bitmask handles every case, so fire
   * never gets stuck on or dropped.
   */
  private syncButtons(buttons: number) {
    const was = this.buttons;
    this.buttons = buttons;
    const leftNow = (buttons & 1) !== 0;
    const rightNow = (buttons & 2) !== 0;
    if (leftNow && !(was & 1)) this.press('fire');
    if (!leftNow && was & 1) this.held.delete('fire');
    if (rightNow && !(was & 2)) this.press('dash');
    if (!rightNow && was & 2) this.held.delete('dash');
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.device = 'touch';
      if (this.touchId === null) {
        this.touchId = e.pointerId;
        this.toNdc(e, this.touchStart);
        this.aimStart.copy(this.aim);
      }
      return;
    }
    this.device = 'pointer';
    this.toNdc(e, this.aim);
    this.syncButtons(e.buttons);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId === this.touchId) this.touchId = null;
      return;
    }
    this.syncButtons(e.buttons);
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
    if (!this.enabled) return false;
    if (a === 'fire' && (this.autoFire || this.device === 'touch')) return true;
    return this.held.has(a);
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
    this.buttons = 0;
    this.held.clear();
    this.pressed.clear();
    this.keys.clear();
  }

  update() {
    /* pointer state is event driven */
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

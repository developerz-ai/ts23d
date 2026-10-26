// Keyboard and pointer-lock mouse state for play mode. Knows nothing about tanks.

const HANDLED = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export interface Controls {
  /** -1 reverse … 1 forward. */
  readonly throttle: number;
  /** -1 right … 1 left (counter-clockwise seen from above). */
  readonly steer: number;
  /** Keyboard turret traverse, -1 … 1. */
  readonly traverse: number;
  /** Keyboard gun elevation, -1 … 1. */
  readonly elevate: number;
}

export class Input {
  private readonly down = new Set<string>();
  private fireQueued = false;
  private mouseX = 0;
  private mouseY = 0;
  private readonly abort = new AbortController();

  constructor(private readonly surface: HTMLElement) {
    const signal = this.abort.signal;
    window.addEventListener('keydown', (e) => this.key(e, true), { signal });
    window.addEventListener('keyup', (e) => this.key(e, false), { signal });
    window.addEventListener('blur', () => this.down.clear(), { signal });
    surface.addEventListener('click', () => void surface.requestPointerLock?.(), { signal });
    document.addEventListener(
      'mousemove',
      (e) => {
        if (document.pointerLockElement !== surface) return;
        this.mouseX += e.movementX;
        this.mouseY += e.movementY;
      },
      { signal },
    );
  }

  /** Current axes; `fired` and the mouse deltas are consumed by the read. */
  read(): Controls & { fired: boolean; mouseX: number; mouseY: number } {
    const k = (...codes: string[]): number => (codes.some((c) => this.down.has(c)) ? 1 : 0);
    const out = {
      throttle: k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'),
      steer: k('KeyA', 'ArrowLeft') - k('KeyD', 'ArrowRight'),
      traverse: k('KeyQ') - k('KeyE'),
      elevate: k('KeyR') - k('KeyF'),
      fired: this.fireQueued,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
    };
    this.fireQueued = false;
    this.mouseX = 0;
    this.mouseY = 0;
    return out;
  }

  dispose(): void {
    this.abort.abort();
    this.down.clear();
    if (document.pointerLockElement === this.surface) document.exitPointerLock();
  }

  private key(e: KeyboardEvent, pressed: boolean): void {
    if (!HANDLED.has(e.code) || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.closest('input, textarea, select, button, a')) return;
    e.preventDefault();
    if (pressed && e.code === 'Space' && !e.repeat) this.fireQueued = true;
    if (pressed) this.down.add(e.code);
    else this.down.delete(e.code);
  }
}

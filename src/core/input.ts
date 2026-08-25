import type { Settings } from './settings';

export class Input {
  private keys = new Set<string>();
  private settings: Settings | null = null;
  private lookX = 0;
  private lookY = 0;
  private jumpQueued = false;
  private reloadQueued = false;
  fireHeld = false;
  locked = false;
  lockFailed = false;
  captureLook = false;

  capturing = false;
  onCapture: (code: string | null) => void = () => {};

  get sprint(): boolean {
    return this.settings !== null && this.keys.has(this.settings.bindings.sprint);
  }

  get crouch(): boolean {
    return this.settings !== null && this.keys.has(this.settings.bindings.crouch);
  }

  onLockFail: () => void = () => {};

  applySettings(settings: Settings): void {
    this.settings = settings;
  }

  startCapture(): void {
    this.capturing = true;
    this.keys.clear();
    this.fireHeld = false;
  }

  cancelCapture(): void {
    if (this.capturing) {
      this.capturing = false;
      this.onCapture(null);
    }
  }

  private codeForButton(button: number): string {
    return `Mouse${button}`;
  }

  private boundCodes(): Set<string> {
    const out = new Set<string>();
    if (this.settings) {
      for (const code of Object.values(this.settings.bindings)) out.add(code);
    }
    return out;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.capturing) {
      e.preventDefault();
      e.stopPropagation();
      this.capturing = false;
      this.onCapture(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (this.boundCodes().has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) {
      const b = this.settings?.bindings;
      if (b) {
        if (e.code === b.jump) this.jumpQueued = true;
        if (e.code === b.reload) this.reloadQueued = true;
      }
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked && !this.captureLook) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.capturing) {
      e.preventDefault();
      e.stopPropagation();
      this.capturing = false;
      this.onCapture(this.codeForButton(e.button));
      return;
    }
    if (this.locked && this.settings && e.button === Number(this.settings.bindings.fire.slice(5))) {
      this.fireHeld = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === Number((this.settings?.bindings.fire ?? 'Mouse0').slice(5))) {
      this.fireHeld = false;
    }
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement !== null;
    if (!this.locked) {
      this.fireHeld = false;
      this.keys.clear();
      this.lookX = 0;
      this.lookY = 0;
    }
  };

  private onLockError = () => {
    if (!this.lockFailed) {
      this.lockFailed = true;
      this.onLockFail();
    }
  };

  attach(el: HTMLElement): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  requestLock(canvas: HTMLCanvasElement): void {
    try {
      const result = canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => this.onLockError());
      }
    } catch {
      this.onLockError();
    }
  }

  resetLockFail(): void {
    this.lockFailed = false;
  }

  moveInput(): { fwd: number; strafe: number } {
    const b = this.settings?.bindings;
    const fwd = b
      ? (this.keys.has(b.forward) ? 1 : 0) - (this.keys.has(b.back) ? 1 : 0)
      : 0;
    const strafe = b
      ? (this.keys.has(b.right) ? 1 : 0) - (this.keys.has(b.left) ? 1 : 0)
      : 0;
    return { fwd, strafe };
  }

  consumeLook(): { x: number; y: number } {
    let x = this.lookX;
    let y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    if (this.settings) {
      x *= this.settings.access.mouseSens;
      y *= this.settings.access.mouseSens * (this.settings.access.invertY ? -1 : 1);
    }
    return { x, y };
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeReload(): boolean {
    const r = this.reloadQueued;
    this.reloadQueued = false;
    return r;
  }
}

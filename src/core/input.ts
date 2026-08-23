export class Input {
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private jumpQueued = false;
  private reloadQueued = false;
  fireHeld = false;
  locked = false;
  lockFailed = false;
  captureLook = false;

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  onLockFail: () => void = () => {};

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault();
    if (!this.keys.has(e.code)) {
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyR') this.reloadQueued = true;
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
    if (this.locked && e.button === 0) this.fireHeld = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
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

  axis(code: string): number {
    return this.keys.has(code) ? 1 : 0;
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
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

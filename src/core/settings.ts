export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'reload' | 'fire' | 'crouch';

export interface ActionDef {
  id: Action;
  label: string;
}

export const ACTIONS: readonly ActionDef[] = [
  { id: 'forward', label: 'MOVE FORWARD' },
  { id: 'back', label: 'MOVE BACK' },
  { id: 'left', label: 'STRAFE LEFT' },
  { id: 'right', label: 'STRAFE RIGHT' },
  { id: 'jump', label: 'JUMP' },
  { id: 'sprint', label: 'SPRINT' },
  { id: 'crouch', label: 'CROUCH' },
  { id: 'reload', label: 'RELOAD' },
  { id: 'fire', label: 'FIRE' }
];

export type Bindings = Record<Action, string>;

export interface AccessSettings {
  mouseSens: number;
  invertY: boolean;
  fov: number;
  volume: number;
  reducedFlash: boolean;
  crosshairScale: number;
  muzzle: string;
}

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  reload: 'KeyR',
  fire: 'Mouse0'
};

export const DEFAULT_ACCESS: AccessSettings = {
  mouseSens: 1,
  invertY: false,
  fov: 78,
  volume: 1,
  reducedFlash: false,
  crosshairScale: 1,
  muzzle: 'default'
};

export interface MuzzleStyle {
  id: string;
  name: string;
  color: number | null;
  css: string | null;
  requires: string;
}

export const MUZZLE_STYLES: readonly MuzzleStyle[] = [
  { id: 'default', name: 'STANDARD', color: null, css: null, requires: '' },
  { id: 'ember',   name: 'EMBER',    color: 0xff7a3c, css: '#ff7a3c', requires: 'wave5' },
  { id: 'void',    name: 'VOID',     color: 0x9a5cff, css: '#9a5cff', requires: 'bossdown' },
  { id: 'toxin',   name: 'TOXIN',    color: 0x9dff3f, css: '#9dff3f', requires: 'heads50' },
  { id: 'gold',    name: 'GOLD',     color: 0xffd23f, css: '#ffd23f', requires: 'cratejackpot' }
];

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const STORE_KEY = 'pitboss.settings.v1';

const PRETTY: Record<string, string> = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT',
  CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Mouse0: 'MOUSE 1', Mouse1: 'MOUSE 2', Mouse2: 'MOUSE 3', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5'
};

export function prettyCode(code: string): string {
  if (PRETTY[code]) return PRETTY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}

interface StoredShape {
  bindings?: Partial<Bindings>;
  access?: Partial<AccessSettings>;
}

function readStored(): StoredShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredShape) : {};
  } catch {
    return {};
  }
}

export class Settings {
  bindings: Bindings = { ...DEFAULT_BINDINGS };
  access: AccessSettings = { ...DEFAULT_ACCESS };
  private listeners: Array<() => void> = [];

  constructor() {
    this.load();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  rebind(action: Action, code: string): void {
    if (this.bindings[action] === code) return;
    for (const other of ACTIONS) {
      if (other.id !== action && this.bindings[other.id] === code) {
        this.bindings[other.id] = this.bindings[action];
      }
    }
    this.bindings[action] = code;
    this.save();
    this.emit();
  }

  resetBindings(): void {
    this.bindings = { ...DEFAULT_BINDINGS };
    this.save();
    this.emit();
  }

  setAccess(patch: Partial<AccessSettings>): void {
    this.access = { ...this.access, ...patch };
    this.save();
    this.emit();
  }

  /** Compact portable snapshot: bindings + accessibility + style. Segment contains no '-'. */
  exportForCode(): string {
    const a = this.access;
    const binds = ACTIONS.map(act => this.bindings[act.id]).join('.');
    const nums = [
      Math.round(a.mouseSens * 100),
      Math.round(a.fov),
      Math.round(a.volume * 100),
      Math.round(a.crosshairScale * 100),
      a.reducedFlash ? 1 : 0,
      a.invertY ? 1 : 0
    ].join('.');
    return `${binds}.${nums}.${a.muzzle}`;
  }

  /** Apply a snapshot from exportForCode(). Returns false if malformed. */
  importFromCode(segment: string): boolean {
    const parts = segment.split('.');
    if (parts.length !== ACTIONS.length + 7) return false;
    const bindCount = ACTIONS.length;
    const binds = parts.slice(0, bindCount);
    if (binds.some(b => !/^[A-Za-z0-9]{1,20}$/.test(b))) return false;
    const nums = parts.slice(bindCount, bindCount + 6).map(n => parseInt(n, 10));
    if (nums.some(n => Number.isNaN(n))) return false;
    const muzzle = parts[bindCount + 6];
    if (!MUZZLE_STYLES.some(m => m.id === muzzle)) return false;
    const [sens, fov, vol, cross, flash, invert] = nums;
    const nextBindings: Partial<Bindings> = {};
    ACTIONS.forEach((act, i) => { nextBindings[act.id] = binds[i]; });
    this.bindings = { ...this.bindings, ...nextBindings };
    this.access = {
      mouseSens: clampNum(sens / 100, 0.3, 3),
      fov: clampNum(fov, 70, 110),
      volume: clampNum(vol / 100, 0, 1),
      crosshairScale: clampNum(cross / 100, 0.6, 1.8),
      reducedFlash: flash === 1,
      invertY: invert === 1,
      muzzle
    };
    this.save();
    this.emit();
    return true;
  }

  private load(): void {
    const stored = readStored();
    if (stored.bindings) {
      for (const a of ACTIONS) {
        const v = stored.bindings[a.id];
        if (typeof v === 'string' && v.length > 0) this.bindings[a.id] = v;
      }
    }
    if (stored.access) {
      this.access = { ...this.access, ...stored.access };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ bindings: this.bindings, access: this.access }));
    } catch {
      // storage unavailable (private mode etc.) — settings stay session-only
    }
  }
}

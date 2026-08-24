export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'reload' | 'fire';

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
}

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  reload: 'KeyR',
  fire: 'Mouse0'
};

export const DEFAULT_ACCESS: AccessSettings = {
  mouseSens: 1,
  invertY: false,
  fov: 78,
  volume: 1,
  reducedFlash: false,
  crosshairScale: 1
};

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

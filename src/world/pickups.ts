import * as THREE from 'three';
import type { Arena } from './arena';
import type { RNG } from '../utils/rng';
import type { WeaponSpec } from '../weapons/specs';
import { SPECIALS } from '../weapons/specs';

export type PickupKind = 'heal' | 'weapon' | 'shield' | 'overdrive' | 'refill' | 'invuln' | 'sentry';

export type PickupEvent =
  | { type: 'heal' }
  | { type: 'weapon'; spec: WeaponSpec }
  | { type: 'shield'; absorbFrac: number }
  | { type: 'overdrive' }
  | { type: 'refill' }
  | { type: 'invuln' }
  | { type: 'sentry'; pos: THREE.Vector3 }
  | { type: 'expired' };

export interface PickupCallbacks {
  onEvent: (ev: PickupEvent) => void;
}

const HEAL_COLOR = 0xff3355;
const SHIELD_COLOR = 0x3fa7ff;
const OVERDRIVE_COLOR = 0xff2244;
const REFILL_COLOR = 0x9dff3f;
const INVULN_COLOR = 0xffd23f;
const SENTRY_COLOR = 0xc15cff;
const PICKUP_RADIUS = 1.0;

const LIFE: Record<PickupKind, number> = {
  heal: 20,
  weapon: 15,
  shield: 15,
  overdrive: 12,
  refill: 15,
  invuln: 12,
  sentry: 12
};

function colorFor(kind: PickupKind, spec: WeaponSpec | null): number {
  switch (kind) {
    case 'heal': return HEAL_COLOR;
    case 'shield': return SHIELD_COLOR;
    case 'overdrive': return OVERDRIVE_COLOR;
    case 'refill': return REFILL_COLOR;
    case 'invuln': return INVULN_COLOR;
    case 'sentry': return SENTRY_COLOR;
    default: return spec!.tracerColor;
  }
}

class Pickup {
  readonly group = new THREE.Group();
  readonly event: PickupEvent;

  private ring: THREE.Mesh;
  private core: THREE.Object3D;
  private life: number;
  private maxLife: number;
  private animT = Math.random() * 10;
  private done = false;

  constructor(kind: PickupKind, spec: WeaponSpec | null, pos: THREE.Vector3) {
    const color = colorFor(kind, spec);
    this.life = LIFE[kind];
    this.maxLife = this.life;
    this.event = Pickup.makeEvent(kind, spec, pos);

    this.core =
      kind === 'heal' ? this.buildHeart()
      : kind === 'shield' ? this.buildShield(color)
      : kind === 'overdrive' ? this.buildOverdrive(color)
      : kind === 'refill' ? this.buildRefill(color)
      : kind === 'invuln' ? this.buildInvuln(color)
      : kind === 'sentry' ? this.buildSentry(color)
      : this.buildGun(spec!.tracerColor);
    this.core.position.y = 0.75;
    this.group.add(this.core);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.035, 6, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 2.8, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    beacon.position.y = 1.5;
    this.group.add(beacon);

    this.group.position.copy(pos);
  }

  private static makeEvent(kind: PickupKind, spec: WeaponSpec | null, pos: THREE.Vector3): PickupEvent {
    switch (kind) {
      case 'heal': return { type: 'heal' };
      case 'weapon': return { type: 'weapon', spec: spec! };
      case 'shield': {
        const frac = 0.65 + Math.random() * 0.15;
        return { type: 'shield', absorbFrac: Math.round(frac * 100) / 100 };
      }
      case 'overdrive': return { type: 'overdrive' };
      case 'invuln': return { type: 'invuln' };
      case 'sentry': return { type: 'sentry', pos: pos.clone() };
      default: return { type: 'refill' };
    }
  }

  private buildHeart(): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff3355, emissive: 0xff3355, emissiveIntensity: 1.7, roughness: 0.3, metalness: 0.1
    });
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), mat);
    s1.position.set(-0.085, 0.07, 0);
    const s2 = s1.clone();
    s2.position.x = 0.085;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.1), mat);
    tip.rotation.z = Math.PI / 4;
    tip.position.y = -0.045;
    g.add(s1, s2, tip);
    g.scale.setScalar(1.5);
    return g;
  }

  private buildGun(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.45),
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.4
    });
    const glow = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.13), mat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.42, 10), glow);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.46, 0.03, 0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.11), mat);
    grip.position.set(-0.18, -0.17, 0);
    grip.rotation.z = 0.32;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 10), glow);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 0.16, 0);
    const underglow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.17), glow);
    underglow.position.y = -0.12;
    g.add(body, barrel, grip, tank, underglow);
    g.rotation.z = -0.12;
    g.scale.setScalar(1.5);
    return g;
  }

  private buildSentry(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2438, roughness: 0.5, metalness: 0.55
    });
    const glowMat = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 10), bodyMat);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8), bodyMat);
    column.position.y = 0.14;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    dome.position.y = 0.24;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.02, 0.3, 0.16);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), glowMat);
    eye.position.set(-0.07, 0.31, 0.09);
    g.add(base, column, dome, barrel, eye);
    g.scale.setScalar(1.6);
    return g;
  }

  private buildShield(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.4),
      emissive: color,
      emissiveIntensity: 1.3,
      roughness: 0.25,
      metalness: 0.5
    });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6), mat);
    shell.rotation.x = Math.PI / 2;
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    inner.position.z = 0.06;
    const emblem = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    emblem.position.z = 0.062;
    emblem.rotation.y = Math.PI;
    g.add(shell, inner, emblem);
    g.scale.setScalar(1.6);
    return g;
  }

  private buildOverdrive(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.5),
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.3,
      metalness: 0.35
    });
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
    shard.scale.y = 1.7;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.025, 6, 24),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.y = 0.02;
    g.add(shard, halo);
    g.scale.setScalar(1.45);
    return g;
  }

  private buildInvuln(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.5),
      emissive: color,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.4
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), coreMat);
    const shellMat = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const shellA = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 1), shellMat);
    const shellB = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), shellMat);
    g.add(core, shellA, shellB);
    g.userData.spinA = shellA;
    g.userData.spinB = shellB;
    g.scale.setScalar(1.5);
    return g;
  }

  private buildRefill(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2d22,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.3
    });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.36), mat);
    const stripeA = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.045, 0.1),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    stripeA.position.y = 0.06;
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.4),
      emissive: color,
      emissiveIntensity: 1.6
    }));
    bolt.position.set(0, 0.24, 0);
    bolt.scale.y = 1.8;
    g.add(crate, stripeA, bolt);
    g.scale.setScalar(1.4);
    return g;
  }

  update(dt: number, playerFeet: THREE.Vector3): PickupEvent | null {
    if (this.done) return null;
    this.life -= dt;
    this.animT += dt;

    const frac = Math.max(0, this.life / this.maxLife);
    this.ring.scale.setScalar(0.35 + frac * 0.75);
    const blink = this.life < 4 ? 0.35 + 0.55 * Math.abs(Math.sin(this.animT * 9)) : 0.9;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = blink * frac;

    this.core.position.y = 0.75 + Math.sin(this.animT * 2.4) * 0.12;
    this.core.rotation.y += dt * (this.event.type === 'overdrive' ? 3.2 : 1.6);
    if (this.event.type === 'invuln') {
      const a = this.core.userData.spinA as THREE.Object3D | undefined;
      const b = this.core.userData.spinB as THREE.Object3D | undefined;
      if (a) { a.rotation.y += dt * 2.8; a.rotation.x += dt * 1.3; }
      if (b) { b.rotation.y -= dt * 1.9; b.rotation.z += dt * 1.1; }
    }

    if (this.life <= 0) {
      this.done = true;
      return { type: 'expired' };
    }

    const dx = playerFeet.x - this.group.position.x;
    const dz = playerFeet.z - this.group.position.z;
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && playerFeet.y < 1.6) {
      this.done = true;
      return this.event;
    }
    return null;
  }

  get removable(): boolean {
    return this.done;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
  }
}

export class PickupManager {
  private active: Pickup[] = [];
  private lastSpecialId: string | null = null;

  constructor(
    private scene: THREE.Scene,
    private arena: Arena,
    private rng: RNG,
    private callbacks: PickupCallbacks
  ) {}

  spawnAtRandom(kind: PickupKind, spec: WeaponSpec | null = null): void {
    const point = this.findOpenPoint();
    if (!point) return;
    this.spawnAtPoint(kind, point, spec);
  }

  spawnAtPoint(kind: PickupKind, point: THREE.Vector3, spec: WeaponSpec | null = null): WeaponSpec | null {
    let chosen: WeaponSpec | null = null;
    if (kind === 'weapon') {
      if (spec) {
        chosen = spec;
      } else {
        const pool = SPECIALS.filter(s => s.id !== this.lastSpecialId);
        chosen = this.rng.pick(pool.length > 0 ? pool : SPECIALS);
        this.lastSpecialId = chosen.id;
      }
    }
    const p = new Pickup(kind, chosen, point.clone());
    p.group.position.y = 0;
    this.scene.add(p.group);
    this.active.push(p);
    return chosen;
  }

  get count(): number {
    return this.active.length;
  }

  get lastSpecial(): string | null {
    return this.lastSpecialId;
  }

  private findOpenPoint(): THREE.Vector3 | null {
    for (let i = 0; i < 16; i++) {
      const x = this.rng.range(-16, 16);
      const z = this.rng.range(-16, 16);
      if (this.arena.isClear(x, z, 0.8)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  update(dt: number, playerFeet: THREE.Vector3): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const ev = p.update(dt, playerFeet);
      if (ev && ev.type !== 'expired') this.callbacks.onEvent(ev);
      if (p.removable) {
        p.dispose(this.scene);
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.active) p.dispose(this.scene);
    this.active.length = 0;
    this.lastSpecialId = null;
  }
}

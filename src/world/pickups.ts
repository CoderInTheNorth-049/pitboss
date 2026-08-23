import * as THREE from 'three';
import type { Arena } from './arena';
import type { RNG } from '../utils/rng';
import type { WeaponSpec } from '../weapons/specs';
import { SPECIALS } from '../weapons/specs';

export type PickupEvent =
  | { type: 'heal' }
  | { type: 'weapon'; spec: WeaponSpec }
  | { type: 'expired' };

export interface PickupCallbacks {
  onEvent: (ev: PickupEvent) => void;
}

const HEAL_COLOR = 0xff3355;
const PICKUP_RADIUS = 1.0;
const HEAL_LIFE = 20;
const WEAPON_LIFE = 15;

class Pickup {
  readonly group = new THREE.Group();
  readonly event: PickupEvent;

  private ring: THREE.Mesh;
  private core: THREE.Object3D;
  private life: number;
  private maxLife: number;
  private animT = Math.random() * 10;
  private done = false;

  constructor(kind: 'heal' | 'weapon', spec: WeaponSpec | null, pos: THREE.Vector3) {
    const color = kind === 'heal' ? HEAL_COLOR : spec!.tracerColor;
    this.life = kind === 'heal' ? HEAL_LIFE : WEAPON_LIFE;
    this.maxLife = this.life;
    this.event = kind === 'heal' ? { type: 'heal' } : { type: 'weapon', spec: spec! };

    this.core = kind === 'heal' ? this.buildHeart() : this.buildGun(spec!.tracerColor);
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
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.09), glow);
    barrel.position.set(0.46, 0.03, 0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.11), mat);
    grip.position.set(-0.18, -0.17, 0);
    grip.rotation.z = 0.32;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.15), glow);
    cell.position.set(0.04, 0.14, 0);
    const underglow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.17), glow);
    underglow.position.y = -0.12;
    g.add(body, barrel, grip, cell, underglow);
    g.rotation.z = -0.12;
    g.scale.setScalar(1.5);
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
    this.core.rotation.y += dt * 1.6;

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

  constructor(
    private scene: THREE.Scene,
    private arena: Arena,
    private rng: RNG,
    private callbacks: PickupCallbacks
  ) {}

  spawnAtRandom(kind: 'heal' | 'weapon', spec: WeaponSpec | null = null): void {
    const point = this.findOpenPoint();
    if (!point) return;
    this.spawnAtPoint(kind, point, spec);
  }

  spawnAtPoint(kind: 'heal' | 'weapon', point: THREE.Vector3, spec: WeaponSpec | null = null): void {
    const chosen = kind === 'weapon' ? (spec ?? this.rng.pick(SPECIALS)) : null;
    const p = new Pickup(kind, chosen, point);
    this.scene.add(p.group);
    this.active.push(p);
  }

  get count(): number {
    return this.active.length;
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
  }
}

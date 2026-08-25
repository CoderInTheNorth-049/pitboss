import * as THREE from 'three';
import type { Arena } from './arena';
import type { Effects } from '../vfx/effects';
import type { Sfx } from '../audio/sfx';
import { CONFIG } from '../config';

const S = CONFIG.sentry;

export interface SentryEnemyLike {
  state: string;
  center: THREE.Vector3;
}

export interface SentryContext<T extends SentryEnemyLike = SentryEnemyLike> {
  enemies: readonly T[];
  arena: Arena;
  fx: Effects;
  sfx: Sfx;
  onDamage: (enemy: T, dmg: number) => 'hit' | 'dead';
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Sentry<T extends SentryEnemyLike = SentryEnemyLike> {
  readonly group = new THREE.Group();
  private head = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private barrel: THREE.Mesh;

  private life: number;
  private cooldown = 0.6;
  private yaw = 0;
  private deployT = 0;
  private kick = 0;
  private done = false;
  private dmgMul: number;
  private retargetT = 0;
  private target: T | null = null;

  constructor(pos: THREE.Vector3, durMul = 1, dmgMul = 1) {
    this.life = S.duration * durMul;
    this.dmgMul = dmgMul;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.5, metalness: 0.6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xc15cff, blending: THREE.AdditiveBlending, depthWrite: false });
    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xc15cff).multiplyScalar(0.4),
      emissive: 0xc15cff, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5
    });

    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Object3D();
      pivot.rotation.y = (i / 3) * Math.PI * 2 + 0.52;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.72, 7), bodyMat);
      leg.position.set(0.26, 0.21, 0);
      leg.rotation.z = -1.1;
      pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.05, 8), bodyMat);
      foot.position.set(0.47, 0.025, 0);
      pivot.add(foot);
      this.group.add(pivot);
    }

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.62, 10), bodyMat);
    column.position.y = 0.68;
    this.group.add(column);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 14), glowMat);
    collar.rotation.x = -Math.PI / 2;
    collar.position.y = 0.94;
    this.group.add(collar);

    this.head.position.y = 1.06;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.38), bodyMat);
    chassis.position.y = -0.02;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), accentMat);
    eye.position.set(0.09, 0.05, 0.16);
    this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.56, 9), bodyMat);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(-0.05, 0.01, 0.24);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.2), glowMat);
    vent.position.set(0.13, -0.02, 0.05);
    this.muzzle.position.set(-0.05, 0.01, 0.53);
    this.head.add(dome, chassis, eye, this.barrel, vent, this.muzzle);
    this.group.add(this.head);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc15cff, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const rangeRing = new THREE.Mesh(new THREE.RingGeometry(S.range - 0.12, S.range, 64), ringMat);
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.y = 0.04;
    this.group.add(rangeRing);

    this.group.position.copy(pos);
    this.yaw = Math.random() * Math.PI * 2;
    this.head.rotation.y = this.yaw;
    this.group.scale.set(1, 0.01, 1);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  get expired(): boolean {
    return this.done;
  }

  update(dt: number, ctx: SentryContext<T>): void {
    if (this.done) return;
    this.life -= dt;
    this.cooldown -= dt;

    if (this.deployT < 1) {
      this.deployT = Math.min(1, this.deployT + dt / 0.35);
      const s = 0.01 + 0.99 * (1 - Math.pow(1 - this.deployT, 3));
      this.group.scale.set(1, s, 1);
    }

    this.kick = Math.max(0, this.kick - dt * 3);
    this.barrel.position.z = 0.24 - this.kick * 0.09;

    const origin = new THREE.Vector3();
    this.muzzle.getWorldPosition(origin);

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || this.target.state === 'dead') {
      this.retargetT = 0.15;
      this.target = this.acquireTarget(ctx, origin);
    }
    let best = this.target;
    if (best && origin.distanceTo(best.center) > S.range) {
      this.target = null;
      best = null;
    }

    if (best) {
      const to = best.center.clone().sub(this.group.position);
      const desired = Math.atan2(to.x, to.z);
      const diff = shortestAngle(this.yaw, desired);
      const step = S.turnSpeed * dt;
      this.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      this.head.rotation.y = this.yaw;

      if (Math.abs(diff) < S.aimTolerance && this.cooldown <= 0) {
        this.cooldown = S.fireInterval;
        this.kick = 1;
        ctx.fx.tracer(
          origin,
          best.center.clone(),
          0xc15cff, 0.1, 0.025
        );
        ctx.fx.muzzleFlash(origin, 0xc15cff);
        ctx.fx.impact(best.center, 0xd9a0ff);
        ctx.sfx.sentryShot();
        ctx.onDamage(best, Math.round(S.damage * this.dmgMul));
      }
    }

    if (this.life <= 0) {
      this.done = true;
      ctx.sfx.sentryDown();
    }
  }

  private acquireTarget(ctx: SentryContext<T>, origin: THREE.Vector3): T | null {
    let best: T | null = null;
    let bestD = Infinity;
    for (const e of ctx.enemies) {
      if (e.state === 'dead') continue;
      const d = origin.distanceTo(e.center);
      if (d > S.range || d >= bestD) continue;
      if (ctx.arena.losBlocked(origin, e.center)) continue;
      best = e;
      bestD = d;
    }
    return best;
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

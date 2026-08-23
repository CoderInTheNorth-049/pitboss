import * as THREE from 'three';
import type { Effects } from '../vfx/effects';
import type { Sfx } from '../audio/sfx';
import { DEFAULT_SPEC, type WeaponSpec, type WeaponSoundId } from './specs';

export interface ShotTarget {
  hitCenter: THREE.Vector3;
  hitRadius: number;
  onHit: (damage: number) => 'hit' | 'dead';
}

export interface WeaponContext {
  arenaColliders: THREE.Box3[];
  effects: Effects;
  sfx: Sfx;
}

export interface FireResult {
  fired: boolean;
  killed: boolean;
  hitSomething: boolean;
  recoil: number;
}

export class Weapon {
  spec: WeaponSpec = DEFAULT_SPEC;
  ammo = DEFAULT_SPEC.magSize;
  reloading = false;
  specialT = 0;
  onSpecialEnd: () => void = () => {};

  private reloadT = 0;
  private cooldown = 0;
  bloom = 0;

  get isSpecial(): boolean {
    return this.spec.specialDuration > 0;
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        this.ammo = this.spec.magSize;
      }
    }
    this.bloom = Math.max(0, this.bloom - 0.11 * dt);
    if (this.isSpecial && this.specialT > 0) {
      this.specialT -= dt;
      if (this.specialT <= 0) this.revertToDefault();
    }
  }

  equipSpecial(spec: WeaponSpec): void {
    this.spec = spec;
    this.ammo = spec.magSize;
    this.specialT = spec.specialDuration;
    this.reloading = false;
    this.bloom = 0;
  }

  private revertToDefault(): void {
    this.spec = DEFAULT_SPEC;
    this.ammo = DEFAULT_SPEC.magSize;
    this.specialT = 0;
    this.reloading = false;
    this.onSpecialEnd();
  }

  reset(): void {
    this.spec = DEFAULT_SPEC;
    this.ammo = DEFAULT_SPEC.magSize;
    this.specialT = 0;
    this.reloading = false;
    this.bloom = 0;
    this.cooldown = 0;
  }

  canFire(): boolean {
    return !this.reloading && this.cooldown <= 0 && this.ammo > 0;
  }

  startReload(): boolean {
    if (this.reloading || this.ammo === this.spec.magSize) return false;
    this.reloading = true;
    this.reloadT = this.spec.reloadTime;
    return true;
  }

  fire(
    origin: THREE.Vector3,
    baseDir: THREE.Vector3,
    targets: readonly ShotTarget[],
    ctx: WeaponContext
  ): FireResult {
    if (!this.canFire()) {
      if (!this.reloading && this.ammo <= 0) {
        this.startReload();
        ctx.sfx.reload();
      }
      return { fired: false, killed: false, hitSomething: false, recoil: 0 };
    }

    const spec = this.spec;
    this.cooldown = spec.fireInterval;
    this.ammo--;
    this.bloom = Math.min(spec.bloomMax, this.bloom + spec.bloomPerShot);
    this.playSound(ctx.sfx, spec.sound);

    const wallT = this.castWall(origin, baseDir, ctx.arenaColliders);
    const endPoint = origin.clone().addScaledVector(baseDir, wallT);
    ctx.effects.muzzleFlash(origin, spec.tracerColor);

    let killed = false;
    let hitSomething = false;

    for (let p = 0; p < spec.pellets; p++) {
      const dir = this.applySpread(baseDir, spec);
      const pelletEnd = spec.pellets > 1
        ? origin.clone().addScaledVector(dir, Math.min(wallT, spec.pierce ? 120 : wallT))
        : endPoint;

      if (spec.pierce) {
        const hits = this.collectHits(origin, dir, targets, wallT);
        if (hits.length > 0) {
          hitSomething = true;
          const pierceEnd = hits[hits.length - 1].t + 1.2;
          ctx.effects.tracer(
            origin.clone().addScaledVector(dir, 0.6),
            origin.clone().addScaledVector(dir, Math.min(pierceEnd, wallT)),
            spec.tracerColor, spec.tracerLife, spec.tracerWidth
          );
          for (const h of hits) {
            if (h.onHit(spec.damage) === 'dead') killed = true;
          }
        } else {
          ctx.effects.tracer(
            origin.clone().addScaledVector(dir, 0.6),
            origin.clone().addScaledVector(dir, wallT),
            spec.tracerColor, spec.tracerLife, spec.tracerWidth
          );
          if (wallT < 120) ctx.effects.impact(endPoint, 0x8a8a94);
        }
        void pelletEnd;
      } else {
        const best = this.nearestHit(origin, dir, targets, wallT);
        const end = best
          ? origin.clone().addScaledVector(dir, best.t)
          : origin.clone().addScaledVector(dir, wallT);
        ctx.effects.tracer(
          origin.clone().addScaledVector(dir, 0.6),
          end, spec.tracerColor, spec.tracerLife, spec.tracerWidth
        );
        if (best) {
          hitSomething = true;
          if (best.target.onHit(spec.damage) === 'dead') killed = true;
        } else if (wallT < 120) {
          ctx.effects.impact(end, 0x8a8a94);
        }
      }
    }

    return { fired: true, killed, hitSomething, recoil: spec.recoilKick };
  }

  private castWall(origin: THREE.Vector3, dir: THREE.Vector3, colliders: THREE.Box3[]): number {
    const ray = new THREE.Ray(origin, dir);
    let best = 120;
    const tmp = new THREE.Vector3();
    for (const b of colliders) {
      const p = ray.intersectBox(b, tmp);
      if (p) {
        const d = p.distanceTo(ray.origin);
        if (d < best) best = d;
      }
    }
    return best;
  }

  private collectHits(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    targets: readonly ShotTarget[],
    maxT: number
  ): Array<{ t: number; onHit: (d: number) => 'hit' | 'dead' }> {
    const ray = new THREE.Ray(origin, dir);
    const hits: Array<{ t: number; onHit: (d: number) => 'hit' | 'dead' }> = [];
    for (const t of targets) {
      const hit = raySphere(ray, t.hitCenter, t.hitRadius);
      if (hit !== null && hit <= maxT) {
        hits.push({ t: hit, onHit: t.onHit });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  private nearestHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    targets: readonly ShotTarget[],
    maxT: number
  ): { t: number; target: ShotTarget } | null {
    const ray = new THREE.Ray(origin, dir);
    let bestT = maxT;
    let best: ShotTarget | null = null;
    for (const t of targets) {
      const hit = raySphere(ray, t.hitCenter, t.hitRadius);
      if (hit !== null && hit < bestT) {
        bestT = hit;
        best = t;
      }
    }
    return best ? { t: bestT, target: best } : null;
  }

  private applySpread(base: THREE.Vector3, spec: WeaponSpec): THREE.Vector3 {
    const spread = spec.spreadBase + this.bloom;
    const dir = base.clone();
    const u = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.y) > 0.95) u.set(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(dir, u).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const angle = Math.sqrt(Math.random()) * spread;
    const around = Math.random() * Math.PI * 2;
    dir.addScaledVector(right, Math.cos(around) * Math.sin(angle))
       .addScaledVector(up, Math.sin(around) * Math.sin(angle))
       .normalize();
    return dir;
  }

  private playSound(sfx: Sfx, id: WeaponSoundId): void {
    if (id === 'rail') sfx.rail();
    else if (id === 'shotgun') sfx.shotgun();
    else sfx.shot();
  }
}

function raySphere(ray: THREE.Ray, center: THREE.Vector3, radius: number): number | null {
  const lx = center.x - ray.origin.x;
  const ly = center.y - ray.origin.y;
  const lz = center.z - ray.origin.z;
  const tca = lx * ray.direction.x + ly * ray.direction.y + lz * ray.direction.z;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  return t > 0 ? t : null;
}

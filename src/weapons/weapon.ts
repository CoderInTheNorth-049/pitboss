import * as THREE from 'three';
import type { Effects } from '../vfx/effects';
import type { Sfx } from '../audio/sfx';
import { DEFAULT_SPEC, type WeaponSpec, type WeaponSoundId } from './specs';

export interface ShotTarget {
  hitCenter: THREE.Vector3;
  hitRadius: number;
  onHit: (damage: number) => 'hit' | 'dead';
  onBurn?: (dps: number, duration: number) => void;
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

const MAX_RANGE = 120;

export class Weapon {
  spec: WeaponSpec = DEFAULT_SPEC;
  ammo = DEFAULT_SPEC.magSize;
  reloading = false;
  specialT = 0;
  onSpecialEnd: () => void = () => {};
  damageMul = 1;
  freeFire = false;

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
    this.damageMul = 1;
    this.freeFire = false;
  }

  canFire(): boolean {
    return !this.reloading && this.cooldown <= 0 && (this.freeFire || this.ammo > 0);
  }

  startReload(): boolean {
    if (this.freeFire) return false;
    if (this.reloading || this.ammo === this.spec.magSize) return false;
    this.reloading = true;
    this.reloadT = this.spec.reloadTime;
    return true;
  }

  wallDistance(origin: THREE.Vector3, dir: THREE.Vector3, colliders: THREE.Box3[]): number {
    return this.castWall(origin, dir, colliders);
  }

  fire(
    origin: THREE.Vector3,
    baseDir: THREE.Vector3,
    targets: readonly ShotTarget[],
    ctx: WeaponContext
  ): FireResult {
    if (!this.canFire()) {
      if (!this.freeFire && !this.reloading && this.ammo <= 0) {
        this.startReload();
        ctx.sfx.reload();
      }
      return { fired: false, killed: false, hitSomething: false, recoil: 0 };
    }

    const spec = this.spec;
    this.cooldown = spec.fireInterval;
    if (!this.freeFire) this.ammo--;
    this.bloom = Math.min(spec.bloomMax, this.bloom + spec.bloomPerShot);
    this.playSound(ctx.sfx, spec.sound);

    const damage = Math.round(spec.damage * this.damageMul);

    if (spec.mode === 'cone') return this.fireCone(origin, baseDir, targets, ctx, damage);

    const wallT = this.castWall(origin, baseDir, ctx.arenaColliders);
    const endPoint = origin.clone().addScaledVector(baseDir, wallT);
    ctx.effects.muzzleFlash(origin, spec.tracerColor);

    let killed = false;
    let hitSomething = false;

    for (let p = 0; p < spec.pellets; p++) {
      const dir = this.applySpread(baseDir, spec);

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
            if (h.onHit(damage) === 'dead') killed = true;
          }
        } else {
          ctx.effects.tracer(
            origin.clone().addScaledVector(dir, 0.6),
            origin.clone().addScaledVector(dir, wallT),
            spec.tracerColor, spec.tracerLife, spec.tracerWidth
          );
          if (wallT < MAX_RANGE) ctx.effects.impact(endPoint, 0x8a8a94);
        }
      } else {
        const best = this.nearestHit(origin, dir, targets, wallT);
        const end = best
          ? origin.clone().addScaledVector(dir, best.t)
          : origin.clone().addScaledVector(baseDir, wallT);
        ctx.effects.tracer(
          origin.clone().addScaledVector(dir, 0.6),
          end, spec.tracerColor, spec.tracerLife, spec.tracerWidth
        );
        if (best) {
          hitSomething = true;
          if (best.target.onHit(damage) === 'dead') killed = true;
        } else if (wallT < MAX_RANGE) {
          ctx.effects.impact(end, 0x8a8a94);
        }
      }
    }

    return { fired: true, killed, hitSomething, recoil: spec.recoilKick };
  }

  private fireCone(
    origin: THREE.Vector3,
    baseDir: THREE.Vector3,
    targets: readonly ShotTarget[],
    ctx: WeaponContext,
    damage: number
  ): FireResult {
    const spec = this.spec;
    const flatDir = new THREE.Vector3(baseDir.x, 0, baseDir.z).normalize();
    const wallT = this.castWall(origin, baseDir, ctx.arenaColliders);
    ctx.effects.muzzleFlash(origin, spec.tracerColor);

    let killed = false;
    let hitAny = false;

    interface ConeHit {
      dist: number;
      angle: number;
      target: ShotTarget;
    }
    const candidates: ConeHit[] = [];

    for (const t of targets) {
      const toT = t.hitCenter.clone().sub(origin);
      const dist = toT.length();
      if (dist > spec.range || dist >= wallT) continue;
      const flat = new THREE.Vector3(toT.x, 0, toT.z);
      const angle = flat.lengthSq() > 1e-6 ? flat.normalize().angleTo(flatDir) : 0;
      candidates.push({ dist, angle, target: t });
    }

    const primaries = candidates
      .filter(c => c.angle <= spec.coneAngle)
      .sort((a, b) => a.dist - b.dist);

    for (const h of primaries) {
      hitAny = true;
      if (h.target.onHit(damage) === 'dead') killed = true;
      if (h.target.onBurn) h.target.onBurn(spec.burnDps * this.damageMul, spec.burnDuration);
    }

    if (primaries.length > 0 && spec.splashRadius > 0) {
      const anchor = primaries[0].target.hitCenter;
      for (const c of candidates) {
        if (c.angle <= spec.coneAngle) continue;
        if (c.target.hitCenter.distanceTo(anchor) > spec.splashRadius) continue;
        hitAny = true;
        if (c.target.onHit(Math.round(damage * 0.6)) === 'dead') killed = true;
        if (c.target.onBurn) {
          c.target.onBurn(spec.burnDps * 0.6 * this.damageMul, spec.burnDuration);
        }
      }
    }

    if (wallT < spec.range) {
      ctx.effects.impact(origin.clone().addScaledVector(baseDir, wallT), 0x5c4a38);
    }

    return { fired: true, killed, hitSomething: hitAny, recoil: spec.recoilKick };
  }

  private castWall(origin: THREE.Vector3, dir: THREE.Vector3, colliders: THREE.Box3[]): number {
    const ray = new THREE.Ray(origin, dir);
    let best = MAX_RANGE;
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
    else if (id === 'flame') sfx.flame();
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

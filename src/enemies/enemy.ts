import * as THREE from 'three';
import { CONFIG } from '../config';
import { Motor } from '../utils/motor';
import { clamp } from '../utils/math';
import type { Arena } from '../world/arena';
import type { Effects } from '../vfx/effects';
import type { Sfx } from '../audio/sfx';
import type { RNG } from '../utils/rng';
import { TIERS, type EnemyStats, type TraitId } from './traits';

export interface SpawnData {
  rivalId: string;
  name: string;
  tier: number;
  traitIds: TraitId[];
}

export interface EnemyContext {
  playerFeet: THREE.Vector3;
  playerEye: THREE.Vector3;
  playerSpeed: number;
  arena: Arena;
  fx: Effects;
  sfx: Sfx;
  rng: RNG;
  onPlayerHit: (damage: number, killer: Enemy) => void;
}

type State = 'rising' | 'combat' | 'dead';

const E = CONFIG.enemy;

let idCounter = 0;

function makeNameSprite(name: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const g = canvas.getContext('2d')!;
  g.font = '700 22px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = color;
  g.fillText(name.slice(0, 22), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 }));
  sprite.scale.set(2.1, 0.4, 1);
  return sprite;
}

export class Enemy {
  readonly instanceId = ++idCounter;
  readonly group = new THREE.Group();
  readonly motor: Motor;
  readonly data: SpawnData;
  stats: EnemyStats;

  hp: number;
  maxHp: number;
  state: State = 'rising';
  deathT = 0;
  removeMe = false;

  private bodyMat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshStandardMaterial;
  private eye: THREE.Mesh;
  private nameSprite: THREE.Sprite | null = null;
  private flashT = 0;
  private riseT = 0.7;
  private losT = 0;
  private hasLos = false;
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private strafeFlipT = 0;
  private cooldownT = 1.0;
  private telegraphT = -1;
  private burstLeft = 0;
  private burstGapT = 0;
  private nameVisibleT = 0;
  private stuckCheckT = 0.5;
  private lastCheckPos = new THREE.Vector3();
  private unstuckT = 0;
  private unstuckDir = new THREE.Vector3();

  constructor(data: SpawnData, stats: EnemyStats, spawnPoint: THREE.Vector3) {
    this.data = data;
    this.stats = stats;
    const tierColor = TIERS[Math.min(data.tier, TIERS.length - 1)].color;

    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.motor = new Motor(0.45 * stats.scale, 1.75 * stats.scale, CONFIG.player.gravity, 0.55);
    this.motor.pos.copy(spawnPoint);
    this.motor.pos.y = -1.7 * stats.scale;

    const geo = new THREE.CapsuleGeometry(0.42 * stats.scale, 0.85 * stats.scale, 6, 14);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tierColor).multiplyScalar(0.5),
      roughness: 0.5,
      metalness: 0.25,
      emissive: new THREE.Color(tierColor),
      emissiveIntensity: 0.35
    });
    const body = new THREE.Mesh(geo, this.bodyMat);
    body.position.y = 0.42 * stats.scale + (0.85 * stats.scale) / 2;
    body.castShadow = true;
    this.group.add(body);

    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      emissive: new THREE.Color(tierColor),
      emissiveIntensity: 3
    });
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 * stats.scale, 10, 10), this.eyeMat);
    this.eye.position.set(0, 0.42 * stats.scale + 0.85 * stats.scale + 0.05, 0.34 * stats.scale);
    this.group.add(this.eye);

    if (data.tier >= 2 || data.traitIds.length > 0) {
      this.nameSprite = makeNameSprite(data.name, tierColor);
      this.nameSprite.position.y = 1.95 * stats.scale + 0.35;
      this.group.add(this.nameSprite);
    }
  }

  get center(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0, 0.9 * this.stats.scale, 0));
  }

  get hitRadius(): number {
    return 0.58 * this.stats.scale;
  }

  addTo(scene: THREE.Scene): void {
    this.group.position.copy(this.motor.pos);
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      if (mat) {
        const maybeMap = (mat as unknown as { map?: THREE.Texture }).map;
        if (maybeMap) maybeMap.dispose();
        mat.dispose();
      }
    });
  }

  takeDamage(amount: number): 'hit' | 'dead' {
    if (this.state === 'dead') return 'hit';
    this.flashT = 0.1;
    this.hp -= amount;
    if (this.telegraphT > 0 && Math.random() < 0.35) {
      this.telegraphT = -1;
      this.cooldownT = this.stats.cooldownScale * 0.8;
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0.55;
      return 'dead';
    }
    return 'hit';
  }

  update(dt: number, ctx: EnemyContext): void {
    switch (this.state) {
      case 'rising': {
        this.riseT -= dt;
        const t = 1 - Math.max(0, this.riseT / 0.7);
        this.motor.pos.y = -1.7 * this.stats.scale * (1 - easeOut(t));
        this.group.position.copy(this.motor.pos);
        if (this.riseT <= 0) {
          this.motor.pos.y = 0;
          this.state = 'combat';
          ctx.fx.spawnRing(this.center, TIERS[Math.min(this.data.tier, TIERS.length - 1)].color);
        }
        return;
      }
      case 'dead': {
        this.deathT -= dt;
        const s = Math.max(0.01, this.deathT / 0.55);
        this.group.scale.setScalar(s);
        this.group.rotation.x += dt * 5;
        if (this.deathT <= 0) this.removeMe = true;
        return;
      }
      case 'combat':
        break;
    }

    this.flashT = Math.max(0, this.flashT - dt);
    this.bodyMat.emissiveIntensity = 0.35 + (this.flashT > 0 ? 2.2 : 0);

    const toPlayer = ctx.playerFeet.clone().sub(this.motor.pos);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    const eyePos = this.motor.pos.clone().add(new THREE.Vector3(0, 1.5 * this.stats.scale, 0));

    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.15;
      this.hasLos = !ctx.arena.losBlocked(eyePos, ctx.playerEye);
    }

    let wishX = 0;
    let wishZ = 0;
    const nx = dist > 0.001 ? toPlayer.x / dist : 0;
    const nz = dist > 0.001 ? toPlayer.z / dist : 0;

    if (!this.hasLos || dist > E.maxDist + 5) {
      wishX = nx;
      wishZ = nz;
    } else if (dist > E.maxDist) {
      wishX = nx * 0.8;
      wishZ = nz * 0.8;
    } else if (dist < E.minDist) {
      wishX = -nx * 0.8;
      wishZ = -nz * 0.8;
    } else {
      this.strafeFlipT -= dt;
      if (this.strafeFlipT <= 0) {
        this.strafeFlipT = ctx.rng.range(1.2, 2.6);
        if (ctx.rng.chance(this.data.traitIds.includes('phantom') ? 0.8 : 0.5)) this.strafeDir *= -1;
      }
      wishX = -nz * this.strafeDir;
      wishZ = nx * this.strafeDir;
    }

    const speed = this.hasLos && dist <= E.maxDist
      ? this.stats.strafeSpeed
      : this.stats.speed;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0.001) {
      this.motor.slideAxis(ctx.arena, 'x', (wishX / wl) * speed * dt);
      this.motor.slideAxis(ctx.arena, 'z', (wishZ / wl) * speed * dt);
    }
    this.motor.vertical(dt, ctx.arena);

    this.stuckCheckT -= dt;
    if (this.stuckCheckT <= 0) {
      this.stuckCheckT = 0.5;
      const moved = this.motor.pos.distanceTo(this.lastCheckPos);
      if (moved < 0.12 && dist > E.minDist) {
        this.unstuckT = 0.45;
        this.unstuckDir.set(-nz, 0, nx).multiplyScalar(this.strafeDir >= 0 ? 1 : -1);
        if (ctx.rng.chance(0.5)) this.strafeDir *= -1;
      }
      this.lastCheckPos.copy(this.motor.pos);
    }
    if (this.unstuckT > 0) {
      this.unstuckT -= dt;
      const ul = Math.hypot(this.unstuckDir.x, this.unstuckDir.z);
      if (ul > 0.001) {
        this.motor.slideAxis(ctx.arena, 'x', (this.unstuckDir.x / ul) * speed * dt);
        this.motor.slideAxis(ctx.arena, 'z', (this.unstuckDir.z / ul) * speed * dt);
      }
    }

    this.updateAttack(dt, ctx, dist, eyePos);

    this.group.position.copy(this.motor.pos);
    const faceYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let dy = faceYaw - this.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * Math.min(1, dt * 7);

    if (this.nameSprite) {
      this.nameVisibleT = dist < 18 ? Math.min(1, this.nameVisibleT + dt * 4) : Math.max(0, this.nameVisibleT - dt * 2);
      (this.nameSprite.material as THREE.SpriteMaterial).opacity = this.nameVisibleT;
    }
  }

  private updateAttack(dt: number, ctx: EnemyContext, dist: number, eyePos: THREE.Vector3): void {
    if (this.burstLeft > 0) {
      this.burstGapT -= dt;
      if (this.burstGapT <= 0) {
        this.fireShot(ctx, eyePos);
        this.burstLeft--;
        this.burstGapT = 0.11;
      }
      return;
    }

    if (this.telegraphT >= 0) {
      const p = 1 - this.telegraphT / Math.max(0.01, this.stats.telegraphTime);
      this.eyeMat.emissiveIntensity = 3 + Math.sin(p * 24) * 2 + p * 4;
      this.telegraphT -= dt;
      if (this.telegraphT < 0) {
        this.eyeMat.emissiveIntensity = 3;
        this.burstLeft = this.stats.burst;
        this.burstGapT = 0;
      }
      return;
    }

    this.cooldownT -= dt;
    if (this.cooldownT <= 0 && this.hasLos && dist < E.attackRange) {
      this.telegraphT = this.stats.telegraphTime;
      ctx.sfx.telegraph();
      this.cooldownT = ctx.rng.range(E.cooldownMin, E.cooldownMax) * this.stats.cooldownScale;
    }
  }

  private fireShot(ctx: EnemyContext, eyePos: THREE.Vector3): void {
    const targetPoint = ctx.playerEye.clone();
    targetPoint.y -= 0.25;

    let acc = this.stats.accuracy;
    if (ctx.playerSpeed > 6.5) acc -= 0.08;
    acc = clamp(acc, 0.05, 0.9);
    const hit = ctx.rng.next() < acc;

    const muzzle = eyePos.clone().add(new THREE.Vector3(0, -0.15, 0));
    let end: THREE.Vector3;
    if (hit) {
      end = targetPoint.clone().add(new THREE.Vector3(
        ctx.rng.range(-0.1, 0.1),
        ctx.rng.range(-0.1, 0.1),
        ctx.rng.range(-0.1, 0.1)
      ));
    } else {
      const missDir = targetPoint.clone().sub(muzzle).normalize();
      missDir.x += ctx.rng.range(-0.09, 0.09) + this.strafeDir * 0.03;
      missDir.y += ctx.rng.range(-0.04, 0.06);
      missDir.normalize();
      end = muzzle.clone().addScaledVector(missDir, ctx.rng.range(14, 26));
      end.y = Math.max(0.2, end.y);
    }

    ctx.fx.beam(muzzle, end, TIERS[Math.min(this.data.tier, TIERS.length - 1)].color);
    ctx.sfx.enemyShot();

    if (hit) {
      ctx.onPlayerHit(Math.round(this.stats.damage), this);
    }
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

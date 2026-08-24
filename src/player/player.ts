import * as THREE from 'three';
import { CONFIG } from '../config';
import { Motor } from '../utils/motor';
import type { Arena } from '../world/arena';
import type { Input } from '../core/input';

const P = CONFIG.player;

export class Player {
  readonly motor = new Motor(P.radius, P.height, P.gravity, P.stepHeight);
  readonly camera: THREE.PerspectiveCamera;

  hp: number = P.maxHp;
  maxHp: number = P.maxHp;
  yaw = 0;
  pitch = 0;
  shieldFrac = 0;
  shieldT = 0;
  shieldBudget = 0;
  moveMul = 1;
  jumpMul = 1;
  gravityMul = 1;

  private velX = 0;
  private velZ = 0;
  private bobPhase = 0;
  private baseFov = 78;
  shakeT = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.05, 200);
    this.motor.pos.set(0, 0, 14);
    this.yaw = 0;
    this.updateCamera(0, true);
  }

  get position(): THREE.Vector3 {
    return this.motor.pos;
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.motor.pos.x, this.motor.pos.y + P.eyeHeight, this.motor.pos.z);
  }

  update(dt: number, input: Input, arena: Arena): void {
    if (this.shieldT > 0) this.shieldT = Math.max(0, this.shieldT - dt);
    const look = input.consumeLook();
    this.yaw -= look.x * 0.0022;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - look.y * 0.0022));

    const { fwd, strafe } = input.moveInput();
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    let wx = strafe * cos - fwd * sin;
    let wz = -fwd * cos - strafe * sin;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }

    const speed = P.speed * this.moveMul * (input.sprint && fwd > 0 ? P.sprintMul : 1);
    const targetX = wx * speed;
    const targetZ = wz * speed;
    const rate = len > 0.01 ? P.accel : P.friction;
    const blend = Math.min(1, rate * dt / speed);
    this.velX += (targetX - this.velX) * blend;
    this.velZ += (targetZ - this.velZ) * blend;

    if (input.consumeJump()) this.motor.jump(P.jumpVel * this.jumpMul);

    this.motor.gravity = P.gravity * this.gravityMul;

    const dx = this.velX * dt;
    const dz = this.velZ * dt;
    this.motor.slideAxis(arena, 'x', dx);
    this.motor.slideAxis(arena, 'z', dz);
    this.motor.vertical(dt, arena);

    const planarSpeed = Math.hypot(this.velX, this.velZ);
    if (this.motor.grounded && planarSpeed > 0.5) {
      this.bobPhase += dt * planarSpeed * 1.7;
    }

    this.updateCamera(dt, false);
  }

  updateCamera(dt: number, instant: boolean): void {
    const bobY = instant ? 0 : Math.sin(this.bobPhase * 2) * 0.035;
    const bobR = instant ? 0 : Math.sin(this.bobPhase) * 0.008;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);

    const e = new THREE.Euler(this.pitch, this.yaw, bobR + (this.shakeT > 0 ? Math.sin(performance.now() * 0.09) * 0.02 * this.shakeT : 0), 'YXZ');
    this.camera.quaternion.setFromEuler(e);
    this.camera.position.set(
      this.motor.pos.x,
      this.motor.pos.y + P.eyeHeight + bobY,
      this.motor.pos.z
    );

    const planar = Math.hypot(this.velX, this.velZ);
    const targetFov = this.baseFov + Math.min(6, Math.max(0, planar - P.speed) * 1.4);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
    if (!this.shakeT && Math.abs(this.velX) < 0.01 && Math.abs(this.velZ) < 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    this.shakeT = Math.min(0.4, this.shakeT + 0.18);
    return this.hp <= 0;
  }

  planarSpeed(): number {
    return Math.hypot(this.velX, this.velZ);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  reset(): void {
    this.hp = P.maxHp;
    this.motor.pos.set(0, 0, 14);
    this.motor.velY = 0;
    this.velX = 0;
    this.velZ = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.shakeT = 0;
    this.bobPhase = 0;
    this.shieldFrac = 0;
    this.shieldT = 0;
    this.shieldBudget = 0;
  }
}

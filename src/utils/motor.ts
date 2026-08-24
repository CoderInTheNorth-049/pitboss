import * as THREE from 'three';
import type { Arena } from '../world/arena';

export class Motor {
  readonly pos = new THREE.Vector3();
  velY = 0;
  grounded = false;

  constructor(
    public radius: number,
    public height: number,
    public gravity: number,
    private step: number
  ) {}

  slideAxis(arena: Arena, axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return;
    this.pos[axis] += delta;
    const p = this.pos;
    const r = this.radius;
    const feet = p.y;
    const head = p.y + this.height;
    for (const b of arena.colliders) {
      if (b.max.y <= feet + this.step) continue;
      if (b.min.y >= head) continue;
      if (
        p.x + r > b.min.x && p.x - r < b.max.x &&
        p.z + r > b.min.z && p.z - r < b.max.z
      ) {
        if (axis === 'x') {
          p.x = delta > 0 ? b.min.x - r - 0.001 : b.max.x + r + 0.001;
        } else {
          p.z = delta > 0 ? b.min.z - r - 0.001 : b.max.z + r + 0.001;
        }
      }
    }
    arena.clampToBounds(p);
  }

  vertical(dt: number, arena: Arena): void {
    this.velY -= this.gravity * dt;
    let ny = this.pos.y + this.velY * dt;
    const support = arena.supportHeight(this.pos.x, this.pos.z, this.radius, this.pos.y, this.step);
    if (ny <= support && this.velY <= 0) {
      ny = support;
      this.velY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.pos.y = Math.max(0, ny);
  }

  jump(vel: number): void {
    if (this.grounded) {
      this.velY = vel;
      this.grounded = false;
    }
  }
}

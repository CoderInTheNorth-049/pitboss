import * as THREE from 'three';

interface PooledFx {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  kind: 'tracer' | 'impact' | 'beam';
  vel?: THREE.Vector3;
}

const MAX_POOL = 64;

export class Effects {
  private scene: THREE.Scene;
  private active: PooledFx[] = [];
  private tracerGeos = new Map<number, THREE.CylinderGeometry>();
  private impactGeo = new THREE.SphereGeometry(0.09, 8, 8);
  private muzzle: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.muzzle = new THREE.PointLight(0xffc37a, 0, 9, 2);
    scene.add(this.muzzle);
  }

  private tracerGeo(width: number): THREE.CylinderGeometry {
    let geo = this.tracerGeos.get(width);
    if (!geo) {
      geo = new THREE.CylinderGeometry(width, width, 1, 5, 1, true);
      this.tracerGeos.set(width, geo);
    }
    return geo;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, life = 0.07, width = 0.012): void {
    if (this.active.length >= MAX_POOL) return;
    const dist = from.distanceTo(to);
    const geo = this.tracerGeo(width);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(1, Math.max(dist, 0.01), 1);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize()
    );
    this.scene.add(mesh);
    this.active.push({ mesh, life, maxLife: life, kind: 'tracer' });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, cssColor: string): void {
    this.tracer(from, to, new THREE.Color(cssColor).getHex(), 0.12);
  }

  impact(point: THREE.Vector3, color = 0x9a9aa4): void {
    if (this.active.length >= MAX_POOL) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.impactGeo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.16, maxLife: 0.16, kind: 'impact', vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4) });
  }

  spawnRing(center: THREE.Vector3, cssColor: string): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 6, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(cssColor), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center);
    ring.position.y = 0.15;
    this.scene.add(ring);
    this.active.push({ mesh: ring, life: 0.45, maxLife: 0.45, kind: 'tracer' });
    ring.userData.grow = true;
  }

  muzzleFlash(pos: THREE.Vector3, color: number): void {
    this.muzzle.color.setHex(color);
    this.muzzle.intensity = 26;
    this.muzzle.position.copy(pos);
  }

  update(dt: number): void {
    this.muzzle.intensity *= Math.pow(0.001, dt * 4);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = Math.max(0, fx.life / fx.maxLife);
      const mat = fx.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t * 0.9;

      if (fx.kind === 'impact' && fx.vel) {
        fx.vel.y -= 14 * dt;
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.scale.setScalar(0.4 + t);
      }
      if (fx.mesh.userData.grow) {
        fx.mesh.scale.addScalar(dt * 7);
        fx.mesh.position.y += dt * 0.4;
      }
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        (fx.mesh.material as THREE.Material).dispose();
        if (fx.mesh.geometry !== this.impactGeo && ![...this.tracerGeos.values()].includes(fx.mesh.geometry as THREE.CylinderGeometry)) {
          fx.mesh.geometry.dispose();
        }
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const fx of this.active) {
      this.scene.remove(fx.mesh);
      (fx.mesh.material as THREE.Material).dispose();
    }
    this.active.length = 0;
  }
}

import * as THREE from 'three';

interface PooledFx {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  kind: 'tracer' | 'impact' | 'beam' | 'ember';
  vel?: THREE.Vector3;
}

const MAX_POOL = 64;

interface FlameLayer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseOpacity: number;
  phase: number;
}

export class Effects {
  private scene: THREE.Scene;
  private active: PooledFx[] = [];
  private tracerGeos = new Map<number, THREE.CylinderGeometry>();
  private impactGeo = new THREE.SphereGeometry(0.09, 8, 8);
  private muzzle: THREE.PointLight;

  private flameGroup = new THREE.Group();
  private flameLayers: FlameLayer[] = [];
  private flameLight: THREE.PointLight;
  private flameIntensity = 0;
  private flameT = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.muzzle = new THREE.PointLight(0xffc37a, 0, 9, 2);
    scene.add(this.muzzle);

    this.buildFlame();
    this.flameLight = new THREE.PointLight(0xff7a26, 0, 14, 2);
    this.flameGroup.add(this.flameLight);
    this.scene.add(this.flameGroup);
  }

  private buildFlame(): void {
    const defs: Array<{ color: number; radius: number; opacity: number; phase: number }> = [
      { color: 0xfff3c4, radius: 0.16, opacity: 0.95, phase: 0 },
      { color: 0xffa326, radius: 0.34, opacity: 0.6, phase: 1.7 },
      { color: 0xff5416, radius: 0.55, opacity: 0.38, phase: 3.9 }
    ];
    for (const d of defs) {
      const geo = new THREE.CylinderGeometry(d.radius, 0.03, 1, 10, 4, true);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: d.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.flameGroup.add(mesh);
      this.flameLayers.push({ mesh, mat, baseOpacity: d.opacity, phase: d.phase });
    }
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

  ember(point: THREE.Vector3, dir: THREE.Vector3): void {
    if (this.active.length >= MAX_POOL) return;
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? 0xffa326 : 0xff5e13,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.impactGeo, mat);
    mesh.scale.setScalar(0.35 + Math.random() * 0.4);
    mesh.position.copy(point);
    this.scene.add(mesh);
    const spread = new THREE.Vector3(
      dir.x + (Math.random() - 0.5) * 0.9,
      Math.random() * 0.55 + 0.15,
      dir.z + (Math.random() - 0.5) * 0.9
    ).normalize().multiplyScalar(3 + Math.random() * 4);
    this.active.push({ mesh, life: 0.5 + Math.random() * 0.35, maxLife: 0.85, kind: 'ember', vel: spread });
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

  setFlame(origin: THREE.Vector3, dir: THREE.Vector3, length: number, active: boolean, dt: number): void {
    this.flameT += dt;
    const target = active ? 1 : 0;
    this.flameIntensity += (target - this.flameIntensity) * Math.min(1, dt * (active ? 14 : 22));
    if (this.flameIntensity < 0.02 && !active) {
      this.flameGroup.visible = false;
      this.flameLayers.forEach(l => { l.mat.opacity = 0; l.mesh.visible = false; });
      this.flameLight.intensity = 0;
      return;
    }
    this.flameGroup.visible = true;

    const flicker = 0.82
      + Math.sin(this.flameT * 37 + 1.3) * 0.1
      + Math.sin(this.flameT * 23.7) * 0.08;
    const len = length * (0.92 + Math.sin(this.flameT * 29) * 0.08);

    for (const layer of this.flameLayers) {
      layer.mesh.visible = true;
      const wob = 1 + Math.sin(this.flameT * 31 + layer.phase * 2.1) * 0.16;
      layer.mesh.scale.set(wob, len, wob);
      layer.mesh.position.copy(origin);
      layer.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const ramp = Math.min(1, this.flameIntensity / 0.25);
      layer.mat.opacity = layer.baseOpacity * flicker * this.flameIntensity * ramp;
    }

    this.flameLight.position.copy(origin).addScaledVector(dir, Math.min(len * 0.45, 4));
    this.flameLight.intensity = (16 + Math.sin(this.flameT * 43) * 7) * this.flameIntensity;

    if (active && Math.random() < dt * 34) {
      const p = origin.clone().addScaledVector(dir, Math.min(length * (0.35 + Math.random() * 0.55), length));
      this.ember(p, dir);
    }
  }

  hideFlame(): void {
    this.setFlame(this.flameGroup.position, new THREE.Vector3(0, 0, -1), 0.001, false, 1 / 60);
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
      } else if (fx.kind === 'ember' && fx.vel) {
        fx.vel.y += 6 * dt;
        fx.vel.multiplyScalar(1 - 1.6 * dt);
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.scale.setScalar(Math.max(0.02, fx.mesh.scale.x - dt * 0.55));
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
    this.flameIntensity = 0;
    this.flameGroup.visible = false;
    for (const l of this.flameLayers) {
      l.mat.opacity = 0;
      l.mesh.visible = false;
    }
    this.flameLight.intensity = 0;
  }
}

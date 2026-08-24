import * as THREE from 'three';

export interface ViewModelState {
  dt: number;
  planarSpeed: number;
  grounded: boolean;
  yawDelta: number;
  pitchDelta: number;
  firing: boolean;
  reloading: boolean;
  overdrive: boolean;
}

const BASE_POS = new THREE.Vector3(0.27, -0.25, -0.48);

export class ViewModel {
  readonly rig = new THREE.Group();
  private holder = new THREE.Group();
  private model: THREE.Group | null = null;
  private currentId: string | null = null;

  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private recoilZ = 0;
  private recoilRot = 0;
  private switchT = 1;
  private t = 0;

  constructor() {
    this.rig.add(this.holder);
    this.holder.position.copy(BASE_POS);
  }

  setWeapon(id: string): void {
    if (id === this.currentId) return;
    this.clearModel();
    this.currentId = id;
    this.model = id === 'pyroclast'
      ? this.buildPyroclast()
      : id === 'railhand'
        ? this.buildRailhand()
        : this.buildRifle();
    this.holder.add(this.model);
    this.switchT = 0;
  }

  kick(strength = 1): void {
    this.recoilZ = Math.min(0.09, this.recoilZ + 0.05 * strength);
    this.recoilRot = Math.min(0.22, this.recoilRot + 0.11 * strength);
  }

  update(s: ViewModelState): void {
    const dt = s.dt;
    this.t += dt;
    this.switchT = Math.min(1, this.switchT + dt / 0.2);

    if (s.grounded && s.planarSpeed > 0.5) {
      this.bobPhase += dt * s.planarSpeed * 1.7;
    }

    const swayTargetX = THREE.MathUtils.clamp(-s.yawDelta * 14, -0.06, 0.06);
    const swayTargetY = THREE.MathUtils.clamp(-s.pitchDelta * 14, -0.05, 0.05);
    this.swayX += (swayTargetX - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (swayTargetY - this.swayY) * Math.min(1, dt * 9);

    this.recoilZ *= Math.pow(0.0008, dt);
    this.recoilRot *= Math.pow(0.0008, dt);

    const bobX = Math.sin(this.bobPhase) * 0.012;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * -0.014;

    const reloadDip = s.reloading ? 1 : 0;
    const pop = 1 - Math.pow(1 - easeOutBack(this.switchT), 1);

    this.holder.position.set(
      BASE_POS.x + this.swayX + bobX,
      BASE_POS.y + this.swayY + bobY - reloadDip * 0.16,
      BASE_POS.z + this.recoilZ
    );
    this.holder.rotation.set(
      this.recoilRot - reloadDip * 0.55,
      this.swayX * 2.2,
      this.swayX * 1.4
    );
    this.holder.scale.setScalar(0.72 + 0.28 * pop);

    if (this.model) {
      this.model.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        const tag = (mesh.userData as { vmGlow?: number }).vmGlow;
        if (!tag) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        let glow = tag;
        if (this.currentId === 'pyroclast') {
          glow = s.firing
            ? tag * (2.6 + Math.sin(this.t * 47) * 1.1 + Math.random() * 0.5)
            : tag * (1 + Math.sin(this.t * 6) * 0.15);
          if (s.overdrive) glow *= 1.6;
        } else if (s.overdrive) {
          glow = tag * 2.2;
        }
        mat.emissiveIntensity = glow;
      });
      if (s.firing && this.currentId === 'pyroclast') {
        this.model.position.x = (Math.random() - 0.5) * 0.006;
        this.model.position.y = (Math.random() - 0.5) * 0.006;
      } else {
        this.model.position.set(0, 0, 0);
      }
    }
  }

  dispose(): void {
    this.clearModel();
    this.currentId = null;
  }

  private clearModel(): void {
    if (!this.model) return;
    this.holder.remove(this.model);
    this.model.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    this.model = null;
  }

  private metal(color: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.62 });
  }

  private glowMat(color: number, glow: number): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.35),
      emissive: color,
      roughness: 0.35,
      metalness: 0.3
    });
    m.emissiveIntensity = glow;
    return m;
  }

  private tag(mesh: THREE.Mesh, glow: number): THREE.Mesh {
    (mesh.userData as { vmGlow?: number }).vmGlow = glow;
    return mesh;
  }

  private buildRifle(): THREE.Group {
    const g = new THREE.Group();
    const body = this.metal(0x23252b);
    const grip = this.metal(0x191a1f);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.34, 10), body);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.4);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), grip);
    shroud.position.set(0, 0.02, -0.36);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 0.09), grip);
    mag.position.set(0, -0.13, -0.05);
    mag.rotation.x = 0.16;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.2), grip);
    stock.position.set(0, -0.01, 0.28);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), grip);
    handle.position.set(0, -0.11, 0.12);
    handle.rotation.x = -0.3;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.1), grip);
    sight.position.set(0, 0.085, -0.1);
    const stripe = this.tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.092, 0.016, 0.42),
      this.glowMat(0xffe9c9, 0.85)
    ), 0.85);
    stripe.position.set(0, 0.045, -0.02);
    const muzzleRing = this.tag(new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.008, 6, 14),
      this.glowMat(0xffc37a, 0.6)
    ), 0.6);
    muzzleRing.position.set(0, 0.02, -0.57);

    g.add(receiver, barrel, shroud, mag, stock, handle, sight, stripe, muzzleRing);
    g.rotation.y = 0.06;
    return g;
  }

  private buildRailhand(): THREE.Group {
    const g = new THREE.Group();
    const body = this.metal(0x1d2b2e);
    const dark = this.metal(0x14181c);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.66), body);
    const rail = this.tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.6),
      this.glowMat(0x35e0d6, 1.4)
    ), 1.4);
    rail.position.set(0, 0.065, -0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.5, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.5);
    for (let i = 0; i < 3; i++) {
      const coil = this.tag(new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.014, 8, 20),
        this.glowMat(0x35e0d6, 1.1)
      ), 1.1);
      coil.position.set(0, 0, -0.36 - i * 0.14);
      g.add(coil);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark);
    grip.position.set(0, -0.115, 0.14);
    grip.rotation.x = -0.28;
    const cell = this.tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.07, 0.16),
      this.glowMat(0x35e0d6, 1.6)
    ), 1.6);
    cell.position.set(0, -0.06, 0.05);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.3), dark);
    fin.position.set(0, 0.1, 0.16);

    g.add(spine, rail, barrel, grip, cell, fin);
    g.rotation.y = 0.05;
    return g;
  }

  private buildPyroclast(): THREE.Group {
    const g = new THREE.Group();
    const body = this.metal(0x2b2019);
    const dark = this.metal(0x17130f);
    const brass = this.metal(0x6b4a23);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.125, 0.46), body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.44, 12), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.38);
    const shroudHeat = this.tag(new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12, 1, true),
      this.glowMat(0xff6a1a, 0.9)
    ), 0.9);
    shroudHeat.rotation.x = Math.PI / 2;
    shroudHeat.position.set(0, 0.015, -0.32);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.03, 0.1, 12), brass);
    nozzle.rotation.x = -Math.PI / 2;
    nozzle.position.set(0, 0.015, -0.63);
    const nozzleGlow = this.tag(new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 10, 10),
      this.glowMat(0xffa326, 1.5)
    ), 1.5);
    nozzleGlow.position.set(0, 0.015, -0.65);

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 12), brass);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, -0.115, 0.02);
    const tankBand = this.tag(new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.01, 6, 16),
      this.glowMat(0xff5416, 0.8)
    ), 0.8);
    tankBand.position.set(0, -0.115, -0.02);
    tankBand.rotation.y = 0;
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), dark);
    valve.position.set(0, -0.06, -0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark);
    grip.position.set(0, -0.12, 0.17);
    grip.rotation.x = -0.3;
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.017, 8, 18, Math.PI), dark);
    hose.position.set(0.05, -0.05, 0.02);
    hose.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    const pilot = this.tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.014, 0.3),
      this.glowMat(0xff6a1a, 0.75)
    ), 0.75);
    pilot.position.set(0.052, 0.02, -0.05);

    g.add(receiver, barrel, shroudHeat, nozzle, nozzleGlow, tank, tankBand, valve, grip, hose, pilot);
    g.rotation.y = 0.07;
    return g;
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

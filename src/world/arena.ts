import * as THREE from 'three';
import { CONFIG } from '../config';

export interface SpawnPad {
  point: THREE.Vector3;
  ring: THREE.Mesh;
}

interface ArenaLayout {
  name: string;
  blocks: Array<[number, number, number, number, number, number]>;
}

export const ARENA_LAYOUTS: readonly ArenaLayout[] = [
  {
    name: 'THE CROSS',
    blocks: [
      [0, -6, 5, 2.3, 2.2, 0x32323c],
      [0, 6, 5, 2.3, 2.2, 0x32323c],
      [-8, 0, 2.2, 1.4, 6, 0x282832],
      [8, 0, 2.2, 1.4, 6, 0x282832],
      [-13, -11, 3, 2.0, 3, 0x32323c],
      [13, -11, 3, 2.0, 3, 0x32323c],
      [-13, 11, 3, 2.0, 3, 0x32323c],
      [13, 11, 3, 2.0, 3, 0x32323c],
      [-5, -15, 4.4, 1.2, 2, 0x282832],
      [5, -15, 4.4, 1.2, 2, 0x282832],
      [-5, 15, 4.4, 1.2, 2, 0x282832],
      [5, 15, 4.4, 1.2, 2, 0x282832],
      [-17, -4, 2, 2.6, 2, 0x2e2e38],
      [17, 4, 2, 2.6, 2, 0x2e2e38],
      [17, -13, 2.4, 0.9, 2.4, 0x3a3a46],
      [-17, 13, 2.4, 0.9, 2.4, 0x3a3a46]
    ]
  },
  {
    name: 'THE RING',
    blocks: [
      [12, 0, 2.4, 2.2, 2.4, 0x32323c],
      [8.5, 8.5, 2.4, 2.2, 2.4, 0x32323c],
      [0, 12, 2.4, 2.2, 2.4, 0x32323c],
      [-8.5, 8.5, 2.4, 2.2, 2.4, 0x32323c],
      [-12, 0, 2.4, 2.2, 2.4, 0x32323c],
      [-8.5, -8.5, 2.4, 2.2, 2.4, 0x32323c],
      [0, -12, 2.4, 2.2, 2.4, 0x32323c],
      [8.5, -8.5, 2.4, 2.2, 2.4, 0x32323c],
      [3, 3, 1.7, 1.1, 1.7, 0x282832],
      [-3, 3, 1.7, 1.1, 1.7, 0x282832],
      [3, -3, 1.7, 1.1, 1.7, 0x282832],
      [-3, -3, 1.7, 1.1, 1.7, 0x282832],
      [16.5, 0, 2, 2.5, 2, 0x2e2e38],
      [-16.5, 0, 2, 2.5, 2, 0x2e2e38],
      [0, 17, 3, 1.2, 2, 0x282832],
      [0, -17, 3, 1.2, 2, 0x282832]
    ]
  },
  {
    name: 'THE LANES',
    blocks: [
      [-7, -7.5, 1.4, 2.3, 11, 0x32323c],
      [-7, 7.5, 1.4, 2.3, 11, 0x32323c],
      [7, -7.5, 1.4, 2.3, 11, 0x32323c],
      [7, 7.5, 1.4, 2.3, 11, 0x32323c],
      [0, -10.5, 5, 1.2, 2, 0x282832],
      [0, 10.5, 5, 1.2, 2, 0x282832],
      [-14, 0, 2, 2.2, 2.4, 0x2e2e38],
      [14, 0, 2, 2.2, 2.4, 0x2e2e38],
      [-14, -13, 2.4, 1.0, 2.4, 0x3a3a46],
      [14, 13, 2.4, 1.0, 2.4, 0x3a3a46],
      [-14, 13, 2.4, 1.0, 2.4, 0x3a3a46],
      [14, -13, 2.4, 1.0, 2.4, 0x3a3a46],
      [0, 0, 3, 1.6, 3, 0x32323c],
      [-3.5, -16, 3, 1.2, 2, 0x282832],
      [3.5, 16, 3, 1.2, 2, 0x282832]
    ]
  }
];

export class Arena {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Box3[] = [];
  readonly spawnPads: SpawnPad[] = [];
  readonly half = 21;

  private raycastTargets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene) {
    this.buildFloor(scene);
    this.buildWalls();
    this.buildCover();
    this.buildSpawnPads();
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(0x0b0b0e, CONFIG.variety.fogBase);
  }

  private buildFloor(scene: THREE.Scene) {
    const size = this.half * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#25252e';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#3a3a46';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    g.fillStyle = '#34343f';
    g.fillRect(250, 250, 12, 12);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 8, size / 8);
    tex.colorSpace = THREE.SRGBColorSpace;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const hemi = new THREE.HemisphereLight(0x454d6e, 0x1a1410, 1.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffe4c4, 2.4);
    dir.position.set(14, 22, 9);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -26;
    dir.shadow.camera.right = 26;
    dir.shadow.camera.top = 26;
    dir.shadow.camera.bottom = -26;
    dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.03;
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  }

  private addBlock(x: number, z: number, w: number, h: number, d: number, color: number, emissive = 0x000000, glow = 0): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.08, emissive, emissiveIntensity: glow })
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.raycastTargets.push(mesh);
    this.coverMeshes.push(mesh);
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, h, z + d / 2)
    ));
  }

  private buildWalls() {
    const H = this.half;
    const t = 1.2;
    const wallH = 6;
    this.addBlock(0, H, H * 2 + t, wallH, t, 0x16161d);
    this.addBlock(0, -H, H * 2 + t, wallH, t, 0x16161d);
    this.addBlock(H, 0, t, wallH, H * 2 + t, 0x16161d);
    this.addBlock(-H, 0, t, wallH, H * 2 + t, 0x16161d);
    this.baseColliderCount = this.colliders.length;
    this.baseTargetCount = this.raycastTargets.length;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(H * 2, 0.18, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x111114, emissive: 0xff5c33, emissiveIntensity: 1.6 })
      );
      strip.position.set(0, wallH - 0.7, sz * (H - t / 2));
      if (sx < 0) strip.rotation.y = Math.PI / 2;
      this.group.add(strip);
    }
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, H * 2),
        new THREE.MeshStandardMaterial({ color: 0x111114, emissive: 0xff5c33, emissiveIntensity: 1.6 })
      );
      strip.position.set(sx * (H - t / 2), wallH - 0.7, 0);
      this.group.add(strip);
    }
  }

  private buildCover(): void {
    for (const [x, z, w, h, d, c] of ARENA_LAYOUTS[0].blocks) this.addBlock(x, z, w, h, d, c);
    this.addPillars();
  }

  setLayout(index: number): string {
    const layout = ARENA_LAYOUTS[Math.max(0, Math.min(ARENA_LAYOUTS.length - 1, index))];
    for (const mesh of this.coverMeshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      mat.dispose();
    }
    this.coverMeshes = [];
    this.colliders.length = this.baseColliderCount;
    this.raycastTargets.length = this.baseTargetCount;
    for (const [x, z, w, h, d, c] of layout.blocks) this.addBlock(x, z, w, h, d, c);
    this.addPillars();
    return layout.name;
  }

  private coverMeshes: THREE.Mesh[] = [];
  private baseColliderCount = 0;
  private baseTargetCount = 0;

  private addPillars(): void {
    for (const x of [-8, 8]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 3.2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x14141a, emissive: 0x35e0d6, emissiveIntensity: 0.85 })
      );
      pillar.position.set(x, 1.6, 10);
      pillar.castShadow = true;
      this.group.add(pillar);
      this.raycastTargets.push(pillar);
      this.coverMeshes.push(pillar);
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(x - 0.25, 0, 9.75),
        new THREE.Vector3(x + 0.25, 3.2, 10.25)
      ));
    }
  }

  private buildSpawnPads() {
    const ringGeo = new THREE.TorusGeometry(1.15, 0.07, 8, 40);
    for (const [x, z] of [[-16.5, -16.5], [16.5, -16.5], [-16.5, 16.5], [16.5, 16.5]] as const) {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({ color: 0x0c0c10, emissive: 0x35e0d6, emissiveIntensity: 1.4 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.03, z);
      this.group.add(ring);
      this.spawnPads.push({ point: new THREE.Vector3(x, 0, z), ring });
    }
  }

  losBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.01) return false;
    dir.normalize();
    this.raycaster.set(from, dir);
    this.raycaster.far = dist - 0.45;
    return this.raycaster.intersectObjects(this.raycastTargets, false).length > 0;
  }

  supportHeight(x: number, z: number, radius: number, feetY: number, step: number): number {
    let best = 0;
    for (const b of this.colliders) {
      const top = b.max.y;
      if (top > feetY + step || top <= best) continue;
      if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z) {
        best = top;
      }
    }
    return best;
  }

  randomSpawnPoint(rng: { pick<T>(arr: readonly T[]): T }, awayFrom: THREE.Vector3): THREE.Vector3 {
    let best = this.spawnPads[0].point;
    let bestD = -1;
    for (let i = 0; i < 4; i++) {
      const p = rng.pick(this.spawnPads).point;
      const d = p.distanceToSquared(awayFrom);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  clampToBounds(pos: THREE.Vector3): void {
    const lim = this.half - 1.8;
    pos.x = Math.min(lim, Math.max(-lim, pos.x));
    pos.z = Math.min(lim, Math.max(-lim, pos.z));
  }

  isClear(x: number, z: number, radius: number): boolean {
    for (const b of this.colliders) {
      if (b.max.y < 0.4) continue;
      if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z) {
        return false;
      }
    }
    return true;
  }
}

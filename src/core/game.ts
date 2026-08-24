import * as THREE from 'three';
import { CONFIG } from '../config';
import { RNG } from '../utils/rng';
import { Arena } from '../world/arena';
import { Player } from '../player/player';
import { Input } from './input';
import { Weapon } from '../weapons/weapon';
import type { ShotTarget } from '../weapons/weapon';
import { ViewModel } from '../weapons/viewmodel';
import { Enemy } from '../enemies/enemy';
import { TIERS, buildStats } from '../enemies/traits';
import type { TraitDef } from '../enemies/traits';
import { spawnLine } from '../enemies/taunts';
import { Director } from '../ai/director';
import { RivalMemory } from '../memory/rivals';
import type { RivalRecord } from '../memory/rivals';
import { Effects } from '../vfx/effects';
import { Sfx } from '../audio/sfx';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import type { DeathScreenData } from '../ui/screens';
import { PickupManager, type PickupEvent, type PickupKind } from '../world/pickups';
import { Sentry } from '../world/sentry';
import { specById } from '../weapons/specs';
import { HighScores } from './highscores';
import { Settings } from './settings';
import { RunMods } from './mods';
import { BOONS, boonById, type BoonDef } from './boons';
import { encodeRun, decodeRun, describeRun } from './shareCode';
import { clamp } from '../utils/math';

function readBest(): number {
  try {
    return parseInt(localStorage.getItem('pitboss.bestWave') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

type GameState = 'menu' | 'playing' | 'dead' | 'paused' | 'draft';

export class Game {
  readonly settings = new Settings();
  readonly mods = new RunMods();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private arena: Arena;
  private player: Player;
  private weapon = new Weapon();
  private input = new Input();
  private effects: Effects;
  private sfx = new Sfx();
  private hud = new Hud();
  private screens: Screens;
  private memory = new RivalMemory();
  private pickups!: PickupManager;
  private rng = RNG.fromTime();
  private director!: Director;
  private viewmodel: ViewModel;

  private enemies: Enemy[] = [];
  private sentries: Sentry<Enemy>[] = [];
  private activeRivalIds = new Set<string>();
  private state: GameState = 'menu';
  private menuClock = 0;

  private kills = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private runStartTime = 0;
  private lastPhase: 'intermission' | 'active' = 'intermission';
  private lastSurging = false;
  private rosterFromDeath = false;
  private lastDeathData: DeathScreenData | null = null;
  private booted = false;
  private highscores = new HighScores();
  private bestWave = Math.max(readBest(), 0);

  private overdriveT = 0;
  private killsSinceDrop = 0;
  private killTimes: number[] = [];
  private streakAnnounced = -1;
  private spreadTimer = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private prevShieldT = 0;
  private invuln = false;
  private invulnT = 0;
  private invulnAura: THREE.Mesh;
  private debugBypass = false;
  private draftChoices: BoonDef[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;

    this.scene.background = new THREE.Color(0x0b0b0e);
    this.arena = new Arena(this.scene);
    this.effects = new Effects(this.scene);
    this.player = new Player(window.innerWidth / window.innerHeight);
    this.scene.add(this.player.camera);
    this.viewmodel = new ViewModel();
    this.player.camera.add(this.viewmodel.rig);
    this.viewmodel.setWeapon(this.weapon.spec.id);

    this.screens = new Screens(this.settings, this.input);
    this.input.applySettings(this.settings);
    this.input.attach(canvas);
    this.bindUi();
    this.screens.onAccessChanged = () => this.applyAccess();
    this.applyAccess();
    this.screens.onBoonPicked = i => this.closeDraft(this.draftChoices[i] ?? null);
    this.screens.onDraftSkip = () => this.closeDraft(null);

    this.invulnAura = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.invulnAura.visible = false;
    this.scene.add(this.invulnAura);

    window.addEventListener('resize', () => this.onResize());
  }

  private applyAccess(): void {
    const a = this.settings.access;
    this.player.setBaseFov(a.fov);
    this.sfx.setVolume(a.volume);
    this.hud.setCrosshairScale(a.crosshairScale);
    this.hud.reducedFlash = a.reducedFlash;
  }

  private bindUi(): void {
    this.screens.onEnterThePit = () => this.startRun();
    this.screens.onReenter = () => this.startRun();
    this.screens.onRosterOpen = fromDeath => {
      this.rosterFromDeath = fromDeath;
      this.sfx.ui();
      this.screens.showRoster(this.memory.roster(), fromDeath);
    };
    this.screens.onRosterClose = () => {
      this.sfx.ui();
      if (this.rosterFromDeath && this.lastDeathData) {
        this.screens.showDeath(this.lastDeathData);
      } else {
        this.screens.showStart();
      }
      this.screens.setHall(this.highscores.top());
    };
    this.screens.onResume = () => {
      this.sfx.unlock();
      this.input.requestLock(this.canvas);
    };
    this.screens.onDecode = code => {
      const summary = decodeRun(code);
      if (!summary) {
        this.sfx.ui();
        this.screens.setDecodeResult('INVALID CODE — CHECK FOR TYPOS', 'bad');
        return;
      }
      this.sfx.heal();
      const desc = describeRun(code) ?? 'ancient run';
      if (this.bestWave === 0) {
        this.screens.setDecodeResult(`${desc} — YOU HAVE NO BEST YET. GO SET ONE.`, 'good');
      } else if (summary.wave > this.bestWave) {
        this.screens.setDecodeResult(`${desc} — THEY BEAT YOUR BEST (WAVE ${this.bestWave}). AVENGE IT.`, 'beat');
      } else if (summary.wave === this.bestWave) {
        this.screens.setDecodeResult(`${desc} — TIES YOUR BEST. TIEBREAK IN THE PIT.`, 'good');
      } else {
        this.screens.setDecodeResult(`${desc} — YOUR BEST (WAVE ${this.bestWave}) STILL STANDS.`, 'good');
      }
    };

    this.input.onLockFail = () => {
      if (this.state === 'playing') {
        this.hud.feed('POINTER LOCK BLOCKED — MOUSE MOVEMENT STILL STEERS. ESC TO PAUSE.', 'info');
      }
    };

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.state === 'playing') {
        this.state = 'paused';
        this.screens.showPause();
      } else if (locked && this.state === 'paused') {
        this.state = 'playing';
        this.screens.hidePause();
      }
    });

    this.screens.setHall(this.highscores.top());

    const debugEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (debugEnabled) {
      (window as unknown as { __PITBOSS: Game }).__PITBOSS = this;
    }

    requestAnimationFrame(t => this.frame(t));
  }

  async init(): Promise<void> {
    this.screens.setLoading(true);
    this.pickups = new PickupManager(this.scene, this.arena, this.rng, {
      onEvent: (ev: PickupEvent) => {
        if (ev.type === 'heal') {
          this.player.heal(30);
          this.sfx.heal();
          this.hud.feed('VIAL DRAINED — +30 VITALS', 'info');
        } else if (ev.type === 'weapon') {
          this.weapon.equipSpecial(ev.spec);
          this.sfx.powerup();
          this.hud.banner(ev.spec.name);
          this.hud.feed(`${ev.spec.name} — ${ev.spec.specialDuration}s OF OVERWHELMING FORCE`, 'info');
        } else if (ev.type === 'shield') {
          this.applyShield(ev.absorbFrac);
        } else if (ev.type === 'overdrive') {
          this.applyOverdrive();
        } else if (ev.type === 'invuln') {
          this.applyInvuln();
        } else if (ev.type === 'sentry') {
          this.deploySentry(ev.pos);
        } else if (ev.type === 'refill') {
          this.weapon.ammo = this.weapon.magSize();
          this.weapon.reloading = false;
          this.sfx.refill();
          this.hud.feed('AMMO CELLS REFILLED', 'info');
        }
      }
    });

    try {
      await Promise.race([
        this.memory.init(this.rng),
        new Promise<void>(resolve => setTimeout(resolve, 2500))
      ]);
    } catch {
      this.memory.fallbackOnly(this.rng);
    }

    this.director = new Director(
      this.memory,
      this.rng,
      () => this.spawnEnemy(),
      (text, kind) => {
        this.hud.banner(text);
        if (kind === 'wave') this.sfx.wave();
        if (kind === 'surge') this.sfx.surge();
      },
      () => this.mods.quotaMul
    );
    this.weapon.onSpecialEnd = () => {
      this.sfx.expire();
      this.hud.feed('SPECIAL FADED — PIT RIFLE RETURNED', 'info');
    };

    this.booted = true;
    this.screens.setLoading(false);
  }

  debugState(): Record<string, unknown> {
    return {
      state: this.state,
      booted: this.booted,
      enemies: this.enemies.length,
      alive: this.aliveCount(),
      wave: this.director?.wave ?? null,
      phase: this.director?.phase ?? null,
      weapon: this.weapon.spec.id,
      specialT: +this.weapon.specialT.toFixed(1),
      shieldT: +this.player.shieldT.toFixed(1),
      shieldFrac: this.player.shieldFrac,
      shieldBudget: Math.round(this.player.shieldBudget),
      overdriveT: +this.overdriveT.toFixed(1),
      invulnT: +this.invulnT.toFixed(1),
      sentries: this.sentries.length,
      mutator: this.mods.mutator?.id ?? null,
      boons: this.mods.boonEntries(),
      maxHp: this.player.maxHp,
      lastSpecial: this.pickups?.lastSpecial ?? null,
      killsToDrop: CONFIG.drops.killsPerDrop - this.killsSinceDrop,
      pickups: this.pickups?.count ?? 0,
      best: this.bestWave,
      playerPos: this.player.position.toArray().map(n => +n.toFixed(2)),
      hp: this.player.hp
    };
  }

  debugForceDeath(): boolean {
    if (this.state !== 'playing') return false;
    const killer = this.enemies.find(e => e.state !== 'dead') ?? null;
    this.debugBypass = true;
    try {
      this.onPlayerHit(this.player.hp, killer);
    } finally {
      this.debugBypass = false;
    }
    return true;
  }

  debugSetHp(hp: number): void {
    this.player.hp = hp;
  }

  debugSetInvuln(v: boolean): void {
    this.invuln = v;
  }

  debugGiveInvuln(): void {
    this.applyInvuln();
  }

  debugGiveSpecial(id: string): void {
    const spec = specById(id);
    if (spec.specialDuration > 0) this.weapon.equipSpecial(spec);
  }

  debugGiveShield(frac = 0.75): void {
    this.applyShield(frac);
  }

  debugGiveOverdrive(): void {
    this.applyOverdrive();
  }

  debugPlayerHit(dmg: number): void {
    this.onPlayerHit(dmg, this.enemies.find(e => e.state !== 'dead') ?? null);
  }

  debugSpawnHealHere(): void {
    const p = this.player.position.clone();
    p.x += 0.4;
    this.pickups.spawnAtPoint('heal', p);
  }

  debugSpawnWeaponRandomHere(): string {
    const p = this.player.position.clone();
    p.x += 0.4;
    return this.pickups.spawnAtPoint('weapon', p)?.id ?? 'none';
  }

  debugTeleportEnemy(x: number, z: number): boolean {
    const e = this.enemies.find(en => en.state !== 'dead');
    if (!e) return false;
    e.motor.pos.set(x, 0, z);
    e.motor.velY = 0;
    e.group.position.copy(e.motor.pos);
    return true;
  }

  debugPlaceEnemyClear(): boolean {
    const e = this.enemies.find(en => en.state !== 'dead');
    if (!e) return false;
    const eye = this.player.eyePosition(new THREE.Vector3());
    const spots: Array<[number, number]> =
      [[4, 12], [-4, 12], [3, 7], [-3, 7], [5, 9], [-5, 9], [2, 10], [-2, 10], [0, 9], [6, 12]];
    for (const [x, z] of spots) {
      if (!this.arena.isClear(x, z, 0.6)) continue;
      const probe = new THREE.Vector3(x, 0.95 * e.stats.scale, z);
      if (!this.arena.losBlocked(eye, probe)) {
        e.motor.pos.set(x, 0, z);
        e.motor.velY = 0;
        e.group.position.copy(e.motor.pos);
        return true;
      }
    }
    return false;
  }

  debugFireAt(zone: 'head' | 'body'): {
    fired: boolean; killed: boolean; headshot: boolean; hpBefore: number; hpAfter: number;
  } {
    const e = this.enemies.find(en => en.state !== 'dead');
    const fallback = { fired: false, killed: false, headshot: false, hpBefore: -1, hpAfter: -1 };
    if (!e) return fallback;
    e.group.position.copy(e.motor.pos);

    const hpBefore = Math.round(e.hp);
    const camera = this.player.camera;
    const point = zone === 'head' ? e.headCenter : e.center.clone();
    const aimFromCam = point.clone().sub(camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(aimFromCam, camera.up).normalize();
    const origin = camera.position.clone().addScaledVector(aimFromCam, 0.35).addScaledVector(right, 0.14);
    origin.y -= 0.12;
    const dir = point.clone().sub(origin).normalize();

    const targets: ShotTarget[] = [];
    for (const en of this.enemies) {
      if (en.state === 'dead') continue;
      targets.push({
        hitCenter: en.center,
        hitRadius: en.hitRadius,
        headCenter: en.headCenter,
        headRadius: en.headRadius,
        onHit: dmg => this.applyDamageToEnemy(en, dmg),
        onBurn: (dps, dur) => en.ignite(dps, dur)
      });
    }

    const w = this.weapon;
    const prevFree = w.freeFire;
    w.freeFire = true;
    w.forceReady();
    const result = w.fire(origin, dir, targets, {
      arenaColliders: this.arena.colliders,
      effects: this.effects,
      sfx: this.sfx,
      onHeadshot: () => {}
    });
    w.freeFire = prevFree;

    return {
      fired: result.fired,
      killed: result.killed,
      headshot: result.headshot,
      hpBefore,
      hpAfter: Math.round(e.hp)
    };
  }

  debugSpawnWeaponHere(id: string): void {
    const p = this.player.position.clone();
    p.x += 0.4;
    this.pickups.spawnAtPoint('weapon', p, specById(id));
  }

  debugSpawnAhead(kind: PickupKind, id: string, dist: number): void {
    const p = this.player.position.clone();
    p.x -= Math.sin(this.player.yaw) * dist;
    p.z -= Math.cos(this.player.yaw) * dist;
    this.pickups.spawnAtPoint(kind, p, id ? specById(id) : null);
  }

  debugDeploySentryHere(): void {
    const p = this.player.position.clone();
    p.x -= Math.sin(this.player.yaw) * 2.5;
    p.z -= Math.cos(this.player.yaw) * 2.5;
    this.deploySentry(p);
  }

  debugForceMutator(id: string): boolean {
    const mut = this.mods.forceMutator(id);
    this.hud.setMutator(mut ? mut.name : null, mut?.color ?? null);
    (this.scene.fog as THREE.FogExp2).density = this.mods.fogDensity;
    return mut !== null;
  }

  debugClearMutator(): void {
    this.mods.clearMutator();
    this.hud.setMutator(null, null);
    (this.scene.fog as THREE.FogExp2).density = CONFIG.variety.fogBase;
  }

  debugGiveBoon(id: string): boolean {
    const boon = boonById(id);
    if (!boon) return false;
    this.mods.addBoon(id);
    this.syncMods();
    if (id === 'vitality') {
      this.player.maxHp = CONFIG.player.maxHp + this.mods.maxHpAdd;
      this.player.heal(20);
    } else if (id === 'mag') {
      this.weapon.ammo = this.weapon.magSize();
    }
    return true;
  }

  debugOpenDraft(): boolean {
    this.openDraft();
    return this.state === 'draft';
  }

  debugWeaponMag(): number {
    return this.weapon.magSize();
  }

  debugQuotaPreview(): number {
    return Math.round((CONFIG.director.quotaBase + (this.director.wave - 1) * CONFIG.director.quotaPerWave) * this.mods.quotaMul);
  }

  debugMutatorSequence(seed: number, waves: number): string[] {
    const rng = RNG.fromSeed(seed);
    const mods = new RunMods();
    const out: string[] = [];
    for (let w = 1; w <= waves; w++) {
      const m = mods.rollMutator(w, rng);
      out.push(m ? m.id : 'none');
    }
    return out;
  }

  private applyShield(frac: number): void {
    this.player.shieldFrac = frac;
    this.player.shieldT = CONFIG.drops.shieldDuration;
    this.player.shieldBudget = CONFIG.drops.shieldBudget;
    this.prevShieldT = this.player.shieldT;
    this.sfx.shieldUp();
    const pct = Math.round(frac * 100);
    this.hud.banner(`AEGIS ${pct}%`);
    this.hud.feed(`AEGIS ONLINE — ABSORBS ${pct}% OF DAMAGE FOR ${CONFIG.drops.shieldDuration}s`, 'info');
  }

  private breakShield(shattered: boolean): void {
    this.player.shieldFrac = 0;
    this.player.shieldT = 0;
    this.player.shieldBudget = 0;
    if (shattered) {
      this.sfx.shieldBreak();
      this.hud.feed('AEGIS SHATTERED', 'info');
    }
  }

  private applyOverdrive(): void {
    this.overdriveT = CONFIG.boost.overdriveDuration;
    this.weapon.damageMul = CONFIG.boost.damageMul;
    this.weapon.freeFire = true;
    this.sfx.overdrive();
    this.hud.banner('OVERDRIVE');
    this.hud.feed(`OVERDRIVE — ${CONFIG.boost.damageMul}× DAMAGE, UNLIMITED AMMO FOR ${CONFIG.boost.overdriveDuration}s`, 'info');
  }

  private applyInvuln(): void {
    this.invulnT = CONFIG.boost.invulnDuration + this.mods.bulwarkDurAdd;
    this.invuln = true;
    this.effects.spawnRing(this.player.position.clone().setY(0.1), '#ffd23f');
    this.sfx.invulnUp();
    this.hud.banner('BULWARK CORE');
    this.hud.feed(`BULWARK ONLINE — IMMORTAL FOR ${CONFIG.boost.invulnDuration}s`, 'info');
  }

  private deploySentry(pos: THREE.Vector3): void {
    const sentry = new Sentry<Enemy>(pos.clone().setY(0), this.mods.sentryDurMul, this.mods.sentryDmgMul);
    sentry.addTo(this.scene);
    this.sentries.push(sentry);
    this.effects.spawnRing(pos.clone().setY(0.1), '#c15cff');
    this.sfx.sentryUp();
    this.hud.banner('WARDEN');
    this.hud.feed(
      `WARDEN DEPLOYED — ${CONFIG.sentry.damage} DMG/SHOT · ${CONFIG.sentry.duration}s UPTIME`,
      'info'
    );
  }

  private spawnKillDrop(enemy: Enemy): void {
    const D = CONFIG.drops;
    const total = D.shieldWeight + D.overdriveWeight + D.refillWeight + D.invulnWeight + D.sentryWeight;
    const roll = this.rng.next() * total;
    const kind: PickupKind =
      roll < D.shieldWeight ? 'shield'
        : roll < D.shieldWeight + D.overdriveWeight ? 'overdrive'
          : roll < D.shieldWeight + D.overdriveWeight + D.refillWeight ? 'refill'
            : roll < D.shieldWeight + D.overdriveWeight + D.refillWeight + D.invulnWeight ? 'invuln'
              : 'sentry';

    const base = enemy.group.position.clone();
    base.y = 0;
    let pos = base;
    if (!this.arena.isClear(base.x, base.z, 0.8)) {
      let found: THREE.Vector3 | null = null;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const tx = base.x + Math.cos(a) * 1.6;
        const tz = base.z + Math.sin(a) * 1.6;
        if (this.arena.isClear(tx, tz, 0.8)) {
          found = new THREE.Vector3(tx, 0, tz);
          break;
        }
      }
      pos = found ?? base;
    }

    this.pickups.spawnAtPoint(kind, pos);
    if (kind === 'shield') this.hud.feed('KILL-STREAK DROP — AEGIS CELL DEPLOYED', 'info');
    else if (kind === 'overdrive') this.hud.feed('KILL-STREAK DROP — OVERDRIVE CORE DEPLOYED', 'info');
    else if (kind === 'invuln') this.hud.feed('KILL-STREAK DROP — BULWARK CORE DEPLOYED', 'info');
    else if (kind === 'sentry') this.hud.feed('KILL-STREAK DROP — WARDEN TURRET DEPLOYED', 'info');
    else this.hud.feed('KILL-STREAK DROP — AMMO CACHE DEPLOYED', 'info');
  }

  private registerStreakKill(): void {
    const S = CONFIG.streak;
    const nowS = performance.now() / 1000;
    this.killTimes.push(nowS);
    this.killTimes = this.killTimes.filter(t => nowS - t <= S.windowSec);

    let tierIdx = -1;
    for (let i = 0; i < S.tiers.length; i++) {
      if (this.killTimes.length >= S.tiers[i].count) tierIdx = i;
      else break;
    }
    if (tierIdx >= 0 && tierIdx > this.streakAnnounced) {
      this.streakAnnounced = tierIdx;
      this.hud.banner(S.tiers[tierIdx].name);
      this.sfx.streak(tierIdx);
      this.director.heat = clamp(this.director.heat + S.heatBonus, 0, 1);
    }
  }

  private spawnEnemy(): void {
    const spec = this.director.requestSpawnSpec(this.activeRivalIds);
    const stats = buildStats(
      spec.tier,
      spec.traitIds,
      this.director.wave,
      this.director.aggression(),
      this.rng,
      this.mods.enemyHpMul,
      this.mods.strafeMul
    );
    const point = this.arena.randomSpawnPoint(this.rng, this.player.position);
    const enemy = new Enemy(spec, stats, point);
    enemy.addTo(this.scene);
    this.enemies.push(enemy);
    this.activeRivalIds.add(spec.rivalId);

    const rec = this.memory.get(spec.rivalId);
    const fearedDeaths = rec?.deaths ?? 0;
    if (spec.tier >= 1 || fearedDeaths >= 3 || spec.traitIds.length > 0) {
      this.hud.feed(spawnLine(spec.name, fearedDeaths, this.rng), 'rival');
    }
  }

  startRun(): void {
    if (!this.booted || !this.director) return;
    try {
      this.sfx.unlock();
      for (const e of this.enemies) e.dispose(this.scene);
      this.enemies.length = 0;
      this.activeRivalIds.clear();
      this.effects.clear();

      this.player.reset();
      this.weapon.reset();
      this.pickups.clear();
      for (const s of this.sentries) s.dispose(this.scene);
      this.sentries.length = 0;
      this.mods.reset();
      this.syncMods();
      (this.scene.fog as THREE.FogExp2).density = CONFIG.variety.fogBase;
      this.hud.setMutator(null, null);
      this.kills = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.runStartTime = performance.now();
      this.lastPhase = 'intermission';
      this.overdriveT = 0;
      this.killsSinceDrop = 0;
      this.killTimes = [];
      this.streakAnnounced = -1;
      this.spreadTimer = 0;
      this.prevShieldT = 0;
      this.invulnT = 0;
      this.lastYaw = this.player.yaw;
      this.lastPitch = this.player.pitch;
      this.director.beginRun();

      this.hud.show();
      this.hud.setHp(this.player.hp, this.player.maxHp);
      this.hud.setAmmo(this.weapon.ammo, false);
      this.hud.setWave(1);
      this.hud.setHeat(this.director.heat);
      this.hud.setBoss(null, 0);
      this.hud.setShield(0, 0);
      this.hud.setBoost(null, 0, 0);
      this.hud.setInvuln(0);

      this.screens.hideAll();
      this.input.resetLockFail();
      this.state = 'playing';
    } catch (err) {
      console.error('[PITBOSS] startRun failed:', err);
      this.state = 'menu';
      this.screens.showStart();
      return;
    }
    this.input.requestLock(this.canvas);
  }

  private openDraft(): void {
    if (this.state !== 'playing') return;
    const pool = BOONS.filter(b => this.mods.stackOf(b.id) < b.maxStacks);
    const choices: BoonDef[] = [];
    const bag = [...pool];
    while (choices.length < Math.min(CONFIG.variety.draftChoices, bag.length)) {
      const i = this.rng.int(0, bag.length);
      choices.push(bag.splice(i, 1)[0]);
    }
    if (choices.length === 0) return;
    this.draftChoices = choices;
    this.state = 'draft';
    this.input.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.screens.showDraft(choices, id => this.mods.stackOf(id));
    this.sfx.ui();
  }

  private closeDraft(picked: BoonDef | null): void {
    if (this.state !== 'draft') return;
    if (picked) {
      this.mods.addBoon(picked.id);
      this.syncMods();
      if (picked.id === 'vitality') {
        this.player.maxHp = CONFIG.player.maxHp + this.mods.maxHpAdd;
        this.player.heal(20);
        this.sfx.heal();
      } else if (picked.id === 'mag') {
        this.weapon.ammo = this.weapon.magSize();
      } else {
        this.sfx.powerup();
      }
      this.hud.feed(`BOON — ${picked.name}: ${picked.desc}`, 'info');
    } else {
      this.player.heal(CONFIG.variety.skipHeal);
      this.sfx.heal();
      this.hud.feed(`DRAFT SKIPPED — +${CONFIG.variety.skipHeal} VITALS`, 'info');
    }
    this.draftChoices = [];
    this.screens.hideDraft();
    this.player.maxHp = CONFIG.player.maxHp + this.mods.maxHpAdd;
    this.state = 'playing';
    this.input.requestLock(this.canvas);
  }

  private onPlayerDied(killer: Enemy | null): void {
    this.state = 'dead';
    this.input.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();

    let record: RivalRecord;
    let promoted = false;
    let newTrait: TraitDef | null = null;

    const killerId = killer?.data.rivalId ?? '';
    if (killerId && this.memory.get(killerId)) {
      const promo = this.memory.promoteOnPlayerDeath(killerId, this.rng);
      record = promo.record;
      promoted = promo.promoted;
      newTrait = promo.newTrait;
    } else {
      record = {
        id: '',
        name: 'THE PIT',
        tier: 0,
        traits: [],
        kills: 0,
        deaths: 0,
        taunt: 'The pit itself claims another.',
        created: Date.now(),
        lastSeen: Date.now()
      };
    }

    this.sfx.death();
    this.hud.feed(`${record.name} finishes you.`, 'rival');

    const accuracy = this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
    const timeSec = (performance.now() - this.runStartTime) / 1000;
    const summary = {
      wave: this.director.wave,
      kills: this.kills,
      accuracy,
      timeSec,
      dayStamp: Math.floor(Date.now() / 86400000),
      at: Date.now()
    };
    const rank = this.highscores.add(summary);
    if (summary.wave > this.bestWave) this.bestWave = summary.wave;

    this.lastDeathData = {
      killerName: record.name,
      killerTier: record.tier,
      killerTraits: [...record.traits],
      taunt: record.taunt,
      promoted,
      newTier: record.tier,
      newTrait: promoted && newTrait ? newTrait.name : null,
      stats: { wave: summary.wave, kills: summary.kills, accuracy, timeSec },
      shareCode: encodeRun(summary),
      rank
    };
    this.screens.showDeath(this.lastDeathData);
  }

  private frame(now: number): void {
    requestAnimationFrame(t => this.frame(t));
    let dt = (now - this.lastFrameT) / 1000;
    this.lastFrameT = now;
    dt = Math.min(0.25, Math.max(0, dt));
    this.input.captureLook = this.state === 'playing';
    this.viewmodel.rig.visible = this.state !== 'menu';

    if (this.state === 'playing') {
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      const stepDt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.simulate(stepDt);
      }
    } else if (this.state === 'menu') {
      this.menuClock += dt;
      const a = this.menuClock * 0.12;
      this.player.camera.position.set(Math.sin(a) * 17, 9 + Math.sin(a * 0.6) * 1.5, Math.cos(a) * 17);
      this.player.camera.lookAt(0, 1.4, 0);
    } else {
      this.effects.hideFlame();
      this.invulnAura.visible = false;
    }

    this.effects.update(dt);
    this.hud.tick(dt);
    this.renderer.render(this.scene, this.player.camera);
  }

  private lastFrameT = performance.now();

  private syncMods(): void {
    this.player.moveMul = this.mods.moveSpeedMul;
    this.player.jumpMul = this.mods.jumpMul;
    this.player.gravityMul = this.mods.gravityMul;
    this.weapon.magSizeMul = this.mods.magSizeMul;
    this.weapon.reloadSpeedMul = this.mods.reloadSpeedMul;
    this.weapon.specialDurAdd = this.mods.specialDurAdd;
  }

  private simulate(dt: number): void {
    this.syncMods();
    this.player.update(dt, this.input, this.arena);

    const yawDelta = this.player.yaw - this.lastYaw;
    const pitchDelta = this.player.pitch - this.lastPitch;
    this.lastYaw = this.player.yaw;
    this.lastPitch = this.player.pitch;

    if (this.input.consumeReload()) {
      if (this.weapon.startReload()) this.sfx.reload();
    }

    const camera = this.player.camera;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    const origin = camera.position.clone().addScaledVector(dir, 0.35).addScaledVector(right, 0.14);
    origin.y -= 0.12;

    const targets: ShotTarget[] = [];
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      targets.push({
        hitCenter: e.center,
        hitRadius: e.hitRadius,
        headCenter: e.headCenter,
        headRadius: e.headRadius,
        onHit: dmg => this.applyDamageToEnemy(e, dmg),
        onBurn: (dps, dur) => e.ignite(dps * this.mods.burnMul, dur)
      });
    }

    if (this.input.fireHeld) {
      const result = this.weapon.fire(origin, dir, targets, {
        arenaColliders: this.arena.colliders,
        effects: this.effects,
        sfx: this.sfx,
        onHeadshot: () => {
          this.sfx.headshot();
          this.hud.hitMarker(true);
        }
      });
      if (result.fired) {
        this.shotsFired++;
        if (result.hitSomething) this.shotsHit++;
        this.player.pitch += result.recoil;
        this.viewmodel.kick(Math.min(1.4, result.recoil / 0.013));
      }
    }

    const flameActive = this.input.fireHeld
      && this.weapon.spec.mode === 'cone'
      && this.weapon.canFire()
      && this.state === 'playing';
    const flameLen = Math.min(
      this.weapon.spec.range,
      this.weapon.wallDistance(origin, dir, this.arena.colliders)
    );
    this.effects.setFlame(origin, dir, flameLen, flameActive, dt);

    this.weapon.update(dt);

    const playerEye = this.player.eyePosition(new THREE.Vector3()).clone();
    const ctx = {
      playerFeet: this.player.position,
      playerEye,
      playerSpeed: this.player.planarSpeed(),
      arena: this.arena,
      fx: this.effects,
      sfx: this.sfx,
      rng: this.rng,
      onPlayerHit: (dmg: number, killer: Enemy) => this.onPlayerHit(dmg, killer),
      onBurnTick: (enemy: Enemy, dmg: number) => this.applyDamageToEnemy(enemy, dmg, true)
    };

    for (const e of this.enemies) e.update(dt, ctx);

    this.spreadTimer -= dt;
    if (this.spreadTimer <= 0) {
      this.spreadTimer = CONFIG.burnSpread.checkInterval;
      const burning = this.enemies.filter(e => e.isBurning);
      for (const b of burning) {
        for (const o of this.enemies) {
          if (o.isBurning || o.state !== 'combat') continue;
          if (o.center.distanceTo(b.center) <= CONFIG.burnSpread.radius
            && this.rng.chance(CONFIG.burnSpread.chance)) {
            o.ignite(b.burnDps, b.burnT);
          }
        }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removeMe) {
        this.enemies[i].dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }

    if (this.sentries.length > 0) {
      const sentryCtx = {
        enemies: this.enemies,
        arena: this.arena,
        fx: this.effects,
        sfx: this.sfx,
        onDamage: (e: Enemy, dmg: number) => this.applyDamageToEnemy(e, dmg)
      };
      for (let i = this.sentries.length - 1; i >= 0; i--) {
        const s = this.sentries[i];
        s.update(dt, sentryCtx);
        if (s.expired) {
          s.dispose(this.scene);
          this.sentries.splice(i, 1);
          this.hud.feed('WARDEN OFFLINE', 'info');
        }
      }
    }

    if (this.overdriveT > 0) {
      this.overdriveT = Math.max(0, this.overdriveT - dt);
      if (this.overdriveT === 0) {
        this.weapon.damageMul = 1;
        this.weapon.freeFire = false;
        this.sfx.expire();
        this.hud.feed('OVERDRIVE SPENT', 'info');
      }
    }

    if (this.invulnT > 0) {
      this.invulnT = Math.max(0, this.invulnT - dt);
      if (this.invulnT === 0) {
        this.sfx.expire();
        this.hud.feed('BULWARK FADED', 'info');
      }
    }
    this.invuln = this.invulnT > 0;
    if (this.invulnT > 0) {
      const p = this.player.position;
      this.invulnAura.position.set(p.x, p.y + CONFIG.player.height * 0.5, p.z);
      const frac = this.invulnT / CONFIG.boost.invulnDuration;
      this.invulnAura.scale.setScalar(1 + Math.sin(performance.now() / 80) * 0.05 * frac);
      (this.invulnAura.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.1 * frac;
      this.invulnAura.visible = true;
    } else {
      this.invulnAura.visible = false;
    }

    if (this.prevShieldT > 0 && this.player.shieldT === 0 && this.player.shieldFrac > 0) {
      this.breakShield(false);
      this.hud.feed('AEGIS EXPIRED', 'info');
    }
    this.prevShieldT = this.player.shieldT;

    const nowS = performance.now() / 1000;
    if (this.killTimes.length > 0) {
      this.killTimes = this.killTimes.filter(t => nowS - t <= CONFIG.streak.windowSec);
      if (this.killTimes.length === 0) this.streakAnnounced = -1;
    }

    this.updateDirectorPhase();
    this.director.update(dt, {
      hpFrac: this.player.hp / this.player.maxHp,
      accuracy: this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 1,
      aliveEnemies: this.aliveCount()
    });
    this.pickups.update(dt, this.player.position);

    this.viewmodel.setWeapon(this.weapon.spec.id);
    this.viewmodel.update({
      dt,
      planarSpeed: this.player.planarSpeed(),
      grounded: this.player.motor.grounded,
      yawDelta,
      pitchDelta,
      firing: this.input.fireHeld && this.weapon.canFire(),
      reloading: this.weapon.reloading,
      overdrive: this.overdriveT > 0
    });

    if (this.weapon.isSpecial && this.weapon.specialT > 0) {
      this.hud.setSpecial(this.weapon.spec.name, this.weapon.specialT / this.weapon.spec.specialDuration, this.weapon.specialT);
    } else {
      this.hud.setSpecial(null, 0, 0);
    }

    if (this.player.shieldFrac > 0 && this.player.shieldT > 0) {
      this.hud.setShield(this.player.shieldBudget / CONFIG.drops.shieldBudget, this.player.shieldT);
    } else {
      this.hud.setShield(0, 0);
    }

    if (this.overdriveT > 0) {
      this.hud.setBoost('OVERDRIVE', this.overdriveT / CONFIG.boost.overdriveDuration, this.overdriveT);
    } else {
      this.hud.setBoost(null, 0, 0);
    }

    if (this.invulnT > 0) {
      this.hud.setInvuln(this.invulnT / CONFIG.boost.invulnDuration);
    } else {
      this.hud.setInvuln(0);
    }

    let boss: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.data.tier < 3) continue;
      if (!boss || e.maxHp > boss.maxHp) boss = e;
    }
    if (boss) {
      this.hud.setBoss(`${boss.data.name} — ${TIERS[boss.data.tier].name}`, boss.hp / boss.maxHp);
    } else {
      this.hud.setBoss(null, 0);
    }

    this.hud.setHp(this.player.hp, this.player.maxHp);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.reloading);
    this.hud.setWave(this.director.wave);
    this.hud.setHeat(this.director.heat);
  }

  private updateDirectorPhase(): void {
    const phase = this.director.phase;
    if (phase !== this.lastPhase) {
      if (phase === 'active') {
        this.lastPhase = phase;
        this.pickups.spawnAtRandom('heal');
        const mut = this.mods.rollMutator(this.director.wave, this.rng);
        if (mut) {
          this.hud.banner(`MUTATOR — ${mut.name}`);
          this.hud.feed(`${mut.name} — ${mut.desc}`, 'info');
          this.sfx.mutator();
        }
        this.hud.setMutator(mut ? mut.name : null, mut?.color ?? null);
        (this.scene.fog as THREE.FogExp2).density = this.mods.fogDensity;
        if (this.director.wave % 3 === 0) {
          this.pickups.spawnAtRandom('weapon');
          this.pickups.spawnAtRandom('sentry');
          this.hud.feed('WEAPON + WARDEN DROP DEPLOYED — FIND THE LIGHT PILLARS', 'info');
        }
      } else {
        this.lastPhase = phase;
        this.player.heal(CONFIG.director.healBetweenWaves);
        this.weapon.ammo = this.weapon.magSize();
        this.weapon.reloading = false;
        this.hud.feed(`WAVE CLEARED — +${CONFIG.director.healBetweenWaves} VITALS, AMMO REFILLED`, 'info');
        this.openDraft();
      }
    }
    const surging = this.director.surging;
    if (surging && !this.lastSurging) {
      this.pickups.spawnAtRandom('weapon');
      this.hud.feed('SURGE REWARD — WEAPON DROP DEPLOYED', 'info');
    }
    this.lastSurging = surging;
  }

  private applyDamageToEnemy(enemy: Enemy, dmg: number, silent = false): 'hit' | 'dead' {
    const result = enemy.takeDamage(Math.round(dmg * this.mods.dmgOutMul));
    if (!silent) {
      this.sfx.hit();
      this.hud.hitMarker();
    }
    if (result === 'dead') {
      this.onEnemyKilled(enemy);
    }
    return result;
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills++;
    this.memory.registerEnemyDeath(enemy.data.rivalId);
    this.effects.impact(enemy.center, 0xffb08a);
    this.hud.feed(`YOU ⟶ ${enemy.data.name}`, 'info');
    if (enemy.data.tier >= 2) {
      this.hud.feed(`${enemy.data.name} has fallen. The pit falls silent... briefly.`, 'rival');
    }
    const heal = this.mods.killHealBoon + this.mods.killHealMut;
    if (heal > 0 && this.player.hp > 0) this.player.heal(heal);
    const bounty = this.mods.bountyEvery;
    if (bounty !== null && this.kills % bounty === 0) this.spawnKillDrop(enemy);
    this.killsSinceDrop++;
    if (this.killsSinceDrop >= this.killsPerDropNow()) {
      this.killsSinceDrop = 0;
      this.spawnKillDrop(enemy);
    }
    this.registerStreakKill();
  }

  private killsPerDropNow(): number {
    const base = Math.max(3, Math.round((CONFIG.drops.killsPerDrop - this.mods.dropKillsReduce) / this.mods.dropRateMul));
    return Math.min(CONFIG.drops.killsPerDrop, base);
  }

  private onPlayerHit(dmg: number, killer: Enemy | null): void {
    if (this.state !== 'playing') return;
    if (this.invuln && !this.debugBypass) return;
    let incoming = dmg * this.mods.dmgInMul;
    if (this.player.shieldT > 0 && this.player.shieldFrac > 0) {
      const absorbed = Math.min(this.player.shieldBudget, incoming * this.player.shieldFrac);
      this.player.shieldBudget -= absorbed;
      incoming = Math.max(0, incoming - absorbed);
      if (this.player.shieldBudget <= 0.5) this.breakShield(true);
    }
    incoming = Math.max(0, Math.round(incoming));
    if (incoming <= 0) return;
    const died = this.player.takeDamage(incoming);
    this.director.registerPlayerDamage(incoming);
    this.sfx.hurt();
    this.hud.damageFlash(1 - this.player.hp / this.player.maxHp + 0.3);
    if (died) this.onPlayerDied(killer);
  }

  private aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state !== 'dead') n++;
    return n;
  }

  private onResize(): void {
    this.player.camera.aspect = window.innerWidth / window.innerHeight;
    this.player.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

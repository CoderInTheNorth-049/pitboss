import * as THREE from 'three';
import { CONFIG } from '../config';
import { RNG } from '../utils/rng';
import { Arena } from '../world/arena';
import { Player } from '../player/player';
import { Input } from './input';
import { Weapon } from '../weapons/weapon';
import type { ShotTarget } from '../weapons/weapon';
import { Enemy } from '../enemies/enemy';
import { TIERS, buildStats } from '../enemies/traits';
import { spawnLine } from '../enemies/taunts';
import { Director } from '../ai/director';
import { RivalMemory } from '../memory/rivals';
import { Effects } from '../vfx/effects';
import { Sfx } from '../audio/sfx';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import type { DeathScreenData } from '../ui/screens';
import { PickupManager, type PickupEvent } from '../world/pickups';
import { specById } from '../weapons/specs';
import { HighScores } from './highscores';
import { encodeRun, decodeRun, describeRun } from './shareCode';

function readBest(): number {
  try {
    return parseInt(localStorage.getItem('pitboss.bestWave') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

type GameState = 'menu' | 'playing' | 'dead' | 'paused';

export class Game {
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

  private enemies: Enemy[] = [];
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

    this.screens = new Screens();
    this.input.attach(canvas);
    this.bindUi();

    window.addEventListener('resize', () => this.onResize());
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
      }
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
      pickups: this.pickups?.count ?? 0,
      best: this.bestWave,
      playerPos: this.player.position.toArray().map(n => +n.toFixed(2)),
      hp: this.player.hp
    };
  }

  debugForceDeath(): boolean {
    if (this.state !== 'playing') return false;
    const killer = this.enemies.find(e => e.state !== 'dead');
    if (!killer) return false;
    this.onPlayerHit(this.player.hp, killer);
    return true;
  }

  debugSetHp(hp: number): void {
    this.player.hp = hp;
  }

  debugGiveSpecial(id: string): void {
    const spec = specById(id);
    if (spec.specialDuration > 0) this.weapon.equipSpecial(spec);
  }

  debugSpawnHealHere(): void {
    const p = this.player.position.clone();
    p.x += 0.4;
    this.pickups.spawnAtPoint('heal', p);
  }

  debugSpawnWeaponHere(id: string): void {
    const p = this.player.position.clone();
    p.x += 0.4;
    this.pickups.spawnAtPoint('weapon', p, specById(id));
  }

  debugSpawnAhead(kind: 'heal' | 'weapon', id: string, dist: number): void {
    const p = this.player.position.clone();
    p.x -= Math.sin(this.player.yaw) * dist;
    p.z -= Math.cos(this.player.yaw) * dist;
    this.pickups.spawnAtPoint(kind, p, id ? specById(id) : null);
  }

  private spawnEnemy(): void {
    const spec = this.director.requestSpawnSpec(this.activeRivalIds);
    const stats = buildStats(spec.tier, spec.traitIds, this.director.wave, this.director.aggression());
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
      this.kills = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.runStartTime = performance.now();
      this.lastPhase = 'intermission';
      this.director.beginRun();

      this.hud.show();
      this.hud.setHp(this.player.hp, this.player.maxHp);
      this.hud.setAmmo(this.weapon.ammo, false);
      this.hud.setWave(1);
      this.hud.setHeat(this.director.heat);
      this.hud.setBoss(null, 0);

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

  private onPlayerDied(killer: Enemy): void {
    this.state = 'dead';
    this.input.fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();

    const { record, promoted, newTrait } = this.memory.promoteOnPlayerDeath(killer.data.rivalId, this.rng);
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
    }

    this.effects.update(dt);
    this.hud.tick(dt);
    this.renderer.render(this.scene, this.player.camera);
  }

  private lastFrameT = performance.now();

  private simulate(dt: number): void {
    this.player.update(dt, this.input, this.arena);

    if (this.input.consumeReload()) {
      if (this.weapon.startReload()) this.sfx.reload();
    }

    const targets: ShotTarget[] = [];
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      targets.push({
        hitCenter: e.center,
        hitRadius: e.hitRadius,
        onHit: dmg => this.applyDamageToEnemy(e, dmg)
      });
    }

    if (this.input.fireHeld) {
      const camera = this.player.camera;
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      const origin = camera.position.clone().addScaledVector(dir, 0.35).addScaledVector(right, 0.14);
      origin.y -= 0.12;

      const result = this.weapon.fire(origin, dir, targets, {
        arenaColliders: this.arena.colliders,
        effects: this.effects,
        sfx: this.sfx
      });
      if (result.fired) {
        this.shotsFired++;
        if (result.hitSomething) this.shotsHit++;
        this.player.pitch += result.recoil;
      }
    }
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
      onPlayerHit: (dmg: number, killer: Enemy) => this.onPlayerHit(dmg, killer)
    };

    for (const e of this.enemies) e.update(dt, ctx);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removeMe) {
        this.enemies[i].dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }

    this.updateDirectorPhase();
    this.director.update(dt, {
      hpFrac: this.player.hp / this.player.maxHp,
      accuracy: this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 1,
      aliveEnemies: this.aliveCount()
    });
    this.pickups.update(dt, this.player.position);

    if (this.weapon.isSpecial && this.weapon.specialT > 0) {
      this.hud.setSpecial(this.weapon.spec.name, this.weapon.specialT / this.weapon.spec.specialDuration, this.weapon.specialT);
    } else {
      this.hud.setSpecial(null, 0, 0);
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
        if (this.director.wave % 3 === 0) {
          this.pickups.spawnAtRandom('weapon');
          this.hud.feed('WEAPON DROP DEPLOYED — FIND THE LIGHT PILLAR', 'info');
        }
      } else {
        this.lastPhase = phase;
        this.player.heal(CONFIG.director.healBetweenWaves);
        this.weapon.ammo = this.weapon.spec.magSize;
        this.weapon.reloading = false;
        this.hud.feed(`WAVE CLEARED — +${CONFIG.director.healBetweenWaves} VITALS, AMMO REFILLED`, 'info');
      }
    }
    const surging = this.director.surging;
    if (surging && !this.lastSurging) {
      this.pickups.spawnAtRandom('weapon');
      this.hud.feed('SURGE REWARD — WEAPON DROP DEPLOYED', 'info');
    }
    this.lastSurging = surging;
  }

  private applyDamageToEnemy(enemy: Enemy, dmg: number): 'hit' | 'dead' {
    const result = enemy.takeDamage(dmg);
    this.sfx.hit();
    this.hud.hitMarker();
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
  }

  private onPlayerHit(dmg: number, killer: Enemy): void {
    if (this.state !== 'playing') return;
    const died = this.player.takeDamage(dmg);
    this.director.registerPlayerDamage(dmg);
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

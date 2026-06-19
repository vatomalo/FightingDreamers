import * as THREE from 'three';
import { AnimationStateMachine, STATES } from './animationStateMachine.js';

const GRAB_CONTACT_DISTANCE = 0.72;
const GRAB_SEEK_SPEED = 5.8;
const MIN_BODY_DISTANCE = 0.96;
const MIN_ATTACK_DISTANCE = 1.08;
const STRIKE_CONTACT_DISTANCE = 1.08;
const FOOT_CONTACT_DISTANCE = 1.16;
const COLLIDER_FORCE = 0.18;
const COLLIDER_FRICTION = 0.72;
const SIDE_STEP_LIMIT = 0.38;
const SIDE_STEP_DISTANCE = 0.26;
const SIDE_STEP_RECENTER_SPEED = 1.15;
const DEPTH_HIT_SCALE = 0.72;
const DEPTH_SPACING_THRESHOLD = 0.7;
const TARGET_WINS = 3;
const colliderPointA = new THREE.Vector3();
const colliderPointB = new THREE.Vector3();

export class Combatant {
  constructor({ name, model, x, ai = null }) {
    this.name = name;
    this.model = model;
    this.ai = ai;
    this.machine = new AnimationStateMachine();
    this.position = model.root.position;
    this.position.set(x, 0.02, 0);
    this.velocity = 0;
    this.zVelocity = 0;
    this.sideStepState = null;
    this.sideStepFromZ = 0;
    this.sideStepTargetZ = 0;
    this.health = 100;
    this.rounds = 0;
    this.facing = x < 0 ? 1 : -1;
    this.state = this.machine.snapshot();
    this.flash = 0;
    this.lastInput = null;
    this.reactionAnimation = null;
    this.reactionTimer = 0;
    this.lastHitZone = null;
  }

  reset(x) {
    this.position.set(x, 0.02, 0);
    this.velocity = 0;
    this.zVelocity = 0;
    this.sideStepState = null;
    this.sideStepFromZ = 0;
    this.sideStepTargetZ = 0;
    this.health = 100;
    this.facing = x < 0 ? 1 : -1;
    this.flash = 0;
    this.ai?.reset();
    this.machine.transition(STATES.IDLE);
    this.state = this.machine.snapshot();
    this.lastInput = null;
    this.reactionAnimation = null;
    this.reactionTimer = 0;
    this.lastHitZone = null;
  }

  updateState(delta, input) {
    this.lastInput = input;
    this.state = this.machine.update(delta, input);
  }

  setReaction(animation, duration) {
    this.reactionAnimation = animation;
    this.reactionTimer = duration;
  }

  updateReaction(delta) {
    if (this.reactionTimer === Infinity) {
      return;
    }

    this.reactionTimer = Math.max(0, this.reactionTimer - delta);
  }
}

export class FightGame {
  constructor({ player, opponent, input, onHitConfirmed = null }) {
    this.player = player;
    this.opponent = opponent;
    this.input = input;
    this.onHitConfirmed = onHitConfirmed;
    this.roundTime = 90;
    this.maxRoundTime = 90;
    this.targetWins = TARGET_WINS;
    this.roundState = 'fight';
    this.message = 'Round 1';
    this.messageTimer = 1.15;
    this.eventLog = [];
    this.activeThrow = null;
    this.hitstopTimer = 0;
    this.debug = {
      hits: 0,
      blocked: 0,
      throws: 0,
      throwBreaks: 0,
      playerAttacks: 0,
      opponentAttacks: 0,
      roundOvers: 0,
    };
  }

  update(delta) {
    if (this.input.wasPressed('KeyR')) {
      this.resetMatch();
    }

    this.messageTimer = Math.max(0, this.messageTimer - delta);

    if (this.roundState === 'matchOver') {
      return;
    }

    if (this.roundState !== 'fight') {
      if (this.messageTimer <= 0) {
        this.resetRound();
      }
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - delta);
      this.updateFlashes(delta, false);
      return;
    }

    this.roundTime = Math.max(0, this.roundTime - delta);
    this.faceEachOther();

    if (this.activeThrow) {
      this.updateThrow(delta);
      this.updateFlashes(delta);
      this.checkRoundEnd();
      return;
    }

    const playerInput = this.player.ai?.update(delta, this.player, this.opponent) ?? this.input;
    const opponentInput = this.opponent.ai?.update(delta, this.opponent, this.player) ?? this.input;
    this.player.updateState(delta, playerInput);
    this.opponent.updateState(delta, opponentInput);

    this.countAttacks(this.player, this.opponent);
    this.resolveMovement(delta);
    this.resolveGrabApproach(this.player, this.opponent, delta);
    this.resolveGrabApproach(this.opponent, this.player, delta);
    this.resolveGrabs(this.player, this.opponent);
    this.resolveGrabs(this.opponent, this.player);
    this.resolveHits(this.player, this.opponent);
    this.resolveHits(this.opponent, this.player);
    this.updateFlashes(delta);
    this.checkRoundEnd();
  }

  resolveGrabApproach(attacker, defender, delta) {
    if (attacker.state.state !== STATES.GRAB || attacker.state.hitResolved) {
      return;
    }

    const targetX = getContactX(attacker, defender);
    const nextX = moveToward(attacker.position.x, targetX, GRAB_SEEK_SPEED * delta);
    attacker.position.x = clamp(nextX, -4.2, 4.2);
    attacker.position.z = moveToward(attacker.position.z, defender.position.z, GRAB_SEEK_SPEED * 0.72 * delta);
    stopAtContact(attacker, defender);
  }

  countAttacks(player, opponent) {
    if (player.state.attack && player.state.elapsed <= 0.025) {
      this.debug.playerAttacks++;
    }

    if (opponent.state.attack && opponent.state.elapsed <= 0.025) {
      this.debug.opponentAttacks++;
    }
  }

  faceEachOther() {
    this.player.facing = this.player.position.x <= this.opponent.position.x ? 1 : -1;
    this.opponent.facing = -this.player.facing;
  }

  resolveMovement(delta) {
    for (const combatant of [this.player, this.opponent]) {
      const direction = combatant.facing;
      let speed = 0;

      if (combatant.state.canMove) {
        if (combatant.state.state === STATES.WALK_FORWARD) {
          speed = 1.65 * direction;
        } else if (combatant.state.state === STATES.WALK_BACK) {
          speed = -1.25 * direction;
        }
      }

      if (combatant.state.sideMove) {
        this.resolveSideStep(combatant);
      } else {
        combatant.sideStepState = null;
        combatant.position.z = moveToward(combatant.position.z, 0, SIDE_STEP_RECENTER_SPEED * delta);
        combatant.zVelocity *= Math.pow(0.001, delta);
        combatant.position.z += combatant.zVelocity * delta;
      }

      combatant.velocity += speed * delta * 16;
      combatant.velocity *= Math.pow(0.001, delta);
      combatant.position.x += combatant.velocity * delta;
      combatant.position.x = clamp(combatant.position.x, -4.2, 4.2);
      combatant.position.z = clamp(combatant.position.z, -SIDE_STEP_LIMIT, SIDE_STEP_LIMIT);
    }

    this.keepSpacing();
  }

  resolveSideStep(combatant) {
    if (combatant.sideStepState !== combatant.state.state) {
      combatant.sideStepState = combatant.state.state;
      combatant.sideStepFromZ = combatant.position.z;
      combatant.sideStepTargetZ = clamp(
        combatant.position.z + combatant.state.sideMove * SIDE_STEP_DISTANCE,
        -SIDE_STEP_LIMIT,
        SIDE_STEP_LIMIT,
      );
      combatant.zVelocity = 0;
    }

    combatant.position.z = lerp(combatant.sideStepFromZ, combatant.sideStepTargetZ, easeInOutCubic(combatant.state.progress));
  }

  keepSpacing() {
    const isGrabSpacing = this.player.state.state === STATES.GRAB || this.opponent.state.state === STATES.GRAB || this.activeThrow;
    const minDistance = isGrabSpacing
      ? GRAB_CONTACT_DISTANCE
      : this.player.state.attack || this.opponent.state.attack
        ? MIN_ATTACK_DISTANCE
        : MIN_BODY_DISTANCE;
    const zDistance = Math.abs(this.opponent.position.z - this.player.position.z);

    if (zDistance > DEPTH_SPACING_THRESHOLD) {
      return;
    }

    const distance = this.opponent.position.x - this.player.position.x;
    const overlap = minDistance - Math.abs(distance);

    if (overlap > 0) {
      const push = overlap / 2;
      const sign = distance >= 0 ? 1 : -1;
      this.player.position.x -= push * sign;
      this.opponent.position.x += push * sign;
    }
  }

  resolveHits(attacker, defender) {
    if (!attacker.state.attack || !attacker.state.isAttackActive || attacker.state.hitResolved) {
      return;
    }

    const attack = attacker.state.attack;

    if (attack.rootMotion) {
      return;
    }

    const isBlocking = defender.state.state === STATES.BLOCK && defender.facing === -attacker.facing;
    const distance = attackDistance(attacker, defender);
    const sphereHitInfo = resolveHitSpheres(attacker, defender, attack, distance);
    const hitInfo = sphereHitInfo === undefined
      ? resolveMissingColliderFallback(attacker, defender, attack, distance)
      : sphereHitInfo;

    if (!hitInfo) {
      return;
    }

    attacker.machine.hitResolved = true;

    const falloff = getAttackRangeFalloff(attacker.state.state, distance, attack);
    const damage = Math.max(1, Math.round((isBlocking ? attack.chip : attack.damage) * falloff));
    defender.health = Math.max(0, defender.health - damage);
    defender.lastHitZone = hitInfo.zone;
    this.applyHitPush(attacker, defender, attack, isBlocking, falloff, hitInfo);
    const launchPower = isBlocking ? 0 : this.applyCinematicLaunch(attacker, defender, attack, damage, falloff);
    defender.flash = isBlocking ? 0.12 : 0.2;
    this.hitstopTimer = Math.max(this.hitstopTimer, isBlocking ? 0.045 : attack.hitstop * falloff);
    this.emitHitConfirmed({ attacker, defender, attack, damage, isBlocking, hitInfo, launchPower });

    if (isBlocking) {
      this.debug.blocked++;
      this.log(`${defender.name} blocked ${attacker.name}'s ${attacker.state.state}`);
    } else {
      this.debug.hits++;
      const reaction = defender.health <= 0 ? chooseDeathAnimation(attacker.state.state, hitInfo.zone) : chooseHitAnimation(hitInfo.zone, attacker.state.state);
      defender.setReaction(reaction, defender.health <= 0 ? Infinity : Math.max(attack.reactionTime * falloff, attack.hitstun, 0.58));
      defender.machine.receiveHit(attack.hitstun * falloff);
      defender.state = defender.machine.snapshot();
      this.log(`${attacker.name} hit ${defender.name}'s ${hitInfo.zone} with ${hitInfo.limb ?? attacker.state.state}`);
    }
  }

  emitHitConfirmed({ attacker, defender, attack, damage, isBlocking, hitInfo, launchPower = 0 }) {
    if (!this.onHitConfirmed) {
      return;
    }

    this.onHitConfirmed({
      attacker,
      defender,
      attack,
      attackState: attacker.state.state,
      impactPoint: new THREE.Vector3((attacker.position.x + defender.position.x) / 2, hitInfo?.zone === 'head' ? 1.42 : 1.02, 0),
      hitDirection: new THREE.Vector3(attacker.facing, 0, 0),
      severity: THREE.MathUtils.clamp(damage / 18, 0, 1),
      rawDamage: damage,
      launchPower,
      chargeLevel: attack.chargeLevel ?? 0,
      isBlocked: isBlocking,
      isKill: defender.health <= 0,
      reactionType: hitInfo?.zone ?? 'body',
    });
  }

  applyHitPush(attacker, defender, attack, isBlocking, falloff = 1, hitInfo = null) {
    const blockScale = isBlocking ? 0.5 : 1;
    const defenderPush = attack.defenderPush * blockScale * falloff;
    const attackerPush = attack.attackerPush * (isBlocking ? 0.35 : 1) * falloff;
    const colliderOverlap = Math.max(hitInfo?.overlap ?? 0, 0);
    const colliderForce = colliderOverlap * COLLIDER_FORCE * blockScale;

    this.stopStrikeAtContact(attacker, defender, hitInfo);
    defender.velocity *= COLLIDER_FRICTION;
    attacker.velocity *= COLLIDER_FRICTION;
    defender.velocity += (attack.knockback + defenderPush + colliderForce) * attacker.facing * blockScale;
    attacker.velocity -= (attackerPush + colliderForce * 0.45) * attacker.facing;
    defender.position.x = clamp(defender.position.x + (defenderPush * 0.13 + colliderForce * 0.08) * attacker.facing, -4.2, 4.2);
    attacker.position.x = clamp(attacker.position.x - (attackerPush * 0.08 + colliderForce * 0.04) * attacker.facing, -4.2, 4.2);
    this.keepSpacing();
  }

  applyCinematicLaunch(attacker, defender, attack, damage, falloff) {
    const launchByState = {
      [STATES.HEAVY]: 0.48,
      [STATES.JUMP_KICK]: 0.62,
      [STATES.HURRICANE_KICK]: 0.58,
      [STATES.ROUNDHOUSE]: 0.42,
      [STATES.GRAB]: 0.52,
    };
    const baseLaunch = launchByState[attacker.state.state] ?? 0;
    const chargeLaunch = (attack.chargeLevel ?? 0) * 0.45;
    const damageLaunch = THREE.MathUtils.clamp((damage - 10) / 12, 0, 0.55);
    const killLaunch = defender.health <= 0 ? 0.35 : 0;
    const launchPower = THREE.MathUtils.clamp((baseLaunch + chargeLaunch + damageLaunch + killLaunch) * falloff, 0, 1);

    if (launchPower <= 0) {
      return 0;
    }

    defender.velocity += (0.6 + launchPower * 1.45) * attacker.facing;
    attacker.velocity -= 0.08 * launchPower * attacker.facing;
    defender.position.x = clamp(defender.position.x + attacker.facing * launchPower * 0.1, -4.2, 4.2);
    return launchPower;
  }

  stopStrikeAtContact(attacker, defender, hitInfo) {
    if (!isStrikeHit(hitInfo)) {
      return;
    }

    const contactDistance = getStrikeContactDistance(attacker.state.state, hitInfo);
    const signedGap = (defender.position.x - attacker.position.x) * attacker.facing;

    if (signedGap >= contactDistance) {
      return;
    }

    defender.position.x = clamp(attacker.position.x + contactDistance * attacker.facing, -4.2, 4.2);
    defender.velocity = Math.max(0, defender.velocity * attacker.facing) * attacker.facing;
  }

  resolveGrabs(attacker, defender) {
    if (!attacker.state.attack || !attacker.state.attack.rootMotion || !attacker.state.isAttackActive || attacker.state.hitResolved) {
      return;
    }

    attacker.machine.hitResolved = true;
    const grab = attacker.state.attack;
    const distance = Math.abs(defender.position.x - attacker.position.x);

    if (distance > grab.range || defender.state.state === STATES.KNOCKDOWN) {
      this.log(`${attacker.name}'s grab whiffed`);
      return;
    }

    if (defender.lastInput?.wasPressed('KeyO')) {
      this.debug.throwBreaks++;
      defender.velocity += 0.16 * defender.facing;
      attacker.velocity += -0.16 * attacker.facing;
      this.log(`${defender.name} broke ${attacker.name}'s grab`);
      return;
    }

    this.startThrow(attacker, defender, grab);
  }

  startThrow(attacker, defender, grab) {
    const facing = attacker.facing;

    attacker.velocity = 0;
    defender.velocity = 0;
    stopAtContact(attacker, defender);
    attacker.machine.transition(STATES.GRAB, { duration: 0.72 });
    defender.machine.transition(STATES.GRABBED, { duration: 0.72 });
    attacker.state = attacker.machine.snapshot();
    defender.state = defender.machine.snapshot();

    const attackerContactX = getContactX(attacker, defender);

    this.activeThrow = {
      attacker,
      defender,
      grab,
      facing,
      elapsed: 0,
      duration: 0.72,
      damageApplied: false,
      defenderStartX: defender.position.x,
      attackerContactX,
      defenderSlamX: clamp(defender.position.x + 0.72 * facing, -4.0, 4.0),
    };

    this.debug.throws++;
    this.log(`${attacker.name} grabbed ${defender.name}`);
  }

  updateThrow(delta) {
    const throwState = this.activeThrow;
    throwState.elapsed += delta;

    const progress = Math.min(throwState.elapsed / throwState.duration, 1);
    const slam = easeInOutCubic(Math.max(0, (progress - 0.36) / 0.64));

    throwState.attacker.position.x = getContactX(throwState.attacker, throwState.defender);
    stopAtContact(throwState.attacker, throwState.defender);
    throwState.defender.position.x = clamp(
      lerp(throwState.defenderStartX, throwState.defenderSlamX, slam),
      -4.2,
      4.2,
    );
    throwState.attacker.position.x = getContactX(throwState.attacker, throwState.defender);
    stopAtContact(throwState.attacker, throwState.defender);

    if (!throwState.damageApplied && progress >= 0.55) {
      throwState.damageApplied = true;
      throwState.defender.health = Math.max(0, throwState.defender.health - throwState.grab.damage);
      throwState.defender.flash = 0.22;
      throwState.defender.lastHitZone = 'body';
      throwState.defender.setReaction(
        throwState.defender.health <= 0 ? chooseDeathAnimation(STATES.GRAB) : 'hitbody-big',
        throwState.defender.health <= 0 ? Infinity : 0.78,
      );
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.08);
      this.emitHitConfirmed({
        attacker: throwState.attacker,
        defender: throwState.defender,
        attack: throwState.grab,
        damage: throwState.grab.damage,
        isBlocking: false,
        hitInfo: { zone: 'body', limb: 'grab' },
        launchPower: 0.68,
      });
      this.debug.hits++;
      this.log(`${throwState.attacker.name} threw ${throwState.defender.name}`);
    }

    if (progress >= 1) {
      throwState.defender.velocity = throwState.grab.knockback * throwState.facing;
      throwState.defender.machine.knockDown();
      throwState.attacker.machine.transition(STATES.IDLE);
      throwState.attacker.state = throwState.attacker.machine.snapshot();
      throwState.defender.state = throwState.defender.machine.snapshot();
      this.activeThrow = null;
      this.faceEachOther();
      this.keepSpacing();
    }
  }

  updateFlashes(delta, updateReactions = true) {
    for (const combatant of [this.player, this.opponent]) {
      combatant.flash = Math.max(0, combatant.flash - delta);
      if (updateReactions) {
        combatant.updateReaction(delta);
      }
    }
  }

  checkRoundEnd() {
    if (this.player.health <= 0 || this.opponent.health <= 0 || this.roundTime <= 0) {
      let winner = null;

      if (this.player.health === this.opponent.health) {
        this.message = 'Double KO';
      } else {
        winner = this.player.health > this.opponent.health ? this.player : this.opponent;
        winner.rounds++;
        this.message = winner.rounds >= this.targetWins ? `${winner.name} wins the match` : `${winner.name} wins`;
        winner.setReaction(chooseVictoryAnimation(), Infinity);
      }

      this.roundState = winner?.rounds >= this.targetWins ? 'matchOver' : 'roundOver';
      this.messageTimer = this.roundState === 'matchOver' ? Infinity : 2.2;
      this.debug.roundOvers++;
      this.log(this.message);
    }
  }

  resetMatch() {
    this.player.rounds = 0;
    this.opponent.rounds = 0;
    this.resetRound();
  }

  resetRound() {
    this.player.reset(-1.35);
    this.opponent.reset(1.35);
    this.roundTime = this.maxRoundTime;
    this.roundState = 'fight';
    this.message = `Round ${this.player.rounds + this.opponent.rounds + 1}`;
    this.messageTimer = 1.1;
    this.eventLog.length = 0;
    this.activeThrow = null;
    this.debug.hits = 0;
    this.debug.blocked = 0;
    this.debug.throws = 0;
    this.debug.throwBreaks = 0;
    this.debug.playerAttacks = 0;
    this.debug.opponentAttacks = 0;
    this.debug.roundOvers = 0;
    this.hitstopTimer = 0;
  }

  log(message) {
    this.eventLog.unshift(message);
    this.eventLog.length = Math.min(this.eventLog.length, 4);
  }

  snapshot() {
    return {
      roundState: this.roundState,
      message: this.messageTimer > 0 ? this.message : '',
      roundTime: Math.ceil(this.roundTime),
      targetWins: this.targetWins,
      player: combatantSnapshot(this.player),
      opponent: combatantSnapshot(this.opponent),
      events: [...this.eventLog],
      debug: { ...this.debug },
    };
  }
}

function resolveHitSpheres(attacker, defender, attack, rootDistance = Infinity) {
  const attackSphereNames = attack.hitSpheres ?? [];
  const hurtSphereNames = ['head', 'stomach'];
  let checkedSpherePair = false;
  let bestHit = null;
  let closestHit = null;

  for (const attackName of attackSphereNames) {
    const attackSphere = attacker.model.hitSpheres?.[attackName];

    if (!attackSphere) {
      continue;
    }

    attackSphere.getWorldPosition(colliderPointA);

    for (const hurtName of hurtSphereNames) {
      const hurtSphere = defender.model.hitSpheres?.[hurtName];

      if (!hurtSphere) {
        continue;
      }

      checkedSpherePair = true;
      hurtSphere.getWorldPosition(colliderPointB);
      const radius = attackSphere.userData.colliderRadius + hurtSphere.userData.colliderRadius + (attack.spherePadding ?? 0.18);
      const distance = colliderPointA.distanceTo(colliderPointB);
      const overlap = radius - distance;
      const xDistance = Math.abs(colliderPointA.x - colliderPointB.x);
      const zDistance = Math.abs(colliderPointA.z - colliderPointB.z);
      const laneDistance = Math.hypot(xDistance, zDistance * DEPTH_HIT_SCALE);
      const candidate = {
        limb: attackName,
        zone: hurtName === 'head' ? 'head' : 'body',
        overlap,
        distance,
        xDistance,
        zDistance,
        laneDistance,
      };

      if (!closestHit || distance < closestHit.distance) {
        closestHit = candidate;
      }

      if (overlap >= 0 && (!bestHit || overlap > bestHit.overlap)) {
        bestHit = candidate;
      }
    }
  }

  if (bestHit) {
    return bestHit;
  }

  if (closestHit && closestHit.laneDistance <= attack.range) {
    return {
      ...closestHit,
      overlap: Math.max(closestHit.overlap, 0.04),
      nearContact: true,
    };
  }

  if (closestHit && rootDistance <= attack.range) {
    return {
      ...closestHit,
      overlap: 0.04,
      stalePoseContact: true,
    };
  }

  return checkedSpherePair ? null : undefined;
}

function resolveMissingColliderFallback(attacker, defender, attack, distance) {
  if (distance > attack.range) {
    return null;
  }

  return {
    limb: null,
    zone: chooseFallbackHitZone(attacker.state.state),
    overlap: Math.max(0, attack.range - distance),
    distance,
    fallback: true,
  };
}

function getAttackRangeFalloff(attackState, distance, attack) {
  if (attackState !== STATES.HURRICANE_KICK) {
    return 1;
  }

  const falloffStart = attack.range * 0.58;
  const falloffEnd = attack.range;
  const t = THREE.MathUtils.clamp((distance - falloffStart) / Math.max(falloffEnd - falloffStart, 0.001), 0, 1);
  return THREE.MathUtils.lerp(1, 0.42, easeInOutCubic(t));
}

function chooseFallbackHitZone(attackState) {
  return attackState === STATES.JAB || attackState === STATES.HEAVY ? 'head' : 'body';
}

function chooseHitAnimation(zone, attackState) {
  const headHits = ['hithead', 'hithead-big', 'hithead-big-1', 'hithead-big-2'];
  const bodyHits = ['hitbody', 'hitbody-1', 'hitbody-2', 'hitbody-big'];

  if (zone === 'head') {
    return pick(attackState === STATES.HEAVY ? headHits.slice(1) : headHits);
  }

  return pick(attackState === STATES.KICK || attackState === STATES.JUMP_KICK ? bodyHits : bodyHits.slice(1));
}

function chooseDeathAnimation(attackState, zone = chooseFallbackHitZone(attackState)) {
  const deathByAttack = {
    [STATES.JAB]: ['death-standing-left', 'death'],
    [STATES.HEAVY]: ['death-fallback', 'death-fallback-1', 'death-flyingback'],
    [STATES.KICK]: ['death-fallback', 'death-standing-left'],
    [STATES.JUMP_KICK]: ['death-flyingback', 'death-fallback-1'],
    [STATES.HURRICANE_KICK]: ['death-flyingback', 'death-fallback-1'],
    [STATES.MARTELO_KICK]: ['death-fallback', 'death-standing-left'],
    [STATES.ROUNDHOUSE]: ['death-flyingback', 'death-fallback'],
    [STATES.GRAB]: ['death-twohand', 'death-shield', 'death'],
  };

  return pick(deathByAttack[attackState] ?? ['death']);
}

function chooseVictoryAnimation() {
  return pick(['victory-1', 'victory-2', 'victory-3', 'victory-4', 'victory-talk']);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function combatantSnapshot(combatant) {
  return {
    name: combatant.name,
    health: Math.round(combatant.health),
    rounds: combatant.rounds,
    state: combatant.state.state,
    x: Number(combatant.position.x.toFixed(3)),
    z: Number(combatant.position.z.toFixed(3)),
    facing: combatant.facing,
    flash: combatant.flash,
    lastHitZone: combatant.lastHitZone,
  };
}

function attackDistance(attacker, defender) {
  const xDistance = Math.abs(defender.position.x - attacker.position.x);
  const zDistance = Math.abs(defender.position.z - attacker.position.z);
  return Math.hypot(xDistance, zDistance * DEPTH_HIT_SCALE);
}

function getContactX(attacker, defender) {
  return clamp(defender.position.x - attacker.facing * GRAB_CONTACT_DISTANCE, -4.2, 4.2);
}

function stopAtContact(attacker, defender) {
  const contactX = getContactX(attacker, defender);

  if (attacker.facing > 0) {
    attacker.position.x = Math.min(attacker.position.x, contactX);
  } else {
    attacker.position.x = Math.max(attacker.position.x, contactX);
  }
}

function isStrikeHit(hitInfo) {
  return ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'].includes(hitInfo?.limb);
}

function getStrikeContactDistance(attackState, hitInfo) {
  if (isFootHit(hitInfo)) {
    return getFootContactDistance(attackState);
  }

  if (attackState === STATES.HEAVY) {
    return 1.12;
  }

  return STRIKE_CONTACT_DISTANCE;
}

function isFootHit(hitInfo) {
  return hitInfo?.limb === 'leftFoot' || hitInfo?.limb === 'rightFoot';
}

function getFootContactDistance(attackState) {
  if (attackState === STATES.JUMP_KICK || attackState === STATES.HURRICANE_KICK || attackState === STATES.ROUNDHOUSE) {
    return 1.24;
  }

  return FOOT_CONTACT_DISTANCE;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

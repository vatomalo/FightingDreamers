import * as THREE from 'three';

const PHASES = {
  GAMEPLAY: 'gameplay',
  ANTICIPATION: 'anticipation',
  WINDUP: 'windup',
  IMPACT: 'impact',
  AFTERMATH: 'aftermath',
  RECOVERY: 'recovery',
};

const phaseDurations = {
  [PHASES.ANTICIPATION]: 0.16,
  [PHASES.WINDUP]: 0.32,
  [PHASES.IMPACT]: 0.34,
  [PHASES.AFTERMATH]: 0.34,
  [PHASES.RECOVERY]: 0.42,
};

const tempPosition = new THREE.Vector3();
const tempLookAt = new THREE.Vector3();

export class CinematicCameraDirector {
  constructor({ camera, random = Math.random } = {}) {
    this.camera = camera;
    this.random = random;
    this.phase = PHASES.GAMEPLAY;
    this.phaseElapsed = 0;
    this.cooldown = 0;
    this.sequenceCount = 0;
    this.anchors = null;
    this.lastShotSide = 1;
    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.currentFov = camera?.fov ?? 42;
    this.debug = {
      phase: this.phase,
      active: false,
      cooldown: 0,
      sequenceCount: 0,
      tier: 0,
    };
  }

  onHit(payload) {
    const tier = this.classifyTier(payload);
    this.debug.tier = tier;

    if (tier < 2 || this.phase !== PHASES.GAMEPLAY || this.cooldown > 0) {
      return;
    }

    this.anchors = makeAnchors(payload);
    this.currentPosition.copy(this.camera.position);
    this.currentLookAt.copy(this.anchors.mid);
    this.currentFov = this.camera.fov;
    this.lastShotSide *= -1;
    this.phase = PHASES.ANTICIPATION;
    this.phaseElapsed = 0;
    this.cooldown = payload.isKill ? 1.6 : 3.2;
    this.sequenceCount++;
    this.updateDebug();
  }

  classifyTier(payload) {
    if (!payload || payload.isBlocked) {
      return 0;
    }

    if (payload.forceCinematic || payload.isKill) {
      return 2;
    }

    const severity = payload.severity ?? 0;
    const isHeavy = payload.rawDamage >= 13 || severity >= 0.5 || payload.attackState === 'heavy';

    if (!isHeavy) {
      return 1;
    }

    const procChance = 0.46 + severity * 0.28;
    return this.random() < procChance ? 2 : 1;
  }

  update(delta, gameplayPose) {
    this.cooldown = Math.max(0, this.cooldown - delta);

    if (this.phase === PHASES.GAMEPLAY || !this.anchors) {
      this.applyGameplayPose(gameplayPose);
      this.updateDebug();
      return;
    }

    this.phaseElapsed += delta;
    const duration = phaseDurations[this.phase];
    const t = THREE.MathUtils.clamp(this.phaseElapsed / duration, 0, 1);
    const shot = this.evaluateShot(this.phase, t, gameplayPose);

    const smooth = phaseSmoothness(this.phase);
    this.currentPosition.lerp(shot.position, smooth);
    this.currentLookAt.lerp(shot.lookAt, smooth);
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, shot.fov, smooth);

    this.camera.position.copy(this.currentPosition);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentLookAt);

    if (t >= 1) {
      this.enterNextPhase();
    }

    this.updateDebug();
  }

  applyGameplayPose(gameplayPose) {
    this.camera.position.copy(gameplayPose.position);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, gameplayPose.fov, 0.08);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(gameplayPose.lookAt);
  }

  evaluateShot(phase, t, gameplayPose) {
    const anchors = this.anchors;
    const eased = easeOutCubic(t);
    const settle = easeInOutQuad(t);
    const side = this.lastShotSide;
    const shake = phase === PHASES.IMPACT ? Math.sin(this.phaseElapsed * 96) * (1 - t) * 0.13 : 0;
    const verticalShake = phase === PHASES.IMPACT ? Math.cos(this.phaseElapsed * 71) * (1 - t) * 0.055 : 0;
    const pose = {
      position: tempPosition.set(0, 0, 0),
      lookAt: tempLookAt.set(0, 0, 0),
      fov: gameplayPose.fov,
    };

    if (phase === PHASES.ANTICIPATION) {
      pose.position.lerpVectors(gameplayPose.position, new THREE.Vector3(anchors.mid.x + side * 0.85, 1.95, 5.55), eased);
      pose.lookAt.lerpVectors(gameplayPose.lookAt, new THREE.Vector3(anchors.mid.x, 1.18, side * -0.08), eased);
      pose.fov = THREE.MathUtils.lerp(gameplayPose.fov, 45, eased);
    } else if (phase === PHASES.WINDUP) {
      const orbit = Math.sin(t * Math.PI) * side * 1.25;
      pose.position.set(anchors.mid.x - anchors.direction.x * 0.95 + orbit, 1.42, 2.95);
      pose.lookAt.set(anchors.impact.x + anchors.direction.x * 0.14, 1.12, side * -0.18);
      pose.fov = THREE.MathUtils.lerp(42, 33, eased);
    } else if (phase === PHASES.IMPACT) {
      const punch = t < 0.28 ? easeOutExpo(t / 0.28) : 1 - easeInOutQuad((t - 0.28) / 0.72) * 0.35;
      pose.position.set(anchors.impact.x - anchors.direction.x * 0.48 + side * 0.2 + shake, 1.03 + verticalShake, 2.12);
      pose.lookAt.set(anchors.impact.x + shake * 0.55, 1.02 + verticalShake * 0.5, side * -0.22);
      pose.fov = THREE.MathUtils.lerp(38, 24, punch);
    } else if (phase === PHASES.AFTERMATH) {
      pose.position.set(anchors.victim.x + anchors.direction.x * 0.48 + side * -0.45, 1.24, 2.85);
      pose.lookAt.set(anchors.victim.x, 1.04, side * 0.12);
      pose.fov = THREE.MathUtils.lerp(30, 44, settle);
    } else {
      const settlePose = new THREE.Vector3(anchors.mid.x * 0.28, 2.1, 6.2);
      pose.position.lerpVectors(settlePose, gameplayPose.position, settle);
      pose.lookAt.lerpVectors(new THREE.Vector3(anchors.mid.x * 0.2, 1.15, 0), gameplayPose.lookAt, settle);
      pose.fov = THREE.MathUtils.lerp(46, gameplayPose.fov, settle);
    }

    return {
      position: pose.position.clone(),
      lookAt: pose.lookAt.clone(),
      fov: pose.fov,
    };
  }

  enterNextPhase() {
    const order = [PHASES.ANTICIPATION, PHASES.WINDUP, PHASES.IMPACT, PHASES.AFTERMATH, PHASES.RECOVERY];
    const next = order[order.indexOf(this.phase) + 1] ?? PHASES.GAMEPLAY;
    this.phase = next;
    this.phaseElapsed = 0;

    if (next === PHASES.GAMEPLAY) {
      this.anchors = null;
    }
  }

  updateDebug() {
    this.debug.phase = this.phase;
    this.debug.active = this.phase !== PHASES.GAMEPLAY;
    this.debug.cooldown = Number(this.cooldown.toFixed(3));
    this.debug.sequenceCount = this.sequenceCount;
  }
}

function makeAnchors(payload) {
  const attacker = payload.attacker.position;
  const victim = payload.defender.position;
  const direction = new THREE.Vector3(Math.sign(victim.x - attacker.x) || 1, 0, 0);

  return {
    attacker: attacker.clone(),
    victim: victim.clone(),
    mid: new THREE.Vector3((attacker.x + victim.x) / 2, 0.95, 0),
    impact: payload.impactPoint?.clone?.() ?? new THREE.Vector3((attacker.x + victim.x) / 2, 1.05, 0),
    direction,
  };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function phaseSmoothness(phase) {
  if (phase === PHASES.IMPACT) {
    return 0.32;
  }

  if (phase === PHASES.WINDUP || phase === PHASES.AFTERMATH) {
    return 0.2;
  }

  return 0.14;
}

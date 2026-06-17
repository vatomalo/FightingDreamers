import * as THREE from 'three';

const PHASES = {
  GAMEPLAY: 'gameplay',
  ANTICIPATION: 'anticipation',
  WINDUP: 'windup',
  IMPACT: 'impact',
  FACE: 'face',
  AFTERMATH: 'aftermath',
  RECOVERY: 'recovery',
};

const phaseDurations = {
  [PHASES.ANTICIPATION]: 0.16,
  [PHASES.WINDUP]: 0.32,
  [PHASES.IMPACT]: 0.28,
  [PHASES.FACE]: 0.34,
  [PHASES.AFTERMATH]: 0.28,
  [PHASES.RECOVERY]: 0.42,
};

const tempPosition = new THREE.Vector3();
const tempLookAt = new THREE.Vector3();

export class CinematicCameraDirector {
  constructor({ camera, random = Math.random, boundaryRadius = 14.25 } = {}) {
    this.camera = camera;
    this.random = random;
    this.boundaryRadius = boundaryRadius;
    this.phase = PHASES.GAMEPLAY;
    this.phaseElapsed = 0;
    this.cooldown = 0;
    this.sequenceCount = 0;
    this.anchors = null;
    this.lastShotSide = 1;
    this.currentPosition = camera?.position?.clone?.() ?? new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3(0, 1.15, 0);
    this.currentFov = camera?.fov ?? 42;
    this.debug = {
      phase: this.phase,
      active: false,
      cooldown: 0,
      sequenceCount: 0,
      tier: 0,
      shot: 'gameplay',
      fov: this.currentFov,
      minFov: this.currentFov,
      faceShotCount: 0,
      radius: 0,
      boundaryRadius: this.boundaryRadius,
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
    this.debug.minFov = this.currentFov;
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
    const isHeadHit = payload.reactionType === 'head';
    const isAirHit = payload.attackState === 'jumpKick' || payload.attackState === 'hurricaneKick';
    const isHeavy = payload.rawDamage >= 13 || severity >= 0.5 || payload.attackState === 'heavy';

    if (!isHeavy && !isHeadHit && !isAirHit) {
      return 1;
    }

    const procChance = 0.58 + severity * 0.3 + (isHeadHit ? 0.16 : 0) + (isAirHit ? 0.12 : 0);
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

    this.keepCameraInsideCylinder(this.currentPosition);
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
    const smooth = 0.22;
    this.currentPosition.lerp(gameplayPose.position, smooth);
    this.currentLookAt.lerp(gameplayPose.lookAt, smooth);
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, gameplayPose.fov, 0.16);
    this.keepCameraInsideCylinder(this.currentPosition);
    this.camera.position.copy(this.currentPosition);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentLookAt);
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
      const depth = Math.max(4.35, frameDepthForBoth(anchors, 4.1));
      pose.position.lerpVectors(gameplayPose.position, new THREE.Vector3(anchors.mid.x + side * 0.56, 1.82, depth), eased);
      pose.lookAt.lerpVectors(gameplayPose.lookAt, new THREE.Vector3(anchors.mid.x, 1.24, side * -0.08), eased);
      pose.fov = THREE.MathUtils.lerp(gameplayPose.fov, 45, eased);
    } else if (phase === PHASES.WINDUP) {
      const orbit = Math.sin(t * Math.PI) * side * 0.95;
      pose.position.set(anchors.mid.x - anchors.direction.x * 0.54 + orbit, 1.36, frameDepthForBoth(anchors, 2.55));
      pose.lookAt.set(THREE.MathUtils.lerp(anchors.mid.x, anchors.impact.x, 0.55), anchors.focusY, side * -0.16);
      pose.fov = THREE.MathUtils.lerp(38, 30, eased);
    } else if (phase === PHASES.IMPACT) {
      const punch = t < 0.28 ? easeOutExpo(t / 0.28) : 1 - easeInOutQuad((t - 0.28) / 0.72) * 0.35;
      pose.position.set(anchors.mid.x - anchors.direction.x * 0.24 + side * 0.2 + shake, anchors.focusY + 0.08 + verticalShake, frameDepthForBoth(anchors, 2.18));
      pose.lookAt.set(THREE.MathUtils.lerp(anchors.mid.x, anchors.impact.x, 0.66) + shake * 0.45, anchors.focusY + verticalShake * 0.5, side * -0.18);
      pose.fov = THREE.MathUtils.lerp(32, 22, punch);
    } else if (phase === PHASES.FACE) {
      const faceSide = side * 0.34;
      const dolly = frameDepthForBoth(anchors, THREE.MathUtils.lerp(2.56, 2.28, easeOutCubic(Math.sin(t * Math.PI * 0.5))));
      const faceFocusX = THREE.MathUtils.lerp(anchors.mid.x, anchors.victimFace.x, 0.64);
      pose.position.set(faceFocusX + anchors.direction.x * 0.18 + faceSide, anchors.victimFace.y + 0.02, dolly);
      pose.lookAt.set(faceFocusX, anchors.victimFace.y - 0.02, side * -0.08);
      pose.fov = THREE.MathUtils.lerp(28, 24, easeOutCubic(t));
    } else if (phase === PHASES.AFTERMATH) {
      pose.position.set(anchors.mid.x + anchors.direction.x * 0.3 + side * -0.36, 1.18, frameDepthForBoth(anchors, 2.8));
      pose.lookAt.set(THREE.MathUtils.lerp(anchors.mid.x, anchors.victim.x, 0.55), 1.08, side * 0.1);
      pose.fov = THREE.MathUtils.lerp(26, 38, settle);
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
    const order = [PHASES.ANTICIPATION, PHASES.WINDUP, PHASES.IMPACT, PHASES.FACE, PHASES.AFTERMATH, PHASES.RECOVERY];
    const next = order[order.indexOf(this.phase) + 1] ?? PHASES.GAMEPLAY;
    this.phase = next;
    this.phaseElapsed = 0;

    if (next === PHASES.FACE) {
      this.debug.faceShotCount++;
    }

    if (next === PHASES.GAMEPLAY) {
      this.anchors = null;
    }
  }

  updateDebug() {
    this.debug.phase = this.phase;
    this.debug.active = this.phase !== PHASES.GAMEPLAY;
    this.debug.cooldown = Number(this.cooldown.toFixed(3));
    this.debug.sequenceCount = this.sequenceCount;
    this.debug.shot = this.phase;
    this.debug.fov = Number(this.currentFov.toFixed(2));
    this.debug.minFov = Number(Math.min(this.debug.minFov, this.currentFov).toFixed(2));
    this.debug.radius = Number(Math.hypot(this.camera.position.x, this.camera.position.z).toFixed(3));
    this.debug.boundaryRadius = this.boundaryRadius;
  }

  keepCameraInsideCylinder(position) {
    const distanceFromCenter = Math.hypot(position.x, position.z);

    if (distanceFromCenter <= this.boundaryRadius || distanceFromCenter <= 0.0001) {
      return;
    }

    const scale = this.boundaryRadius / distanceFromCenter;
    position.x *= scale;
    position.z *= scale;
  }
}

function makeAnchors(payload) {
  const attacker = payload.attacker.position;
  const victim = payload.defender.position;
  const direction = new THREE.Vector3(Math.sign(victim.x - attacker.x) || 1, 0, 0);

  const focusY = payload.reactionType === 'head' ? 1.46 : 1.12;
  const span = Math.max(Math.abs(victim.x - attacker.x), 0.72);

  return {
    attacker: attacker.clone(),
    victim: victim.clone(),
    mid: new THREE.Vector3((attacker.x + victim.x) / 2, 0.95, 0),
    impact: payload.impactPoint?.clone?.() ?? new THREE.Vector3((attacker.x + victim.x) / 2, 1.05, 0),
    victimFace: new THREE.Vector3(victim.x, 1.5, 0),
    focusY,
    span,
    direction,
  };
}

function frameDepthForBoth(anchors, preferredDepth) {
  const requiredDepth = 1.5 + anchors.span * 1.02;
  return Math.max(preferredDepth, requiredDepth);
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

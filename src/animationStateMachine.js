export const STATES = {
  IDLE: 'idle',
  WALK_FORWARD: 'walkForward',
  WALK_BACK: 'walkBack',
  SIDE_STEP_LEFT: 'sideStepLeft',
  SIDE_STEP_RIGHT: 'sideStepRight',
  CHARGE_ATTACK: 'chargeAttack',
  CROUCH: 'crouch',
  BLOCK: 'block',
  JUMP: 'jump',
  JAB: 'jab',
  KICK: 'kick',
  JUMP_KICK: 'jumpKick',
  HURRICANE_KICK: 'hurricaneKick',
  MARTELO_KICK: 'marteloKick',
  HEAVY: 'heavy',
  ROUNDHOUSE: 'roundhouse',
  GRAB: 'grab',
  GRABBED: 'grabbed',
  HITSTUN: 'hitstun',
  KNOCKDOWN: 'knockdown',
};

const STATE_CONFIG = {
  [STATES.IDLE]: { duration: Infinity, canMove: true },
  [STATES.WALK_FORWARD]: { duration: Infinity, canMove: true },
  [STATES.WALK_BACK]: { duration: Infinity, canMove: true },
  [STATES.SIDE_STEP_LEFT]: { duration: 0.48, canMove: false, sideMove: -1 },
  [STATES.SIDE_STEP_RIGHT]: { duration: 0.48, canMove: false, sideMove: 1 },
  [STATES.CHARGE_ATTACK]: { duration: Infinity, canMove: false },
  [STATES.CROUCH]: { duration: Infinity, canMove: false },
  [STATES.BLOCK]: { duration: Infinity, canMove: false },
  [STATES.JUMP]: { duration: 0.52, canMove: false, cancelAfter: Infinity, animation: 'jump' },
  [STATES.JAB]: { duration: 0.4, canMove: false, cancelAfter: 0.2, activeFrom: 0.1, activeTo: 0.2, damage: 7, chip: 1, range: 1.08, knockback: 0.18, hitstun: 0.24, hitstop: 0.045, attackerPush: 0.04, defenderPush: 0.2, reactionTime: 0.68, hitSpheres: ['rightHand'], spherePadding: 0.22, animation: 'jab' },
  [STATES.KICK]: { duration: 0.62, canMove: false, cancelAfter: 0.42, activeFrom: 0.18, activeTo: 0.34, damage: 10, chip: 2, range: 1.3, knockback: 0.3, hitstun: 0.3, hitstop: 0.065, attackerPush: 0.06, defenderPush: 0.34, reactionTime: 0.74, hitSpheres: ['rightFoot'], spherePadding: 0.28, animation: 'kick' },
  [STATES.JUMP_KICK]: { duration: 0.84, canMove: false, cancelAfter: 0.66, activeFrom: 0.2, activeTo: 0.58, damage: 14, chip: 3, range: 1.66, knockback: 0.46, hitstun: 0.36, hitstop: 0.085, attackerPush: 0.08, defenderPush: 0.52, reactionTime: 0.82, hitSpheres: ['rightFoot', 'leftFoot'], spherePadding: 0.5, animation: 'jumpKick', airborne: true },
  [STATES.HURRICANE_KICK]: { duration: 0.86, canMove: false, cancelAfter: 0.66, activeFrom: 0.26, activeTo: 0.54, damage: 15, chip: 3, range: 1.54, knockback: 0.44, hitstun: 0.38, hitstop: 0.09, attackerPush: 0.08, defenderPush: 0.5, reactionTime: 0.84, hitSpheres: ['leftFoot', 'rightFoot'], spherePadding: 0.36, animation: 'hurricaneKick' },
  [STATES.MARTELO_KICK]: { duration: 0.74, canMove: false, cancelAfter: 0.54, activeFrom: 0.2, activeTo: 0.42, damage: 13, chip: 3, range: 1.4, knockback: 0.38, hitstun: 0.34, hitstop: 0.08, attackerPush: 0.07, defenderPush: 0.42, reactionTime: 0.8, hitSpheres: ['rightFoot'], spherePadding: 0.32, animation: 'marteloKick' },
  [STATES.HEAVY]: { duration: 0.68, canMove: false, cancelAfter: 0.5, activeFrom: 0.22, activeTo: 0.38, damage: 16, chip: 4, range: 1.34, knockback: 0.42, hitstun: 0.38, hitstop: 0.095, attackerPush: 0.1, defenderPush: 0.48, reactionTime: 0.88, hitSpheres: ['leftHand', 'rightHand'], spherePadding: 0.26, animation: 'heavy' },
  [STATES.ROUNDHOUSE]: { duration: 0.72, canMove: false, cancelAfter: 0.52, activeFrom: 0.2, activeTo: 0.4, damage: 12, chip: 2, range: 1.52, knockback: 0.34, hitstun: 0.32, hitstop: 0.075, attackerPush: 0.07, defenderPush: 0.42, reactionTime: 0.78, hitSpheres: ['leftFoot', 'rightFoot'], spherePadding: 0.34, animation: 'roundhouse' },
  [STATES.GRAB]: { duration: 0.8, canMove: false, cancelAfter: 0.58, activeFrom: 0.12, activeTo: 0.28, damage: 18, chip: 0, range: 0.9, knockback: 0.24, hitstun: 0.42, rootMotion: true, animation: 'grab' },
  [STATES.GRABBED]: { duration: 0.72, canMove: false },
  [STATES.HITSTUN]: { duration: 0.34, canMove: false },
  [STATES.KNOCKDOWN]: { duration: 0.82, canMove: false },
};

const ATTACKS = new Set([STATES.JAB, STATES.KICK, STATES.JUMP_KICK, STATES.HURRICANE_KICK, STATES.MARTELO_KICK, STATES.HEAVY, STATES.ROUNDHOUSE, STATES.GRAB]);
const LOCKED = new Set([STATES.HITSTUN, STATES.KNOCKDOWN, STATES.GRABBED]);
const CHARGE_MIN = 0.18;
const CHARGE_MAX = 0.82;
const ATTACK_BY_KEY = {
  KeyJ: STATES.JAB,
  KeyK: STATES.KICK,
  KeyH: STATES.HURRICANE_KICK,
  KeyM: STATES.MARTELO_KICK,
  KeyU: STATES.HEAVY,
  KeyI: STATES.ROUNDHOUSE,
  KeyO: STATES.GRAB,
};

export class AnimationStateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.previousState = STATES.IDLE;
    this.elapsed = 0;
    this.comboStep = 0;
    this.hitResolved = false;
    this.overrideDuration = null;
    this.chargeKey = null;
    this.chargeTarget = null;
    this.chargeLevel = 0;
  }

  update(delta, input) {
    this.elapsed += delta;

    if (this.isTimedStateComplete()) {
      this.transition(this.readLocomotion(input));
      return this.snapshot();
    }

    if (LOCKED.has(this.state)) {
      return this.snapshot();
    }

    if (this.state === STATES.JUMP || this.state === STATES.SIDE_STEP_LEFT || this.state === STATES.SIDE_STEP_RIGHT) {
      return this.snapshot();
    }

    if (this.state === STATES.CHARGE_ATTACK) {
      this.updateCharge(input);
      return this.snapshot();
    }

    if (ATTACKS.has(this.state)) {
      this.readAttackCancel(input);
      return this.snapshot();
    }

    if (input.wasPressed('KeyQ')) {
      this.transition(STATES.SIDE_STEP_LEFT);
    } else if (input.wasPressed('KeyE')) {
      this.transition(STATES.SIDE_STEP_RIGHT);
    } else if (this.readAttackPress(input)) {
      return this.snapshot();
    } else if (this.readJump(input)) {
      this.transition(STATES.JUMP);
    } else {
      this.transition(this.readLocomotion(input));
    }

    return this.snapshot();
  }

  transition(nextState, options = {}) {
    if (nextState === this.state) {
      return;
    }

    this.previousState = this.state;
    this.state = nextState;
    this.elapsed = 0;
    this.hitResolved = false;
    this.overrideDuration = options.duration ?? null;
    this.chargeLevel = options.chargeLevel ?? 0;

    if (!ATTACKS.has(nextState)) {
      this.comboStep = 0;
    }

    if (nextState !== STATES.CHARGE_ATTACK) {
      this.chargeKey = null;
      this.chargeTarget = null;
    }
  }

  readLocomotion(input) {
    if (input.isDown('ArrowDown') || input.isDown('KeyS')) {
      return STATES.CROUCH;
    }

    if (input.isDown('KeyL')) {
      return STATES.BLOCK;
    }

    if (this.readJump(input)) {
      return STATES.JUMP;
    }

    if (input.wasPressed('KeyQ')) {
      return STATES.SIDE_STEP_LEFT;
    }

    if (input.wasPressed('KeyE')) {
      return STATES.SIDE_STEP_RIGHT;
    }

    if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
      return STATES.WALK_FORWARD;
    }

    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
      return STATES.WALK_BACK;
    }

    return STATES.IDLE;
  }

  readAttackCancel(input) {
    const config = STATE_CONFIG[this.state];
    const canCancel = this.elapsed >= config.cancelAfter;

    if (!canCancel) {
      return;
    }

    if (this.state === STATES.JAB && input.wasPressed('KeyJ')) {
      this.comboStep = Math.min(this.comboStep + 1, 2);
      this.transition(STATES.JAB);
    } else if (input.wasPressed('KeyU')) {
      this.comboStep = 0;
      this.transition(STATES.HEAVY);
    } else if (input.wasPressed('KeyH')) {
      this.comboStep = 0;
      this.transition(STATES.HURRICANE_KICK);
    } else if (input.wasPressed('KeyM')) {
      this.comboStep = 0;
      this.transition(STATES.MARTELO_KICK);
    } else if (input.wasPressed('KeyK')) {
      this.comboStep = 0;
      this.transition(STATES.KICK);
    } else if (input.wasPressed('KeyI')) {
      this.comboStep = 0;
      this.transition(STATES.ROUNDHOUSE);
    } else if (input.wasPressed('KeyO')) {
      this.comboStep = 0;
      this.transition(STATES.GRAB);
    }
  }

  readAttackPress(input) {
    for (const [key, state] of Object.entries(ATTACK_BY_KEY)) {
      if (!input.wasPressed(key)) {
        continue;
      }

      const targetState = key === 'KeyK' && this.readJump(input) ? STATES.JUMP_KICK : state;

      if (!input.isDown(key)) {
        this.transition(targetState);
        return true;
      }

      this.chargeKey = key;
      this.chargeTarget = targetState;
      this.transition(STATES.CHARGE_ATTACK);
      this.chargeKey = key;
      this.chargeTarget = targetState;
      return true;
    }

    return false;
  }

  updateCharge(input) {
    const released = !this.chargeKey || !input.isDown(this.chargeKey) || input.wasReleased?.(this.chargeKey);

    if (!released) {
      return;
    }

    const target = this.chargeTarget ?? STATES.JAB;
    const chargeLevel = Math.min(Math.max((this.elapsed - CHARGE_MIN) / (CHARGE_MAX - CHARGE_MIN), 0), 1);
    this.transition(target, { chargeLevel });
  }

  readJump(input) {
    return input.isDown('KeyW') || input.isDown('Space') || input.isDown('ArrowUp');
  }

  isTimedStateComplete() {
    return this.elapsed >= this.duration;
  }

  receiveHit(duration = STATE_CONFIG[STATES.HITSTUN].duration) {
    this.transition(STATES.HITSTUN, { duration });
  }

  knockDown() {
    this.transition(STATES.KNOCKDOWN);
  }

  get grabbed() {
    return this.state === STATES.GRABBED;
  }

  get duration() {
    return this.overrideDuration ?? this.attack?.duration ?? STATE_CONFIG[this.state].duration;
  }

  get attack() {
    if (!ATTACKS.has(this.state)) {
      return null;
    }

    return chargedAttackConfig(STATE_CONFIG[this.state], this.chargeLevel);
  }

  get isAttackActive() {
    const attack = this.attack;
    return Boolean(attack && this.elapsed >= attack.activeFrom && this.elapsed <= attack.activeTo);
  }

  snapshot() {
    const progress = this.duration === Infinity ? 0 : Math.min(this.elapsed / this.duration, 1);
    const config = STATE_CONFIG[this.state];

    return {
      state: this.state,
      previousState: this.previousState,
      elapsed: this.elapsed,
      progress,
      comboStep: this.comboStep,
      chargeLevel: this.state === STATES.CHARGE_ATTACK ? Math.min(Math.max((this.elapsed - CHARGE_MIN) / (CHARGE_MAX - CHARGE_MIN), 0), 1) : this.chargeLevel,
      canMove: config.canMove,
      duration: this.duration,
      animation: config.animation ?? null,
      sideMove: config.sideMove ?? 0,
      attack: this.attack,
      isAttackActive: this.isAttackActive,
      hitResolved: this.hitResolved,
    };
  }
}

function chargedAttackConfig(config, chargeLevel = 0) {
  if (!chargeLevel) {
    return config;
  }

  const windupScale = 1 + chargeLevel * 0.55;
  const durationScale = 1 + chargeLevel * 0.42;
  const activeWindow = config.activeTo - config.activeFrom;

  return {
    ...config,
    duration: config.duration * durationScale,
    cancelAfter: config.cancelAfter * durationScale,
    activeFrom: config.activeFrom * windupScale,
    activeTo: config.activeFrom * windupScale + activeWindow * (1 + chargeLevel * 0.18),
    damage: config.damage * (1 + chargeLevel * 0.55),
    chip: config.chip * (1 + chargeLevel * 0.35),
    knockback: config.knockback * (1 + chargeLevel * 0.75),
    hitstun: config.hitstun * (1 + chargeLevel * 0.35),
    hitstop: config.hitstop * (1 + chargeLevel * 0.65),
    attackerPush: config.attackerPush * (1 + chargeLevel * 0.35),
    defenderPush: config.defenderPush * (1 + chargeLevel * 0.8),
    reactionTime: config.reactionTime * (1 + chargeLevel * 0.3),
    spherePadding: (config.spherePadding ?? 0.18) * (1 + chargeLevel * 0.2),
    chargeLevel,
  };
}

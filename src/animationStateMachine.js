export const STATES = {
  IDLE: 'idle',
  WALK_FORWARD: 'walkForward',
  WALK_BACK: 'walkBack',
  CROUCH: 'crouch',
  BLOCK: 'block',
  JAB: 'jab',
  KICK: 'kick',
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
  [STATES.CROUCH]: { duration: Infinity, canMove: false },
  [STATES.BLOCK]: { duration: Infinity, canMove: false },
  [STATES.JAB]: { duration: 0.4, canMove: false, cancelAfter: 0.2, activeFrom: 0.1, activeTo: 0.2, damage: 7, chip: 1, range: 0.92, knockback: 0.18, hitstun: 0.24, animation: 'jab' },
  [STATES.KICK]: { duration: 0.62, canMove: false, cancelAfter: 0.42, activeFrom: 0.18, activeTo: 0.34, damage: 10, chip: 2, range: 1.12, knockback: 0.3, hitstun: 0.3, animation: 'kick' },
  [STATES.HEAVY]: { duration: 0.68, canMove: false, cancelAfter: 0.5, activeFrom: 0.22, activeTo: 0.38, damage: 16, chip: 4, range: 1.16, knockback: 0.42, hitstun: 0.38, animation: 'heavy' },
  [STATES.ROUNDHOUSE]: { duration: 0.72, canMove: false, cancelAfter: 0.52, activeFrom: 0.2, activeTo: 0.4, damage: 12, chip: 2, range: 1.34, knockback: 0.34, hitstun: 0.32, animation: 'roundhouse' },
  [STATES.GRAB]: { duration: 0.8, canMove: false, cancelAfter: 0.58, activeFrom: 0.12, activeTo: 0.28, damage: 18, chip: 0, range: 0.74, knockback: 0.24, hitstun: 0.42, rootMotion: true, animation: 'grab' },
  [STATES.GRABBED]: { duration: 0.72, canMove: false },
  [STATES.HITSTUN]: { duration: 0.34, canMove: false },
  [STATES.KNOCKDOWN]: { duration: 0.82, canMove: false },
};

const ATTACKS = new Set([STATES.JAB, STATES.KICK, STATES.HEAVY, STATES.ROUNDHOUSE, STATES.GRAB]);
const LOCKED = new Set([STATES.HITSTUN, STATES.KNOCKDOWN, STATES.GRABBED]);

export class AnimationStateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.previousState = STATES.IDLE;
    this.elapsed = 0;
    this.comboStep = 0;
    this.hitResolved = false;
    this.overrideDuration = null;
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

    if (ATTACKS.has(this.state)) {
      this.readAttackCancel(input);
      return this.snapshot();
    }

    if (input.wasPressed('KeyJ')) {
      this.transition(STATES.JAB);
    } else if (input.wasPressed('KeyK')) {
      this.transition(STATES.KICK);
    } else if (input.wasPressed('KeyO')) {
      this.transition(STATES.GRAB);
    } else if (input.wasPressed('KeyU')) {
      this.transition(STATES.HEAVY);
    } else if (input.wasPressed('KeyI')) {
      this.transition(STATES.ROUNDHOUSE);
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

    if (!ATTACKS.has(nextState)) {
      this.comboStep = 0;
    }
  }

  readLocomotion(input) {
    if (input.isDown('ArrowDown') || input.isDown('KeyS')) {
      return STATES.CROUCH;
    }

    if (input.isDown('KeyL')) {
      return STATES.BLOCK;
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
    return this.overrideDuration ?? STATE_CONFIG[this.state].duration;
  }

  get attack() {
    return ATTACKS.has(this.state) ? STATE_CONFIG[this.state] : null;
  }

  get isAttackActive() {
    const attack = this.attack;
    return Boolean(attack && this.elapsed >= attack.activeFrom && this.elapsed <= attack.activeTo);
  }

  snapshot() {
    const progress = this.duration === Infinity ? 0 : Math.min(this.elapsed / this.duration, 1);

    return {
      state: this.state,
      previousState: this.previousState,
      elapsed: this.elapsed,
      progress,
      comboStep: this.comboStep,
      canMove: STATE_CONFIG[this.state].canMove,
      duration: this.duration,
      attack: this.attack,
      isAttackActive: this.isAttackActive,
      hitResolved: this.hitResolved,
    };
  }
}

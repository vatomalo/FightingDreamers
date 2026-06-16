export const STATES = {
  IDLE: 'idle',
  WALK_FORWARD: 'walkForward',
  WALK_BACK: 'walkBack',
  CROUCH: 'crouch',
  BLOCK: 'block',
  JAB: 'jab',
  HEAVY: 'heavy',
  HITSTUN: 'hitstun',
  KNOCKDOWN: 'knockdown',
};

const STATE_CONFIG = {
  [STATES.IDLE]: { duration: Infinity, canMove: true },
  [STATES.WALK_FORWARD]: { duration: Infinity, canMove: true },
  [STATES.WALK_BACK]: { duration: Infinity, canMove: true },
  [STATES.CROUCH]: { duration: Infinity, canMove: false },
  [STATES.BLOCK]: { duration: Infinity, canMove: false },
  [STATES.JAB]: { duration: 0.28, canMove: false, cancelAfter: 0.18 },
  [STATES.HEAVY]: { duration: 0.58, canMove: false, cancelAfter: 0.46 },
  [STATES.HITSTUN]: { duration: 0.34, canMove: false },
  [STATES.KNOCKDOWN]: { duration: 0.82, canMove: false },
};

const ATTACKS = new Set([STATES.JAB, STATES.HEAVY]);
const LOCKED = new Set([STATES.HITSTUN, STATES.KNOCKDOWN]);

export class AnimationStateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.previousState = STATES.IDLE;
    this.elapsed = 0;
    this.comboStep = 0;
  }

  update(delta, input) {
    this.elapsed += delta;

    if (input.wasPressed('KeyH')) {
      this.transition(STATES.HITSTUN);
      return this.snapshot();
    }

    if (input.wasPressed('KeyK')) {
      this.transition(STATES.KNOCKDOWN);
      return this.snapshot();
    }

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
    } else if (input.wasPressed('KeyU')) {
      this.transition(STATES.HEAVY);
    } else {
      this.transition(this.readLocomotion(input));
    }

    return this.snapshot();
  }

  transition(nextState) {
    if (nextState === this.state) {
      return;
    }

    this.previousState = this.state;
    this.state = nextState;
    this.elapsed = 0;

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
    }
  }

  isTimedStateComplete() {
    return this.elapsed >= STATE_CONFIG[this.state].duration;
  }

  snapshot() {
    return {
      state: this.state,
      previousState: this.previousState,
      elapsed: this.elapsed,
      progress: Math.min(this.elapsed / STATE_CONFIG[this.state].duration, 1),
      comboStep: this.comboStep,
      canMove: STATE_CONFIG[this.state].canMove,
    };
  }
}

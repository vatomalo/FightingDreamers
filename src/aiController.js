export class AiController {
  constructor({ seed = 1337 } = {}) {
    this.intent = new VirtualInput();
    this.seed = seed;
    this.personality = {
      preferredMin: 1.24,
      preferredMax: 1.62,
      retreatRange: 1.08,
      farRange: 2.35,
      reactionDelay: 0.22,
    };
    this.reset();
  }

  reset() {
    this.intent.nextFrame();
    this.thinkTimer = 0;
    this.blockTimer = 0;
    this.attackCooldown = 1.2;
    this.macro = null;
    this.macroTimer = 0;
    this.macroElapsed = 0;
    this.lastOpponentState = null;
    this.reactionTimer = 0;
  }

  update(delta, self, opponent) {
    this.intent.nextFrame();
    this.thinkTimer -= delta;
    this.blockTimer = Math.max(0, this.blockTimer - delta);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.updateReactionClock(delta, opponent);

    const distance = Math.abs(opponent.position.x - self.position.x);
    const opponentAttacking = Boolean(opponent.state.attack && opponent.state.progress < 0.78);
    const canReact = this.reactionTimer <= 0;

    if (this.macroTimer > 0) {
      this.runMovementMacro(delta, self, opponent);
      return this.intent;
    }

    if (canReact && this.canWhiffPunish(opponent, distance)) {
      this.chooseWhiffPunish(distance);
      return this.intent;
    }

    if (canReact && opponentAttacking && distance < this.threatRange(opponent) + 0.4 && this.random() < 0.38) {
      this.startMacro('kbdRetreat', 0.28, self, opponent);
      this.attackCooldown = Math.max(this.attackCooldown, 0.18);
      return this.intent;
    }

    if (canReact && opponentAttacking && distance < this.threatRange(opponent) + 0.18 && this.random() < 0.34) {
      this.blockTimer = Math.max(this.blockTimer, 0.2);
    }

    if (this.blockTimer > 0) {
      this.intent.hold('KeyL');
      return this.intent;
    }

    if (self.state.state === 'hitstun' || self.state.state === 'knockdown' || self.state.state === 'grabbed') {
      return this.intent;
    }

    if (opponent.state.state === 'grab' && distance < 0.96 && this.random() < 0.28) {
      this.intent.press('KeyO');
      this.attackCooldown = 0.5;
      return this.intent;
    }

    if (this.attackCooldown <= 0 && distance > 1.02 && distance < 1.58) {
      this.chooseAttack(distance);
      return this.intent;
    }

    if (distance > this.personality.farRange) {
      this.startMacro('dashIn', 0.18, self, opponent);
    } else if (distance > this.personality.preferredMax) {
      this.intent.hold(this.towardKey(self, opponent));
      if (this.attackCooldown <= 0 && this.random() < 0.018) {
        this.chooseAttack(distance);
      }
    } else if (distance < this.personality.retreatRange) {
      this.startMacro('kbdRetreat', 0.3, self, opponent);
    } else if (distance < this.personality.preferredMin && this.random() < 0.11) {
      this.startMacro('kbdRetreat', 0.24, self, opponent);
    } else if (this.attackCooldown <= 0 && this.random() < 0.022) {
      this.chooseAttack(distance);
    } else if (this.random() < 0.028) {
      this.startMacro('kbdRetreat', 0.18, self, opponent);
    }

    return this.intent;
  }

  chooseAttack(distance) {
    if (distance > 1.32 && distance < 1.78 && this.random() < 0.28) {
      this.startMacro('jumpKick', 0.42);
      this.attackCooldown = 1.25;
    } else if (distance > 1.24 && this.random() < 0.34) {
      this.intent.press('KeyH');
      this.attackCooldown = 1.15;
    } else if (distance > 1.08 && this.random() < 0.38) {
      this.intent.press('KeyM');
      this.attackCooldown = 0.98;
    } else if (distance < 0.9 && this.random() < 0.34) {
      this.intent.press('KeyO');
      this.attackCooldown = 1.2;
    } else if (distance > 1.16) {
      this.intent.press('KeyI');
      this.attackCooldown = 0.9;
    } else if (this.random() < 0.46) {
      this.intent.press('KeyJ');
      this.attackCooldown = 0.64;
    } else if (this.random() < 0.62) {
      this.intent.press('KeyK');
      this.attackCooldown = 0.82;
    } else {
      this.intent.press('KeyU');
      this.attackCooldown = 1.05;
    }
  }

  chooseWhiffPunish(distance) {
    if (distance > 1.5) {
      this.startMacro('dashIn', 0.16);
      this.attackCooldown = 0.18;
    } else if (distance > 1.22) {
      this.intent.press('KeyH');
      this.attackCooldown = 1.0;
    } else if (distance > 1.02) {
      this.intent.press('KeyM');
      this.attackCooldown = 0.9;
    } else {
      this.intent.press('KeyU');
      this.attackCooldown = 1.05;
    }
  }

  canWhiffPunish(opponent, distance) {
    const attack = opponent.state.attack;

    if (!attack || opponent.state.hitResolved) {
      return false;
    }

    const hasPassedActiveFrames = opponent.state.elapsed > attack.activeTo;
    const whiffedBySpacing = distance > attack.range + 0.08;
    return hasPassedActiveFrames && whiffedBySpacing && distance < 1.9;
  }

  threatRange(opponent) {
    return opponent.state.attack?.range ?? 1.1;
  }

  updateReactionClock(delta, opponent) {
    if (opponent.state.state !== this.lastOpponentState) {
      this.lastOpponentState = opponent.state.state;
      this.reactionTimer = this.personality.reactionDelay;
      return;
    }

    this.reactionTimer = Math.max(0, this.reactionTimer - delta);
  }

  startMacro(macro, duration, self = null, opponent = null) {
    this.macro = macro;
    this.macroTimer = duration;
    this.macroElapsed = 0;
    this.runMovementMacro(0, self, opponent);
  }

  runMovementMacro(delta, self, opponent) {
    this.macroTimer = Math.max(0, this.macroTimer - delta);
    this.macroElapsed += delta;

    if (this.macro === 'kbdRetreat') {
      this.intent.hold(this.awayKey(self, opponent));
    } else if (this.macro === 'dashIn') {
      this.intent.hold(this.towardKey(self, opponent));
    } else if (this.macro === 'jumpKick') {
      this.intent.hold('KeyW');
      if (this.macroElapsed <= 0.04) {
        this.intent.press('KeyK');
      }
    }

    if (this.macroTimer <= 0) {
      this.macro = null;
    }
  }

  towardKey(self, opponent) {
    return 'KeyD';
  }

  awayKey(self, opponent) {
    return 'KeyA';
  }

  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}

class VirtualInput {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
  }

  nextFrame() {
    this.down.clear();
    this.pressed.clear();
  }

  hold(code) {
    this.down.add(code);
  }

  press(code) {
    this.down.add(code);
    this.pressed.add(code);
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }
}

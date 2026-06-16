export class AiController {
  constructor() {
    this.intent = new VirtualInput();
    this.seed = 1337;
    this.personality = {
      preferredRange: 1.05,
      retreatRange: 0.58,
      farRange: 2.0,
    };
    this.reset();
  }

  reset() {
    this.intent.nextFrame();
    this.thinkTimer = 0;
    this.blockTimer = 0;
    this.attackCooldown = 1.2;
  }

  update(delta, self, opponent) {
    this.intent.nextFrame();
    this.thinkTimer -= delta;
    this.blockTimer = Math.max(0, this.blockTimer - delta);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const distance = Math.abs(opponent.position.x - self.position.x);
    const opponentAttacking = Boolean(opponent.state.attack && opponent.state.progress < 0.72);

    if (opponentAttacking && distance < 1.35 && this.random() < 0.36) {
      this.blockTimer = Math.max(this.blockTimer, 0.26);
    }

    if (this.blockTimer > 0) {
      this.intent.hold('KeyL');
      return this.intent;
    }

    if (self.state.state === 'hitstun' || self.state.state === 'knockdown' || self.state.state === 'grabbed') {
      return this.intent;
    }

    if (opponent.state.state === 'grab' && distance < 0.82 && this.random() < 0.28) {
      this.intent.press('KeyO');
      this.attackCooldown = 0.5;
      return this.intent;
    }

    if (this.attackCooldown <= 0 && distance < 1.18) {
      this.chooseAttack(distance);
      return this.intent;
    }

    if (distance > this.personality.farRange) {
      this.intent.hold(this.towardKey(self, opponent));
    } else if (distance > this.personality.preferredRange) {
      this.intent.hold(this.towardKey(self, opponent));
      if (this.attackCooldown <= 0 && this.random() < 0.018) {
        this.chooseAttack(distance);
      }
    } else if (distance < this.personality.retreatRange) {
      this.intent.hold(this.awayKey(self, opponent));
    } else if (this.attackCooldown <= 0 && this.random() < 0.022) {
      this.chooseAttack(distance);
    }

    return this.intent;
  }

  chooseAttack(distance) {
    if (distance < 0.72 && this.random() < 0.34) {
      this.intent.press('KeyO');
      this.attackCooldown = 1.2;
    } else if (distance > 1.02) {
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

export class AiController {
  constructor({ seed = 1337, availableActions = null } = {}) {
    this.intent = new VirtualInput();
    this.seed = seed;
    this.availableActions = new Set(availableActions ?? [
      'jab',
      'heavy',
      'kick',
      'jumpKick',
      'hurricaneKick',
      'marteloKick',
      'roundhouse',
      'grab',
    ]);
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
    this.macroData = null;
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
    const incomingThreat = this.incomingThreat(opponent, distance);

    if (this.macroTimer > 0) {
      this.runMovementMacro(delta, self, opponent);
      return this.intent;
    }

    if (canReact && incomingThreat.shouldBlock && this.random() < incomingThreat.blockChance) {
      this.blockTimer = Math.max(this.blockTimer, incomingThreat.blockDuration);
      this.attackCooldown = Math.max(this.attackCooldown, 0.18);
    }

    if (this.blockTimer > 0) {
      this.intent.hold('KeyL');
      return this.intent;
    }

    if (canReact && this.canWhiffPunish(opponent, distance)) {
      this.chooseWhiffPunish(distance);
      return this.intent;
    }

    if (canReact && opponentAttacking && distance < this.threatRange(opponent) + 0.22 && this.random() < 0.045) {
      this.startMacro(this.random() < 0.5 ? 'sideStepLeft' : 'sideStepRight', 0.32, self, opponent);
      this.attackCooldown = Math.max(this.attackCooldown, 0.48);
      return this.intent;
    }

    if (canReact && opponentAttacking && distance < this.threatRange(opponent) + 0.36 && this.random() < 0.18) {
      this.startMacro('kbdRetreat', 0.28, self, opponent);
      this.attackCooldown = Math.max(this.attackCooldown, 0.18);
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
    } else if (this.random() < 0.006) {
      this.startMacro(this.random() < 0.5 ? 'sideStepLeft' : 'sideStepRight', 0.3, self, opponent);
    } else if (this.random() < 0.028) {
      this.startMacro('kbdRetreat', 0.18, self, opponent);
    }

    return this.intent;
  }

  chooseAttack(distance) {
    if (this.canUse('jumpKick') && distance > 1.32 && distance < 1.78 && this.random() < 0.28) {
      this.startMacro('jumpKick', 0.42);
      this.attackCooldown = 1.25;
    } else if (this.canUse('hurricaneKick') && distance > 1.24 && this.random() < 0.34) {
      this.useAttack('KeyH', 1.15, { chargeChance: 0.24, chargeDuration: 0.42 });
    } else if (this.canUse('marteloKick') && distance > 1.08 && this.random() < 0.38) {
      this.useAttack('KeyM', 0.98, { chargeChance: 0.2, chargeDuration: 0.38 });
    } else if (this.canUse('grab') && distance < 0.9 && this.random() < 0.34) {
      this.intent.press('KeyO');
      this.attackCooldown = 1.2;
    } else if (this.canUse('roundhouse') && distance > 1.16) {
      this.useAttack('KeyI', 0.9, { chargeChance: 0.22, chargeDuration: 0.4 });
    } else if (this.canUse('jab') && this.random() < 0.46) {
      this.useAttack('KeyJ', 0.64, { chargeChance: 0.12, chargeDuration: 0.28 });
    } else if (this.canUse('kick') && this.random() < 0.62) {
      this.useAttack('KeyK', 0.82, { chargeChance: 0.18, chargeDuration: 0.34 });
    } else if (this.canUse('heavy')) {
      this.useAttack('KeyU', 1.05, { chargeChance: 0.34, chargeDuration: 0.5 });
    } else {
      this.attackCooldown = 0.35;
    }
  }

  chooseWhiffPunish(distance) {
    if (distance > 1.5) {
      this.startMacro('dashIn', 0.16);
      this.attackCooldown = 0.18;
    } else if (this.canUse('hurricaneKick') && distance > 1.22) {
      this.useAttack('KeyH', 1.0, { chargeChance: 0.18, chargeDuration: 0.36 });
    } else if (this.canUse('marteloKick') && distance > 1.02) {
      this.useAttack('KeyM', 0.9, { chargeChance: 0.16, chargeDuration: 0.34 });
    } else if (this.canUse('heavy')) {
      this.useAttack('KeyU', 1.05, { chargeChance: 0.28, chargeDuration: 0.44 });
    } else if (this.canUse('jab')) {
      this.intent.press('KeyJ');
      this.attackCooldown = 0.64;
    } else {
      this.attackCooldown = 0.35;
    }
  }

  canUse(actionName) {
    return this.availableActions.has(actionName);
  }

  useAttack(key, cooldown, { chargeChance = 0, chargeDuration = 0.32 } = {}) {
    if (this.random() < chargeChance) {
      this.startMacro('chargeAttack', chargeDuration, null, null, { key });
      this.attackCooldown = cooldown + chargeDuration * 0.65;
      return;
    }

    this.intent.press(key);
    this.attackCooldown = cooldown;
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

  incomingThreat(opponent, distance) {
    const attack = opponent.state.attack;

    if (!attack || opponent.state.hitResolved || opponent.state.state === 'grab') {
      return {
        shouldBlock: false,
        blockChance: 0,
        blockDuration: 0,
      };
    }

    const threatLead = attack.activeFrom - opponent.state.elapsed;
    const activeOrSoon = opponent.state.isAttackActive || (threatLead >= -0.08 && threatLead <= 0.28);
    const inRange = distance < attack.range + 0.42;

    if (!activeOrSoon || !inRange) {
      return {
        shouldBlock: false,
        blockChance: 0,
        blockDuration: 0,
      };
    }

    const lateReactionPenalty = opponent.state.isAttackActive ? 0.12 : 0;
    const closeBonus = distance < attack.range + 0.12 ? 0.18 : 0;
    const heavyBonus = (attack.damage ?? 0) >= 14 ? 0.12 : 0;

    return {
      shouldBlock: true,
      blockChance: Math.min(0.86, 0.58 + closeBonus + heavyBonus - lateReactionPenalty),
      blockDuration: Math.max(0.28, Math.min(0.56, attack.activeTo - opponent.state.elapsed + 0.24)),
    };
  }

  updateReactionClock(delta, opponent) {
    if (opponent.state.state !== this.lastOpponentState) {
      this.lastOpponentState = opponent.state.state;
      this.reactionTimer = this.personality.reactionDelay;
      return;
    }

    this.reactionTimer = Math.max(0, this.reactionTimer - delta);
  }

  startMacro(macro, duration, self = null, opponent = null, data = null) {
    this.macro = macro;
    this.macroTimer = duration;
    this.macroElapsed = 0;
    this.macroData = data;
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
    } else if (this.macro === 'sideStepLeft') {
      if (this.macroElapsed <= 0.04) {
        this.intent.press('KeyQ');
      }
    } else if (this.macro === 'sideStepRight') {
      if (this.macroElapsed <= 0.04) {
        this.intent.press('KeyE');
      }
    } else if (this.macro === 'chargeAttack') {
      const key = this.macroData?.key ?? 'KeyU';
      if (this.macroElapsed <= 0.04) {
        this.intent.press(key);
      } else {
        this.intent.hold(key);
      }
    }

    if (this.macroTimer <= 0) {
      this.macro = null;
      this.macroData = null;
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
    this.released = new Set();
  }

  nextFrame() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
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

  wasReleased(code) {
    return this.released.has(code);
  }
}

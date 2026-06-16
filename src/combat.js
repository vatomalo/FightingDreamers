import { AnimationStateMachine, STATES } from './animationStateMachine.js';

export class Combatant {
  constructor({ name, model, x, ai = null }) {
    this.name = name;
    this.model = model;
    this.ai = ai;
    this.machine = new AnimationStateMachine();
    this.position = model.root.position;
    this.position.set(x, 0.02, 0);
    this.velocity = 0;
    this.health = 100;
    this.rounds = 0;
    this.facing = x < 0 ? 1 : -1;
    this.state = this.machine.snapshot();
    this.flash = 0;
  }

  reset(x) {
    this.position.set(x, 0.02, 0);
    this.velocity = 0;
    this.health = 100;
    this.facing = x < 0 ? 1 : -1;
    this.flash = 0;
    this.ai?.reset();
    this.machine.transition(STATES.IDLE);
    this.state = this.machine.snapshot();
  }

  updateState(delta, input) {
    this.state = this.machine.update(delta, input);
  }
}

export class FightGame {
  constructor({ player, opponent, input }) {
    this.player = player;
    this.opponent = opponent;
    this.input = input;
    this.roundTime = 90;
    this.maxRoundTime = 90;
    this.roundState = 'fight';
    this.message = 'Round 1';
    this.messageTimer = 1.15;
    this.eventLog = [];
    this.debug = {
      hits: 0,
      blocked: 0,
      playerAttacks: 0,
      opponentAttacks: 0,
      roundOvers: 0,
    };
  }

  update(delta) {
    if (this.input.wasPressed('KeyR')) {
      this.resetRound();
    }

    this.messageTimer = Math.max(0, this.messageTimer - delta);

    if (this.roundState !== 'fight') {
      if (this.messageTimer <= 0) {
        this.resetRound();
      }
      return;
    }

    this.roundTime = Math.max(0, this.roundTime - delta);
    this.faceEachOther();

    const aiInput = this.opponent.ai.update(delta, this.opponent, this.player);
    this.player.updateState(delta, this.input);
    this.opponent.updateState(delta, aiInput);

    this.countAttacks(this.player, this.opponent);
    this.resolveMovement(delta);
    this.resolveHits(this.player, this.opponent);
    this.resolveHits(this.opponent, this.player);
    this.updateFlashes(delta);
    this.checkRoundEnd();
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

      combatant.velocity += speed * delta * 16;
      combatant.velocity *= Math.pow(0.001, delta);
      combatant.position.x += combatant.velocity * delta;
      combatant.position.x = clamp(combatant.position.x, -4.2, 4.2);
    }

    this.keepSpacing();
  }

  keepSpacing() {
    const minDistance = 0.64;
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
    const distance = Math.abs(defender.position.x - attacker.position.x);

    if (distance > attack.range) {
      return;
    }

    attacker.machine.hitResolved = true;

    const isBlocking = defender.state.state === STATES.BLOCK && defender.facing === -attacker.facing;
    const damage = isBlocking ? attack.chip : attack.damage;
    defender.health = Math.max(0, defender.health - damage);
    defender.velocity += attack.knockback * attacker.facing * (isBlocking ? 0.45 : 1);
    defender.flash = isBlocking ? 0.12 : 0.2;

    if (isBlocking) {
      this.debug.blocked++;
      this.log(`${defender.name} blocked ${attacker.name}'s ${attacker.state.state}`);
    } else {
      this.debug.hits++;
      defender.machine.receiveHit(attack.hitstun);
      this.log(`${attacker.name} hit ${defender.name} with ${attacker.state.state}`);
    }
  }

  updateFlashes(delta) {
    for (const combatant of [this.player, this.opponent]) {
      combatant.flash = Math.max(0, combatant.flash - delta);
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
        this.message = `${winner.name} wins`;
      }

      this.roundState = 'roundOver';
      this.messageTimer = 2.2;
      this.debug.roundOvers++;
      this.log(this.message);
    }
  }

  resetRound() {
    this.player.reset(-1.35);
    this.opponent.reset(1.35);
    this.roundTime = this.maxRoundTime;
    this.roundState = 'fight';
    this.message = `Round ${this.player.rounds + this.opponent.rounds + 1}`;
    this.messageTimer = 1.1;
    this.eventLog.length = 0;
    this.debug.hits = 0;
    this.debug.blocked = 0;
    this.debug.playerAttacks = 0;
    this.debug.opponentAttacks = 0;
    this.debug.roundOvers = 0;
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
      player: combatantSnapshot(this.player),
      opponent: combatantSnapshot(this.opponent),
      events: [...this.eventLog],
      debug: { ...this.debug },
    };
  }
}

function combatantSnapshot(combatant) {
  return {
    name: combatant.name,
    health: Math.round(combatant.health),
    rounds: combatant.rounds,
    state: combatant.state.state,
    x: Number(combatant.position.x.toFixed(3)),
    facing: combatant.facing,
    flash: combatant.flash,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

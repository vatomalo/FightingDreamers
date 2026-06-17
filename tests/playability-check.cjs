const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const BASE_URL = process.env.FIGHTING_DREAMERS_URL || 'http://127.0.0.1:5173';

function screenshotStats(buffer) {
  const png = PNG.sync.read(buffer);
  const first = [png.data[0], png.data[1], png.data[2]];
  let varied = 0;
  let total = 0;
  const stride = Math.max(1, Math.floor((png.width * png.height) / 5000));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const i = pixel * 4;
    const delta =
      Math.abs(png.data[i] - first[0]) +
      Math.abs(png.data[i + 1] - first[1]) +
      Math.abs(png.data[i + 2] - first[2]);
    total++;

    if (delta > 10) {
      varied++;
    }
  }

  return { width: png.width, height: png.height, ratio: varied / total };
}

async function snapshot(page) {
  return page.evaluate(() => window.__FIGHTING_DREAMERS__.snapshot());
}

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__FIGHTING_DREAMERS__), null, { timeout: 120000 });
  await page.locator('#game').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(3000);
  await page.waitForFunction(
    () => window.__FIGHTING_DREAMERS__.backgroundStatus.state !== 'loading',
    null,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => window.__FIGHTING_DREAMERS__.pngBackgroundStatus.state !== 'loading',
    null,
    { timeout: 60000 },
  );

  const playerAiEnabledByDefault = await page.evaluate(() => Boolean(window.__FIGHTING_DREAMERS__.game.player.ai));
  await page.evaluate(() => window.__FIGHTING_DREAMERS__.setPlayerAiEnabled(false));

  const animationInfo = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    return {
      playerClip: game.player.model.stanceClip?.name,
      opponentClip: game.opponent.model.stanceClip?.name,
      playerStanceName: game.player.model.stanceName,
      opponentStanceName: game.opponent.model.stanceName,
      playerClampFinal: game.player.model.stanceClampFinal,
      opponentClampFinal: game.opponent.model.stanceClampFinal,
      playerClamp: Boolean(game.player.model.stanceAction?.clampWhenFinished),
      opponentClamp: Boolean(game.opponent.model.stanceAction?.clampWhenFinished),
      playerLoop: game.player.model.stanceAction?.loop,
      opponentLoop: game.opponent.model.stanceAction?.loop,
      playerTime: game.player.model.stanceAction?.time ?? 0,
      opponentTime: game.opponent.model.stanceAction?.time ?? 0,
      playerDuration: game.player.model.stanceClip?.duration ?? 0,
      opponentDuration: game.opponent.model.stanceClip?.duration ?? 0,
      playerTrackCount: game.player.model.stanceClip?.tracks.length ?? 0,
      playerColliderCount: Object.keys(game.player.model.hitSpheres ?? {}).length,
      opponentColliderCount: Object.keys(game.opponent.model.hitSpheres ?? {}).length,
      playerVisibleColliderCount: Object.values(game.player.model.hitSpheres ?? {}).filter((sphere) => sphere.visible).length,
      opponentVisibleColliderCount: Object.values(game.opponent.model.hitSpheres ?? {}).filter((sphere) => sphere.visible).length,
      backgroundStatus: { ...window.__FIGHTING_DREAMERS__.backgroundStatus },
      pngBackgroundStatus: { ...window.__FIGHTING_DREAMERS__.pngBackgroundStatus },
      pngBackgroundOptionCount: window.__FIGHTING_DREAMERS__.pngBackgroundOptions.length,
      actionTrackCounts: Object.fromEntries(
        [
          'jab',
          'heavy',
          'kick',
          'jump',
          'jumpKick',
          'hurricaneKick',
          'marteloKick',
          'roundhouse',
          'grab',
          'hithead',
          'hitbody',
          'hitbody-big',
          'death',
          'death-flyingback',
        ].map((key) => [
          key,
          game.player.model.actions[key]?.clip.tracks.length ?? 0,
        ]),
      ),
      modelOptionCount: window.__FIGHTING_DREAMERS__.modelOptions.length,
      differentModels: game.player.model.sourceUrl !== game.opponent.model.sourceUrl,
    };
  });
  assert(animationInfo.playerClip === 'stance', 'player loads stance animation');
  assert(animationInfo.opponentClip === 'stance', 'opponent loads stance animation');
  assert(animationInfo.playerStanceName !== 'sumo', 'player random stance does not choose special sumo stance');
  assert(animationInfo.opponentStanceName !== 'sumo', 'opponent random stance does not choose special sumo stance');
  assert(animationInfo.playerClampFinal === (animationInfo.playerStanceName === 'sumo'), 'only player sumo stance clamps');
  assert(animationInfo.opponentClampFinal === (animationInfo.opponentStanceName === 'sumo'), 'only opponent sumo stance clamps');
  assert(animationInfo.playerClamp === animationInfo.playerClampFinal, 'player stance clamp flag matches action');
  assert(animationInfo.opponentClamp === animationInfo.opponentClampFinal, 'opponent stance clamp flag matches action');
  assert(
    animationInfo.playerLoop === (animationInfo.playerClampFinal ? 2200 : 2201),
    'player stance loop mode matches stance type',
  );
  assert(
    animationInfo.opponentLoop === (animationInfo.opponentClampFinal ? 2200 : 2201),
    'opponent stance loop mode matches stance type',
  );
  if (animationInfo.playerClampFinal) {
    assert(animationInfo.playerTime >= animationInfo.playerDuration - 0.05, 'player sumo stance holds final frame');
  }
  if (animationInfo.opponentClampFinal) {
    assert(animationInfo.opponentTime >= animationInfo.opponentDuration - 0.05, 'opponent sumo stance holds final frame');
  }
  assert(animationInfo.playerTime <= animationInfo.playerDuration, 'stance animation does not advance beyond its clip duration');
  assert(animationInfo.opponentTime <= animationInfo.opponentDuration, 'opponent stance animation does not advance beyond its clip duration');
  assert(animationInfo.playerTrackCount > 10, 'stance animation has bone tracks');
  assert(animationInfo.playerColliderCount >= 6, 'player model has hand, foot, head, and stomach spheres');
  assert(animationInfo.opponentColliderCount >= 6, 'opponent model has hand, foot, head, and stomach spheres');
  assert(animationInfo.playerVisibleColliderCount === 0, 'player debug collider spheres are hidden');
  assert(animationInfo.opponentVisibleColliderCount === 0, 'opponent debug collider spheres are hidden');
  assert(
    ['loaded', 'no-assets', 'disabled'].includes(animationInfo.backgroundStatus.state),
    `paired PLY background is loaded or intentionally unavailable, status was ${JSON.stringify(animationInfo.backgroundStatus)}`,
  );
  if (animationInfo.backgroundStatus.state === 'loaded') {
    assert(animationInfo.backgroundStatus.pointCount > 1000000, `festival background has point data, count was ${animationInfo.backgroundStatus.pointCount}`);
  }
  assert(animationInfo.pngBackgroundOptionCount >= 1, 'runtime discovers PNG background choices');
  assert(
    ['loaded', 'no-assets', 'disabled'].includes(animationInfo.pngBackgroundStatus.state),
    `PNG background is loaded or intentionally unavailable, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`,
  );
  if (animationInfo.pngBackgroundStatus.state === 'loaded') {
    assert(animationInfo.pngBackgroundStatus.width > 0, `PNG background reports image width, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
    assert(animationInfo.pngBackgroundStatus.height > 0, `PNG background reports image height, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
  }
  assert(animationInfo.modelOptionCount >= 5, 'runtime has all added fighter model choices');
  assert(animationInfo.differentModels, 'player and opponent choose different model files');
  assert(playerAiEnabledByDefault, 'player 1 starts with AI enabled');
  for (const [key, trackCount] of Object.entries(animationInfo.actionTrackCounts)) {
    assert(trackCount > 10, `${key} animation has bone tracks`);
  }

  const renderStats = screenshotStats(await page.screenshot());
  assert(renderStats.ratio > 0.06, `render variation too low: ${JSON.stringify(renderStats)}`);

  await page.evaluate(() => window.__FIGHTING_DREAMERS__.triggerCameraTest());
  await page.waitForTimeout(260);
  const cameraDuringCinematic = await page.evaluate(() => ({ ...window.__FIGHTING_DREAMERS__.cameraDebug }));
  assert(cameraDuringCinematic.active, `cinematic camera activates, debug was ${JSON.stringify(cameraDuringCinematic)}`);
  assert(cameraDuringCinematic.sequenceCount >= 1, 'cinematic camera records a triggered sequence');
  await page.waitForTimeout(900);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const initial = await snapshot(page);
  assert(initial.player.health === 100, 'player starts with full health');
  assert(initial.opponent.health === 100, 'opponent starts with full health');
  assert(initial.opponent.x < 2.25, `opponent should approach, not retreat to the wall: ${initial.opponent.x}`);

  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.45;
    game.opponent.position.x = 0.45;
    game.opponent.ai.attackCooldown = 99;
  });
  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.input.down.add('KeyL');
    game.update(1 / 60);
    game.opponent.machine.transition('heavy');
    for (let i = 0; i < 36; i++) {
      game.update(1 / 60);
    }
    game.input.down.delete('KeyL');
  });
  const afterBlock = await snapshot(page);
  assert(afterBlock.debug.blocked > 0, 'holding block can defend against the CPU');
  assert(afterBlock.player.health >= 92, `blocking should avoid full damage, health was ${afterBlock.player.health}`);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const afterReset = await snapshot(page);
  assert(afterReset.player.health === 100 && afterReset.opponent.health === 100, 'reset restores health');
  assert(afterReset.debug.hits === 0 && afterReset.debug.blocked === 0, 'reset clears combat diagnostics');

  const hitReaction = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.45;
    game.opponent.position.x = 0.45;
    game.opponent.ai.attackCooldown = 99;
    game.opponent.machine.transition('heavy');
    for (let i = 0; i < 24; i++) {
      game.update(1 / 60);
    }
    window.__FIGHTING_DREAMERS__.syncAnimations();
    for (let i = 0; i < 18; i++) {
      game.update(1 / 60);
      window.__FIGHTING_DREAMERS__.syncAnimations();
    }
    return {
      reaction: game.player.reactionAnimation,
      reactionTimer: game.player.reactionTimer,
      hitZone: game.player.lastHitZone,
      currentActionName: game.player.model.currentActionName,
      actionRunning: Boolean(game.player.model.actions[game.player.reactionAnimation]?.action.isRunning()),
    };
  });
  assert(hitReaction.reaction?.startsWith('hit'), 'non-lethal damage chooses a hit reaction animation');
  assert(['head', 'body'].includes(hitReaction.hitZone), `hit reaction records a hit zone, got ${hitReaction.hitZone}`);
  assert(hitReaction.reactionTimer > 0, 'hit reaction remains timed after impact');
  assert(hitReaction.currentActionName === hitReaction.reaction, 'hit reaction stays as the active animation');
  assert(hitReaction.actionRunning, 'hit reaction animation action starts');

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);

  await hold(page, 'KeyD', 1050);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(420);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(520);
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(720);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(640);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(580);
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(900);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const attacksBeforeKickCheck = await page.evaluate(() => window.__FIGHTING_DREAMERS__.snapshot().debug.playerAttacks);
  const kickStart = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.45;
    game.opponent.position.x = 0.45;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyK');
    game.update(1 / 60);
    game.input.pressed.clear();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    game.player.model.mixer.update(1 / 60);
    window.__FIGHTING_DREAMERS__.constrainRootMotion();
    return {
      state: game.player.state.state,
      actionRunning: Boolean(game.player.model.actions.kick?.action.isRunning()),
      rootYDelta: Math.abs(game.player.model.rootBone.position.y - game.player.model.baseRootBonePosition.y),
    };
  });
  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    for (let i = 0; i < 26; i++) {
      game.update(1 / 60);
    }
  });

  const afterCombo = await snapshot(page);
  assert(afterCombo.player.x > initial.player.x, 'player can walk forward');
  assert(afterCombo.debug.playerAttacks > attacksBeforeKickCheck, 'kick is counted as a player attack');
  assert(kickStart.state === 'kick', 'K enters the kick state');
  assert(kickStart.actionRunning, 'kick animation action starts');
  assert(kickStart.rootYDelta < 0.001, `grounded kick should not move hips upward, delta was ${kickStart.rootYDelta}`);
  assert(afterCombo.opponent.health < 100 || afterCombo.debug.blocked > 0, 'player attacks interact with opponent');

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const specialKickStart = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.55;
    game.opponent.position.x = 0.55;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyH');
    game.update(1 / 60);
    game.input.pressed.clear();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    const hurricane = {
      state: game.player.state.state,
      actionRunning: Boolean(game.player.model.actions.hurricaneKick?.action.isRunning()),
    };
    game.player.machine.transition('idle');
    game.player.state = game.player.machine.snapshot();
    game.input.pressed.add('KeyM');
    game.update(1 / 60);
    game.input.pressed.clear();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    return {
      hurricane,
      martelo: {
        state: game.player.state.state,
        actionRunning: Boolean(game.player.model.actions.marteloKick?.action.isRunning()),
      },
    };
  });
  assert(specialKickStart.hurricane.state === 'hurricaneKick', 'H enters the hurricane kick state');
  assert(specialKickStart.hurricane.actionRunning, 'hurricane kick animation action starts');
  assert(specialKickStart.martelo.state === 'marteloKick', 'M enters the martelo kick state');
  assert(specialKickStart.martelo.actionRunning, 'martelo kick animation action starts');

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const jumpKickStart = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.62;
    game.opponent.position.x = 0.62;
    game.opponent.ai.attackCooldown = 99;
    game.input.down.add('KeyW');
    game.update(1 / 60);
    window.__FIGHTING_DREAMERS__.syncAnimations();
    const jumpOnly = {
      state: game.player.state.state,
      jumpActionRunning: Boolean(game.player.model.actions.jump?.action.isRunning()),
      jumpKickActionRunning: Boolean(game.player.model.actions.jumpKick?.action.isRunning()),
    };
    game.input.pressed.add('KeyK');
    game.update(1 / 60);
    game.input.pressed.clear();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    const kickDuringJump = {
      state: game.player.state.state,
      jumpActionRunning: Boolean(game.player.model.actions.jump?.action.isRunning()),
      jumpKickActionRunning: Boolean(game.player.model.actions.jumpKick?.action.isRunning()),
    };
    game.input.down.delete('KeyW');
    game.player.machine.transition('idle');
    game.player.state = game.player.machine.snapshot();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    game.input.down.add('KeyW');
    game.input.pressed.add('KeyK');
    game.update(1 / 60);
    game.input.pressed.clear();
    game.input.down.delete('KeyW');
    window.__FIGHTING_DREAMERS__.syncAnimations();
    return {
      jumpOnly,
      kickDuringJump,
      state: game.player.state.state,
      actionRunning: Boolean(game.player.model.actions.jumpKick?.action.isRunning()),
    };
  });
  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    for (let i = 0; i < 52; i++) {
      game.update(1 / 60);
    }
  });
  const afterJumpKick = await snapshot(page);
  assert(jumpKickStart.jumpOnly.state === 'jump', 'W alone enters standalone jump');
  assert(jumpKickStart.jumpOnly.jumpActionRunning, 'W alone starts jump animation');
  assert(!jumpKickStart.jumpOnly.jumpKickActionRunning, 'W alone does not start jump kick animation');
  assert(jumpKickStart.kickDuringJump.state === 'jump', 'K during an existing jump does not convert into jump kick');
  assert(!jumpKickStart.kickDuringJump.jumpKickActionRunning, 'jump does not chain into jump kick');
  assert(jumpKickStart.state === 'jumpKick', 'W+K enters the jump kick state');
  assert(jumpKickStart.actionRunning, 'jump kick animation action starts');
  assert(afterJumpKick.opponent.health < 100 || afterJumpKick.debug.blocked > 0, 'jump kick interacts with opponent');

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const deathReaction = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.62;
    game.opponent.position.x = 0.62;
    game.opponent.health = 6;
    game.opponent.ai.attackCooldown = 99;
    game.opponent.ai.random = () => 1;
    game.input.down.add('KeyW');
    game.input.pressed.add('KeyK');
    game.update(1 / 60);
    game.input.down.delete('KeyW');
    game.input.pressed.clear();
    for (let i = 0; i < 52; i++) {
      game.update(1 / 60);
    }
    window.__FIGHTING_DREAMERS__.syncAnimations();
    return {
      health: game.opponent.health,
      reaction: game.opponent.reactionAnimation,
      actionRunning: Boolean(game.opponent.model.actions[game.opponent.reactionAnimation]?.action.isRunning()),
    };
  });
  assert(deathReaction.health <= 0, 'lethal attack can KO opponent');
  assert(deathReaction.reaction?.startsWith('death'), 'KO chooses a death animation');
  assert(deathReaction.actionRunning, 'death animation action starts');

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const grabContact = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.42;
    game.opponent.position.x = 0.42;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyO');
    game.update(1 / 60);
    game.input.pressed.clear();
    let minSignedGap = Infinity;
    let maxSignedGap = -Infinity;
    let maxGrabRootDepthDelta = 0;
    for (let i = 0; i < 22; i++) {
      game.update(1 / 60);
      window.__FIGHTING_DREAMERS__.syncAnimations();
      game.player.model.mixer.update(1 / 60);
      window.__FIGHTING_DREAMERS__.constrainRootMotion();
      const gap = (game.opponent.position.x - game.player.position.x) * game.player.facing;
      minSignedGap = Math.min(minSignedGap, gap);
      maxSignedGap = Math.max(maxSignedGap, gap);
      maxGrabRootDepthDelta = Math.max(
        maxGrabRootDepthDelta,
        Math.abs(game.player.model.rootBone.position.z - game.player.model.baseRootBonePosition.z),
      );
    }
    const duringThrow = game.snapshot();
    for (let i = 0; i < 32; i++) {
      game.update(1 / 60);
      window.__FIGHTING_DREAMERS__.syncAnimations();
      game.player.model.mixer.update(1 / 60);
      window.__FIGHTING_DREAMERS__.constrainRootMotion();
      const gap = (game.opponent.position.x - game.player.position.x) * game.player.facing;
      minSignedGap = Math.min(minSignedGap, gap);
      maxSignedGap = Math.max(maxSignedGap, gap);
      maxGrabRootDepthDelta = Math.max(
        maxGrabRootDepthDelta,
        Math.abs(game.player.model.rootBone.position.z - game.player.model.baseRootBonePosition.z),
      );
    }
    return {
      duringDistance: Math.abs(duringThrow.opponent.x - duringThrow.player.x),
      minSignedGap,
      maxSignedGap,
      maxGrabRootDepthDelta,
    };
  });
  const afterGrab = await snapshot(page);
  assert(afterGrab.debug.throws >= 1, 'grab starts a throw');
  assert(afterGrab.debug.hits >= 1, 'throw applies damage through combat resolver');
  assert(grabContact.duringDistance >= 0.55, `grab should stop at contact distance, distance was ${grabContact.duringDistance}`);
  assert(grabContact.minSignedGap >= 0.575, `grab attacker should never cross contact, min gap was ${grabContact.minSignedGap}`);
  assert(grabContact.maxSignedGap < 1.35, `grab should seek contact instead of overshooting away, max gap was ${grabContact.maxSignedGap}`);
  assert(grabContact.maxGrabRootDepthDelta < 0.001, `grab visual root depth should be locked, delta was ${grabContact.maxGrabRootDepthDelta}`);
  assert(afterGrab.opponent.health <= 82, `throw should deal root-motion grab damage, health was ${afterGrab.opponent.health}`);
  assert(afterGrab.opponent.x > 0.85, `throw root motion should move defender, x was ${afterGrab.opponent.x}`);

  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.resetRound();
    window.__FIGHTING_DREAMERS__.setPlayerAiEnabled(true);
    game.opponent.ai.attackCooldown = 0;
    game.player.ai.attackCooldown = 0;
    for (let i = 0; i < 360; i++) {
      game.update(1 / 60);
    }
  });
  const afterAi = await snapshot(page);
  assert(afterAi.debug.opponentAttacks > 0, 'autonomous opponent attacks');
  assert(afterAi.debug.playerAttacks > 0, 'autonomous player 1 attacks');
  assert(afterAi.debug.hits + afterAi.debug.blocked > 0, 'combat produces hits or blocks');
  assert(afterAi.player.health < 100 || afterAi.opponent.health < 100, 'health changes after combat');
  assert(Math.abs(afterAi.player.x - afterAi.opponent.x) >= 0.55, 'fighters do not collapse into each other');
  assert(Math.abs(afterAi.player.x) <= 4.25 && Math.abs(afterAi.opponent.x) <= 4.25, 'fighters stay inside arena bounds');
  assert(afterAi.roundTime < initial.roundTime, 'round timer advances');
  assert(consoleErrors.length === 0, `browser errors: ${consoleErrors.join(' | ')}`);

  await page.close();
  return {
    viewport,
    renderRatio: Number(renderStats.ratio.toFixed(3)),
    initial,
    afterBlock,
    afterReset,
    afterCombo,
    afterJumpKick,
    afterGrab,
    afterAi,
  };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    results.push(await runViewport(browser, viewport));
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

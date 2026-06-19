const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const BASE_URL = process.env.FIGHTING_DREAMERS_URL || 'http://127.0.0.1:5173';
const PLAYABILITY_URL = withQuery(BASE_URL, { p1style: 'martial', p2style: 'martial' });

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

  await page.goto(PLAYABILITY_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
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
        Object.keys(game.player.model.actions).map((key) => [
          key,
          game.player.model.actions[key]?.clip.tracks.length ?? 0,
        ]),
      ),
      playerCombatActionNames: game.player.model.combatActionNames,
      opponentCombatActionNames: game.opponent.model.combatActionNames,
      playerStyleName: window.__FIGHTING_DREAMERS__.playerAnimationStyleName,
      opponentStyleName: window.__FIGHTING_DREAMERS__.opponentAnimationStyleName,
      modelOptionCount: window.__FIGHTING_DREAMERS__.modelOptions.length,
      animationStyleNames: window.__FIGHTING_DREAMERS__.animationStyleNames,
      animationStyleOptions: window.__FIGHTING_DREAMERS__.animationStyleOptions,
      activeAnimationStyleName: window.__FIGHTING_DREAMERS__.activeAnimationStyleName,
      styleLabel: document.querySelector('.style-label')?.textContent ?? '',
      activeClipNames: {
        stance: game.player.model.stanceClip?.name,
        jab: game.player.model.actions.jab?.clip.name,
        heavy: game.player.model.actions.heavy?.clip.name,
        block: game.player.model.actions.blockbody?.clip.name,
      },
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
  assert(animationInfo.pngBackgroundOptionCount >= 4, 'runtime discovers all PNG background choices');
  assert(
    ['loaded', 'no-assets', 'disabled'].includes(animationInfo.pngBackgroundStatus.state),
    `PNG background is loaded or intentionally unavailable, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`,
  );
  if (animationInfo.pngBackgroundStatus.state === 'loaded') {
    assert(animationInfo.pngBackgroundStatus.width > 0, `PNG background reports image width, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
    assert(animationInfo.pngBackgroundStatus.height > 0, `PNG background reports image height, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
    assert(animationInfo.pngBackgroundStatus.skyWidth > 0, `PNG background has paired sky width, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
    assert(animationInfo.pngBackgroundStatus.skyHeight > 0, `PNG background has paired sky height, status was ${JSON.stringify(animationInfo.pngBackgroundStatus)}`);
  }
  assert(animationInfo.modelOptionCount >= 5, 'runtime has all added fighter model choices');
  assert(animationInfo.animationStyleNames.includes('default'), 'runtime discovers the default animation style folder');
  assert(animationInfo.animationStyleNames.includes('boxing'), 'runtime discovers the boxing animation style folder');
  assert(animationInfo.animationStyleNames.includes('hooligan'), 'runtime discovers the hooligan animation style folder');
  assert(animationInfo.animationStyleNames.includes('martial'), 'runtime discovers the martial animation style folder');
  assert(animationInfo.animationStyleNames.includes('capoeira'), 'runtime discovers the capoeira animation style folder');
  assert(!animationInfo.animationStyleOptions.includes('default'), 'default is shared support, not a playable attack style');
  assert(animationInfo.animationStyleOptions.includes('boxing'), 'boxing style is playable');
  assert(animationInfo.animationStyleOptions.includes('hooligan'), 'hooligan style is playable');
  assert(animationInfo.animationStyleOptions.includes('martial'), 'martial style is playable');
  assert(animationInfo.animationStyleOptions.includes('capoeira'), 'capoeira style is playable');
  assert(animationInfo.playerStyleName === 'martial', `forced player style is martial, got ${animationInfo.playerStyleName}`);
  assert(animationInfo.opponentStyleName === 'martial', `forced opponent style is martial, got ${animationInfo.opponentStyleName}`);
  assert(animationInfo.animationStyleOptions.includes(animationInfo.playerStyleName), 'player animation style is playable');
  assert(animationInfo.animationStyleOptions.includes(animationInfo.opponentStyleName), 'opponent animation style is playable');
  assert(animationInfo.playerCombatActionNames.includes('grab'), 'martial player keeps the old grab attack');
  assert(animationInfo.playerCombatActionNames.includes('hurricaneKick'), 'martial player keeps the old hurricane kick attack');
  assert(
    animationInfo.styleLabel.toLowerCase().includes('martial / martial'),
    `HUD shows the active animation style, label was ${animationInfo.styleLabel}`,
  );
  assert(animationInfo.activeClipNames.stance === 'stance', 'active style supplies the stance clip');
  assert(animationInfo.activeClipNames.jab === 'jab', 'active style supplies the jab clip');
  assert(animationInfo.activeClipNames.heavy === 'heavy', 'active style supplies the heavy clip');
  assert(animationInfo.activeClipNames.block === 'blockbody', 'active style supplies the block clip');
  assert(animationInfo.differentModels, 'player and opponent choose different model files');
  assert(playerAiEnabledByDefault, 'player 1 starts with AI enabled');
  for (const [key, trackCount] of Object.entries(animationInfo.actionTrackCounts)) {
    assert(trackCount > 10, `${key} animation has bone tracks`);
  }
  for (const key of ['hithead', 'hitbody', 'hitbody-big', 'death', 'death-flyingback', 'victory-1', 'victory-2', 'victory-3', 'victory-4', 'victory-talk']) {
    assert(animationInfo.actionTrackCounts[key] > 10, `${key} shared animation is inherited by martial`);
  }

  const renderStats = screenshotStats(await page.screenshot());
  assert(renderStats.ratio > 0.06, `render variation too low: ${JSON.stringify(renderStats)}`);

  await page.evaluate(() => window.__FIGHTING_DREAMERS__.triggerCameraTest());
  await page.waitForTimeout(260);
  const cameraDuringCinematic = await page.evaluate(() => ({ ...window.__FIGHTING_DREAMERS__.cameraDebug }));
  assert(cameraDuringCinematic.active, `cinematic camera activates, debug was ${JSON.stringify(cameraDuringCinematic)}`);
  assert(cameraDuringCinematic.sequenceCount >= 1, 'cinematic camera records a triggered sequence');
  await page.evaluate(() => window.__FIGHTING_DREAMERS__.advanceCameraForTest(110, 1 / 60));
  const cameraDuringFaceShot = await page.evaluate(() => ({ ...window.__FIGHTING_DREAMERS__.cameraDebug }));
  assert(cameraDuringFaceShot.faceShotCount >= 1, `face close-up is reached, debug was ${JSON.stringify(cameraDuringFaceShot)}`);
  assert(cameraDuringFaceShot.minFov <= 34, `camera narrows for impact and face beats, debug was ${JSON.stringify(cameraDuringFaceShot)}`);
  assert(
    cameraDuringFaceShot.radius <= cameraDuringFaceShot.boundaryRadius + 0.001,
    `camera stays inside the backdrop cylinder, debug was ${JSON.stringify(cameraDuringFaceShot)}`,
  );
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
    game.player.position.z = 0;
    game.opponent.position.x = 0.45;
    game.opponent.position.z = 0;
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

  const sideStepCheck = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.45;
    game.player.position.z = 0;
    game.opponent.position.x = 0.45;
    game.opponent.position.z = 0;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyE');
    game.update(1 / 60);
    game.input.pressed.clear();
    for (let i = 0; i < 24; i++) {
      game.update(1 / 60);
    }
    const zAfterStep = game.player.position.z;
    game.player.machine.transition('idle');
    game.player.state = game.player.machine.snapshot();
    game.input.pressed.add('KeyJ');
    game.update(1 / 60);
    game.input.pressed.clear();
    for (let i = 0; i < 24; i++) {
      game.update(1 / 60);
    }
    return {
      stateAfterStep: game.player.state.previousState,
      zAfterStep,
      opponentHealth: game.opponent.health,
      hits: game.debug.hits,
    };
  });
  assert(sideStepCheck.zAfterStep > 0.25, `E sidestep moves the fighter on the depth axis, got ${JSON.stringify(sideStepCheck)}`);
  assert(sideStepCheck.opponentHealth === 100, `off-axis jab should whiff after sidestep, got ${JSON.stringify(sideStepCheck)}`);

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
  const chargedAttack = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.52;
    game.player.position.z = 0;
    game.opponent.position.x = 0.52;
    game.opponent.position.z = 0;
    game.opponent.health = 100;
    game.opponent.ai.attackCooldown = 99;
    game.input.down.add('KeyU');
    game.input.pressed.add('KeyU');
    game.update(1 / 60);
    game.input.pressed.clear();
    for (let i = 0; i < 38; i++) {
      game.update(1 / 60);
    }
    const chargeBeforeRelease = game.player.state.chargeLevel;
    game.input.down.delete('KeyU');
    game.input.released.add('KeyU');
    game.update(1 / 60);
    game.input.released.clear();
    const released = {
      state: game.player.state.state,
      chargeLevel: game.player.state.chargeLevel,
      duration: game.player.state.duration,
      activeFrom: game.player.state.attack?.activeFrom ?? 0,
      damage: game.player.state.attack?.damage ?? 0,
    };
    for (let i = 0; i < 68; i++) {
      game.update(1 / 60);
    }
    return {
      chargeBeforeRelease,
      released,
      opponentHealth: game.opponent.health,
      hits: game.debug.hits,
    };
  });
  assert(chargedAttack.chargeBeforeRelease > 0.55, `holding attack builds charge, got ${JSON.stringify(chargedAttack)}`);
  assert(chargedAttack.released.state === 'heavy', `releasing U starts heavy, got ${JSON.stringify(chargedAttack)}`);
  assert(chargedAttack.released.chargeLevel > 0.55, `released attack keeps charge level, got ${JSON.stringify(chargedAttack)}`);
  assert(chargedAttack.released.duration > 0.68, `charged heavy has slower execution, got ${JSON.stringify(chargedAttack)}`);
  assert(chargedAttack.released.damage > 16, `charged heavy has boosted damage, got ${JSON.stringify(chargedAttack)}`);
  assert(chargedAttack.opponentHealth < 84 || chargedAttack.hits > 0, `charged heavy deals extra damage when it connects, got ${JSON.stringify(chargedAttack)}`);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const aiChargedAttack = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.52;
    game.player.position.z = 0;
    game.opponent.position.x = 0.52;
    game.opponent.position.z = 0;
    game.opponent.ai.attackCooldown = 99;
    game.opponent.ai.startMacro('chargeAttack', 0.46, null, null, { key: 'KeyU' });
    let maxCharge = 0;
    for (let i = 0; i < 88; i++) {
      game.update(1 / 60);
      maxCharge = Math.max(maxCharge, game.opponent.state.chargeLevel ?? 0);
    }
    return {
      maxCharge,
      playerHealth: game.player.health,
      opponentState: game.opponent.state.state,
      opponentCharge: game.opponent.state.chargeLevel,
      hits: game.debug.hits,
    };
  });
  assert(aiChargedAttack.maxCharge > 0.35, `AI can hold an attack charge, got ${JSON.stringify(aiChargedAttack)}`);
  assert(aiChargedAttack.playerHealth < 100 || aiChargedAttack.hits > 0, `AI charged attack resolves through combat, got ${JSON.stringify(aiChargedAttack)}`);

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
  assert(
    Math.abs(afterCombo.opponent.x - afterCombo.player.x) >= 1.12,
    `kick contact should stop overlap before pushback, gap was ${Math.abs(afterCombo.opponent.x - afterCombo.player.x)}`,
  );

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(80);
  const handContact = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.42;
    game.opponent.position.x = 0.42;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyJ');
    game.update(1 / 60);
    game.input.pressed.clear();
    for (let i = 0; i < 20; i++) {
      game.update(1 / 60);
    }
    return {
      gap: Math.abs(game.opponent.position.x - game.player.position.x),
      opponentHealth: game.opponent.health,
      events: [...game.eventLog],
    };
  });
  assert(handContact.opponentHealth < 100, `jab should connect for hand contact test, result was ${JSON.stringify(handContact)}`);
  assert(handContact.gap >= 1.04, `hand contact should stop overlap before pushback, gap was ${handContact.gap}`);

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
    game.player.model.mixer.update(1 / 60);
    window.__FIGHTING_DREAMERS__.constrainRootMotion();
    const hurricane = {
      state: game.player.state.state,
      actionRunning: Boolean(game.player.model.actions.hurricaneKick?.action.isRunning()),
      rootYDelta: Math.abs(game.player.model.rootBone.position.y - game.player.model.baseRootBonePosition.y),
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
  assert(specialKickStart.hurricane.rootYDelta < 0.001, `hurricane kick root Y is locked, delta was ${specialKickStart.hurricane.rootYDelta}`);
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
    game.player.model.mixer.update(1 / 60);
    window.__FIGHTING_DREAMERS__.constrainRootMotion();
    const jumpRootYDelta = Math.abs(game.player.model.rootBone.position.y - game.player.model.baseRootBonePosition.y);
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
    game.player.model.mixer.update(1 / 60);
    window.__FIGHTING_DREAMERS__.constrainRootMotion();
    const jumpKickRootYDelta = Math.abs(game.player.model.rootBone.position.y - game.player.model.baseRootBonePosition.y);
    return {
      jumpOnly,
      kickDuringJump,
      state: game.player.state.state,
      actionRunning: Boolean(game.player.model.actions.jumpKick?.action.isRunning()),
      jumpRootYDelta,
      jumpKickRootYDelta,
    };
  });
  const jumpPoseLift = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    window.__FIGHTING_DREAMERS__.syncAnimations();
    window.__FIGHTING_DREAMERS__.constrainRootMotion();
    const before = game.player.model.root.position.y;
    game.player.state = {
      ...game.player.state,
      state: 'jumpKick',
      progress: 0.5,
    };
    window.__FIGHTING_DREAMERS__.applyPoseForTest(game.player, 0);
    return game.player.model.root.position.y - before;
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
  assert(jumpKickStart.jumpRootYDelta < 0.001, `jump animation root Y is locked, delta was ${jumpKickStart.jumpRootYDelta}`);
  assert(jumpKickStart.jumpKickRootYDelta < 0.001, `jump kick animation root Y is locked, delta was ${jumpKickStart.jumpKickRootYDelta}`);
  assert(jumpPoseLift > 0.5, `gameplay code adds jump Y lift, lift was ${jumpPoseLift}`);
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
  assert(grabContact.duringDistance >= 0.69, `grab should stop at contact distance, distance was ${grabContact.duringDistance}`);
  assert(grabContact.minSignedGap >= 0.715, `grab attacker should never cross contact, min gap was ${grabContact.minSignedGap}`);
  assert(grabContact.maxSignedGap < 1.45, `grab should seek contact instead of overshooting away, max gap was ${grabContact.maxSignedGap}`);
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
  assert(Math.abs(afterAi.player.x - afterAi.opponent.x) >= 0.82, 'fighters do not collapse into each other');
  assert(Math.abs(afterAi.player.x) <= 4.25 && Math.abs(afterAi.opponent.x) <= 4.25, 'fighters stay inside arena bounds');
  assert(afterAi.roundTime < initial.roundTime, 'round timer advances');

  const afterMatchPoint = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.resetMatch();
    game.player.rounds = game.targetWins - 1;
    game.opponent.health = 0;
    game.checkRoundEnd();
    window.__FIGHTING_DREAMERS__.syncAnimations();
    const playerReaction = game.player.reactionAnimation;
    const actionStarted = Boolean(game.player.model.actions[playerReaction]?.action.isRunning());
    for (let i = 0; i < 180; i++) {
      game.update(1 / 60);
      window.__FIGHTING_DREAMERS__.syncAnimations();
    }
    return {
      snapshot: game.snapshot(),
      playerReaction,
      actionStarted,
    };
  });
  assert(afterMatchPoint.snapshot.targetWins === 3, 'match target is first to 3 wins');
  assert(afterMatchPoint.snapshot.roundState === 'matchOver', 'third win stops the match');
  assert(afterMatchPoint.snapshot.player.rounds === 3, 'winner is held at 3 wins');
  assert(afterMatchPoint.snapshot.message.includes('wins the match'), 'match-over message is shown');
  assert(afterMatchPoint.playerReaction?.startsWith('victory'), `winner chooses a victory animation, got ${afterMatchPoint.playerReaction}`);
  assert(afterMatchPoint.actionStarted, 'winner victory animation action starts');

  await page.goto(withQuery(BASE_URL, { p1style: 'boxing', p2style: 'hooligan' }), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__FIGHTING_DREAMERS__), null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const styleSplit = await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    return {
      playerStyle: window.__FIGHTING_DREAMERS__.playerAnimationStyleName,
      opponentStyle: window.__FIGHTING_DREAMERS__.opponentAnimationStyleName,
      playerCombatActions: game.player.model.combatActionNames,
      opponentCombatActions: game.opponent.model.combatActionNames,
      playerHasMartialGrab: Boolean(game.player.model.actions.grab),
      opponentHasMartialGrab: Boolean(game.opponent.model.actions.grab),
      playerHasMartialKick: Boolean(game.player.model.actions.hurricaneKick || game.player.model.actions.marteloKick || game.player.model.actions.roundhouse),
      opponentHasMartialKick: Boolean(game.opponent.model.actions.hurricaneKick || game.opponent.model.actions.marteloKick || game.opponent.model.actions.roundhouse),
      playerSharedReaction: Boolean(game.player.model.actions.hithead && game.player.model.actions.death && game.player.model.actions['victory-1']),
      opponentSharedReaction: Boolean(game.opponent.model.actions.hithead && game.opponent.model.actions.death && game.opponent.model.actions['victory-1']),
      label: document.querySelector('.style-label')?.textContent ?? '',
    };
  });
  assert(styleSplit.playerStyle === 'boxing', `forced player style is boxing, got ${JSON.stringify(styleSplit)}`);
  assert(styleSplit.opponentStyle === 'hooligan', `forced opponent style is hooligan, got ${JSON.stringify(styleSplit)}`);
  assert(styleSplit.playerCombatActions.includes('jab') && styleSplit.playerCombatActions.includes('heavy'), 'boxing still has its own punch attacks');
  assert(styleSplit.opponentCombatActions.includes('jab') && styleSplit.opponentCombatActions.includes('heavy'), 'hooligan still has its own punch attacks');
  assert(!styleSplit.playerHasMartialGrab && !styleSplit.opponentHasMartialGrab, 'non-martial styles do not inherit default/martial grab');
  assert(!styleSplit.playerHasMartialKick && !styleSplit.opponentHasMartialKick, 'non-martial styles do not inherit default/martial kicks');
  assert(styleSplit.playerSharedReaction && styleSplit.opponentSharedReaction, 'styles still inherit shared reactions and victories');
  assert(styleSplit.label.toLowerCase().includes('boxing / hooligan'), `HUD shows mixed styles, label was ${styleSplit.label}`);

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
    afterMatchPoint: afterMatchPoint.snapshot,
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

function withQuery(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

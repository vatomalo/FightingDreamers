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

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__FIGHTING_DREAMERS__));
  await page.locator('#game').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(500);

  const renderStats = screenshotStats(await page.screenshot());
  assert(renderStats.ratio > 0.06, `render variation too low: ${JSON.stringify(renderStats)}`);

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

  await hold(page, 'KeyD', 1050);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(420);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(580);
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.player.position.x = -0.45;
    game.opponent.position.x = 0.45;
    game.opponent.ai.attackCooldown = 99;
    game.input.pressed.add('KeyJ');
    game.update(1 / 60);
    game.input.pressed.clear();
    for (let i = 0; i < 18; i++) {
      game.update(1 / 60);
    }
  });

  const afterCombo = await snapshot(page);
  assert(afterCombo.player.x > initial.player.x, 'player can walk forward');
  assert(afterCombo.debug.playerAttacks >= 2, 'player attacks are counted');
  assert(afterCombo.opponent.health < 100 || afterCombo.debug.blocked > 0, 'player attacks interact with opponent');

  await page.evaluate(() => {
    const { game } = window.__FIGHTING_DREAMERS__;
    game.opponent.ai.attackCooldown = 0;
  });
  await page.waitForTimeout(4500);
  const afterAi = await snapshot(page);
  assert(afterAi.debug.opponentAttacks > 0, 'autonomous opponent attacks');
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

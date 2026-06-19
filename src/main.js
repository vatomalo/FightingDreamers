import * as THREE from 'three';
import { AiController } from './aiController.js';
import { Combatant, FightGame } from './combat.js';
import { createGaussianPlyPointBackground, createPngBackdrop, updatePngBackdrop } from './backgroundFactory.js';
import { CinematicCameraDirector } from './cinematicCamera.js';
import { AttackEffectsDirector } from './attackEffects.js';
import { createArena, createFighterModel } from './fighterFactory.js';
import { InputBuffer } from './input.js';
import { STATES } from './animationStateMachine.js';
import './styles.css';

const ENABLE_POINT_BACKGROUND = false;
const ENABLE_PNG_BACKGROUND = true;
const modelModules = import.meta.glob('../Models/*.fbx', {
  import: 'default',
  query: '?url',
});
const animationModules = import.meta.glob('../Models/Anim/*/*.fbx', {
  import: 'default',
  query: '?url',
});
const pngBackgroundModules = import.meta.glob('../Backgrounds/*.png', {
  import: 'default',
  query: '?url',
});
const plyBackgroundModules = import.meta.glob('../Backgrounds/*.ply', {
  import: 'default',
  query: '?url',
});
const requiredAnimationActions = [
  'jab',
  'heavy',
  'kick',
  'jumpKick',
  'hurricaneKick',
  'marteloKick',
  'roundhouse',
  'grab',
];
const sharedAnimationActions = [
  'hithead',
  'hithead-big',
  'hithead-big-1',
  'hithead-big-2',
  'hithead-2',
  'hitbody-1',
  'hitbody-2',
  'hitbody',
  'hitbody-big',
  'death',
  'death-fallback',
  'death-fallback-1',
  'death-flyingback',
  'death-standing-left',
  'death-shield',
  'death-twohand',
  'victory-1',
  'victory-2',
  'victory-3',
  'victory-4',
  'victory-talk',
];
const pngBackgroundOptions = createBackgroundOptions();
const modelOptions = createModelOptions();
const animationStyles = createAnimationStyles();
const animationStyleOptions = createAnimationStyleOptions();
const animationSpeedByStyle = {
  hooligan: 0.78,
  martial: 1.14,
  boxing: 1.28,
};

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161c);
scene.fog = new THREE.Fog(0x11161c, 7.5, 15);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 3.1, 7.4);
camera.lookAt(0, 1.15, 0);

scene.add(new THREE.HemisphereLight(0xc7ddff, 0x222916, 1.55));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.45);
keyLight.position.set(-3.5, 5.2, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffda7a, 1.1);
rimLight.position.set(4, 3, -3);
scene.add(rimLight);

scene.add(createArena());

const input = new InputBuffer();
const clock = new THREE.Clock();
const hud = createHud();
let player;
let opponent;
let game;
let cameraDirector;
let effectsDirector;
let pngBackgroundObject = null;
let isResettingFighters = false;
let currentStylePair = null;
const gameplayCameraPose = {
  position: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
  fov: 42,
};
let gameplayCameraInitialized = false;
const backgroundStatus = {
  state: 'idle',
  name: null,
  pointCount: 0,
  error: null,
};
const pngBackgroundStatus = {
  state: 'idle',
  name: null,
  width: 0,
  height: 0,
  error: null,
};

init().catch(handleFatalLoadError);

async function init() {
  hud.message.textContent = 'Loading fighters';
  const selectedBackground = selectPngBackground();
  if (ENABLE_PNG_BACKGROUND) {
    loadSceneBackground(selectedBackground);
  } else {
    pngBackgroundStatus.state = 'disabled';
    backgroundStatus.state = 'disabled';
  }
  const fighterPair = await loadFighterPair();
  const { playerModel, opponentModel, playerAnimationStyle, opponentAnimationStyle } = fighterPair;
  scene.add(playerModel.root, opponentModel.root);

  player = new Combatant({ name: 'Dreamer', model: playerModel, x: -1.35, ai: new AiController({ seed: 7331, availableActions: playerModel.combatActionNames }) });
  opponent = new Combatant({ name: 'Rival', model: opponentModel, x: 1.35, ai: new AiController({ seed: 1337, availableActions: opponentModel.combatActionNames }) });
  cameraDirector = new CinematicCameraDirector({ camera });
  effectsDirector = new AttackEffectsDirector({ scene });
  game = new FightGame({
    player,
    opponent,
    input,
    onHitConfirmed: (payload) => {
      cameraDirector.onHit(payload);
      effectsDirector.onHit(payload);
    },
  });

  window.__FIGHTING_DREAMERS__ = {
    game,
    modelOptions,
    animationStyleNames: Object.keys(animationStyles),
    animationStyleOptions: animationStyleOptions.map((style) => style.name),
    activeAnimationStyleName: `${playerAnimationStyle.name}/${opponentAnimationStyle.name}`,
    playerAnimationStyleName: playerAnimationStyle.name,
    opponentAnimationStyleName: opponentAnimationStyle.name,
    backgroundStatus,
    pngBackgroundStatus,
    pngBackgroundOptions,
    cameraDebug: cameraDirector.debug,
    snapshot: () => game.snapshot(),
    syncAnimations: () => {
      updateAnimationAction(player);
      updateAnimationAction(opponent);
    },
    constrainRootMotion: () => {
      constrainRootMotion(player);
      constrainRootMotion(opponent);
    },
    applyPoseForTest: (combatant, time = 0) => {
      applyPose(combatant, time);
    },
    setPlayerAiEnabled: (enabled) => {
      player.ai = enabled ? new AiController({ seed: 7331, availableActions: player.model.combatActionNames }) : null;
    },
    triggerCameraTest: () => {
      cameraDirector.cooldown = 0;
      cameraDirector.onHit({
        attacker: player,
        defender: opponent,
        impactPoint: new THREE.Vector3((player.position.x + opponent.position.x) / 2, 1.08, 0),
        hitDirection: new THREE.Vector3(player.facing, 0, 0),
        severity: 1,
        rawDamage: 18,
        isBlocked: false,
        isKill: false,
        forceCinematic: true,
        attackState: 'heavy',
      });
    },
    advanceCameraForTest: (steps = 1, step = 1 / 60) => {
      for (let i = 0; i < steps; i++) {
        cameraDirector.update(step, gameplayCameraPose);
      }
    },
  };
  syncDebugGlobals();

  clock.start();
  tick();
}

function tick() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (input.wasPressed('KeyR') && !isResettingFighters) {
    resetFightersWithNewStyles().catch(handleFatalLoadError);
    input.endFrame();
    requestAnimationFrame(tick);
    return;
  }

  if (isResettingFighters) {
    renderer.render(scene, camera);
    input.endFrame();
    requestAnimationFrame(tick);
    return;
  }

  game.update(delta);
  updateAnimationAction(player);
  updateAnimationAction(opponent);
  const animationDelta = game.hitstopTimer > 0 ? delta * 0.08 : delta;
  player.model.mixer?.update(animationDelta);
  opponent.model.mixer?.update(animationDelta);
  constrainRootMotion(player);
  constrainRootMotion(opponent);
  applyPose(player, time);
  applyPose(opponent, time + 0.7);
  effectsDirector?.update(delta);
  updateCamera(delta);
  updatePngBackdrop(pngBackgroundObject, { cameraX: gameplayCameraPose.position.x, delta });
  updateHud(game.snapshot());

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(tick);
}

function handleFatalLoadError(error) {
  console.error('Fighting Dreamers failed to load.', error);
  hud.message.textContent = 'Load failed';
  hud.events.innerHTML = `<span>${error?.message ?? String(error)}</span>`;
  isResettingFighters = false;
}

async function loadFighterPair({ avoidCurrentStyles = false } = {}) {
  const [playerAnimationStyle, opponentAnimationStyle] = selectAnimationStylePair(
    avoidCurrentStyles ? currentStylePair : null,
  );
  const playerStance = randomStance(playerAnimationStyle);
  const opponentStance = randomStance(opponentAnimationStyle);
  const [playerModelOption, opponentModelOption] = randomModelPair();
  const [playerModelUrl, opponentModelUrl, playerStanceUrl, opponentStanceUrl, playerAnimations, opponentAnimations] = await Promise.all([
    resolveAssetUrl(playerModelOption),
    resolveAssetUrl(opponentModelOption),
    resolveAssetUrl(playerStance),
    resolveAssetUrl(opponentStance),
    createAnimationMap(playerAnimationStyle),
    createAnimationMap(opponentAnimationStyle),
  ]);
  const [playerModel, opponentModel] = await Promise.all([
    createFighterModel({
      url: playerModelUrl,
      stanceUrl: playerStanceUrl,
      stanceName: playerStance.name,
      stanceClampFinal: playerStance.clampFinal,
      animations: playerAnimations,
      tint: 0x51d88a,
      fallback: { body: 0x51d88a, accent: 0x16212d, skin: 0xf0be9f },
    }),
    createFighterModel({
      url: opponentModelUrl,
      stanceUrl: opponentStanceUrl,
      stanceName: opponentStance.name,
      stanceClampFinal: opponentStance.clampFinal,
      animations: opponentAnimations,
      tint: 0xdf4f59,
      fallback: { body: 0xdf4f59, accent: 0x241923, skin: 0xd8a07f },
    }),
  ]);

  configureFighterModel(playerModel, playerAnimationStyle);
  configureFighterModel(opponentModel, opponentAnimationStyle);
  currentStylePair = [playerAnimationStyle.name, opponentAnimationStyle.name];
  hud.styleLabel.textContent = `STYLE: ${playerAnimationStyle.name} / ${opponentAnimationStyle.name}`;

  return {
    playerModel,
    opponentModel,
    playerAnimationStyle,
    opponentAnimationStyle,
  };
}

function configureFighterModel(model, style) {
  model.animationStyleName = style.name;
  model.animationSpeed = animationSpeedForStyle(style);
  model.combatActionNames = combatActionNamesForStyle(style);

  if (model.stanceAction) {
    model.stanceAction.timeScale = model.animationSpeed;
  }
}

async function resetFightersWithNewStyles() {
  isResettingFighters = true;
  hud.message.textContent = 'Loading new styles';

  const oldPlayerRoot = player?.model?.root;
  const oldOpponentRoot = opponent?.model?.root;

  const { playerModel, opponentModel } = await loadFighterPair({ avoidCurrentStyles: true });
  scene.remove(oldPlayerRoot, oldOpponentRoot);
  scene.add(playerModel.root, opponentModel.root);

  player = new Combatant({
    name: 'Dreamer',
    model: playerModel,
    x: -1.35,
    ai: new AiController({ seed: 7331 + Math.floor(Math.random() * 100000), availableActions: playerModel.combatActionNames }),
  });
  opponent = new Combatant({
    name: 'Rival',
    model: opponentModel,
    x: 1.35,
    ai: new AiController({ seed: 1337 + Math.floor(Math.random() * 100000), availableActions: opponentModel.combatActionNames }),
  });

  game.player = player;
  game.opponent = opponent;
  game.resetMatch();
  syncDebugGlobals();
  isResettingFighters = false;
}

function syncDebugGlobals() {
  if (!window.__FIGHTING_DREAMERS__) {
    return;
  }

  window.__FIGHTING_DREAMERS__.game = game;
  window.__FIGHTING_DREAMERS__.activeAnimationStyleName = currentStylePair?.join('/') ?? '';
  window.__FIGHTING_DREAMERS__.playerAnimationStyleName = player?.model?.animationStyleName ?? '';
  window.__FIGHTING_DREAMERS__.opponentAnimationStyleName = opponent?.model?.animationStyleName ?? '';
}

async function loadSceneBackground(selectedBackground) {
  if (!selectedBackground) {
    pngBackgroundStatus.state = 'no-assets';
    backgroundStatus.state = 'no-assets';
    return;
  }

  pngBackgroundStatus.state = 'loading';
  pngBackgroundStatus.name = selectedBackground.name;
  backgroundStatus.name = selectedBackground.name;

  try {
    const [backgroundUrl, skyUrl] = await Promise.all([
      resolveAssetUrl(selectedBackground),
      selectedBackground.sky ? resolveAssetUrl(selectedBackground.sky) : null,
    ]);
    const pngBackground = await createPngBackdrop({
      url: backgroundUrl,
      skyUrl,
      name: `${selectedBackground.name}-png-backdrop`,
    });
    pngBackgroundObject = pngBackground;
    scene.add(pngBackground);
    pngBackgroundStatus.state = 'loaded';
    pngBackgroundStatus.width = pngBackground.userData.textureSize?.width ?? 0;
    pngBackgroundStatus.height = pngBackground.userData.textureSize?.height ?? 0;
    pngBackgroundStatus.skyWidth = pngBackground.userData.skyTextureSize?.width ?? 0;
    pngBackgroundStatus.skyHeight = pngBackground.userData.skyTextureSize?.height ?? 0;
  } catch (error) {
    console.warn('Could not load PNG background.', error);
    pngBackgroundStatus.state = 'error';
    pngBackgroundStatus.error = error?.message ?? String(error);
    backgroundStatus.state = 'blocked';
    backgroundStatus.error = 'PNG backdrop failed before PLY alignment.';
    return;
  }

  if (!ENABLE_POINT_BACKGROUND) {
    backgroundStatus.state = 'disabled';
    return;
  }

  if (!selectedBackground.ply) {
    backgroundStatus.state = 'no-assets';
    return;
  }

  backgroundStatus.state = 'loading';

  try {
    const plyUrl = await resolveAssetUrl(selectedBackground.ply);
    const backdropSize = scene.getObjectByName(`${selectedBackground.name}-png-backdrop`)?.userData.backdropSize;
    const pointBackground = await createGaussianPlyPointBackground(plyUrl, {
      name: `${selectedBackground.name}-point-background`,
      width: backdropSize?.width,
      height: backdropSize?.height,
    });
    scene.add(pointBackground);
    backgroundStatus.state = 'loaded';
    backgroundStatus.pointCount = pointBackground.geometry.getAttribute('position')?.count ?? 0;
  } catch (error) {
    console.warn('Could not load PLY background.', error);
    backgroundStatus.state = 'error';
    backgroundStatus.error = error?.message ?? String(error);
  }
}

function applyPose(combatant, time) {
  const model = combatant.model;
  const state = combatant.state;
  const facing = combatant.facing;
  const bob = Math.sin(time * 7.5) * 0.04;
  const flashColor = combatant.flash > 0 ? 1.8 : 1;

  model.root.rotation.set(0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  model.root.scale.set(1, 1, 1);
  model.visual.rotation.set(0, 0, 0);
  model.visual.scale.copy(model.visual.userData.baseScale);
  model.visual.position.copy(model.visual.userData.basePosition);
  model.visual.position.z = model.visual.userData.basePosition.z;
  model.root.position.y = 0.02;
  model.shadow.scale.set(1, 1, 0.48);

  setModelIntensity(model, flashColor);
  cacheSideStepPose(model, state);

  switch (state.state) {
    case STATES.WALK_FORWARD:
    case STATES.WALK_BACK:
      model.root.position.y += Math.abs(bob);
      model.visual.rotation.z = Math.sin(time * 9) * 0.04 * facing;
      model.visual.position.z += Math.sin(time * 9) * 0.035;
      break;
    case STATES.SIDE_STEP_LEFT:
    case STATES.SIDE_STEP_RIGHT: {
      const sideDirection = model.sideStepPose?.direction ?? (state.state === STATES.SIDE_STEP_RIGHT ? 1 : -1);
      const step = smoothStep01(Math.sin(state.progress * Math.PI));
      model.visual.position.z += 0.045 * step * sideDirection;
      model.visual.position.x -= 0.025 * step * facing;
      model.root.position.y += Math.abs(Math.sin(state.progress * Math.PI * 2)) * 0.012;
      model.shadow.scale.set(0.98 + step * 0.04, 1, 0.46);
      break;
    }
    case STATES.CHARGE_ATTACK: {
      const charge = state.chargeLevel ?? 0;
      const pulse = 0.5 + Math.sin(time * 24) * 0.5;
      model.visual.rotation.z = -0.13 * facing * (0.35 + charge);
      model.visual.position.x -= 0.08 * facing * (0.3 + charge);
      model.visual.scale.x *= 1 + charge * 0.05 + pulse * charge * 0.025;
      model.visual.scale.y *= 1 - charge * 0.035;
      model.shadow.scale.x *= 1 + charge * 0.22;
      break;
    }
    case STATES.CROUCH:
      model.visual.scale.y *= 0.74;
      model.visual.scale.x *= 1.08;
      model.root.position.y = -0.04;
      model.shadow.scale.x = 1.15;
      break;
    case STATES.BLOCK:
      model.visual.rotation.z = -0.16 * facing;
      model.visual.position.z = -0.03;
      break;
    case STATES.JAB:
      break;
    case STATES.KICK:
      break;
    case STATES.JUMP:
      model.root.position.y += Math.sin(state.progress * Math.PI) * 0.72;
      model.shadow.scale.setScalar(1 - Math.sin(state.progress * Math.PI) * 0.24);
      break;
    case STATES.JUMP_KICK:
      model.root.position.y += Math.sin(state.progress * Math.PI) * 0.86;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.18 * facing;
      model.shadow.scale.setScalar(1 - Math.sin(state.progress * Math.PI) * 0.32);
      break;
    case STATES.HEAVY:
      break;
    case STATES.ROUNDHOUSE:
      break;
    case STATES.GRAB:
      break;
    case STATES.GRABBED:
      model.visual.rotation.z = 0.28 * -facing;
      model.visual.position.z -= Math.sin(state.progress * Math.PI) * 0.1;
      break;
    case STATES.HITSTUN:
      model.root.rotation.z = 0.16 * -facing;
      model.visual.rotation.z = 0.18 * -facing;
      break;
    case STATES.KNOCKDOWN:
      model.root.rotation.z = THREE.MathUtils.lerp(0, -Math.PI / 2 * facing, state.progress);
      model.root.position.y = 0.02;
      model.shadow.scale.x = 1.4;
      break;
  }

  applyCodedAttackMotion(combatant);
}

function cacheSideStepPose(model, state) {
  const isSideStep = state.state === STATES.SIDE_STEP_LEFT || state.state === STATES.SIDE_STEP_RIGHT;

  if (!isSideStep) {
    model.sideStepPose = null;
    return;
  }

  if (model.sideStepPose?.state === state.state) {
    return;
  }

  model.sideStepPose = {
    state: state.state,
    direction: state.state === STATES.SIDE_STEP_RIGHT ? 1 : -1,
  };
}

function setModelIntensity(model, scalar) {
  model.visual.traverse((part) => {
    if (!part.isMesh) {
      return;
    }

    const materials = Array.isArray(part.material) ? part.material : [part.material];
    for (const material of materials) {
      if (material?.emissive) {
        material.emissive.setRGB(0.08 * scalar, 0.06 * scalar, 0.04 * scalar);
      }
    }
  });
}

function applyCodedAttackMotion(combatant) {
  const { model, state, facing } = combatant;

  if (!state.attack) {
    return;
  }

  const t = state.progress;
  const windup = Math.sin(Math.min(t, 0.45) / 0.45 * Math.PI);
  const snap = Math.sin(Math.min(Math.max(t - 0.12, 0), 0.34) / 0.34 * Math.PI);
  const recovery = Math.sin(Math.max(t - 0.48, 0) / 0.52 * Math.PI);
  const charge = state.attack.chargeLevel ?? 0;
  const power = getPosePower(state.state) * (1 + charge * 0.4);

  model.visual.rotation.z += (-0.08 * windup + 0.14 * snap - 0.05 * recovery) * facing * power;
  model.visual.rotation.x += 0.03 * snap * power;
  model.visual.scale.x *= 1 + snap * 0.055 * power;
  model.visual.scale.y *= 1 - snap * 0.035 * power;
  model.visual.position.x += (snap * 0.09 - windup * 0.045) * facing * power;
  model.visual.position.z += Math.sin(t * Math.PI * 2) * 0.025 * power;
  model.shadow.scale.x *= 1 + snap * 0.28 * power;

  if (state.state === STATES.HURRICANE_KICK || state.state === STATES.ROUNDHOUSE) {
    model.visual.rotation.y += Math.sin(t * Math.PI * 2.2) * 0.11 * facing;
    model.visual.position.y += Math.sin(t * Math.PI) * 0.08;
  }

  if (state.state === STATES.HEAVY || state.state === STATES.JUMP_KICK) {
    model.visual.position.x += Math.pow(snap, 2) * 0.12 * facing;
  }
}

function getPosePower(stateName) {
  if (stateName === STATES.HEAVY || stateName === STATES.JUMP_KICK || stateName === STATES.HURRICANE_KICK) {
    return 1.2;
  }

  if (stateName === STATES.GRAB) {
    return 0.7;
  }

  return 0.82;
}

function updateCamera(delta) {
  const center = (player.position.x + opponent.position.x) / 2;
  const centerZ = (player.position.z + opponent.position.z) / 2;
  const distance = Math.abs(player.position.x - opponent.position.x);
  const depthDistance = Math.abs(player.position.z - opponent.position.z);
  const aspect = Math.max(camera.aspect, 0.65);
  const horizontalNeed = distance / aspect;
  const targetZ = THREE.MathUtils.clamp(4.85 + horizontalNeed * 1.18 + depthDistance * 0.42, 5.65, 7.55);
  const targetY = THREE.MathUtils.clamp(1.95 + distance * 0.08 + depthDistance * 0.08, 2.05, 2.48);
  const targetFov = THREE.MathUtils.clamp(36 + distance * 1.9, 38, 45);
  const targetPosition = tempCameraPosition.set(center * 0.5, targetY, targetZ + centerZ * 0.16);
  const targetLookAt = tempCameraLookAt.set(center * 0.36, 1.08 + distance * 0.035, centerZ * 0.36);
  const positionAlpha = dampAlpha(7.6, delta);
  const lookAlpha = dampAlpha(9.2, delta);

  if (!gameplayCameraInitialized) {
    gameplayCameraPose.position.copy(targetPosition);
    gameplayCameraPose.lookAt.copy(targetLookAt);
    gameplayCameraPose.fov = targetFov;
    gameplayCameraInitialized = true;
  } else {
    gameplayCameraPose.position.lerp(targetPosition, positionAlpha);
    gameplayCameraPose.lookAt.lerp(targetLookAt, lookAlpha);
    gameplayCameraPose.fov = THREE.MathUtils.lerp(gameplayCameraPose.fov, targetFov, dampAlpha(5.4, delta));
  }

  cameraDirector.update(delta, gameplayCameraPose);
}

const tempCameraPosition = new THREE.Vector3();
const tempCameraLookAt = new THREE.Vector3();

function dampAlpha(speed, delta) {
  return 1 - Math.exp(-speed * Math.min(delta, 1 / 20));
}

function smoothStep01(t) {
  return t * t * (3 - 2 * t);
}

function constrainRootMotion(combatant) {
  const { rootBone, baseRootBonePosition } = combatant.model;

  if (!rootBone || !baseRootBonePosition) {
    return;
  }

  rootBone.position.y = baseRootBonePosition.y;

  if (combatant.state.state === STATES.GRAB) {
    rootBone.position.x = baseRootBonePosition.x;
    rootBone.position.z = baseRootBonePosition.z;
  }
}

function createHud() {
  const root = document.createElement('div');
  root.className = 'fight-ui';
  root.innerHTML = `
    <div class="topline">
      <section class="fighter-panel player-panel">
        <div class="name-row"><strong>Dreamer</strong><span class="rounds" data-player-rounds></span></div>
        <div class="health"><i data-player-health></i></div>
        <small data-player-state></small>
      </section>
      <div class="timer" data-timer>90</div>
      <section class="fighter-panel opponent-panel">
        <div class="name-row"><span class="rounds" data-opponent-rounds></span><strong>Rival CPU</strong></div>
        <div class="health"><i data-opponent-health></i></div>
        <small data-opponent-state></small>
      </section>
    </div>
    <div class="style-label" data-style-label>STYLE</div>
    <div class="center-message" data-message></div>
    <div class="event-log" data-events></div>
    <div class="controls">
      <span>A/D: move</span><span>Q/E: sidestep</span><span>W/Space: jump</span><span>S: crouch</span><span>L: block</span><span>J: jab</span><span>K: kick</span><span>W+K: jump kick</span><span>H: hurricane</span><span>M: martelo</span><span>I: roundhouse</span><span>U: heavy</span><span>O: grab/break</span><span>R: reset</span>
    </div>
  `;
  document.body.append(root);
  return {
    root,
    playerHealth: root.querySelector('[data-player-health]'),
    opponentHealth: root.querySelector('[data-opponent-health]'),
    playerState: root.querySelector('[data-player-state]'),
    opponentState: root.querySelector('[data-opponent-state]'),
    playerRounds: root.querySelector('[data-player-rounds]'),
    opponentRounds: root.querySelector('[data-opponent-rounds]'),
    timer: root.querySelector('[data-timer]'),
    message: root.querySelector('[data-message]'),
    events: root.querySelector('[data-events]'),
    styleLabel: root.querySelector('[data-style-label]'),
  };
}

function updateHud(snapshot) {
  hud.playerHealth.style.transform = `scaleX(${snapshot.player.health / 100})`;
  hud.opponentHealth.style.transform = `scaleX(${snapshot.opponent.health / 100})`;
  hud.playerState.textContent = snapshot.player.state;
  hud.opponentState.textContent = snapshot.opponent.state;
  hud.playerRounds.textContent = '*'.repeat(snapshot.player.rounds);
  hud.opponentRounds.textContent = '*'.repeat(snapshot.opponent.rounds);
  hud.timer.textContent = snapshot.roundTime;
  hud.message.textContent = snapshot.message;
  hud.events.innerHTML = snapshot.events.map((event) => `<span>${event}</span>`).join('');
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

function createModelOptions() {
  return Object.entries(modelModules)
    .map(([path, load]) => ({
      name: assetNameFromPath(path, 'fbx'),
      load,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createAnimationStyles() {
  const styles = {};
  const stanceByFile = {
    stanceanim: { name: 'default', order: 0, clampFinal: false },
    stancesumo: { name: 'sumo', order: 1, clampFinal: true },
    stance2hand: { name: 'twoHand', order: 2, clampFinal: false },
    stancejeetkundo: { name: 'jeetKuneDo', order: 3, clampFinal: false },
    stancefight: { name: 'fight', order: 4, clampFinal: false },
    stancecapoeira: { name: 'capoeira', order: 5, clampFinal: false },
    capoeira: { name: 'ginga', order: 0, clampFinal: false },
    'ginga variation 1': { name: 'gingaOne', order: 1, clampFinal: false },
    'ginga variation 2': { name: 'gingaTwo', order: 2, clampFinal: false },
    'ginga variation 3': { name: 'gingaThree', order: 3, clampFinal: false },
  };
  const actionByFile = {
    lpunch: 'jab',
    rpunch: 'heavy',
    rkick: 'kick',
    jump: 'jump',
    jumpkick: 'jumpKick',
    kickhurricane: 'hurricaneKick',
    kickmartelo: 'marteloKick',
    lkick: 'roundhouse',
    grabflipkick: 'grab',
    blockbody: 'blockbody',
    hithead: 'hithead',
    'hithead-big': 'hithead-big',
    'hithead-big-1': 'hithead-big-1',
    'hithead-big-2': 'hithead-big-2',
    'hithead-2': 'hithead-2',
    hitbody: 'hitbody',
    'hitbody-1': 'hitbody-1',
    'hitbody-2': 'hitbody-2',
    'hitbody-big': 'hitbody-big',
    death: 'death',
    'death-fallback': 'death-fallback',
    'death-fallback-1': 'death-fallback-1',
    'death-flyingback': 'death-flyingback',
    'death-standing-left': 'death-standing-left',
    'death-shield': 'death-shield',
    'death-twohand': 'death-twohand',
    'victory-1': 'victory-1',
    'victory-2': 'victory-2',
    'victory-3': 'victory-3',
    'victory-4': 'victory-4',
    'victory-talk': 'victory-talk',
    ram: 'heavy',
    bencao: 'kick',
    pontera: 'kick',
    'martelo 2': 'marteloKick',
    'martelo 3': 'marteloKick',
    'meia lua de frente': 'roundhouse',
    'meia lua de compasso': 'hurricaneKick',
    'meia lua de compasso back': 'hurricaneKick',
    armada: 'roundhouse',
    'chapa-giratoria': 'heavy',
    'chapa giratoria 2': 'heavy',
    'chapa 2': 'jumpKick',
    'queshada 1': 'roundhouse',
    'queshada 2': 'roundhouse',
    'rasteira 1': 'kick',
    'rasteira 2': 'kick',
    au: 'jump',
    'au to role': 'jumpKick',
    'macaco side': 'jumpKick',
  };

  Object.entries(animationModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([path, load]) => {
      const styleName = animationStyleNameFromPath(path);
      const fileName = assetNameFromPath(path, 'fbx');
      const fileKey = fileName.toLowerCase();
      const style = styles[styleName] ?? createEmptyAnimationStyle(styleName);
      styles[styleName] = style;

      if (stanceByFile[fileKey]) {
        style.stances.push({
          ...stanceByFile[fileKey],
          fileName,
          load,
        });
        return;
      }

      const actionName = actionByFile[fileKey];
      if (!actionName) {
        return;
      }
      style.actions[actionName] = { load };
    });

  Object.values(styles).forEach((style) => {
    style.stances.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });

  return styles;
}

function createEmptyAnimationStyle(name) {
  return {
    name,
    actions: {},
    stances: [],
  };
}

function createAnimationStyleOptions() {
  const playableStyles = Object.values(animationStyles).filter((style) => isPlayableAnimationStyle(style));
  return playableStyles.length > 0 ? playableStyles : Object.values(animationStyles).filter((style) => style.stances.length > 0);
}

function isPlayableAnimationStyle(style) {
  return style.name !== 'default' && style.stances.length > 0 && combatActionNamesForStyle(style).length > 0;
}

function combatActionNamesForStyle(style) {
  return requiredAnimationActions.filter((action) => Boolean(style.actions[action]));
}

function animationSpeedForStyle(style) {
  return animationSpeedByStyle[style.name] ?? 1;
}

function selectAnimationStylePair(avoidPair = null) {
  const requestedStyle = new URLSearchParams(window.location.search).get('style');
  const requestedPlayerStyle = new URLSearchParams(window.location.search).get('p1style') ?? requestedStyle;
  const requestedOpponentStyle = new URLSearchParams(window.location.search).get('p2style') ?? requestedStyle;

  if (!requestedPlayerStyle && !requestedOpponentStyle && avoidPair && animationStyleOptions.length > 1) {
    const stylePairs = animationStyleOptions.flatMap((playerStyle) =>
      animationStyleOptions.map((opponentStyle) => [playerStyle, opponentStyle]),
    );
    const availablePairs = stylePairs.filter(([playerStyle, opponentStyle]) =>
      playerStyle.name !== avoidPair[0] || opponentStyle.name !== avoidPair[1],
    );
    const pair = availablePairs[Math.floor(Math.random() * availablePairs.length)] ?? stylePairs[0];
    return pair;
  }

  return [
    selectAnimationStyle(requestedPlayerStyle),
    selectAnimationStyle(requestedOpponentStyle),
  ];
}

function selectAnimationStyle(requestedStyle = null) {
  if (requestedStyle && animationStyles[requestedStyle] && isPlayableAnimationStyle(animationStyles[requestedStyle])) {
    return animationStyles[requestedStyle];
  }

  return animationStyleOptions[Math.floor(Math.random() * animationStyleOptions.length)]
    ?? animationStyles.martial
    ?? Object.values(animationStyles).find((style) => style.stances.length > 0)
    ?? createEmptyAnimationStyle('default');
}

function animationStyleNameFromPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return normalized.match(/\/Anim\/([^/]+)\//)?.[1] ?? 'default';
}

function assetNameFromPath(path, extension) {
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return path
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    .replace(new RegExp(`\\.${escapedExtension}$`, 'i'), '');
}

function randomStance(style) {
  const randomStanceOptions = style.stances.filter((stance) => stance.name !== 'sumo');
  const availableStances = randomStanceOptions.length > 0 ? randomStanceOptions : style.stances;
  return availableStances[Math.floor(Math.random() * availableStances.length)];
}

function randomModelPair() {
  const playerIndex = Math.floor(Math.random() * modelOptions.length);
  let opponentIndex = Math.floor(Math.random() * modelOptions.length);

  if (modelOptions.length > 1) {
    while (opponentIndex === playerIndex) {
      opponentIndex = Math.floor(Math.random() * modelOptions.length);
    }
  }

  return [modelOptions[playerIndex], modelOptions[opponentIndex]];
}

function selectPngBackground() {
  if (pngBackgroundOptions.length === 0) {
    return null;
  }

  return pngBackgroundOptions[Math.floor(Math.random() * pngBackgroundOptions.length)];
}

function createBackgroundOptions() {
  const plyByName = Object.fromEntries(
    Object.entries(plyBackgroundModules).map(([path, load]) => [
      path.split('/').pop()?.replace(/\.ply$/i, '') ?? 'background',
      { load },
    ]),
  );
  const skyByName = Object.fromEntries(
    Object.entries(pngBackgroundModules)
      .filter(([path]) => path.split('/').pop()?.startsWith('sky-'))
      .map(([path, load]) => [path.split('/').pop()?.replace(/^sky-/i, '').replace(/\.png$/i, '') ?? 'background', { load }])
      .filter(([name]) => name !== 'background'),
  );

  return Object.entries(pngBackgroundModules)
    .filter(([path]) => !path.split('/').pop()?.startsWith('sky-'))
    .map(([path, load]) => {
      const name = path.split('/').pop()?.replace(/\.png$/i, '') ?? 'background';

      return {
        name,
        load,
        ply: plyByName[name] ?? null,
        sky: skyByName[name] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sharedActionsFromDefault() {
  const defaultActions = animationStyles.default?.actions ?? {};
  return Object.fromEntries(
    sharedAnimationActions
      .filter((name) => defaultActions[name])
      .map((name) => [name, defaultActions[name]]),
  );
}

async function createAnimationMap(style) {
  const inheritedActions = style.name === 'default'
    ? style.actions
    : { ...sharedActionsFromDefault(), ...style.actions };
  const entries = await Promise.all(
    Object.entries(inheritedActions).map(async ([name, asset]) => [name, await resolveAssetUrl(asset)]),
  );
  return Object.fromEntries(entries);
}

async function resolveAssetUrl(asset) {
  if (!asset) {
    return null;
  }

  if (typeof asset === 'string') {
    return asset;
  }

  if (typeof asset.load === 'function') {
    return asset.load();
  }

  if (typeof asset.url === 'string') {
    return asset.url;
  }

  return null;
}

function updateAnimationAction(combatant) {
  const model = combatant.model;
  const hasActiveReaction =
    Boolean(combatant.reactionAnimation) &&
    (combatant.reactionTimer > 0 || combatant.reactionTimer === Infinity);
  const canPlayReaction =
    hasActiveReaction ||
    combatant.health <= 0 ||
    combatant.state.state === STATES.HITSTUN ||
    combatant.state.state === STATES.KNOCKDOWN ||
    combatant.state.state === STATES.GRABBED;

  if (!canPlayReaction) {
    combatant.reactionAnimation = null;
  }

  const requestedAction = (canPlayReaction ? combatant.reactionAnimation : null) ?? combatant.state.animation ?? null;
  const desiredAction = requestedAction && model.actions[requestedAction]?.action
    ? requestedAction
    : null;

  if (requestedAction && !desiredAction) {
    rememberMissingAnimation(model, requestedAction, combatant.state.state);
  }

  if (model.currentActionName === desiredAction) {
    return;
  }

  if (model.currentActionName) {
    model.actions[model.currentActionName]?.action.fadeOut(0.08);
  }

  model.currentActionName = desiredAction;

  if (desiredAction) {
    const action = model.actions[desiredAction].action;
    const clip = model.actions[desiredAction].clip;

    model.stanceAction?.fadeOut(0.06);
    const targetDuration = desiredAction.startsWith('death') || desiredAction.startsWith('victory')
      ? clip.duration
      : Math.max(combatant.reactionTimer || 0, combatant.state.duration);
    action.timeScale = (clip.duration / Math.max(targetDuration, 0.001)) * (model.animationSpeed ?? 1);
    action.reset().fadeIn(0.04).play();
  } else {
    playStanceFallback(model);
  }
}

function rememberMissingAnimation(model, actionName, stateName) {
  const key = `${model.animationStyleName ?? 'unknown'}:${stateName}:${actionName}`;

  if (!model.missingAnimationKeys) {
    model.missingAnimationKeys = new Set();
    model.missingAnimations = [];
  }

  if (model.missingAnimationKeys.has(key)) {
    return;
  }

  model.missingAnimationKeys.add(key);
  model.missingAnimations.push({
    style: model.animationStyleName ?? 'unknown',
    state: stateName,
    action: actionName,
  });
}

function playStanceFallback(model) {
  const action = model.stanceAction;
  const clip = model.stanceClip;

  if (!action || !clip) {
    return;
  }

  action.enabled = true;
  action.setEffectiveWeight(1);
  action.paused = Boolean(model.stanceClampFinal);

  if (model.stanceClampFinal) {
    action.time = clip.duration;
  } else if (!action.isRunning()) {
    action.reset().fadeIn(0.08).play();
  }

  action.play();
}

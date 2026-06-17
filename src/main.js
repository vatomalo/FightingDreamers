import * as THREE from 'three';
import { AiController } from './aiController.js';
import { Combatant, FightGame } from './combat.js';
import { createGaussianPlyPointBackground, createPngBackdrop, updatePngBackdrop } from './backgroundFactory.js';
import { CinematicCameraDirector } from './cinematicCamera.js';
import { createArena, createFighterModel } from './fighterFactory.js';
import { InputBuffer } from './input.js';
import { STATES } from './animationStateMachine.js';
import './styles.css';

const ENABLE_POINT_BACKGROUND = false;
const ENABLE_PNG_BACKGROUND = true;
const modelModules = import.meta.glob('../Models/*.fbx', {
  eager: true,
  import: 'default',
  query: '?url',
});
const animationModules = import.meta.glob('../Models/Anim/*/*.fbx', {
  eager: true,
  import: 'default',
  query: '?url',
});
const pngBackgroundModules = import.meta.glob('../Backgrounds/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});
const plyBackgroundModules = import.meta.glob('../Backgrounds/*.ply', {
  eager: true,
  import: 'default',
  query: '?url',
});
const requiredAnimationActions = [
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
];
const pngBackgroundOptions = createBackgroundOptions();
const modelOptions = createModelOptions();
const animationStyles = createAnimationStyles();
const animationStyleOptions = createAnimationStyleOptions();
const activeAnimationStyle = selectAnimationStyle();
const stanceOptions = activeAnimationStyle.stances;

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
let pngBackgroundObject = null;
const gameplayCameraPose = {
  position: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
  fov: 42,
};
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

init();

async function init() {
  hud.message.textContent = 'Loading fighters';
  const selectedBackground = selectPngBackground();
  if (ENABLE_PNG_BACKGROUND) {
    loadSceneBackground(selectedBackground);
  } else {
    pngBackgroundStatus.state = 'disabled';
    backgroundStatus.state = 'disabled';
  }
  const playerStance = randomStance();
  const opponentStance = randomStance();
  const [playerModelOption, opponentModelOption] = randomModelPair();
  const animations = createAnimationMap();
  const [playerModel, opponentModel] = await Promise.all([
    createFighterModel({
      url: playerModelOption.url,
      stanceUrl: playerStance.url,
      stanceName: playerStance.name,
      stanceClampFinal: playerStance.clampFinal,
      animations,
      tint: 0x51d88a,
      fallback: { body: 0x51d88a, accent: 0x16212d, skin: 0xf0be9f },
    }),
    createFighterModel({
      url: opponentModelOption.url,
      stanceUrl: opponentStance.url,
      stanceName: opponentStance.name,
      stanceClampFinal: opponentStance.clampFinal,
      animations,
      tint: 0xdf4f59,
      fallback: { body: 0xdf4f59, accent: 0x241923, skin: 0xd8a07f },
    }),
  ]);

  scene.add(playerModel.root, opponentModel.root);

  player = new Combatant({ name: 'Dreamer', model: playerModel, x: -1.35, ai: new AiController({ seed: 7331 }) });
  opponent = new Combatant({ name: 'Rival', model: opponentModel, x: 1.35, ai: new AiController({ seed: 1337 }) });
  cameraDirector = new CinematicCameraDirector({ camera });
  game = new FightGame({
    player,
    opponent,
    input,
    onHitConfirmed: (payload) => cameraDirector.onHit(payload),
  });

  window.__FIGHTING_DREAMERS__ = {
    game,
    modelOptions,
    animationStyleNames: Object.keys(animationStyles),
    animationStyleOptions: animationStyleOptions.map((style) => style.name),
    activeAnimationStyleName: activeAnimationStyle.name,
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
    setPlayerAiEnabled: (enabled) => {
      player.ai = enabled ? new AiController({ seed: 7331 }) : null;
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
  };

  clock.start();
  tick();
}

function tick() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

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
  updateCamera(delta);
  updatePngBackdrop(pngBackgroundObject, { cameraX: gameplayCameraPose.position.x, delta });
  updateHud(game.snapshot());

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(tick);
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
    const pngBackground = await createPngBackdrop({
      url: selectedBackground.url,
      name: `${selectedBackground.name}-png-backdrop`,
    });
    pngBackgroundObject = pngBackground;
    scene.add(pngBackground);
    pngBackgroundStatus.state = 'loaded';
    pngBackgroundStatus.width = pngBackground.userData.textureSize?.width ?? 0;
    pngBackgroundStatus.height = pngBackground.userData.textureSize?.height ?? 0;
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

  if (!selectedBackground.plyUrl) {
    backgroundStatus.state = 'no-assets';
    return;
  }

  backgroundStatus.state = 'loading';

  try {
    const backdropSize = scene.getObjectByName(`${selectedBackground.name}-png-backdrop`)?.userData.backdropSize;
    const pointBackground = await createGaussianPlyPointBackground(selectedBackground.plyUrl, {
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
  model.root.position.z = 0;
  model.shadow.scale.set(1, 1, 0.48);

  setModelIntensity(model, flashColor);

  switch (state.state) {
    case STATES.WALK_FORWARD:
    case STATES.WALK_BACK:
      model.root.position.y += Math.abs(bob);
      model.visual.rotation.z = Math.sin(time * 9) * 0.04 * facing;
      model.visual.position.z += Math.sin(time * 9) * 0.035;
      break;
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
      model.shadow.scale.setScalar(1 - Math.sin(state.progress * Math.PI) * 0.24);
      break;
    case STATES.JUMP_KICK:
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

function updateCamera(delta) {
  const center = (player.position.x + opponent.position.x) / 2;
  const distance = Math.abs(player.position.x - opponent.position.x);
  gameplayCameraPose.position.set(
    THREE.MathUtils.lerp(camera.position.x, center * 0.42, 0.075),
    THREE.MathUtils.lerp(camera.position.y, 2.18, 0.04),
    THREE.MathUtils.lerp(camera.position.z, THREE.MathUtils.clamp(5.6 + distance * 0.64, 6.1, 8.2), 0.055),
  );
  gameplayCameraPose.lookAt.set(center * 0.28, 1.1, 0);
  gameplayCameraPose.fov = 40;
  cameraDirector.update(delta, gameplayCameraPose);
}

function constrainRootMotion(combatant) {
  const { rootBone, baseRootBonePosition } = combatant.model;

  if (!rootBone || !baseRootBonePosition) {
    return;
  }

  if (combatant.state.state !== STATES.JUMP && combatant.state.state !== STATES.JUMP_KICK) {
    rootBone.position.y = baseRootBonePosition.y;
    combatant.model.root.position.y = 0.02;
  }

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
    <div class="center-message" data-message></div>
    <div class="event-log" data-events></div>
    <div class="controls">
      <span>A/D: move</span><span>W/Space: jump</span><span>S: crouch</span><span>L: block</span><span>J: jab</span><span>K: kick</span><span>W+K: jump kick</span><span>H: hurricane</span><span>M: martelo</span><span>I: roundhouse</span><span>U: heavy</span><span>O: grab/break</span><span>R: reset</span>
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
    .map(([path, url]) => ({
      name: assetNameFromPath(path, 'fbx'),
      url,
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
  };

  Object.entries(animationModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([path, url]) => {
      const styleName = animationStyleNameFromPath(path);
      const fileName = assetNameFromPath(path, 'fbx');
      const fileKey = fileName.toLowerCase();
      const style = styles[styleName] ?? createEmptyAnimationStyle(styleName);
      styles[styleName] = style;

      if (stanceByFile[fileKey]) {
        style.stances.push({
          ...stanceByFile[fileKey],
          fileName,
          url,
        });
        return;
      }

      const actionName = actionByFile[fileKey] ?? fileName;
      style.actions[actionName] = url;
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
  const completeStyles = Object.values(animationStyles).filter((style) => isCompleteAnimationStyle(style));
  return completeStyles.length > 0 ? completeStyles : Object.values(animationStyles);
}

function isCompleteAnimationStyle(style) {
  return style.stances.length > 0 && requiredAnimationActions.every((action) => Boolean(style.actions[action]));
}

function selectAnimationStyle() {
  const requestedStyle = new URLSearchParams(window.location.search).get('style');

  if (requestedStyle && animationStyles[requestedStyle] && isCompleteAnimationStyle(animationStyles[requestedStyle])) {
    return animationStyles[requestedStyle];
  }

  if (animationStyleOptions.length === 0) {
    return animationStyles.default ?? Object.values(animationStyles)[0] ?? createEmptyAnimationStyle('default');
  }

  return animationStyleOptions[Math.floor(Math.random() * animationStyleOptions.length)];
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

function randomStance() {
  const randomStanceOptions = stanceOptions.filter((stance) => stance.name !== 'sumo');
  const availableStances = randomStanceOptions.length > 0 ? randomStanceOptions : stanceOptions;
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
    Object.entries(plyBackgroundModules).map(([path, url]) => [
      path.split('/').pop()?.replace(/\.ply$/i, '') ?? 'background',
      url,
    ]),
  );

  return Object.entries(pngBackgroundModules)
    .map(([path, url]) => {
      const name = path.split('/').pop()?.replace(/\.png$/i, '') ?? 'background';

      return {
        name,
        url,
        plyUrl: plyByName[name] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createAnimationMap() {
  return { ...activeAnimationStyle.actions };
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

  const desiredAction = (canPlayReaction ? combatant.reactionAnimation : null) ?? combatant.state.animation ?? null;

  if (model.currentActionName === desiredAction) {
    return;
  }

  if (model.currentActionName) {
    model.actions[model.currentActionName]?.action.fadeOut(0.08);
  }

  model.currentActionName = desiredAction;

  if (desiredAction) {
    const action = model.actions[desiredAction]?.action;
    const clip = model.actions[desiredAction]?.clip;

    if (action && clip) {
      model.stanceAction?.fadeOut(0.06);
      const targetDuration = desiredAction.startsWith('death')
        ? clip.duration
        : Math.max(combatant.reactionTimer || 0, combatant.state.duration);
      action.timeScale = clip.duration / Math.max(targetDuration, 0.001);
      action.reset().fadeIn(0.04).play();
    }
  } else {
    holdStanceFinalFrame(model);
  }
}

function holdStanceFinalFrame(model) {
  const action = model.stanceAction;
  const clip = model.stanceClip;

  if (!action || !clip) {
    return;
  }

  action.enabled = true;
  action.paused = Boolean(model.stanceClampFinal);

  if (model.stanceClampFinal) {
    action.time = clip.duration;
  }

  action.setEffectiveWeight(1);
  action.play();
}

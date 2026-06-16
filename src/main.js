import * as THREE from 'three';
import { AiController } from './aiController.js';
import { Combatant, FightGame } from './combat.js';
import { createArena, createFighterModel } from './fighterFactory.js';
import { InputBuffer } from './input.js';
import { STATES } from './animationStateMachine.js';
import playerModelUrl from '../Models/T-Pose (4).fbx?url';
import opponentModelUrl from '../Models/T-Pose (5).fbx?url';
import stanceDefaultUrl from '../Models/Anim/StanceAnim.fbx?url';
import stanceSumoUrl from '../Models/Anim/stanceSumo.fbx?url';
import stanceTwoHandUrl from '../Models/Anim/stance2hand.fbx?url';
import stanceJeetKuneDoUrl from '../Models/Anim/stanceJeetkundo.fbx?url';
import stanceFightUrl from '../Models/Anim/stancefight.fbx?url';
import jabAnimUrl from '../Models/Anim/lpunch.fbx?url';
import heavyAnimUrl from '../Models/Anim/rpunch.fbx?url';
import kickAnimUrl from '../Models/Anim/rkick.fbx?url';
import roundhouseAnimUrl from '../Models/Anim/lkick.fbx?url';
import grabAnimUrl from '../Models/Anim/grabflipkick.fbx?url';
import './styles.css';

const stanceOptions = [
  { name: 'default', url: stanceDefaultUrl, clampFinal: false },
  { name: 'sumo', url: stanceSumoUrl, clampFinal: true },
  { name: 'twoHand', url: stanceTwoHandUrl, clampFinal: false },
  { name: 'jeetKuneDo', url: stanceJeetKuneDoUrl, clampFinal: false },
  { name: 'fight', url: stanceFightUrl, clampFinal: false },
];

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

init();

async function init() {
  hud.message.textContent = 'Loading fighters';
  const playerStance = randomStance();
  const opponentStance = randomStance();
  const [playerModel, opponentModel] = await Promise.all([
    createFighterModel({
      url: playerModelUrl,
      stanceUrl: playerStance.url,
      stanceName: playerStance.name,
      stanceClampFinal: playerStance.clampFinal,
      animations: {
        jab: jabAnimUrl,
        heavy: heavyAnimUrl,
        kick: kickAnimUrl,
        roundhouse: roundhouseAnimUrl,
        grab: grabAnimUrl,
      },
      tint: 0x51d88a,
      fallback: { body: 0x51d88a, accent: 0x16212d, skin: 0xf0be9f },
    }),
    createFighterModel({
      url: opponentModelUrl,
      stanceUrl: opponentStance.url,
      stanceName: opponentStance.name,
      stanceClampFinal: opponentStance.clampFinal,
      animations: {
        jab: jabAnimUrl,
        heavy: heavyAnimUrl,
        kick: kickAnimUrl,
        roundhouse: roundhouseAnimUrl,
        grab: grabAnimUrl,
      },
      tint: 0xdf4f59,
      fallback: { body: 0xdf4f59, accent: 0x241923, skin: 0xd8a07f },
    }),
  ]);

  scene.add(playerModel.root, opponentModel.root);

  player = new Combatant({ name: 'Dreamer', model: playerModel, x: -1.35 });
  opponent = new Combatant({ name: 'Rival', model: opponentModel, x: 1.35, ai: new AiController() });
  game = new FightGame({ player, opponent, input });

  window.__FIGHTING_DREAMERS__ = {
    game,
    snapshot: () => game.snapshot(),
    syncAnimations: () => {
      updateAnimationAction(player);
      updateAnimationAction(opponent);
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
  player.model.mixer?.update(delta);
  opponent.model.mixer?.update(delta);
  applyPose(player, time);
  applyPose(opponent, time + 0.7);
  updateCamera();
  updateHud(game.snapshot());

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(tick);
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
  model.root.position.y = 0.02;
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
      model.visual.rotation.z = -0.08 * facing;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.12 * facing;
      break;
    case STATES.KICK:
      model.visual.rotation.z = -0.18 * facing;
      model.visual.position.z += Math.sin(state.progress * Math.PI) * 0.08;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.1 * facing;
      break;
    case STATES.HEAVY:
      model.visual.rotation.z = -0.24 * facing;
      model.root.rotation.y += -0.25 * facing;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.2 * facing;
      break;
    case STATES.ROUNDHOUSE:
      model.visual.rotation.z = -0.32 * facing;
      model.visual.position.z = Math.sin(state.progress * Math.PI) * 0.08;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.08 * facing;
      break;
    case STATES.GRAB:
      model.visual.rotation.z = -0.2 * facing;
      model.visual.position.z += Math.sin(state.progress * Math.PI) * 0.12;
      model.root.position.x += Math.sin(state.progress * Math.PI) * 0.08 * facing;
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
      model.root.position.y = THREE.MathUtils.lerp(0.02, 0.28, state.progress);
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

function updateCamera() {
  const center = (player.position.x + opponent.position.x) / 2;
  const distance = Math.abs(player.position.x - opponent.position.x);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, center * 0.42, 0.075);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, THREE.MathUtils.clamp(5.9 + distance * 0.72, 6.5, 8.6), 0.055);
  camera.lookAt(center * 0.28, 1.12, 0);
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
      <span>A/D: move</span><span>S: crouch</span><span>L: block</span><span>J: jab</span><span>K: kick</span><span>I: roundhouse</span><span>U: heavy</span><span>O: grab/break</span><span>R: reset</span>
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

function randomStance() {
  return stanceOptions[Math.floor(Math.random() * stanceOptions.length)];
}

function updateAnimationAction(combatant) {
  const model = combatant.model;
  const desiredAction = combatant.state.attack?.animation ?? null;

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
      action.timeScale = clip.duration / Math.max(combatant.state.duration, 0.001);
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

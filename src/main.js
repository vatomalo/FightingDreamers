import * as THREE from 'three';
import { AnimationStateMachine, STATES } from './animationStateMachine.js';
import { InputBuffer } from './input.js';
import './styles.css';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161c);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 3.4, 7.2);
camera.lookAt(0, 1.1, 0);

const hemiLight = new THREE.HemisphereLight(0xb9d8ff, 0x293119, 1.7);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(-3.5, 5, 4);
keyLight.castShadow = true;
scene.add(keyLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 7),
  new THREE.MeshStandardMaterial({ color: 0x2f3944, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(12, 12, 0x4c6172, 0x3a4652);
grid.position.y = 0.01;
scene.add(grid);

const fighter = createFighter();
fighter.root.position.y = 0.02;
scene.add(fighter.root);

const opponent = createOpponent();
opponent.position.set(2.7, 0.02, 0);
scene.add(opponent);

const stateMachine = new AnimationStateMachine();
const input = new InputBuffer();
const clock = new THREE.Clock();

const label = document.createElement('div');
label.className = 'hud';
document.body.append(label);

function tick() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const state = stateMachine.update(delta, input);

  applyPose(fighter, state, clock.elapsedTime, delta);
  updateCamera();
  updateHud(state);

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(tick);
}

function createFighter() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x68d391, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2933, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c4a7, roughness: 0.55 });

  const torso = part(new THREE.BoxGeometry(0.72, 1.0, 0.32), material, [0, 1.25, 0]);
  const head = part(new THREE.SphereGeometry(0.25, 24, 16), skin, [0, 1.95, 0]);
  const hip = part(new THREE.BoxGeometry(0.62, 0.28, 0.34), dark, [0, 0.72, 0]);

  const leftArm = limb(material, [-0.52, 1.45, 0], 0.22, 0.72);
  const rightArm = limb(material, [0.52, 1.45, 0], 0.22, 0.72);
  const leftLeg = limb(dark, [-0.22, 0.37, 0], 0.24, 0.68);
  const rightLeg = limb(dark, [0.22, 0.37, 0], 0.24, 0.68);

  root.add(torso, head, hip, leftArm, rightArm, leftLeg, rightLeg);

  return { root, torso, head, hip, leftArm, rightArm, leftLeg, rightLeg };
}

function createOpponent() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xeb5757, roughness: 0.5 });
  group.add(part(new THREE.BoxGeometry(0.7, 1.1, 0.35), material, [0, 1.18, 0]));
  group.add(part(new THREE.SphereGeometry(0.25, 24, 16), material, [0, 1.92, 0]));
  group.rotation.y = -0.25;
  return group;
}

function limb(material, position, width, height) {
  return part(new THREE.BoxGeometry(width, height, width), material, position);
}

function part(geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  return mesh;
}

function applyPose(model, state, time, delta) {
  const { root, torso, head, leftArm, rightArm, leftLeg, rightLeg } = model;
  const bob = Math.sin(time * 7) * 0.04;

  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  torso.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  leftArm.rotation.set(0, 0, 0.28);
  rightArm.rotation.set(0, 0, -0.28);
  leftLeg.rotation.set(0, 0, 0.12);
  rightLeg.rotation.set(0, 0, -0.12);
  root.position.y = 0.02;

  if (state.canMove) {
    const speed = state.state === STATES.WALK_FORWARD ? 1 : state.state === STATES.WALK_BACK ? -0.75 : 0;
    root.position.x = THREE.MathUtils.clamp(root.position.x + speed * delta, -2.2, 1.7);
  }

  switch (state.state) {
    case STATES.WALK_FORWARD:
    case STATES.WALK_BACK:
      root.position.y += Math.abs(bob);
      leftArm.rotation.z = Math.sin(time * 9) * 0.45;
      rightArm.rotation.z = -Math.sin(time * 9) * 0.45;
      leftLeg.rotation.z = -Math.sin(time * 9) * 0.35;
      rightLeg.rotation.z = Math.sin(time * 9) * 0.35;
      break;
    case STATES.CROUCH:
      root.scale.y = 0.72;
      root.position.y = -0.04;
      leftArm.rotation.z = 0.85;
      rightArm.rotation.z = -0.85;
      break;
    case STATES.BLOCK:
      torso.rotation.z = -0.12;
      leftArm.rotation.z = -1.15;
      rightArm.rotation.z = 1.15;
      break;
    case STATES.JAB:
      rightArm.rotation.z = -1.45 - Math.sin(state.progress * Math.PI) * 0.45;
      torso.rotation.y = -0.18;
      root.position.x += Math.sin(state.progress * Math.PI) * 0.08;
      break;
    case STATES.HEAVY:
      rightArm.rotation.z = -0.5 - Math.sin(state.progress * Math.PI) * 1.35;
      torso.rotation.y = -0.55;
      root.rotation.y = -0.28;
      root.position.x += Math.sin(state.progress * Math.PI) * 0.18;
      break;
    case STATES.HITSTUN:
      root.rotation.z = 0.16;
      torso.rotation.z = 0.24;
      head.rotation.z = 0.22;
      root.position.x -= Math.sin(state.progress * Math.PI) * 0.14;
      break;
    case STATES.KNOCKDOWN:
      root.rotation.z = THREE.MathUtils.lerp(0, -Math.PI / 2, state.progress);
      root.position.y = THREE.MathUtils.lerp(0.02, 0.28, state.progress);
      break;
  }
}

function updateCamera() {
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, fighter.root.position.x * 0.25, 0.06);
  camera.lookAt(fighter.root.position.x * 0.25, 1.1, 0);
}

function updateHud(state) {
  label.innerHTML = `
    <strong>${state.state}</strong>
    <span>A/D or arrows: walk</span>
    <span>S: crouch</span>
    <span>L: block</span>
    <span>J: jab</span>
    <span>U: heavy</span>
    <span>H: hitstun</span>
    <span>K: knockdown</span>
  `;
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
tick();

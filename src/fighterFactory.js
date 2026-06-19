import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const loader = new FBXLoader();

export async function createFighterModel({
  url,
  stanceUrl,
  stanceName = 'stance',
  stanceClampFinal = false,
  animations = {},
  tint = 0xffffff,
  height = 2.05,
  fallback = {},
} = {}) {
  const root = new THREE.Group();
  const shadow = part(
    new THREE.CylinderGeometry(0.55, 0.72, 0.02, 32),
    new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.35 }),
    [0, 0.012, 0],
  );
  shadow.scale.z = 0.48;
  root.add(shadow);

  let visual;

  try {
    visual = await loader.loadAsync(url);
  } catch (error) {
    console.warn(`Could not load ${url}; using fallback fighter.`, error);
    visual = createFallbackFighter(fallback);
  }

  normalizeModel(visual, height);
  prepareModelMaterials(visual, tint);
  const rootBone = findRootBone(visual);
  const hitSpheres = createHitSpheres(visual);
  root.add(visual);

  const animation = stanceUrl ? await createStanceAnimation(visual, stanceUrl, stanceName, stanceClampFinal) : null;
  const actions = animation ? await createActionAnimations(animation.mixer, animations) : {};

  return {
    root,
    visual,
    shadow,
    rootBone,
    baseRootBonePosition: rootBone?.position.clone() ?? null,
    hitSpheres,
    sourceUrl: url,
    mixer: animation?.mixer ?? null,
    stanceAction: animation?.action ?? null,
    stanceClip: animation?.clip ?? null,
    stanceName: animation?.stanceName ?? null,
    stanceClampFinal: animation?.clampFinal ?? false,
    actions,
  };
}

function createHitSpheres(model) {
  const materialByRole = {
    attack: new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.38, wireframe: true, depthTest: false }),
    hurt: new THREE.MeshBasicMaterial({ color: 0x55c7ff, transparent: true, opacity: 0.32, wireframe: true, depthTest: false }),
  };
  const specs = {
    rightHand: { role: 'attack', radius: 0.105, bones: ['RightHand', 'Right hand', 'R_Hand'] },
    leftHand: { role: 'attack', radius: 0.105, bones: ['LeftHand', 'Left hand', 'L_Hand'] },
    rightFoot: { role: 'attack', radius: 0.13, bones: ['RightFoot', 'RightToeBase', 'Right toe', 'R_Foot'] },
    leftFoot: { role: 'attack', radius: 0.13, bones: ['LeftFoot', 'LeftToeBase', 'Left toe', 'L_Foot'] },
    head: { role: 'hurt', radius: 0.18, bones: ['Head'] },
    stomach: { role: 'hurt', radius: 0.22, bones: ['Spine2', 'Spine1', 'Spine', 'Hips'] },
  };
  const spheres = {};

  for (const [name, spec] of Object.entries(specs)) {
    const bone = findBone(model, spec.bones);

    if (!bone) {
      continue;
    }

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 16, 12), materialByRole[spec.role]);
    sphere.name = `collider-${name}`;
    sphere.visible = false;
    sphere.renderOrder = 20;
    sphere.userData.colliderName = name;
    sphere.userData.colliderRole = spec.role;
    sphere.userData.colliderRadius = spec.radius;
    bone.add(sphere);
    spheres[name] = sphere;
  }

  return spheres;
}

function findBone(model, candidates) {
  let match = null;

  model.traverse((child) => {
    if (match || !child.isBone) {
      return;
    }

    const normalized = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidates.some((candidate) => normalized.endsWith(candidate.toLowerCase().replace(/[^a-z0-9]/g, '')))) {
      match = child;
    }
  });

  return match;
}

function findRootBone(model) {
  let rootBone = null;

  model.traverse((child) => {
    if (!rootBone && child.isBone && child.name.endsWith('Hips')) {
      rootBone = child;
    }
  });

  return rootBone;
}

export function createArena() {
  const group = new THREE.Group();
  group.visible = false;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f3944, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(12, 12, 0x6f8798, 0x3a4652);
  grid.position.y = 0.01;
  group.add(grid);

  const ringBack = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xb94a48, roughness: 0.6 }),
  );
  ringBack.position.set(0, 1.1, -2.2);
  group.add(ringBack);

  for (const x of [-4.8, 4.8]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xd2d7df, roughness: 0.5 }),
    );
    post.position.set(x, 1.05, -2.2);
    post.castShadow = true;
    group.add(post);
  }

  return group;
}

function part(geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  return mesh;
}

function normalizeModel(model, targetHeight) {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scale = targetHeight / Math.max(size.y, 0.001);
  model.scale.multiplyScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y += (size.y * scale) / 2;
  model.userData.baseScale = model.scale.clone();
  model.userData.basePosition = model.position.clone();
}

function prepareModelMaterials(model, tint) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      material.side = THREE.FrontSide;
      material.color?.lerp(new THREE.Color(tint), 0.08);
      material.emissive?.set(0x000000);
      material.needsUpdate = true;
    }
  });
}

function createFallbackFighter({ body = 0x68d391, accent = 0x1f2933, skin = 0xf2c4a7 } = {}) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: body, roughness: 0.45, metalness: 0.04 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 });

  group.add(part(new THREE.BoxGeometry(0.72, 1.0, 0.32), bodyMaterial, [0, 1.25, 0]));
  group.add(part(new THREE.SphereGeometry(0.25, 24, 16), skinMaterial, [0, 1.95, 0]));
  group.add(part(new THREE.BoxGeometry(0.62, 0.28, 0.34), accentMaterial, [0, 0.72, 0]));
  group.add(part(new THREE.BoxGeometry(0.22, 0.72, 0.22), bodyMaterial, [-0.52, 1.45, 0]));
  group.add(part(new THREE.BoxGeometry(0.22, 0.72, 0.22), bodyMaterial, [0.52, 1.45, 0]));
  group.add(part(new THREE.BoxGeometry(0.24, 0.68, 0.24), accentMaterial, [-0.22, 0.37, 0]));
  group.add(part(new THREE.BoxGeometry(0.24, 0.68, 0.24), accentMaterial, [0.22, 0.37, 0]));

  return group;
}

async function createStanceAnimation(visual, stanceUrl, stanceName, clampFinal) {
  try {
    const animationSource = await loader.loadAsync(stanceUrl);
    const sourceClip = animationSource.animations[0];

    if (!sourceClip) {
      return null;
    }

    const clip = sourceClip.clone();
    clip.name = 'stance';
    clip.tracks = clip.tracks.filter((track) => track.name !== 'mixamorigHips.position');

    const mixer = new THREE.AnimationMixer(visual);
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.clampWhenFinished = clampFinal;

    if (clampFinal) {
      action.setLoop(THREE.LoopOnce, 1);
    } else {
      action.setLoop(THREE.LoopRepeat);
    }

    action.play();

    return { mixer, action, clip, stanceName, clampFinal };
  } catch (error) {
    console.warn(`Could not load stance animation ${stanceUrl}.`, error);
    return null;
  }
}

async function createActionAnimations(mixer, animations) {
  const actions = {};

  for (const [name, url] of Object.entries(animations)) {
    try {
      const animationSource = await loader.loadAsync(url);
      const sourceClip = animationSource.animations[0];

      if (!sourceClip) {
        continue;
      }

      const clip = sourceClip.clone();
      clip.name = name;
      clip.tracks = clip.tracks.map((track) => sanitizeRootPositionTrack(track, {
        lockDepthRootMotion: name === 'grab',
      }));

      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = name.startsWith('death') || name.startsWith('victory');
      action.setLoop(THREE.LoopOnce, 1);
      actions[name] = { action, clip };
    } catch (error) {
      console.warn(`Could not load action animation ${url}.`, error);
    }
  }

  return actions;
}

function sanitizeRootPositionTrack(track, { lockDepthRootMotion }) {
  if (!isRootMotionPositionTrack(track.name)) {
    return track;
  }

  const values = track.values.slice();
  const lockedX = values[0] ?? 0;
  const lockedHeight = values[1] ?? 0;
  const lockedZ = values[2] ?? 0;

  for (let i = 0; i < values.length; i += 3) {
    values[i] = lockedX;
    values[i + 1] = lockedHeight;

    if (lockDepthRootMotion) {
      values[i + 2] = lockedZ;
    }
  }

  return new THREE.VectorKeyframeTrack(track.name, track.times.slice(), values);
}

function isRootMotionPositionTrack(trackName) {
  if (!trackName.endsWith('.position')) {
    return false;
  }

  const targetName = trackName
    .slice(0, -'.position'.length)
    .split(/[.:/|\\]/)
    .pop()
    ?.toLowerCase() ?? '';

  return (
    targetName.endsWith('hips') ||
    targetName.endsWith('pelvis') ||
    targetName === 'root' ||
    targetName === 'armature' ||
    targetName === 'bip01'
  );
}

import * as THREE from 'three';

export function createFighterModel({ body = 0x68d391, accent = 0x1f2933, skin = 0xf2c4a7 } = {}) {
  const root = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: body, roughness: 0.45, metalness: 0.04 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 });

  const shadow = part(
    new THREE.CylinderGeometry(0.55, 0.72, 0.02, 32),
    new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.35 }),
    [0, 0.012, 0],
  );
  shadow.scale.z = 0.48;

  const torso = part(new THREE.BoxGeometry(0.72, 1.0, 0.32), bodyMaterial, [0, 1.25, 0]);
  const head = part(new THREE.SphereGeometry(0.25, 24, 16), skinMaterial, [0, 1.95, 0]);
  const hip = part(new THREE.BoxGeometry(0.62, 0.28, 0.34), accentMaterial, [0, 0.72, 0]);

  const leftArm = limb(bodyMaterial, [-0.52, 1.45, 0], 0.22, 0.72);
  const rightArm = limb(bodyMaterial, [0.52, 1.45, 0], 0.22, 0.72);
  const leftLeg = limb(accentMaterial, [-0.22, 0.37, 0], 0.24, 0.68);
  const rightLeg = limb(accentMaterial, [0.22, 0.37, 0], 0.24, 0.68);

  root.add(shadow, torso, head, hip, leftArm, rightArm, leftLeg, rightLeg);

  return { root, shadow, torso, head, hip, leftArm, rightArm, leftLeg, rightLeg };
}

export function createArena() {
  const group = new THREE.Group();
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

function limb(material, position, width, height) {
  return part(new THREE.BoxGeometry(width, height, width), material, position);
}

function part(geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  return mesh;
}

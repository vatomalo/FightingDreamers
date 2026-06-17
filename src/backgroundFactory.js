import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

const SH_C0 = 0.28209479177387814;
const BACKDROP_PLACEMENT = {
  height: 38,
  radius: 15.5,
  position: new THREE.Vector3(0, 9.35, 0),
};
const GROUND_BAND_HEIGHT = 5.8;
const GROUND_BAND_Y = -13.7;
const GROUND_CAP_Y = -9.7;
const BACKDROP_SCROLL_SPEED = 0;
const BACKDROP_PARALLAX_X = 0.018;
const BACKDROP_HORIZONTAL_REPEAT = 5;
const BACKDROP_VERTICAL_REPEAT = 2;
const GROUND_TEXTURE_SLICE_HEIGHT = 0.24;
const SKY_SECTION_HEIGHT = 23;
const STAGE_SECTION_HEIGHT = 14;
const SKY_SECTION_Y = 9.1;
const STAGE_SECTION_Y = -11.1;

export async function createPngBackdrop({ url, skyUrl = null, name = 'png-backdrop', height = BACKDROP_PLACEMENT.height } = {}) {
  if (!url) {
    throw new Error('PNG backdrop requires a texture URL.');
  }

  const texture = await new THREE.TextureLoader().loadAsync(url);
  prepareBackdropTexture(texture, {
    repeatX: BACKDROP_HORIZONTAL_REPEAT,
    repeatY: BACKDROP_VERTICAL_REPEAT,
  });
  const skyTexture = skyUrl ? await new THREE.TextureLoader().loadAsync(skyUrl) : null;

  if (skyTexture) {
    prepareBackdropTexture(skyTexture, {
      repeatX: BACKDROP_HORIZONTAL_REPEAT,
      repeatY: 1,
    });
  }

  const imageWidth = texture.image?.naturalWidth ?? texture.image?.width ?? 16;
  const imageHeight = texture.image?.naturalHeight ?? texture.image?.height ?? 9;

  const backdrop = new THREE.Group();
  backdrop.name = name;
  backdrop.position.copy(BACKDROP_PLACEMENT.position);

  if (skyTexture) {
    const stageCylinderTexture = texture.clone();
    stageCylinderTexture.wrapS = THREE.MirroredRepeatWrapping;
    stageCylinderTexture.wrapT = THREE.MirroredRepeatWrapping;
    stageCylinderTexture.repeat.set(BACKDROP_HORIZONTAL_REPEAT, -BACKDROP_VERTICAL_REPEAT);
    stageCylinderTexture.offset.set(0, 1);
    stageCylinderTexture.needsUpdate = true;

    const skyCylinder = createBackdropCylinder({
      texture: skyTexture,
      height: SKY_SECTION_HEIGHT,
      y: SKY_SECTION_Y,
      radiusScale: 1,
      name: `${name}-sky-cylinder`,
    });
    skyCylinder.renderOrder = -31;
    backdrop.add(skyCylinder);

    const stageCylinder = createBackdropCylinder({
      texture: stageCylinderTexture,
      height: STAGE_SECTION_HEIGHT,
      y: STAGE_SECTION_Y,
      radiusScale: 0.999,
      name: `${name}-stage-cylinder`,
    });
    stageCylinder.renderOrder = -30;
    backdrop.add(stageCylinder);
  } else {
    const fullCylinder = createBackdropCylinder({
      texture,
      height,
      y: 0,
      radiusScale: 1,
      name: `${name}-full-cylinder`,
    });
    fullCylinder.renderOrder = -30;
    backdrop.add(fullCylinder);
  }

  const circumference = Math.PI * 2 * BACKDROP_PLACEMENT.radius;
  const groundTexture = texture.clone();
  groundTexture.wrapS = THREE.MirroredRepeatWrapping;
  groundTexture.wrapT = THREE.ClampToEdgeWrapping;
  groundTexture.repeat.set(BACKDROP_HORIZONTAL_REPEAT, GROUND_TEXTURE_SLICE_HEIGHT);
  groundTexture.offset.set(0, 0);
  groundTexture.needsUpdate = true;
  const groundMaterial = new THREE.MeshBasicMaterial({
    map: groundTexture,
    fog: false,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const groundBand = new THREE.Mesh(
    new THREE.CylinderGeometry(
      BACKDROP_PLACEMENT.radius * 0.998,
      BACKDROP_PLACEMENT.radius * 0.998,
      GROUND_BAND_HEIGHT,
      96,
      1,
      true,
    ),
    groundMaterial,
  );
  groundBand.name = `${name}-stretched-ground-band`;
  groundBand.position.y = GROUND_BAND_Y;
  groundBand.renderOrder = -29;
  groundBand.frustumCulled = false;
  backdrop.add(groundBand);

  const groundCapTexture = texture.clone();
  groundCapTexture.wrapS = THREE.MirroredRepeatWrapping;
  groundCapTexture.wrapT = THREE.ClampToEdgeWrapping;
  groundCapTexture.repeat.set(3, GROUND_TEXTURE_SLICE_HEIGHT);
  groundCapTexture.offset.set(0, 0);
  groundCapTexture.needsUpdate = true;
  const groundCap = new THREE.Mesh(
    new THREE.CircleGeometry(BACKDROP_PLACEMENT.radius * 0.996, 128),
    new THREE.MeshBasicMaterial({
      map: groundCapTexture,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  groundCap.name = `${name}-bottom-cap`;
  groundCap.rotation.x = -Math.PI / 2;
  groundCap.position.y = GROUND_CAP_Y;
  groundCap.renderOrder = -28;
  groundCap.frustumCulled = false;
  backdrop.add(groundCap);

  backdrop.renderOrder = -30;
  backdrop.frustumCulled = false;
  backdrop.userData.textureSize = { width: imageWidth, height: imageHeight };
  backdrop.userData.skyTextureSize = skyTexture
    ? {
        width: skyTexture.image?.naturalWidth ?? skyTexture.image?.width ?? 0,
        height: skyTexture.image?.naturalHeight ?? skyTexture.image?.height ?? 0,
      }
    : { width: 0, height: 0 };
  backdrop.userData.backdropSize = { width: circumference, height };
  backdrop.userData.backdropPosition = BACKDROP_PLACEMENT.position.clone();
  backdrop.userData.radius = BACKDROP_PLACEMENT.radius;
  backdrop.userData.tileHeight = height;
  backdrop.userData.scrollY = 0;

  return backdrop;
}

function prepareBackdropTexture(texture, { repeatX, repeatY }) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
}

function createBackdropCylinder({ texture, height, y, radiusScale, name }) {
  const geometry = new THREE.CylinderGeometry(
    BACKDROP_PLACEMENT.radius * radiusScale,
    BACKDROP_PLACEMENT.radius * radiusScale,
    height,
    96,
    1,
    true,
  );
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    fog: false,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.name = name;
  cylinder.position.y = y;
  cylinder.frustumCulled = false;
  return cylinder;
}

export function updatePngBackdrop(backdrop, { cameraX = 0, delta = 0 } = {}) {
  if (!backdrop?.userData?.backdropPosition) {
    return;
  }

  const tileHeight = backdrop.userData.tileHeight ?? 1;
  const basePosition = backdrop.userData.backdropPosition;
  backdrop.userData.scrollY = (backdrop.userData.scrollY + delta * BACKDROP_SCROLL_SPEED) % tileHeight;

  backdrop.position.set(basePosition.x, basePosition.y - backdrop.userData.scrollY, basePosition.z);
  backdrop.rotation.y = cameraX * BACKDROP_PARALLAX_X;
}

export async function createGaussianPlyPointBackground(
  url,
  { name = 'point-background', width = 42 * (16 / 9), height = BACKDROP_PLACEMENT.height } = {},
) {
  const loader = new PLYLoader();
  loader.setCustomPropertyNameMapping({
    sphericalHarmonicsColor: ['f_dc_0', 'f_dc_1', 'f_dc_2'],
    splatOpacity: ['opacity'],
  });

  const geometry = await loader.loadAsync(url);
  applySphericalHarmonicsColors(geometry);
  normalizeBackgroundGeometry(geometry, { width, height });

  const material = new THREE.PointsMaterial({
    size: 0.032,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.position.copy(BACKDROP_PLACEMENT.position);
  points.frustumCulled = false;
  points.renderOrder = -20;
  points.userData.backdropSize = { width, height };
  points.userData.backdropPosition = BACKDROP_PLACEMENT.position.clone();

  return points;
}

function applySphericalHarmonicsColors(geometry) {
  const sphericalHarmonicsColor = geometry.getAttribute('sphericalHarmonicsColor');
  const position = geometry.getAttribute('position');

  if (!sphericalHarmonicsColor || !position) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(makeNeutralColors(position.count), 3));
    return;
  }

  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = THREE.MathUtils.clamp(0.5 + SH_C0 * sphericalHarmonicsColor.getX(i), 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(0.5 + SH_C0 * sphericalHarmonicsColor.getY(i), 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(0.5 + SH_C0 * sphericalHarmonicsColor.getZ(i), 0, 1);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function makeNeutralColors(count) {
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    colors[i * 3] = 0.42;
    colors[i * 3 + 1] = 0.47;
    colors[i * 3 + 2] = 0.52;
  }

  return colors;
}

function normalizeBackgroundGeometry(geometry, { width, height }) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;

  if (!box) {
    return;
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(
    width / Math.max(size.x, 0.001),
    -height / Math.max(size.y, 0.001),
    0.001 / Math.max(size.z, 0.001),
  );
}

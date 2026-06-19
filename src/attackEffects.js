import * as THREE from 'three';

const impactColor = new THREE.Color(0xfff0a6);
const powerColor = new THREE.Color(0x78f7ff);
const killColor = new THREE.Color(0xff4d7a);

export class AttackEffectsDirector {
  constructor({ scene }) {
    this.scene = scene;
    this.effects = [];
  }

  onHit(payload) {
    if (payload?.isBlocked) {
      this.spawnImpact(payload, { color: 0xb7d9ff, scale: 0.75, sparks: 4 });
      return;
    }

    const chargeLevel = payload.chargeLevel ?? 0;
    const isPowerHit = payload.rawDamage >= 13 || payload.isKill || payload.forceCinematic || chargeLevel > 0.35;
    this.spawnImpact(payload, {
      color: payload.isKill ? killColor : isPowerHit ? powerColor : impactColor,
      scale: (payload.isKill ? 1.55 : isPowerHit ? 1.25 : 0.85) + chargeLevel * 0.45,
      sparks: Math.round((payload.isKill ? 16 : isPowerHit ? 11 : 7) + chargeLevel * 6),
    });

    if (isPowerHit) {
      this.spawnSpeedLines(payload);
      this.spawnShockRing(payload);
    }
  }

  update(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.elapsed += delta;
      const t = Math.min(effect.elapsed / effect.duration, 1);
      effect.update(t, delta);

      if (t >= 1) {
        this.scene.remove(effect.root);
        disposeObject(effect.root);
        this.effects.splice(i, 1);
      }
    }
  }

  spawnImpact(payload, { color, scale, sparks }) {
    const root = new THREE.Group();
    root.position.copy(payload.impactPoint);
    root.position.z += 0.08;

    const burst = new THREE.Mesh(
      new THREE.RingGeometry(0.08 * scale, 0.2 * scale, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    burst.rotation.y = Math.PI / 2;
    root.add(burst);

    for (let i = 0; i < sparks; i++) {
      const length = THREE.MathUtils.lerp(0.22, 0.62, i / Math.max(sparks - 1, 1)) * scale;
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.018 * scale, 0.018 * scale),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const angle = (i / sparks) * Math.PI * 2;
      spark.position.set(Math.cos(angle) * 0.12 * scale, Math.sin(angle) * 0.12 * scale, 0);
      spark.rotation.z = angle;
      spark.userData.start = spark.position.clone();
      spark.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * THREE.MathUtils.lerp(0.8, 1.8, Math.random()),
        Math.sin(angle) * THREE.MathUtils.lerp(0.8, 1.8, Math.random()),
        THREE.MathUtils.lerp(-0.25, 0.25, Math.random()),
      );
      root.add(spark);
    }

    this.addEffect(root, 0.34, (t) => {
      const eased = easeOutCubic(t);
      burst.scale.setScalar(THREE.MathUtils.lerp(0.35, 2.2, eased));
      burst.material.opacity = (1 - t) * 0.92;

      for (const child of root.children) {
        if (child === burst) {
          continue;
        }
        child.position.copy(child.userData.start).addScaledVector(child.userData.velocity, eased * 0.38);
        child.material.opacity = (1 - t) * 0.8;
      }
    });
  }

  spawnSpeedLines(payload) {
    const root = new THREE.Group();
    const direction = payload.hitDirection?.x >= 0 ? 1 : -1;
    root.position.copy(payload.impactPoint);
    root.position.y += 0.02;
    root.position.z += 0.18;

    for (let i = 0; i < 10; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(THREE.MathUtils.lerp(0.55, 1.35, Math.random()), 0.018, 0.018),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xffffff : 0x81f7ff,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      line.position.set(
        direction * THREE.MathUtils.lerp(-0.15, 0.5, Math.random()),
        THREE.MathUtils.lerp(-0.34, 0.34, Math.random()),
        THREE.MathUtils.lerp(-0.12, 0.12, Math.random()),
      );
      line.rotation.z = THREE.MathUtils.lerp(-0.15, 0.15, Math.random());
      line.userData.start = line.position.clone();
      root.add(line);
    }

    this.addEffect(root, 0.28, (t) => {
      const eased = easeOutCubic(t);
      for (const child of root.children) {
        child.position.x = child.userData.start.x - direction * eased * 1.2;
        child.material.opacity = (1 - t) * 0.56;
      }
    });
  }

  spawnShockRing(payload) {
    const root = new THREE.Group();
    root.position.copy(payload.impactPoint);
    root.position.y = Math.max(root.position.y, 0.9);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({
        color: payload.isKill ? killColor : powerColor,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.y = Math.PI / 2;
    root.add(ring);

    this.addEffect(root, payload.isKill ? 0.58 : 0.44, (t) => {
      const scale = THREE.MathUtils.lerp(0.35, payload.isKill ? 4.3 : 3.1, easeOutCubic(t));
      ring.scale.set(scale, scale, scale);
      ring.material.opacity = (1 - t) * 0.72;
    });
  }

  addEffect(root, duration, update) {
    this.scene.add(root);
    this.effects.push({ root, duration, update, elapsed: 0 });
  }
}

function disposeObject(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

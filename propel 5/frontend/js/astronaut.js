import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * GLTF Astronaut
 * - Loads a real 3D astronaut model (models/Astronaut.glb)
 * - Floating animation, flight path into cockpit, seating & happy bob
 * - Tether line to rocket part
 * - Maintains exact same public API as the old procedural version
 */
export class Astronaut {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'astronaut';

    // State
    this.isInCockpit = false;
    this.modelLoaded = false;
    this.mixer = null; // AnimationMixer for any embedded animations

    this._buildTetherMaterial();
    this._loadModel();
    this._buildTether();

    // Add to scene
    this.scene.add(this.group);
  }

  _buildTetherMaterial() {
    this.tetherMat = new THREE.LineBasicMaterial({
      color: 0x7FA8FF, transparent: true, opacity: 0.5, linewidth: 2,
    });
  }

  _loadModel() {
    const loader = new GLTFLoader();

    loader.load(
      '/models/Astronaut.glb',
      (gltf) => {
        this.model = gltf.scene;

        // Compute bounding box to normalize scale
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Target height ~0.9 units (similar to old procedural astronaut at 0.75 scale)
        const targetHeight = 0.9;
        const scaleFactor = targetHeight / size.y;
        this.model.scale.setScalar(scaleFactor);

        // Recalculate box after scale
        box.setFromObject(this.model);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Center the model so origin is at center-bottom
        this.model.position.sub(center);
        this.model.position.y += (size.y * scaleFactor) / 2;

        // Enhance materials for the space scene
        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
              // Boost material quality
              if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
                child.material.envMapIntensity = 1.2;
                child.material.needsUpdate = true;
              }
            }
          }
        });

        this.group.add(this.model);

        // Set up animation mixer if the model has animations
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.model);
          // Play the first animation (idle) by default
          const action = this.mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        this.modelLoaded = true;
        console.log('Astronaut model loaded successfully');
      },
      (progress) => {
        // Loading progress
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          if (pct % 25 === 0) console.log(`Astronaut model: ${pct}% loaded`);
        }
      },
      (error) => {
        console.error('Failed to load astronaut model:', error);
        // Fallback: create a simple placeholder sphere so the scene isn't broken
        this._buildFallback();
      }
    );
  }

  /** Minimal fallback in case the GLB fails to load */
  _buildFallback() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xF4F2FF, roughness: 0.35, metalness: 0.1,
    });
    const body = new THREE.Group();

    // Simple helmet sphere
    const helmetGeo = new THREE.SphereGeometry(0.25, 24, 24);
    const helmet = new THREE.Mesh(helmetGeo, mat);
    helmet.position.y = 0.45;
    body.add(helmet);

    // Visor
    const visorGeo = new THREE.SphereGeometry(0.22, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x6C63FF, emissive: 0x22D3EE, emissiveIntensity: 0.25,
      roughness: 0.1, metalness: 0.8, clearcoat: 1.0,
      transparent: true, opacity: 0.85,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.rotation.x = Math.PI / 2;
    visor.position.set(0, 0.45, 0.04);
    body.add(visor);

    // Simple body cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.4, 16);
    const bodyMesh = new THREE.Mesh(bodyGeo, mat);
    bodyMesh.position.y = 0.1;
    body.add(bodyMesh);

    body.scale.setScalar(0.75);
    this.group.add(body);
    this.modelLoaded = true;
  }

  /* ── Build Tether Line ───────────────────────────────────── */
  _buildTether() {
    const points = [];
    for (let i = 0; i <= 15; i++) {
      points.push(new THREE.Vector3(0, 0, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.tetherLine = new THREE.Line(geometry, this.tetherMat);
    this.scene.add(this.tetherLine);
  }

  /* ── Main update called every frame ─────────────────────── */
  update(time, scrollProgress, cockpitTargetWorldPos, targetRocketPartWorldPos) {
    // Update animation mixer if present
    if (this.mixer) {
      this.mixer.update(0.016); // ~60fps delta
    }

    // Don't animate position/rotation until model is loaded
    if (!this.modelLoaded) return;

    const orbitCenter = new THREE.Vector3(-3.5, 0.5, 0.5);
    if (window.innerWidth < 1200 && window.innerWidth >= 768) {
      orbitCenter.set(-2.8, 0.5, 0.2);
    } else if (window.innerWidth < 768) {
      orbitCenter.set(-1.0, 0.2, -0.5);
    }

    const orbitAngle = time * 0.15;
    const orbitX = Math.sin(orbitAngle) * 2.2 + Math.cos(time * 0.08) * 0.6;
    const orbitY = Math.cos(orbitAngle * 0.7) * 1.2 + Math.sin(time * 0.12) * 0.4;
    const orbitZ = Math.sin(orbitAngle * 1.3) * 1.0;
    const floatPos = orbitCenter.clone().add(new THREE.Vector3(orbitX, orbitY, orbitZ));

    const seatedPos = cockpitTargetWorldPos ? cockpitTargetWorldPos.clone() : new THREE.Vector3(-3.5, 1.95, 0);
    seatedPos.z += 0.05;

    let currentPos = new THREE.Vector3();
    let currentRot = new THREE.Euler();

    if (scrollProgress < 0.70) {
      // ── Floating in space as parts attach ──
      currentPos.copy(floatPos);
      currentRot.set(
        Math.sin(time * 0.5) * 0.25,    // gentler tumble for realistic model
        time * 0.15,                      // slower spin
        Math.cos(time * 0.4) * 0.2
      );
      this.isInCockpit = false;

      // Tether
      if (this.tetherLine && targetRocketPartWorldPos) {
        this.tetherLine.visible = true;
        const astroPos = this.group.position;
        const targetPos = targetRocketPartWorldPos;

        const positions = this.tetherLine.geometry.attributes.position.array;
        for (let i = 0; i <= 15; i++) {
          const t = i / 15;
          const sag = Math.sin(t * Math.PI) * -0.5;
          const px = THREE.MathUtils.lerp(astroPos.x, targetPos.x, t);
          const py = THREE.MathUtils.lerp(astroPos.y, targetPos.y, t) + sag;
          const pz = THREE.MathUtils.lerp(astroPos.z, targetPos.z, t);
          positions[i * 3] = px;
          positions[i * 3 + 1] = py;
          positions[i * 3 + 2] = pz;
        }
        this.tetherLine.geometry.attributes.position.needsUpdate = true;
        // Fade tether as progress moves towards 0.70
        this.tetherLine.material.opacity = Math.max(0, (1 - scrollProgress / 0.70) * 0.5);
      }

    } else if (scrollProgress < 0.90) {
      // ── Flying path towards cockpit module (0.70 to 0.90) ──
      const flyT = (scrollProgress - 0.70) / 0.20;
      const easedT = Math.pow(flyT, 2) * (3 - 2 * flyT); // smoothstep

      const midPoint = floatPos.clone().lerp(seatedPos, 0.5).add(new THREE.Vector3(1.0, 0.8, 0.5));

      const p0 = floatPos;
      const p1 = midPoint;
      const p2 = seatedPos;
      // Quadratic bezier
      currentPos.x = (1 - easedT) * (1 - easedT) * p0.x + 2 * (1 - easedT) * easedT * p1.x + easedT * easedT * p2.x;
      currentPos.y = (1 - easedT) * (1 - easedT) * p0.y + 2 * (1 - easedT) * easedT * p1.y + easedT * easedT * p2.y;
      currentPos.z = (1 - easedT) * (1 - easedT) * p0.z + 2 * (1 - easedT) * easedT * p1.z + easedT * easedT * p2.z;

      // Rotate to face direction of travel, easing out tumble
      currentRot.set(
        (1 - easedT) * Math.sin(time * 0.5) * 0.25,
        (1 - easedT) * (time * 0.15),
        (1 - easedT) * Math.cos(time * 0.4) * 0.2
      );

      this.isInCockpit = false;

      if (this.tetherLine) {
        this.tetherLine.visible = false;
      }

    } else {
      // ── Seated in Cockpit (0.90 to 1.00) ──
      const happyBob = Math.sin(time * 4) * 0.04;
      currentPos.copy(seatedPos);
      currentPos.y += happyBob;
      currentRot.set(0, 0, 0);

      this.isInCockpit = true;

      if (this.tetherLine) {
        this.tetherLine.visible = false;
      }
    }

    this.group.position.copy(currentPos);
    this.group.rotation.copy(currentRot);
  }

  dispose() {
    this.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    if (this.tetherLine) {
      this.tetherLine.geometry.dispose();
      this.tetherLine.material.dispose();
      this.scene.remove(this.tetherLine);
    }
    this.scene.remove(this.group);
  }
}

import * as THREE from 'three';

/* ═════════════════════════════════════════════════════════════
   StarField — Parallax background starfield
   ═════════════════════════════════════════════════════════════ */
export class StarField {
  constructor(scene, count = 2000) {
    this.scene = scene;
    this.count = count;
    this.build();
  }
  build() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 3);
    const cols = new Float32Array(this.count * 3);
    const colorOpts = [
      new THREE.Color(0xffffff),
      new THREE.Color(0x6C63FF),
      new THREE.Color(0x4ECDC4),
      new THREE.Color(0xF0687C),
      new THREE.Color(0xFFD93D)
    ];
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 120;
      pos[i3 + 1] = (Math.random() - 0.5) * 120;
      pos[i3 + 2] = (Math.random() - 0.5) * 120;
      const c = colorOpts[Math.floor(Math.random() * colorOpts.length)];
      cols[i3] = c.r;
      cols[i3 + 1] = c.g;
      cols[i3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }
  update(time, scrollProgress) {
    if (this.particles) {
      this.particles.rotation.y = time * 0.02;
      this.particles.rotation.x = time * 0.01;
      this.particles.position.y = -scrollProgress * 15;
      this.particles.position.x = Math.sin(scrollProgress * Math.PI) * 2;
    }
  }
}

/* ═════════════════════════════════════════════════════════════
   GPUExhaustParticles — Points-based exhaust with 5-color brand gradient
   ═════════════════════════════════════════════════════════════ */
export class GPUExhaustParticles {
  constructor(scene, rocketGroup) {
    this.scene = scene;
    this.rocketGroup = rocketGroup;

    const isMobile = window.innerWidth < 768;
    this.maxParticles = isMobile ? 150 : 600;
    this.intensity = 0.15;

    this.positions = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.maxLifetimes = new Float32Array(this.maxParticles);

    // 5-color gradient: White -> #9FD8FF -> #6C63FF -> #A855F7 -> #F0687C
    this.gradientColors = [
      new THREE.Color(0xffffff),   // white core
      new THREE.Color(0x9FD8FF),   // light blue
      new THREE.Color(0x6C63FF),   // indigo
      new THREE.Color(0xA855F7),   // purple
      new THREE.Color(0xF0687C),   // coral
    ];

    for (let i = 0; i < this.maxParticles; i++) {
      this.lifetimes[i] = 0;
      this.sizes[i] = 0;
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = -1000;
      this.positions[i * 3 + 2] = 0;
    }

    this._build();
  }

  _build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);

    // Faint smoke trail
    this.smokePositions = new Float32Array(this.maxParticles * 3);
    this.smokeColors = new Float32Array(this.maxParticles * 3);
    this.smokeSizes = new Float32Array(this.maxParticles);
    this.smokeLifetimes = new Float32Array(this.maxParticles);
    for (let i = 0; i < this.maxParticles; i++) {
      this.smokeLifetimes[i] = 0;
      this.smokePositions[i * 3 + 1] = -1000;
    }

    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    smokeGeo.setAttribute('color', new THREE.BufferAttribute(this.smokeColors, 3));
    smokeGeo.setAttribute('size', new THREE.BufferAttribute(this.smokeSizes, 1));

    const smokeMat = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.scene.add(this.smokePoints);
  }

  setIntensity(v) { this.intensity = v; }

  update(delta) {
    const wp = new THREE.Vector3();
    this.rocketGroup.getWorldPosition(wp);

    const emitCount = Math.floor(this.intensity * 14) + 1;

    for (let i = 0; i < this.maxParticles; i++) {
      const i3 = i * 3;

      if (this.lifetimes[i] <= 0) {
        if (emitCount > 0 && Math.random() < this.intensity * 0.35) {
          // Position near rocket nozzles (y offset ~ -2.2)
          this.positions[i3] = wp.x + (Math.random() - 0.5) * 0.4;
          this.positions[i3 + 1] = wp.y - 2.2;
          this.positions[i3 + 2] = wp.z + (Math.random() - 0.5) * 0.4;

          this.velocities[i3] = (Math.random() - 0.5) * 0.05;
          this.velocities[i3 + 1] = -(Math.random() * 0.14 + 0.05) * (0.5 + this.intensity);
          this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;

          const ci = Math.floor(Math.random() * this.gradientColors.length);
          const col = this.gradientColors[ci];
          this.colors[i3] = col.r;
          this.colors[i3 + 1] = col.g;
          this.colors[i3 + 2] = col.b;

          this.lifetimes[i] = 0.6 + Math.random() * 0.8;
          this.maxLifetimes[i] = this.lifetimes[i];
          this.sizes[i] = (Math.random() * 0.06 + 0.03) * (0.5 + this.intensity);

          this.smokePositions[i3] = this.positions[i3];
          this.smokePositions[i3 + 1] = this.positions[i3 + 1];
          this.smokePositions[i3 + 2] = this.positions[i3 + 2];
          this.smokeColors[i3] = 0.35;
          this.smokeColors[i3 + 1] = 0.35;
          this.smokeColors[i3 + 2] = 0.45;
          this.smokeLifetimes[i] = this.lifetimes[i] * 1.5;
          this.smokeSizes[i] = 0.02;
        }
        continue;
      }

      this.lifetimes[i] -= delta;
      this.positions[i3] += this.velocities[i3];
      this.positions[i3 + 1] += this.velocities[i3 + 1];
      this.positions[i3 + 2] += this.velocities[i3 + 2];

      this.velocities[i3 + 1] -= 0.0008;
      this.velocities[i3] *= 0.98;
      this.velocities[i3 + 2] *= 0.98;
      this.sizes[i] *= 0.995;

      if (this.smokeLifetimes[i] > 0) {
        this.smokeLifetimes[i] -= delta * 0.7;
        this.smokePositions[i3] += this.velocities[i3] * 0.3;
        this.smokePositions[i3 + 1] += this.velocities[i3 + 1] * 0.3;
        this.smokePositions[i3 + 2] += this.velocities[i3 + 2] * 0.3;
        this.smokeSizes[i] *= 0.998;
      } else {
        this.smokePositions[i3 + 1] = -1000;
      }

      if (this.lifetimes[i] <= 0) {
        this.positions[i3 + 1] = -1000;
        this.sizes[i] = 0;
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;

    this.smokePoints.geometry.attributes.position.needsUpdate = true;
    this.smokePoints.geometry.attributes.color.needsUpdate = true;
    this.smokePoints.geometry.attributes.size.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.scene.remove(this.points);
    this.smokePoints.geometry.dispose();
    this.smokePoints.material.dispose();
    this.scene.remove(this.smokePoints);
  }
}

/* ═════════════════════════════════════════════════════════════
   DockingEffects — Expanding Shockwave Rings & Spark Particles
   ═════════════════════════════════════════════════════════════ */
export class DockingEffects {
  constructor(scene) {
    this.scene = scene;
    this.activeShockwaves = [];
    this.sparkPoints = null;
    this.maxSparks = 100;
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkVelocities = new Float32Array(this.maxSparks * 3);
    this.sparkLifetimes = new Float32Array(this.maxSparks);

    this._buildSparks();
  }

  _buildSparks() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0xF0687C,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(geo, mat);
    this.scene.add(this.sparkPoints);
  }

  /** Trigger a docking shockwave ring & spark burst at world position */
  triggerDock(pos) {
    // 1. Shockwave Ring
    const ringGeo = new THREE.TorusGeometry(0.7, 0.03, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6C63FF,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.rotation.x = Math.PI / 2;
    this.scene.add(ringMesh);

    this.activeShockwaves.push({
      mesh: ringMesh,
      scale: 1.0,
      opacity: 0.9,
    });

    // 2. Spark particles burst
    for (let i = 0; i < 15; i++) {
      const idx = Math.floor(Math.random() * this.maxSparks);
      const i3 = idx * 3;
      this.sparkPositions[i3] = pos.x;
      this.sparkPositions[i3 + 1] = pos.y;
      this.sparkPositions[i3 + 2] = pos.z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.12;
      this.sparkVelocities[i3] = Math.cos(angle) * speed;
      this.sparkVelocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      this.sparkVelocities[i3 + 2] = Math.sin(angle) * speed;
      this.sparkLifetimes[idx] = 0.5 + Math.random() * 0.3;
    }
  }

  update(delta) {
    // Update shockwave rings
    for (let i = this.activeShockwaves.length - 1; i >= 0; i--) {
      const sw = this.activeShockwaves[i];
      sw.scale += delta * 3.5;
      sw.opacity -= delta * 1.8;

      sw.mesh.scale.set(sw.scale, sw.scale, sw.scale);
      sw.mesh.material.opacity = Math.max(0, sw.opacity);

      if (sw.opacity <= 0) {
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        this.scene.remove(sw.mesh);
        this.activeShockwaves.splice(i, 1);
      }
    }

    // Update sparks
    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparkLifetimes[i] > 0) {
        this.sparkLifetimes[i] -= delta;
        const i3 = i * 3;
        this.sparkPositions[i3] += this.sparkVelocities[i3];
        this.sparkPositions[i3 + 1] += this.sparkVelocities[i3 + 1];
        this.sparkPositions[i3 + 2] += this.sparkVelocities[i3 + 2];
      } else {
        this.sparkPositions[i * 3 + 1] = -1000;
      }
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
  }
}

/* ═════════════════════════════════════════════════════════════
   ConfettiParticles — Celebration burst when astronaut enters cockpit
   ═════════════════════════════════════════════════════════════ */
export class ConfettiParticles {
  constructor(scene) {
    this.scene = scene;
    this.maxConfetti = 80;
    this.positions = new Float32Array(this.maxConfetti * 3);
    this.velocities = new Float32Array(this.maxConfetti * 3);
    this.colors = new Float32Array(this.maxConfetti * 3);
    this.lifetimes = new Float32Array(this.maxConfetti);

    this.palette = [
      new THREE.Color(0xF0687C),
      new THREE.Color(0x6C63FF),
      new THREE.Color(0x22D3EE),
      new THREE.Color(0xFFD93D),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < this.maxConfetti; i++) {
      this.lifetimes[i] = 0;
      this.positions[i * 3 + 1] = -1000;
    }

    this._build();
  }

  _build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  triggerBurst(pos) {
    for (let i = 0; i < this.maxConfetti; i++) {
      const i3 = i * 3;
      this.positions[i3] = pos.x + (Math.random() - 0.5) * 0.2;
      this.positions[i3 + 1] = pos.y + (Math.random() - 0.5) * 0.2;
      this.positions[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.15;
      this.velocities[i3] = Math.cos(angle) * speed;
      this.velocities[i3 + 1] = Math.sin(angle) * speed + 0.05;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * speed;

      const c = this.palette[Math.floor(Math.random() * this.palette.length)];
      this.colors[i3] = c.r;
      this.colors[i3 + 1] = c.g;
      this.colors[i3 + 2] = c.b;

      this.lifetimes[i] = 1.0 + Math.random() * 0.8;
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  update(delta) {
    for (let i = 0; i < this.maxConfetti; i++) {
      if (this.lifetimes[i] > 0) {
        this.lifetimes[i] -= delta;
        const i3 = i * 3;
        this.positions[i3] += this.velocities[i3];
        this.positions[i3 + 1] += this.velocities[i3 + 1];
        this.positions[i3 + 2] += this.velocities[i3 + 2];
        this.velocities[i3 + 1] -= 0.003; // gravity
      } else {
        this.positions[i * 3 + 1] = -1000;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/* ═════════════════════════════════════════════════════════════
   CosmicObjects — Background deep-space glowing Orbs
   ═════════════════════════════════════════════════════════════ */
export class CosmicObjects {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.build();
  }
  build() {
    const p1 = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 16),
      new THREE.MeshPhongMaterial({ color: 0x6C63FF, emissive: 0x6C63FF, emissiveIntensity: 0.2, transparent: true, opacity: 0.3 })
    );
    p1.position.set(-12, -15, -12);
    this.scene.add(p1);
    this.objects.push({ mesh: p1, speed: 0.3, axis: 'y' });

    const p2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 12, 12),
      new THREE.MeshPhongMaterial({ color: 0xF0687C, emissive: 0xF0687C, emissiveIntensity: 0.15, transparent: true, opacity: 0.25 })
    );
    p2.position.set(-15, -30, -8);
    this.scene.add(p2);
    this.objects.push({ mesh: p2, speed: 0.5, axis: 'x' });
  }
  update(time) {
    for (const obj of this.objects) {
      obj.mesh.rotation[obj.axis] = time * obj.speed;
      obj.mesh.position.y += Math.sin(time * 0.5) * 0.002;
    }
  }
}

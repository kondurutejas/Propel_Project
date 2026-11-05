import * as THREE from 'three';

/**
 * Chunky 3D Rocket — 7 Modular Assembling Parts
 * Proportions: Fat body, ~1:3 width-to-height ratio, cartoon-realistic style.
 *
 * 7 Parts (docking order: engines -> lower body -> mid body -> upper body -> fins -> cockpit -> nose cone):
 * a) Engine cluster: 3 gunmetal #2A2A3D bell nozzles with glowing inner ring (#6C63FF/#9FD8FF)
 * b) Lower body / engine skirt: slightly wider white #F4F2FF cylinder with indigo trim
 * c) Mid body: white cylinder with deep-violet #4C3BCF stripe and round porthole
 * d) Upper body: pearl-white #F4F2FF cylinder with panel lines, rivets, and indigo #6C63FF band
 * e) Fins: 3 thick swept fins (3-way radial symmetry), deep violet with coral edge stripes
 * f) Cockpit module: thick white ring frame with large round tinted-glass dome/window (#7FA8FF)
 * g) Nose cone: rounded ogive cone, glossy coral #F0687C with white tip ring & antenna
 */

/* ── Flame Shaders ─────────────────────────────────────────── */
const flameVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float t = vUv.y;
    float n = fbm(vec2(vUv.x * 4.0, vUv.y * 6.0 - uTime * 3.5));
    float flickr = 0.75 + 0.25 * sin(uTime * 18.0 + vUv.x * 12.0);

    // Cool white-to-blue exhaust, matching the supplied rocket reference.
    vec3 col = mix(vec3(1.0, 1.0, 1.0), vec3(0.38, 0.58, 0.95), t);

    float dist = abs(vUv.x - 0.5) * 2.0;
    float radial = 1.0 - smoothstep(0.0, 1.0, dist);
    float vFade = 1.0 - smoothstep(0.0, 1.0, t);

    float alpha = radial * vFade * flickr * (0.4 + n * 0.6) * uIntensity;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(col * (1.0 + n * 0.35), alpha);
  }
`;

export class Rocket {
  constructor() {
    this.masterGroup = new THREE.Group();
    this.parts = []; // Array of 7 part objects { group, homePos, homeRot, explodedPos, explodedRot, label }
    this.flameMaterial = null;
    this.thrustLight = null;
    this.cockpitWorldPos = new THREE.Vector3();

    this._buildMaterials();
    this._buildParts();
    this._buildFlame();
    this._buildLights();
  }

  /* ── Materials ─────────────────────────────────────────── */
  _buildMaterials() {
    const isMobile = window.innerWidth < 768;

    // Physical material for main white rocket hull
    this.matHull = new THREE.MeshPhysicalMaterial({
      color: 0xB8BEC9,
      roughness: 0.22,
      metalness: 0.48,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    // Glass material for cockpit dome window
    if (!isMobile && THREE.MeshPhysicalMaterial) {
      this.matGlass = new THREE.MeshPhysicalMaterial({
        color: 0x7A839D,
        transmission: 0.9,
        thickness: 0.5,
        ior: 1.4,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        emissive: 0x1459E8,
        emissiveIntensity: 0.1,
      });
    } else {
      // Mobile fallback
      this.matGlass = new THREE.MeshStandardMaterial({
        color: 0x7A839D,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
      });
    }

    this.matGunmetal = new THREE.MeshStandardMaterial({
      color: 0x2A2A3D, metalness: 0.85, roughness: 0.3,
    });
    this.matGunmetalDark = new THREE.MeshStandardMaterial({
      color: 0x1A1A28, metalness: 0.9, roughness: 0.35,
    });
    this.matIndigo = new THREE.MeshStandardMaterial({
      color: 0x1459E8, metalness: 0.5, roughness: 0.3,
      emissive: 0x1459E8, emissiveIntensity: 0.15,
    });
    this.matViolet = new THREE.MeshStandardMaterial({
      color: 0x081744, metalness: 0.6, roughness: 0.35,
      emissive: 0x081744, emissiveIntensity: 0.1,
    });
    this.matCoral = new THREE.MeshPhysicalMaterial({
      color: 0x050C2B, metalness: 0.5, roughness: 0.22,
      clearcoat: 1.0, clearcoatRoughness: 0.1,
      emissive: 0x050C2B, emissiveIntensity: 0.12,
    });
    this.matCoralEdge = new THREE.MeshStandardMaterial({
      color: 0x050C2B, metalness: 0.4, roughness: 0.3,
      emissive: 0x050C2B, emissiveIntensity: 0.2,
    });
    this.matNozzleInner = new THREE.MeshBasicMaterial({
      color: 0x9FD8FF, transparent: true, opacity: 0.8,
    });
    this.matPortholeGlass = new THREE.MeshStandardMaterial({
      color: 0x1747B5, metalness: 0.3, roughness: 0.1,
      emissive: 0x1747B5, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.85,
    });
    this.matDarkTrim = new THREE.MeshStandardMaterial({
      color: 0x171525, metalness: 0.7, roughness: 0.4,
    });
    this.matPanelLine = new THREE.MeshBasicMaterial({
      color: 0xC8C8DC,
    });
  }

  /* ── 1. Engine Cluster ──────────────────────────────────── */
  _buildEngineCluster() {
    const g = new THREE.Group();
    g.name = 'part-engines';

    // Base plate skirt
    const skirtGeo = new THREE.CylinderGeometry(0.68, 0.72, 0.3, 32);
    const skirt = new THREE.Mesh(skirtGeo, this.matGunmetalDark);
    skirt.position.y = -1.5;
    g.add(skirt);

    // Gimbal ring
    const gimbalGeo = new THREE.TorusGeometry(0.66, 0.04, 12, 32);
    const gimbal = new THREE.Mesh(gimbalGeo, this.matIndigo);
    gimbal.position.y = -1.45;
    gimbal.rotation.x = Math.PI / 2;
    g.add(gimbal);

    // 3 bell nozzles in triangular formation
    const nozzlePositions = [
      { x: 0, z: 0.32 },
      { x: -0.28, z: -0.16 },
      { x: 0.28, z: -0.16 },
    ];

    nozzlePositions.forEach(pos => {
      // Outer bell
      const bellGeo = new THREE.CylinderGeometry(0.14, 0.28, 0.55, 20);
      const bell = new THREE.Mesh(bellGeo, this.matGunmetal);
      bell.position.set(pos.x, -1.9, pos.z);
      g.add(bell);

      // Inner glowing cone
      const innerGeo = new THREE.CylinderGeometry(0.08, 0.22, 0.45, 16);
      const inner = new THREE.Mesh(innerGeo, this.matNozzleInner);
      inner.position.set(pos.x, -1.92, pos.z);
      g.add(inner);

      // Nozzle rim ring
      const rimGeo = new THREE.TorusGeometry(0.28, 0.02, 8, 20);
      const rim = new THREE.Mesh(rimGeo, this.matIndigo);
      rim.position.set(pos.x, -2.18, pos.z);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
    });

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(-3.2, -4.5, 2.0),
      explodedRot: new THREE.Euler(0.8, 1.4, -0.6),
      label: 'Level 1 — Propulsion Engine',
    };
  }

  /* ── 2. Lower Body / Engine Skirt ────────────────────────── */
  _buildLowerBody() {
    const g = new THREE.Group();
    g.name = 'part-lower-body';

    // Main flared lower cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.65, 0.70, 0.75, 32);
    const body = new THREE.Mesh(bodyGeo, this.matHull);
    body.position.y = -0.95;
    g.add(body);

    // Indigo bottom trim ring
    const trimGeo = new THREE.TorusGeometry(0.70, 0.03, 10, 32);
    const trim = new THREE.Mesh(trimGeo, this.matIndigo);
    trim.position.y = -1.3;
    trim.rotation.x = Math.PI / 2;
    g.add(trim);

    // Top transition shoulder ring
    const topRingGeo = new THREE.TorusGeometry(0.65, 0.025, 10, 32);
    const topRing = new THREE.Mesh(topRingGeo, this.matDarkTrim);
    topRing.position.y = -0.58;
    topRing.rotation.x = Math.PI / 2;
    g.add(topRing);

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(4.0, -3.2, -2.5),
      explodedRot: new THREE.Euler(-0.5, -1.2, 0.5),
      label: 'Level 2 — Heavy Lower Hull',
    };
  }

  /* ── 3. Mid Body ────────────────────────────────────────── */
  _buildMidBody() {
    const g = new THREE.Group();
    g.name = 'part-mid-body';

    // Main white cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.75, 32);
    const body = new THREE.Mesh(bodyGeo, this.matHull);
    body.position.y = -0.2;
    g.add(body);

    // Deep-violet stripe
    const stripeGeo = new THREE.CylinderGeometry(0.655, 0.655, 0.22, 32);
    const stripe = new THREE.Mesh(stripeGeo, this.matIndigo);
    stripe.position.y = -0.2;
    g.add(stripe);

    // Round porthole window (front facing)
    const frameGeo = new THREE.TorusGeometry(0.14, 0.025, 12, 24);
    const frame = new THREE.Mesh(frameGeo, this.matGunmetal);
    frame.position.set(0, -0.2, 0.655);
    g.add(frame);

    const glassGeo = new THREE.CircleGeometry(0.13, 24);
    const glass = new THREE.Mesh(glassGeo, this.matPortholeGlass);
    glass.position.set(0, -0.2, 0.66);
    g.add(glass);

    // Emblem badge on right side
    const emblemGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
    const emblem = new THREE.Mesh(emblemGeo, this.matCoral);
    emblem.position.set(0.655, -0.2, 0);
    emblem.rotation.z = Math.PI / 2;
    g.add(emblem);

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(-4.5, -0.5, 3.0),
      explodedRot: new THREE.Euler(1.1, 0.6, -0.9),
      label: 'Level 3 — Core Tank Module',
    };
  }

  /* ── 4. Upper Body ──────────────────────────────────────── */
  _buildUpperBody() {
    const g = new THREE.Group();
    g.name = 'part-upper-body';

    // Main cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.75, 32);
    const body = new THREE.Mesh(bodyGeo, this.matHull);
    body.position.y = 0.55;
    g.add(body);

    // Indigo band accent
    const bandGeo = new THREE.CylinderGeometry(0.655, 0.655, 0.18, 32);
    const band = new THREE.Mesh(bandGeo, this.matIndigo);
    band.position.y = 0.55;
    g.add(band);

    // Panel line rings
    [0.2, 0.9].forEach(y => {
      const ringGeo = new THREE.TorusGeometry(0.652, 0.012, 8, 32);
      const ring = new THREE.Mesh(ringGeo, this.matDarkTrim);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    });

    // Tiny coral warning stripes
    for (let i = 0; i < 4; i++) {
      const stripeGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);
      const stripe = new THREE.Mesh(stripeGeo, this.matCoral);
      const angle = (i * Math.PI) / 2;
      stripe.position.set(Math.sin(angle) * 0.658, 0.88, Math.cos(angle) * 0.658);
      stripe.rotation.y = -angle;
      g.add(stripe);
    }

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(4.8, 1.8, -2.0),
      explodedRot: new THREE.Euler(-0.8, 1.3, 0.7),
      label: 'Level 4 — Flight Avionics Deck',
    };
  }

  /* ── 5. Fins ────────────────────────────────────────────── */
  _buildFins() {
    const g = new THREE.Group();
    g.name = 'part-fins';

    // 3 thick swept fins (3-way radial symmetry)
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.95, -0.65);
    finShape.lineTo(0.88, -0.15);
    finShape.lineTo(0.72, 0.70);
    finShape.lineTo(0.18, 0.95);
    finShape.lineTo(0, 0.70);

    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    });

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;

      const finGroup = new THREE.Group();
      finGroup.rotation.y = angle;

      // Main fin body (deep violet)
      const fin = new THREE.Mesh(finGeo, this.matViolet);
      fin.position.set(0.60, -1.2, -0.045);
      finGroup.add(fin);

      // Coral edge stripe
      const edgeGeo = new THREE.BoxGeometry(0.85, 0.03, 0.10);
      const edge = new THREE.Mesh(edgeGeo, this.matCoralEdge);
      edge.position.set(0.95, -1.15, 0);
      edge.rotation.z = -0.4;
      finGroup.add(edge);

      g.add(finGroup);
    }

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(-5.0, 3.0, 4.0),
      explodedRot: new THREE.Euler(1.3, -0.7, -1.2),
      label: 'Level 5 — Aerodynamic Fins',
    };
  }

  /* ── 6. Cockpit Module ──────────────────────────────────── */
  _buildCockpitModule() {
    const g = new THREE.Group();
    g.name = 'part-cockpit';

    // Thick white ring frame
    const frameGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.75, 32);
    const frame = new THREE.Mesh(frameGeo, this.matHull);
    frame.position.y = 1.3;
    g.add(frame);

    // Large round tinted-glass dome bubble window (front facing)
    const glassDomeGeo = new THREE.SphereGeometry(0.42, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const glassDome = new THREE.Mesh(glassDomeGeo, this.matGlass);
    glassDome.rotation.x = Math.PI / 2;
    glassDome.position.set(0, 1.3, 0.42);
    g.add(glassDome);

    // Glass frame ring
    const windowFrameGeo = new THREE.TorusGeometry(0.42, 0.03, 12, 32);
    const windowFrame = new THREE.Mesh(windowFrameGeo, this.matGunmetal);
    windowFrame.position.set(0, 1.3, 0.42);
    g.add(windowFrame);

    // Interior seat platform
    const seatGeo = new THREE.BoxGeometry(0.4, 0.1, 0.35);
    const seat = new THREE.Mesh(seatGeo, this.matDarkTrim);
    seat.position.set(0, 1.05, 0.1);
    g.add(seat);

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(3.5, 4.8, 3.2),
      explodedRot: new THREE.Euler(-0.7, 1.6, 0.8),
      label: 'Level 6 — Glass Cockpit Dome',
    };
  }

  /* ── 7. Nose Cone ───────────────────────────────────────── */
  _buildNoseCone() {
    const g = new THREE.Group();
    g.name = 'part-nose-cone';

    // Ogive smooth rounded cone
    const coneGeo = new THREE.ConeGeometry(0.65, 1.0, 32);
    const cone = new THREE.Mesh(coneGeo, this.matCoral);
    cone.position.y = 2.15;
    g.add(cone);

    // White tip ring
    const tipRingGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.15, 32);
    const tipRing = new THREE.Mesh(tipRingGeo, this.matHull);
    tipRing.position.y = 2.48;
    g.add(tipRing);

    // Metallic antenna pin
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.025, 0.35, 12);
    const antenna = new THREE.Mesh(antennaGeo, this.matGunmetal);
    antenna.position.y = 2.78;
    g.add(antenna);

    const tipBallGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const tipBall = new THREE.Mesh(tipBallGeo, this.matIndigo);
    tipBall.position.y = 2.95;
    g.add(tipBall);

    // Bottom attachment ring
    const botRingGeo = new THREE.TorusGeometry(0.65, 0.02, 10, 32);
    const botRing = new THREE.Mesh(botRingGeo, this.matIndigo);
    botRing.position.y = 1.66;
    botRing.rotation.x = Math.PI / 2;
    g.add(botRing);

    return {
      group: g,
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      explodedPos: new THREE.Vector3(-2.5, 7.2, -3.5),
      explodedRot: new THREE.Euler(1.2, -1.0, 1.4),
      label: 'Level 7 — Orbit Command Tip',
    };
  }

  /* ── Build All 7 Parts ─────────────────────────────────── */
  _buildParts() {
    const builders = [
      () => this._buildEngineCluster(),
      () => this._buildLowerBody(),
      () => this._buildMidBody(),
      () => this._buildUpperBody(),
      () => this._buildFins(),
      () => this._buildCockpitModule(),
      () => this._buildNoseCone(),
    ];

    builders.forEach(build => {
      const part = build();
      part.group.position.copy(part.explodedPos);
      part.group.rotation.copy(part.explodedRot);
      this.masterGroup.add(part.group);
      this.parts.push(part);
    });
  }

  /* ── Flame & Exhaust Cone ───────────────────────────────── */
  _buildFlame() {
    this.flameMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.15 },
      },
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Main flame cone under engine nozzles (home Y ~ -2.2)
    const flameGeo = new THREE.ConeGeometry(0.48, 1.9, 32, 8, true);
    this.flameMesh = new THREE.Mesh(flameGeo, this.flameMaterial);
    this.flameMesh.position.y = -3.1;
    this.flameMesh.rotation.x = Math.PI; // Point downwards
    this.masterGroup.add(this.flameMesh);

    // Outer halo glow cone
    const haloGeo = new THREE.ConeGeometry(0.60, 2.3, 24, 6, true);
    const haloMat = this.flameMaterial.clone();
    haloMat.uniforms.uIntensity = { value: 0.06 };
    this.haloMaterial = haloMat;
    this.haloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.haloMesh.position.y = -3.3;
    this.haloMesh.rotation.x = Math.PI;
    this.masterGroup.add(this.haloMesh);
  }

  /* ── Lights ────────────────────────────────────────────── */
  _buildLights() {
    // Flickering point light under engine nozzles lighting hull & ground
    this.thrustLight = new THREE.PointLight(0x1459E8, 1.8, 8);
    this.thrustLight.position.set(0, -3.2, 0);
    this.masterGroup.add(this.thrustLight);

    const thrustLight2 = new THREE.PointLight(0x9FD8FF, 1.2, 5);
    thrustLight2.position.set(0, -4.2, 0);
    this.masterGroup.add(thrustLight2);
  }

  /* ── Main update ───────────────────────────────────────── */
  update(time, intensity = 0.15) {
    if (this.flameMaterial) {
      this.flameMaterial.uniforms.uTime.value = time;
      this.flameMaterial.uniforms.uIntensity.value = intensity;
    }
    if (this.haloMaterial) {
      this.haloMaterial.uniforms.uTime.value = time;
      this.haloMaterial.uniforms.uIntensity.value = intensity * 0.4;
    }

    const flicker = 0.85 + Math.sin(time * 20.0) * 0.15;
    const power = 0.75 + intensity * 0.35;
    if (this.flameMesh) {
      this.flameMesh.scale.set(flicker, power, flicker);
    }
    if (this.haloMesh) {
      this.haloMesh.scale.set(flicker * 0.95, power * 1.1, flicker * 0.95);
    }

    if (this.thrustLight) {
      this.thrustLight.intensity = 1.0 + intensity * 4.0 + Math.sin(time * 24) * 0.8;
    }

    // Record world position of cockpit module for astronaut targeting
    if (this.parts[5]) {
      this.parts[5].group.getWorldPosition(this.cockpitWorldPos);
    }
  }

  getGroup() { return this.masterGroup; }
  getParts() { return this.parts; }
  getCockpitWorldPos() { return this.cockpitWorldPos; }

  dispose() {
    this.masterGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}

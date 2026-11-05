import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Rocket } from './js/rocket.js';
import { Astronaut } from './js/astronaut.js';
import { StarField, GPUExhaustParticles, DockingEffects, ConfettiParticles, CosmicObjects } from './js/particles.js';
import { api } from './js/api.js';
import { showToast, NotificationPanel } from './js/notifications.js';
import { ReadinessTracker } from './js/tracker.js';
import { JobsDashboard } from './js/jobs.js';

// Post-processing imports (ship with three@0.166)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

gsap.registerPlugin(ScrollTrigger);

/* ─── Easing helper ───────────────────────────────────────── */
function power3Out(t) {
  return 1 - Math.pow(1 - t, 3);
}

/* ─── Lerp / Damp helper ─────────────────────────────────── */
function damp(current, target, factor) {
  return current + (target - current) * factor;
}

/* ─── Reduced motion check ───────────────────────────────── */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class PropelScene {
  constructor() {
    this.canvas = document.getElementById('rocket-canvas');
    if (!this.canvas) return;

    // WebGL availability check
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) { console.warn('WebGL not available'); return; }
    } catch (e) { console.warn('WebGL not available'); return; }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.clock = new THREE.Clock();

    // Scroll state
    this.rawScrollProgress = 0;
    this.scrollProgress = 0;    // damped
    this.prevScrollProgress = 0;
    this.scrollVelocity = 0;

    // Mouse state
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetTiltX = 0;
    this.targetTiltZ = 0;
    this.currentTiltX = 0;
    this.currentTiltZ = 0;

    // Camera shake
    this.shakeOffset = new THREE.Vector3();

    // Labels & Docking tracking
    this.labelElements = [];
    this.dockFired = new Array(7).fill(false);
    this.confettiFired = false;

    // Liftoff state
    this.liftoffOffset = 0;

    this.isReady = false;
    this.isMobile = window.innerWidth < 768;

    this.init();
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Camera setup
    this.camera.position.set(0, 0.5, 7);
    this.camera.lookAt(0, 0, 0);

    // ===== LIGHTING =====
    this.scene.add(new THREE.AmbientLight(0x404060, 0.6));

    // Key light — soft white from top-right
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(4, 5, 4);
    this.scene.add(keyLight);

    // Indigo rim light — left/back
    const indigoRim = new THREE.DirectionalLight(0x6C63FF, 0.7);
    indigoRim.position.set(-4, 1, -2);
    this.scene.add(indigoRim);

    // Coral rim light — right/back
    const coralRim = new THREE.DirectionalLight(0xB9D7FF, 1.0);
    coralRim.position.set(4, 1, 1);
    this.scene.add(coralRim);

    // Fill light — soft purple from left
    const fillLight = new THREE.DirectionalLight(0xD9E3FF, 0.5);
    fillLight.position.set(-4, 2, 2);
    this.scene.add(fillLight);

    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.003);

    // ===== ROCKET =====
    this.rocket = new Rocket();
    this.rocketGroup = this.rocket.getGroup();
    this.positionRocket();
    this.scene.add(this.rocketGroup);

    // ===== ASTRONAUT =====
    this.astronaut = new Astronaut(this.scene);

    // ===== PARTICLES & EFFECTS =====
    this.starField = new StarField(this.scene, 2000);
    this.cosmicObjects = new CosmicObjects(this.scene);
    this.exhaust = new GPUExhaustParticles(this.scene, this.rocketGroup);
    this.dockingEffects = new DockingEffects(this.scene);
    this.confetti = new ConfettiParticles(this.scene);

    // If reduced motion, snap all parts to home instantly
    if (prefersReducedMotion) {
      this.rocket.getParts().forEach(part => {
        part.group.position.copy(part.homePos);
        part.group.rotation.copy(part.homeRot);
      });
    }

    // ===== BLOOM POST-PROCESSING =====
    this._setupBloom();

    // ===== LABELS =====
    // Reference rocket uses an uncluttered silhouette without assembly labels.

    // ===== EVENT LISTENERS =====
    this._setupScroll();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    this.isReady = true;
    this.animate();
  }

  /* ── Bloom setup ───────────────────────────────────────── */
  _setupBloom() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.75, // strength
      0.4,  // radius
      0.65  // threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  /* ── Position rocket on the left side, responsive ──────── */
  positionRocket() {
    const w = window.innerWidth;
    this.isMobile = w < 768;

    if (w >= 1200) {
      this.rocketGroup.position.set(-5.4, 0.45, -0.5);
      this.rocketGroup.scale.setScalar(0.78);
    } else if (w >= 768) {
      this.rocketGroup.position.set(-3.7, 0.35, -1.0);
      this.rocketGroup.scale.setScalar(0.72);
    } else {
      // Mobile: centered behind content at 35% opacity
      this.rocketGroup.position.set(-1.8, 0.15, -2.0);
      this.rocketGroup.scale.setScalar(0.48);
    }

    this.baseRocketPos = this.rocketGroup.position.clone();
  }

  /* ── Floating labels ───────────────────────────────────── */
  _createLabels() {
    const parts = this.rocket.getParts();
    const container = document.body;

    parts.forEach((part, i) => {
      const el = document.createElement('div');
      el.className = 'rocket-label';
      el.innerHTML = `<span class="rocket-label-num">${i + 1}</span><span class="rocket-label-text">${part.label}</span>`;
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      container.appendChild(el);
      this.labelElements.push({ el, partIndex: i, visible: false });
    });
  }

  _updateLabels() {
    if (this.isMobile) {
      this.labelElements.forEach(l => { l.el.style.opacity = '0'; });
      return;
    }

    const parts = this.rocket.getParts();
    const progress = this.scrollProgress;

    parts.forEach((part, i) => {
      const labelInfo = this.labelElements[i];
      if (!labelInfo) return;

      // Assembly range 0.00 to 0.90 across 7 parts
      const partStart = i * (0.90 / 7);
      const partEnd = (i + 1) * (0.90 / 7);
      const partProgress = Math.max(0, Math.min(1, (progress - partStart) / (partEnd - partStart)));

      // Show label when part is docking (70%+ of its slot) and hide as scroll advances
      const shouldShow = partProgress >= 0.70 && progress < (partEnd + 0.08) && progress < 0.95;

      if (shouldShow && !labelInfo.visible) {
        labelInfo.visible = true;
        labelInfo.el.style.opacity = '1';
        labelInfo.el.style.transform = 'translateY(0)';
      } else if (!shouldShow && labelInfo.visible) {
        labelInfo.visible = false;
        labelInfo.el.style.opacity = '0';
        labelInfo.el.style.transform = 'translateY(10px)';
      }

      if (shouldShow) {
        const worldPos = new THREE.Vector3();
        part.group.getWorldPosition(worldPos);
        worldPos.x += 1.6;

        const screenPos = worldPos.clone().project(this.camera);
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

        labelInfo.el.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
        labelInfo.el.style.top = `${Math.max(y, 40)}px`;
      }
    });
  }

  /* ── Scroll setup ──────────────────────────────────────── */
  _setupScroll() {
    const updateScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        this.rawScrollProgress = window.pageYOffset / totalHeight;
      }
    };

    window.addEventListener('scroll', updateScroll, { passive: true });
    updateScroll();

    gsap.utils.toArray('.feature-card').forEach((card, i) => {
      gsap.from(card, {
        y: 60, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: card, start: 'top 85%', toggleActions: 'play none none reverse' },
        delay: i * 0.1,
      });
    });
    gsap.utils.toArray('.section-header').forEach(header => {
      gsap.from(header, {
        y: 40, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: header, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });
  }

  /* ── Continuous Scroll Assembly (0% to 90%) ─────────────── */
  _updateRocketAssembly(elapsed) {
    if (prefersReducedMotion) return;

    const parts = this.rocket.getParts();
    const progress = this.scrollProgress;

    // Orbital parameters for floating state of each part before docking
    const orbitParams = [
      { rx: 2.5, ry: 1.4, rz: 1.0, speed: 0.12, offset: 0.0 }, // Engines
      { rx: 3.2, ry: 1.8, rz: 1.2, speed: 0.09, offset: 1.1 }, // Lower Body
      { rx: 2.8, ry: 1.5, rz: 1.5, speed: 0.15, offset: 2.2 }, // Mid Body
      { rx: 3.5, ry: 2.0, rz: 0.8, speed: 0.08, offset: 3.3 }, // Upper Body
      { rx: 2.2, ry: 1.2, rz: 1.4, speed: 0.18, offset: 4.4 }, // Fins
      { rx: 3.8, ry: 2.2, rz: 1.1, speed: 0.10, offset: 5.2 }, // Cockpit
      { rx: 2.9, ry: 1.6, rz: 1.6, speed: 0.14, offset: 6.1 }, // Nose Cone
    ];

    // Global assembly progress scaled across 0.00 to 0.90 page scroll
    const globalT = Math.max(0, Math.min(1.0, progress / 0.90));

    parts.forEach((part, i) => {
      const p = orbitParams[i];
      const partStart = i * (1.0 / 7);
      const partEnd = (i + 1) * (1.0 / 7);

      // Shrunk orbit vector as scroll advances
      const shrink = 1.0 - globalT * 0.8;
      const a = elapsed * p.speed + p.offset;
      const ox = Math.cos(a) * p.rx * shrink;
      const oy = Math.sin(a * 0.7) * p.ry * shrink;
      const oz = Math.sin(a * 1.3) * p.rz * shrink;

      const floatPos = new THREE.Vector3(ox, oy, oz);
      const floatRot = new THREE.Euler(
        (1 - globalT) * (elapsed * 0.12 + i),
        (1 - globalT) * (elapsed * 0.18 + i * 1.5),
        (1 - globalT) * (elapsed * 0.1 + i * 2.0)
      );

      if (globalT < partStart) {
        // Floating before its scroll slot is reached
        part.group.position.copy(floatPos);
        part.group.rotation.copy(floatRot);
        this.dockFired[i] = false;

      } else if (globalT >= partStart && globalT <= partEnd) {
        // Active docking transition as user scrolls through this part's slot
        const localT = (globalT - partStart) / (partEnd - partStart);
        const easedT = power3Out(localT);

        part.group.position.lerpVectors(floatPos, part.homePos, easedT);
        part.group.rotation.x = floatRot.x + (part.homeRot.x - floatRot.x) * easedT;
        part.group.rotation.y = floatRot.y + (part.homeRot.y - floatRot.y) * easedT;
        part.group.rotation.z = floatRot.z + (part.homeRot.z - floatRot.z) * easedT;

        // Overshoot bounce when reaching home
        if (localT > 0.82 && localT < 1.0) {
          const bounce = Math.sin((localT - 0.82) / 0.18 * Math.PI) * 0.08;
          part.group.position.y += bounce;
        }

        // Trigger dock shockwave ring & sparks when docking completes
        if (localT >= 0.85 && !this.dockFired[i]) {
          this.dockFired[i] = true;
          const worldPos = new THREE.Vector3();
          part.group.getWorldPosition(worldPos);
          this.dockingEffects.triggerDock(worldPos);
        }

      } else {
        // Fully docked at home position
        part.group.position.copy(part.homePos);
        part.group.rotation.copy(part.homeRot);
      }
    });

    if (progress < 0.90) {
      this.confettiFired = false;
    } else {
      // Trigger celebration confetti when astronaut reaches cockpit at 90%+
      if (!this.confettiFired) {
        this.confettiFired = true;
        const cockpitPos = this.rocket.getCockpitWorldPos();
        this.confetti.triggerBurst(cockpitPos);
      }
    }
  }

  /* ── Thrust state: IGNITES ONLY AT LAST (90% to 100%) ──────── */
  _updateThrust(elapsed) {
    const progress = this.scrollProgress;
    let intensity = 0.0;

    if (progress < 0.90) {
      // NO engine flame or thrust light while assembling!
      intensity = 0.0;
      if (this.rocket.flameMesh) this.rocket.flameMesh.visible = false;
      if (this.rocket.haloMesh) this.rocket.haloMesh.visible = false;
    } else {
      // Engine thrust ignites ONLY AT THE VERY LAST (90% to 100% at page bottom)!
      const thrustT = (progress - 0.90) / 0.10;
      const velBoost = Math.min(Math.abs(this.scrollVelocity) * 6, 0.35);
      intensity = 0.5 + thrustT * 0.4 + velBoost + Math.sin(elapsed * 10) * 0.08;
      intensity = Math.min(intensity, 1.0);

      if (this.rocket.flameMesh) this.rocket.flameMesh.visible = true;
      if (this.rocket.haloMesh) this.rocket.haloMesh.visible = true;
    }

    this.rocket.update(elapsed, intensity);
    this.exhaust.setIntensity(intensity);
  }

  /* ── Camera shake ──────────────────────────────────────── */
  _updateShake() {
    if (this.scrollProgress > 0.90 && !prefersReducedMotion) {
      const str = Math.min((this.scrollProgress - 0.90) * 3.0, 1.0) * 0.025;
      this.shakeOffset.set(
        (Math.random() - 0.5) * str,
        (Math.random() - 0.5) * str,
        0,
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
  }

  /* ── Liftoff ───────────────────────────────────────────── */
  _updateLiftoff(elapsed) {
    if (this.scrollProgress > 0.92 && !prefersReducedMotion) {
      const liftT = (this.scrollProgress - 0.92) / 0.08;
      const hoverBob = Math.sin(elapsed * 3) * 0.06;
      this.liftoffOffset = power3Out(liftT) * 1.5 + hoverBob;
    } else if (this.scrollProgress > 0.88) {
      this.liftoffOffset = Math.sin(elapsed * 3) * 0.04;
    } else {
      this.liftoffOffset = 0;
    }
  }

  /* ── Resize ────────────────────────────────────────────── */
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.positionRocket();
  }

  /* ── Mobile opacity ────────────────────────────────────── */
  _updateMobileOpacity() {
    if (!this.isMobile) return;
    this.rocketGroup.traverse(child => {
      if (child.isMesh && child.material && child.material.transparent) {
        child.material.opacity = Math.min(child.material.opacity, 0.35);
      }
    });
  }

  /* ── Main animation loop ───────────────────────────────── */
  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Damp scroll progress (~0.08 damping)
    this.prevScrollProgress = this.scrollProgress;
    this.scrollProgress = damp(this.scrollProgress, this.rawScrollProgress, 0.08);
    this.scrollVelocity = this.scrollProgress - this.prevScrollProgress;

    // Mouse parallax tilt
    this.targetTiltX = this.mouseY * 0.08;
    this.targetTiltZ = -this.mouseX * 0.06;
    this.currentTiltX = damp(this.currentTiltX, this.targetTiltX, 0.05);
    this.currentTiltZ = damp(this.currentTiltZ, this.targetTiltZ, 0.05);

    // === ASSEMBLY & FLOATING ===
    this._updateRocketAssembly(elapsed);

    // Rocket master tilt & slow Y rotation when assembled at bottom
    if (this.scrollProgress > 0.90 && !prefersReducedMotion) {
      this.rocketGroup.rotation.y = 0.3 + Math.sin(elapsed*.15)*.08;
    } else {
      this.rocketGroup.rotation.y = 0.3;
    }
    this.rocketGroup.rotation.x = this.currentTiltX;
    this.rocketGroup.rotation.z = this.currentTiltZ;

    // === ASTRONAUT UPDATE ===
    const cockpitPos = this.rocket.getCockpitWorldPos();
    const cockpitPartWorldPos = new THREE.Vector3();
    if (this.rocket.getParts()[5]) {
      this.rocket.getParts()[5].group.getWorldPosition(cockpitPartWorldPos);
    }
    this.astronaut.update(elapsed, this.scrollProgress, cockpitPos, cockpitPartWorldPos);

    // === THRUST & LIFTOFF ===
    this._updateThrust(elapsed);
    this._updateLiftoff(elapsed);
    if (this.baseRocketPos) {
      this.rocketGroup.position.y = this.baseRocketPos.y + this.liftoffOffset;
    }

    // === CAMERA SHAKE ===
    this._updateShake();

    // === PARTICLES & DOCKING EFFECTS ===
    this.starField.update(elapsed, this.scrollProgress);
    this.exhaust.update(delta);
    this.dockingEffects.update(delta);
    this.confetti.update(delta);
    this.cosmicObjects.update(elapsed);

    // === MOBILE OPACITY ===
    this._updateMobileOpacity();

    // === LABELS ===


    // === CAMERA ===
    const baseCamY = 0.5;
    this.camera.position.set(
      this.shakeOffset.x,
      baseCamY + this.shakeOffset.y,
      7 + this.shakeOffset.z,
    );
    this.camera.lookAt(
      this.rocketGroup.position.x * 0.25,
      this.rocketGroup.position.y * 0.15,
      0
    );

    // === RENDER ===
    this.composer.render();
  }
}

class PropelApp {
  constructor() { this.init(); }
  init() {
    this.scene = new PropelScene();
    this.notifPanel = new NotificationPanel();
    this.tracker = new ReadinessTracker();
    this.jobs = new JobsDashboard(this.notifPanel);
    this.setupNav(); this.setupAuth(); this.setupContactForm(); this.setupScrollProgress(); this.animateCounters();
    setTimeout(() => { showToast({ title: 'Welcome to Propel! 🚀', message: 'Track your readiness, discover jobs, and launch your career.', type: 'info', icon: '🌟', duration: 5000 }); }, 2000);
  }
  setupNav() {
    const nav = document.getElementById('main-nav'); const mt = document.getElementById('mobile-menu-toggle'); const mm = document.getElementById('mobile-menu');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) nav?.classList.add('scrolled'); else nav?.classList.remove('scrolled');
      const sections = document.querySelectorAll('.section'); let current = '';
      sections.forEach(s => { if (window.scrollY >= s.offsetTop - 200) current = s.id; });
      document.querySelectorAll('.nav-link').forEach(l => { l.classList.remove('active'); if (l.dataset.section === current) l.classList.add('active'); });
    });
    mt?.addEventListener('click', () => mm?.classList.toggle('hidden'));
    document.querySelectorAll('.mobile-link').forEach(l => l.addEventListener('click', () => mm?.classList.add('hidden')));
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const href=a.getAttribute('href'); (href==='#'?document.getElementById('hero'):document.querySelector(href))?.scrollIntoView({ behavior: 'smooth' }); }));
    document.getElementById('btn-get-started')?.addEventListener('click', () => document.getElementById('tracker')?.scrollIntoView({ behavior: 'smooth' }));
    document.getElementById('btn-explore')?.addEventListener('click', () => document.getElementById('jobs')?.scrollIntoView({ behavior: 'smooth' }));
  }
  setupAuth() {
    const modal = document.getElementById('auth-modal'); const loginBtn = document.getElementById('btn-login');
    const closeBtn = document.getElementById('auth-modal-close'); const overlay = modal?.querySelector('.modal-overlay');
    const open = () => { modal?.classList.remove('hidden'); document.getElementById('mobile-menu')?.classList.add('hidden'); };
    const close = () => modal?.classList.add('hidden');
    loginBtn?.addEventListener('click', () => { if(api.isLoggedIn()) { api.logout(); return; } open(); });
    const updateAuth=()=>{if(loginBtn)loginBtn.textContent=api.isLoggedIn()?'Sign out':'Sign In';};
    window.addEventListener('propel-auth',updateAuth); updateAuth(); document.getElementById('mobile-login')?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close); overlay?.addEventListener('click', close);
    document.getElementById('show-register')?.addEventListener('click', e => { e.preventDefault(); document.getElementById('auth-login-view')?.classList.add('hidden'); document.getElementById('auth-register-view')?.classList.remove('hidden'); });
    document.getElementById('show-login')?.addEventListener('click', e => { e.preventDefault(); document.getElementById('auth-register-view')?.classList.add('hidden'); document.getElementById('auth-login-view')?.classList.remove('hidden'); });
    document.getElementById('login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.login(document.getElementById('login-username').value, document.getElementById('login-password').value); close(); showToast({ title:'Welcome back! 🎉', message:'Signed in successfully', type:'success', icon:'👋' }); }
      catch(err) { showToast({ title:'Login Failed', message:err.message||err.error||'Invalid credentials', type:'error', icon:'❌' }); }
    });
    document.getElementById('register-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.register(document.getElementById('register-username').value, document.getElementById('register-email').value, document.getElementById('register-password').value, document.getElementById('register-goal').value); close(); showToast({ title:'Account Created! 🌟', message:'Welcome to Propel!', type:'success', icon:'🚀' }); }
      catch(err) { showToast({ title:'Registration Failed', message:err.message||err.error||'Something went wrong', type:'error', icon:'❌' }); }
    });
  }
  setupContactForm() {
    document.getElementById('contact-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api.sendContact(document.getElementById('contact-name').value, document.getElementById('contact-email').value, document.getElementById('contact-subject').value, document.getElementById('contact-message').value); }
      catch(err) { showToast({title:'Message not sent',message:err.message,type:'error'});return; }
      showToast({ title:'Message Sent! 📨', message:'We\'ll get back to you soon.', type:'success', icon:'✅' }); e.target.reset();
    });
  }
  setupScrollProgress() {
    const bar = document.getElementById('scroll-progress-bar');
    window.addEventListener('scroll', () => { const p = (window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100; if (bar) bar.style.width = `${p}%`; });
  }
  animateCounters() {
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { this.countUp(entry.target, parseInt(entry.target.dataset.target)); observer.unobserve(entry.target); } }); }, { threshold: 0.5 });
    document.querySelectorAll('.stat-number').forEach(c => observer.observe(c));
  }
  countUp(el, target) {
    const step = target / 125; let current = 0;
    const tick = () => { current += step; if (current >= target) { el.textContent = target.toLocaleString(); return; } el.textContent = Math.floor(current).toLocaleString(); requestAnimationFrame(tick); };
    tick();
  }
}

document.addEventListener('DOMContentLoaded', () => new PropelApp());

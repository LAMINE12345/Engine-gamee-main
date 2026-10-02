// ---------------------------------------------------------------------------
// Runtime module
// ---------------------------------------------------------------------------

/** Substitutions du corps runtime. */
export interface RuntimeFlags {
  /** includeSound — synthétiseur audio activé. */
  sound: boolean;
  /** Projet avec GLB embarqué → import GLTFLoader. */
  gltf: boolean;
}

/** Lignes d'import en tête du module (three toujours, GLTFLoader si GLB). */
export function runtimeHeader(hasGltf: boolean): string {
  const lines = ["import * as THREE from 'three';"];
  if (hasGltf) {
    lines.push("import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';");
  }
  return lines.join('\n');
}

/**
 * Corps complet du runtime de jeu (module script).
 *
 * Contraintes de génération : pas de backticks ni de ${ littéraux dans le
 * source runtime (tout le corps est un template literal TS) ; GLSL en
 * chaînes monilignes sans antislash.
 */
export function runtimeBody(flags: RuntimeFlags): string {
  const glbLoadCode = flags.gltf
    ? `
    try {
      const bin = atob(projectData.gltf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
      gltf.scene.traverse((o) => {
        const id = o.userData && o.userData.__aetherId;
        if (id) glbIndex.set(id, o);
      });
      scene.add(gltf.scene);
    } catch (err) {
      console.warn('[Aether] Chargement GLB echoue, reconstruction JSON :', err);
      glbIndex.clear();
    }
    delete projectData.gltf;`
    : '';

  return `    const SOUND_ENABLED = ${flags.sound ? 'true' : 'false'};

    // =====================================================================
    // 1. Synthetiseur audio procédural (Web Audio)
    // =====================================================================
    class SoundSynth {
      static ctx = null;

      static getContext() {
        if (!SOUND_ENABLED) return null;
        if (!SoundSynth.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          SoundSynth.ctx = new AC();
        }
        if (SoundSynth.ctx.state === 'suspended') SoundSynth.ctx.resume();
        return SoundSynth.ctx;
      }

      static blip(type, f0, f1, dur, vol, when, stepTime) {
        const ctx = SoundSynth.ctx;
        const t = ctx.currentTime + (when || 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t);
        if (stepTime) osc.frequency.setValueAtTime(f1, t + stepTime);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.03);
      }

      static play(preset) {
        if (!SOUND_ENABLED || !preset || preset === 'none') return;
        try {
          if (!SoundSynth.getContext()) return;
          switch (preset) {
            case 'coin':
              SoundSynth.blip('triangle', 987.77, 1318.51, 0.35, 0.3, 0, 0.08);
              break;
            case 'gem':
              SoundSynth.blip('sine', 1318.51, 1975.53, 0.4, 0.28, 0, 0.1);
              break;
            case 'powerup':
              SoundSynth.blip('square', 440, 880, 0.45, 0.2, 0);
              SoundSynth.blip('triangle', 880, 1320, 0.3, 0.18, 0.18);
              break;
            case 'jump':
              SoundSynth.blip('sine', 150, 450, 0.2, 0.3, 0);
              break;
            case 'damage':
            case 'hit':
              SoundSynth.blip('sawtooth', 220, 60, 0.22, 0.35, 0);
              break;
            case 'hurt':
              SoundSynth.blip('square', 300, 90, 0.3, 0.28, 0);
              break;
            case 'explosion':
              SoundSynth.blip('sawtooth', 180, 30, 0.5, 0.4, 0);
              SoundSynth.blip('triangle', 90, 40, 0.4, 0.3, 0.05);
              break;
            case 'chime':
              SoundSynth.blip('sine', 880, 880, 0.25, 0.25, 0);
              SoundSynth.blip('sine', 1320, 1320, 0.3, 0.22, 0.12);
              break;
            case 'checkpoint':
              SoundSynth.blip('triangle', 660, 1320, 0.5, 0.28, 0);
              break;
            case 'alarm':
              SoundSynth.blip('square', 880, 440, 0.18, 0.25, 0);
              SoundSynth.blip('square', 880, 440, 0.18, 0.25, 0.22);
              SoundSynth.blip('square', 880, 440, 0.18, 0.25, 0.44);
              break;
            case 'warp':
              SoundSynth.blip('sine', 200, 1200, 0.4, 0.28, 0);
              break;
            default:
              SoundSynth.blip('sine', 660, 880, 0.12, 0.2, 0);
          }
        } catch (e) {
          console.warn('[Aether] audio:', e);
        }
      }
    }

    // =====================================================================
    // 2. Données du projet
    // =====================================================================
    const projectData = JSON.parse(document.getElementById('aether-project-data').textContent);
    const container = document.getElementById('game-container');
    const nodes = projectData.nodes || [];
    const env = projectData.environment || {};
    const atmo = projectData.atmosphere || null;

    // =====================================================================
    // 3. Scene / camera / renderer
    // =====================================================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color((atmo && atmo.fog && atmo.fog.color) || env.backgroundColor || '#0c0e14');
    if (atmo && atmo.fog && atmo.fog.enabled) {
      scene.fog = new THREE.FogExp2(atmo.fog.color || '#0c0e14', atmo.fog.density || 0.015);
    }

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // =====================================================================
    // 4. Lumieres & ciel (atmosphere exportée, sinon repli environment)
    // =====================================================================
    const ambient = new THREE.AmbientLight(
      (atmo && atmo.ambientColor) || '#ffffff',
      (atmo && atmo.ambientIntensity) !== undefined ? atmo.ambientIntensity : (env.ambientIntensity ?? 0.75)
    );
    scene.add(ambient);

    const sunPos = (atmo && atmo.sunPosition) || env.sunPosition || { x: 12, y: 20, z: 10 };
    const sun = new THREE.DirectionalLight(
      (atmo && atmo.sunColor) || '#fff8eb',
      (atmo && atmo.sunIntensity) !== undefined ? atmo.sunIntensity : (env.sunIntensity ?? 2.2)
    );
    sun.position.set(sunPos.x, sunPos.y, sunPos.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    if (atmo) {
      const skyGeo = new THREE.SphereGeometry(400, 32, 24);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(atmo.skyTopColor || '#0284c7') },
          bottomColor: { value: new THREE.Color(atmo.skyBottomColor || '#38bdf8') },
        },
        vertexShader: 'varying vec3 vWorldPosition; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorldPosition; void main() { float h = normalize(vWorldPosition).y; gl_FragColor = vec4(mix(bottomColor, topColor, max(0.0, h)), 1.0); }'
      });
      scene.add(new THREE.Mesh(skyGeo, skyMat));
    }

    // =====================================================================
    // 5. Terrain (option includeTerrain) + sol plat de repli
    // =====================================================================
    const terrainCfg = projectData.terrain && projectData.terrain.config;
    const hasTerrain = Boolean(terrainCfg && terrainCfg.enabled !== false);
    let terrainMesh = null;
    let terrainHeights = hasTerrain ? (projectData.terrain.heightmap || null) : null;
    const terrainSize = hasTerrain ? (terrainCfg.size || 60) : 60;
    const terrainRes = hasTerrain ? (terrainCfg.resolution || 64) : 64;

    if (hasTerrain) {
      const tGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainRes, terrainRes);
      tGeo.rotateX(-Math.PI / 2);
      const pos = tGeo.attributes.position;
      const col = new Float32Array(pos.count * 3);

      const grass = new THREE.Color((terrainCfg.colors && terrainCfg.colors.grass) || '#3d7a36');
      const rock = new THREE.Color((terrainCfg.colors && terrainCfg.colors.rock) || '#52525b');
      const sand = new THREE.Color((terrainCfg.colors && terrainCfg.colors.sand) || '#d4b483');

      for (let i = 0; i < pos.count; i++) {
        let h;
        if (terrainHeights && terrainHeights[i] !== undefined) {
          h = terrainHeights[i];
        } else {
          const vx = pos.getX(i);
          const vz = pos.getZ(i);
          h = Math.sin(vx * 0.08) * Math.cos(vz * 0.08) * 3.5 + Math.sin(vx * 0.2) * 1.0;
        }
        pos.setY(i, h);
        const tempCol = h < 0.3 ? sand : (h > 4.5 ? rock : grass);
        col[i * 3] = tempCol.r;
        col[i * 3 + 1] = tempCol.g;
        col[i * 3 + 2] = tempCol.b;
      }

      tGeo.computeVertexNormals();
      tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

      const tMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        flatShading: true,
      });

      terrainMesh = new THREE.Mesh(tGeo, tMat);
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
    } else {
      const gGeo = new THREE.PlaneGeometry(400, 400);
      gGeo.rotateX(-Math.PI / 2);
      const gMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 1 });
      const ground = new THREE.Mesh(gGeo, gMat);
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);
    }

    function getTerrainHeight(x, z) {
      if (!terrainMesh) return 0;
      const half = terrainSize / 2;
      const gx = Math.floor(((x + half) / terrainSize) * terrainRes);
      const gz = Math.floor(((z + half) / terrainSize) * terrainRes);
      if (gx < 0 || gx >= terrainRes || gz < 0 || gz >= terrainRes) return 0;
      const idx = gz * (terrainRes + 1) + gx;
      return terrainHeights && terrainHeights[idx] !== undefined ? terrainHeights[idx] : 0;
    }

    // =====================================================================
    // 6. GLB embarqué (geometrie exacte) — index par __aetherId
    // =====================================================================
    const glbIndex = new Map();${glbLoadCode}

    // =====================================================================
    // 7. Reconstruction des noeuds
    // =====================================================================
    const byId = new Map();
    const byIdObj = new Map();
    nodes.forEach((n) => { if (n.id) byId.set(n.id, n); });

    // Sous-types éditeur : visibles dans l'éditeur, inexistants dans le jeu.
    const HIDE_SUBTYPES = { camera: 1, triggerVolume: 1, postProcessVolume: 1, helper: 1 };
    const entities = [];
    let playerObj = null;

    function composeLocal(t) {
      const m = new THREE.Matrix4();
      const e = new THREE.Euler(
        (t.rotation.x * Math.PI) / 180,
        (t.rotation.y * Math.PI) / 180,
        (t.rotation.z * Math.PI) / 180,
        'XYZ'
      );
      m.compose(
        new THREE.Vector3(t.position.x, t.position.y, t.position.z),
        new THREE.Quaternion().setFromEuler(e),
        new THREE.Vector3(t.scale.x, t.scale.y, t.scale.z)
      );
      return m;
    }

    function worldMatrixOf(n) {
      const m = composeLocal(n.transform);
      let p = n.parentId ? byId.get(n.parentId) : null;
      let guard = 0;
      while (p && guard++ < 64) {
        m.premultiply(composeLocal(p.transform));
        p = p.parentId ? byId.get(p.parentId) : null;
      }
      return m;
    }

    function makePrimitive(n) {
      const st = n.subType || '';
      let geo;
      if (st === 'sphere') geo = new THREE.SphereGeometry(0.5, 32, 24);
      else if (st === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      else if (st === 'torus') geo = new THREE.TorusGeometry(0.5, 0.2, 16, 32);
      else if (st === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 24);
      else if (st === 'player') geo = new THREE.CapsuleGeometry(0.35, 0.9, 12, 16);
      else geo = new THREE.BoxGeometry(1, 1, 1);

      const mat = new THREE.MeshStandardMaterial({
        color: (n.material && n.material.color) || '#38bdf8',
        roughness: n.material && n.material.roughness !== undefined ? n.material.roughness : 0.4,
        metalness: n.material && n.material.metalness !== undefined ? n.material.metalness : 0.1,
        emissive: (n.material && n.material.emissive) || '#000000',
        emissiveIntensity: (n.material && n.material.emissiveIntensity) || 0,
      });
      if (n.material && n.material.transparent) {
        mat.transparent = true;
        mat.opacity = n.material.opacity !== undefined ? n.material.opacity : 1;
      }
      if (n.material && n.material.wireframe) mat.wireframe = true;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = n.castShadow !== false;
      mesh.receiveShadow = n.receiveShadow !== false;
      return mesh;
    }

    function makeLight(n) {
      const L = n.light || {};
      const st = n.subType || 'point';
      if (st === 'spot') {
        const sl = new THREE.SpotLight(L.color || '#ffffff', L.intensity !== undefined ? L.intensity : 3, L.distance || 0);
        sl.angle = 0.6;
        sl.penumbra = 0.5;
        sl.target.position.set(0, 0, -1);
        sl.add(sl.target);
        return sl;
      }
      if (st === 'directional') {
        return new THREE.DirectionalLight(L.color || '#fff8eb', L.intensity !== undefined ? L.intensity : 2);
      }
      return new THREE.PointLight(L.color || '#ffffff', L.intensity !== undefined ? L.intensity : 2, L.distance || 20);
    }

    nodes.forEach((n) => {
      if (!n.transform) return;
      let obj = null;
      let fromGLB = false;

      if (n.id && glbIndex.has(n.id)) {
        obj = glbIndex.get(n.id);
        fromGLB = true;
      } else if (n.type === 'mesh') {
        obj = makePrimitive(n);
      } else if (n.type === 'group') {
        obj = new THREE.Group();
      } else if (n.type === 'light') {
        obj = makeLight(n);
      } else {
        return; // type camera/helper sans GLB : rien a afficher
      }

      if (!fromGLB) {
        const wm = worldMatrixOf(n);
        wm.decompose(obj.position, obj.quaternion, obj.scale);
        scene.add(obj);
      }

      if (HIDE_SUBTYPES[n.subType] || n.type === 'helper' || n.type === 'camera') {
        obj.visible = false;
      }
      if (n.visible === false) obj.visible = false;

      obj.userData = {
        name: n.name || '',
        logic: n.logic || null,
        subType: n.subType || '',
        baseLocal: obj.position.clone(),
        baseScale: obj.scale.clone(),
        state: {},
      };
      entities.push(obj);
      if (n.id) byIdObj.set(n.id, obj);
      if (n.subType === 'player') playerObj = obj;
    });

    if (!playerObj) {
      playerObj = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.9, 12, 16),
        new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.2 })
      );
      playerObj.position.set(0, 1.5, 0);
      playerObj.castShadow = true;
      scene.add(playerObj);
      entities.push(playerObj);
    }
    const playerStart = playerObj.position.clone();

    // =====================================================================
    // 8. Etat de jeu, HUD, toasts
    // =====================================================================
    const gameState = { Health: 100, Score: 0, Coins: 0, checkpoint: null, deathAt: 0 };

    function updateHUD() {
      const hpFill = document.getElementById('hud-hp-fill');
      if (hpFill) hpFill.style.width = Math.max(0, Math.min(100, gameState.Health)) + '%';
      const hpVal = document.getElementById('hud-hp-val');
      if (hpVal) hpVal.textContent = Math.round(gameState.Health) + '/100';
      const scoreVal = document.getElementById('hud-score-val');
      if (scoreVal) scoreVal.textContent = String(gameState.Score);
      const coinVal = document.getElementById('hud-coin-val');
      if (coinVal) coinVal.textContent = String(gameState.Coins);
    }

    let toastTimer = 0;
    function showToast(msg) {
      const el = document.getElementById('msg-toast');
      if (!el || !msg) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    updateHUD();

    // =====================================================================
    // 9. Entrees, camera orbitale, pause
    // =====================================================================
    const keys = {};
    let paused = false;
    let isDragging = false;
    const prevMouse = { x: 0, y: 0 };
    const cameraAngle = { yaw: 0, pitch: 0.35 };

    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
          e.code === 'KeyZ' || e.code === 'KeyQ' || e.code === 'Space') {
        SoundSynth.getContext();
      }
      if (e.code === 'Escape') {
        paused = !paused;
        const p = document.getElementById('pause-screen');
        if (p) p.style.display = paused ? 'flex' : 'none';
      }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        paused = false;
        const p = document.getElementById('pause-screen');
        if (p) p.style.display = 'none';
      });
    }

    window.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouse.x = e.clientX;
      prevMouse.y = e.clientY;
      SoundSynth.getContext();
    });
    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        cameraAngle.yaw -= dx * 0.005;
        cameraAngle.pitch = Math.max(0.1, Math.min(1.4, cameraAngle.pitch + dy * 0.005));
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    // =====================================================================
    // 10. Helpers spatiaux + cartes de comportement
    // =====================================================================
    const _wp = new THREE.Vector3();
    const _v1 = new THREE.Vector3();
    const _v2 = new THREE.Vector3();
    const _v3 = new THREE.Vector3();
    const _v4 = new THREE.Vector3();
    const _burnColor = new THREE.Color('#1c1917');

    function wpOf(o, out) {
      o.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(o.matrixWorld);
    }

    function volumeContains(ent, cfg, p) {
      const c = wpOf(ent, _v3);
      if ((cfg.shape || 'box') === 'sphere') {
        return _v4.subVectors(p, c).length() <= (cfg.radius || 3);
      }
      const hs = cfg.size || { x: 2, y: 2, z: 2 };
      const d = _v4.subVectors(p, c);
      return Math.abs(d.x) <= hs.x / 2 && Math.abs(d.y) <= hs.y / 2 && Math.abs(d.z) <= hs.z / 2;
    }

    function igniteFlammable(ent) {
      const st = ent.userData.state;
      if (st.burnPhase) return;
      st.burnPhase = 'burning';
      st.burnT = 0;
      st.spreadDone = false;
    }

    function runCards(ent, dt, now, playerWp) {
      const st = ent.userData.state;
      const cards = (ent.userData.logic && ent.userData.logic.cards) || [];

      for (const c of cards) {
        if (!c || c.enabled === false) continue;
        const cfg = c.config || {};

        switch (c.type) {
          // --- Collectable : rotation + hover + ramassage + respawn ---------
          case 'Collectable': {
            ent.rotation.y += THREE.MathUtils.degToRad(Number(cfg.rotateSpeed ?? 60)) * dt;
            ent.position.y =
              st.baseLocal.y +
              Math.sin(now * 0.001 * Number(cfg.hoverSpeed ?? 2)) * Number(cfg.hoverAmplitude ?? 0.25);
            if (st.taken) {
              if (st.respawnAt && now >= st.respawnAt) {
                st.taken = false;
                st.respawnAt = 0;
                ent.visible = true;
              }
              break;
            }
            if (!ent.visible) break;
            if (wpOf(ent, _v1).distanceTo(playerWp) < 1.4) {
              st.taken = true;
              ent.visible = false;
              gameState.Score += Number(cfg.scoreValue ?? 100);
              gameState.Coins += 1;
              if (cfg.soundPreset && cfg.soundPreset !== 'none') SoundSynth.play(cfg.soundPreset);
              updateHUD();
              const rt = Number(cfg.respawnTime ?? 0);
              if (rt > 0) st.respawnAt = now + rt * 1000;
            }
            break;
          }

          // --- Patrol : va-et-vient avec pause aux extremites ---------------
          case 'Patrol': {
            const axis = cfg.axis || 'x';
            const dist = Math.max(0.1, Number(cfg.distance ?? 6));
            const speed = Math.max(0.01, Number(cfg.speed ?? 2.5));
            if (!st.pat) st.pat = { s: dist / 2, dir: -1, wait: 0 };
            const pat = st.pat;
            if (pat.wait > 0) {
              pat.wait -= dt;
            } else {
              pat.s += pat.dir * speed * dt;
              if (pat.s >= dist) {
                pat.s = dist;
                if (cfg.pingPong === false) pat.s = 0;
                else { pat.dir = -1; pat.wait = Number(cfg.waitTime || 0); }
              } else if (pat.s <= 0) {
                pat.s = 0;
                pat.dir = 1;
                pat.wait = Number(cfg.waitTime || 0);
              }
            }
            ent.position[axis] = st.baseLocal[axis] + pat.s - dist / 2;
            break;
          }

          // --- TriggerZone : action a l'entree ------------------------------
          case 'TriggerZone': {
            const radius = Number(cfg.radius ?? 3);
            const cWp = wpOf(ent, _v1);
            const inside = cWp.distanceTo(playerWp) < radius;
            const latchKey = 'tzLatch_' + c.id;
            const everKey = 'tzEver_' + c.id;

            if (inside && !st[latchKey]) {
              st[latchKey] = true;
              if (cfg.repeatable || !st[everKey]) {
                st[everKey] = true;
                const act = cfg.action || 'PlaySound';
                if (act === 'PlaySound') {
                  if (cfg.soundPreset && cfg.soundPreset !== 'none') SoundSynth.play(cfg.soundPreset);
                } else if (act === 'ShowMessage') {
                  showToast(cfg.message || '');
                } else if (act === 'ChangeColor') {
                  const mat = ent.material;
                  if (mat && mat.emissive && st.flashT === undefined) {
                    st.em0 = { r: mat.emissive.r, g: mat.emissive.g, b: mat.emissive.b };
                    st.flashT = 0.5;
                  }
                } else if (act === 'EmitPulse') {
                  st.pulse = 1;
                }
              }
            }
            if (!inside) st[latchKey] = false;

            if (st.flashT !== undefined && st.flashT > 0) {
              st.flashT -= dt;
              const mat = ent.material;
              if (mat && mat.emissive) {
                if (st.flashT > 0) {
                  mat.emissive.setRGB(0.22, 0.75, 0.97);
                } else if (st.em0) {
                  mat.emissive.setRGB(st.em0.r, st.em0.g, st.em0.b);
                  st.flashT = undefined;
                }
              }
            }
            if (st.pulse !== undefined && st.pulse > 0) {
              st.pulse = Math.max(0, st.pulse - dt * 1.5);
              ent.scale.copy(st.baseScale).multiplyScalar(1 + 0.25 * st.pulse);
              if (st.pulse === 0) ent.scale.copy(st.baseScale);
            }
            break;
          }

          // --- DamageOnTouch : degats + recul + cooldown ---------------------
          case 'DamageOnTouch': {
            const cd = Number(cfg.cooldown ?? 1) * 1000;
            if (st.dmgAt !== undefined && now - st.dmgAt < cd) break;
            if (wpOf(ent, _v1).distanceTo(playerWp) > 1.3) break;
            st.dmgAt = now;
            gameState.Health = Math.max(0, gameState.Health - Number(cfg.damage ?? 10));
            if (cfg.soundPreset && cfg.soundPreset !== 'none') SoundSynth.play(cfg.soundPreset);
            if (Number(cfg.knockbackForce ?? 0) > 0) {
              _v2.subVectors(playerWp, _v1).normalize();
              playerObj.position.addScaledVector(_v2, Number(cfg.knockbackForce) * 0.2);
            }
            updateHUD();
            break;
          }

          // --- WindZone : poussee du joueur (directionnel / vortex / updraft) -
          case 'WindZone': {
            const radius = Number(cfg.radius ?? 5);
            if (radius <= 0) break;
            const cWp = wpOf(ent, _v1);
            const d = cWp.distanceTo(playerWp);
            if (d >= radius) break;
            const f = Number(cfg.force ?? 5) * (1 - d / radius);
            const mode = cfg.mode || 'directional';
            if (mode === 'updraft') {
              playerVelocityY = Math.max(playerVelocityY, f);
            } else if (mode === 'vortex') {
              _v2.subVectors(playerWp, cWp);
              _v2.y = 0;
              if (_v2.lengthSq() > 1e-4) {
                _v2.normalize();
                _v3.set(-_v2.z, 0, _v2.x);
                playerObj.position.addScaledVector(_v3, f * dt * 0.8);
              }
            } else {
              const dir = cfg.direction || { x: 0, y: 0, z: 1 };
              _v2.set(dir.x, dir.y, dir.z);
              if (_v2.lengthSq() > 1e-6) {
                _v2.normalize();
                playerObj.position.addScaledVector(_v2, f * dt);
              }
            }
            break;
          }

          // --- Flammable : combustion, propagation, degats -------------------
          case 'Flammable': {
            if (st.burnPhase === undefined) {
              if (cfg.autoIgniteOnStart) igniteFlammable(ent);
              break;
            }
            if (st.burnPhase !== 'burning') break;
            st.burnT += dt;
            const dur = Math.max(0.1, Number(cfg.burnDuration ?? 2));
            const k = Math.min(1, st.burnT / dur);
            const mat = ent.material;
            if (mat && mat.color) {
              if (!st.c0) st.c0 = mat.color.clone();
              mat.color.copy(st.c0).lerp(_burnColor, k);
              if (mat.emissive) {
                mat.emissive.setRGB(0.55 * k, 0.12 * k, 0);
                mat.emissiveIntensity = 1;
              }
            }
            if (!st.spreadDone && st.burnT > 0.5) {
              st.spreadDone = true;
              const sr = Number(cfg.spreadRadius ?? 0);
              if (sr > 0) {
                const cWp = wpOf(ent, _v1);
                for (const other of entities) {
                  if (other === ent) continue;
                  const oc = other.userData.logic && other.userData.logic.cards;
                  if (!oc || !oc.some((x) => x.type === 'Flammable' && x.enabled !== false)) continue;
                  if (other.userData.state.burnPhase) continue;
                  if (wpOf(other, _v2).distanceTo(cWp) <= sr) igniteFlammable(other);
                }
              }
            }
            if (Number(cfg.burnDamage ?? 0) > 0) {
              const bcd = 1000;
              if (st.burnDmgAt === undefined || now - st.burnDmgAt >= bcd) {
                if (wpOf(ent, _v1).distanceTo(playerWp) < 1.3) {
                  st.burnDmgAt = now;
                  gameState.Health = Math.max(0, gameState.Health - Number(cfg.burnDamage));
                  updateHUD();
                }
              }
            }
            break;
          }

          // --- WeatherListener : pas de meteo dans le runtime exporte --------
          case 'WeatherListener':
            break;

          // --- Buoyant : flotaison decorative autour de la position d'origine -
          case 'Buoyant': {
            const mul = Math.min(2, Math.max(0, Number(cfg.buoyancyMultiplier ?? 1)));
            ent.position.y = st.baseLocal.y + Math.sin(now * 0.0015) * 0.15 * mul;
            break;
          }

          // --- NavMeshAgent : poursuite en ligne droite (pas de navmesh hors-
          //     ligne : water/avoid ignores, distance d'arret respectee) ------
          case 'NavMeshAgent': {
            let target;
            if ((cfg.targetType || 'Player') === 'Position' && cfg.targetPosition) {
              target = _v2.set(cfg.targetPosition.x, cfg.targetPosition.y, cfg.targetPosition.z);
            } else if (cfg.targetType === 'Entity' && cfg.targetEntityId && byIdObj.has(cfg.targetEntityId)) {
              target = wpOf(byIdObj.get(cfg.targetEntityId), _v2);
            } else {
              target = _v2.copy(playerWp);
            }
            const cWp = wpOf(ent, _v1);
            const stop = Number(cfg.stoppingDistance ?? 1.5);
            const d = cWp.distanceTo(target);
            if (d > stop) {
              _v3.subVectors(target, cWp).normalize();
              const step = Math.min(Number(cfg.speed ?? 2.5) * dt, d - stop);
              ent.position.addScaledVector(_v3, step);
              ent.rotation.y = Math.atan2(_v3.x, _v3.z);
            }
            break;
          }

          // --- TriggerVolume : checkpoint / teleport / piege -----------------
          case 'TriggerVolume': {
            if (!volumeContains(ent, cfg, playerWp)) break;
            const cd = Number(cfg.cooldown ?? 1) * 1000;
            const repeatable = cfg.repeatable !== false;
            const canFire = repeatable
              ? (st.tvAt === undefined ? -1e9 : st.tvAt) + cd <= now
              : !st.tvDone;
            if (!canFire) break;
            st.tvAt = now;
            if (!repeatable) st.tvDone = true;

            const act = cfg.actionType || 'custom';
            if (cfg.triggerMessage) showToast(cfg.triggerMessage);
            if (cfg.soundPreset && cfg.soundPreset !== 'none') SoundSynth.play(cfg.soundPreset);

            if (act === 'checkpoint') {
              gameState.checkpoint = {
                x: playerObj.position.x,
                y: playerObj.position.y,
                z: playerObj.position.z,
              };
              showToast(cfg.checkpointName || 'Point de sauvegarde atteint');
            } else if (act === 'teleport' && cfg.teleportDestination) {
              const dest = cfg.teleportDestination;
              playerObj.position.set(dest.x, dest.y, dest.z);
              playerVelocityY = 0;
            } else if (act === 'cinematic') {
              showToast(cfg.cinematicText || 'Cinematique');
            } else if (act === 'trap') {
              gameState.Health = Math.max(0, gameState.Health - Number(cfg.trapDamage ?? 20));
              if (Number(cfg.trapKnockback ?? 0) > 0) {
                _v1.copy(playerObj.position);
                _v2.subVectors(_v1, wpOf(ent, _v3)).normalize();
                playerObj.position.addScaledVector(_v2, Number(cfg.trapKnockback) * 0.2);
              }
              SoundSynth.play('explosion');
              updateHUD();
            } else if (act === 'custom') {
              showToast(cfg.triggerMessage || 'Declenche');
            }
            break;
          }

          // --- PostProcessVolume : traite dans applyPostProcess --------------
          case 'PostProcessVolume':
            break;

          default:
            break;
        }
      }
    }

    // Post-process volume actif (priorite haute) -> exposition cible.
    let targetExposure = 1.15;
    function applyPostProcess(dt, playerWp) {
      targetExposure = 1.15;
      let bestPri = -Infinity;
      for (const ent of entities) {
        const cards = (ent.userData.logic && ent.userData.logic.cards) || [];
        for (const c of cards) {
          if (c.type !== 'PostProcessVolume' || c.enabled === false) continue;
          const cfg = c.config || {};
          if (!volumeContains(ent, cfg, playerWp)) continue;
          const pri = cfg.priority ?? 0;
          if (pri >= bestPri) {
            bestPri = pri;
            const ov = cfg.overrides || {};
            if (ov.exposure !== undefined) targetExposure = ov.exposure;
          }
        }
      }
      const cur = renderer.toneMappingExposure;
      renderer.toneMappingExposure = cur + (targetExposure - cur) * Math.min(1, dt * 6);
    }

    // =====================================================================
    // 11. Boucle principale
    // =====================================================================
    let lastTime = performance.now();
    let playerVelocityY = 0;
    let isGrounded = false;
    const camTarget = new THREE.Vector3();

    function animate() {
      requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (paused) {
        renderer.render(scene, camera);
        return;
      }

      // Deplacement joueur (ZQSD/WASD/Fleches)
      const moveDir = new THREE.Vector3();
      const forward = new THREE.Vector3(-Math.sin(cameraAngle.yaw), 0, -Math.cos(cameraAngle.yaw));
      const right = new THREE.Vector3(Math.cos(cameraAngle.yaw), 0, -Math.sin(cameraAngle.yaw));

      if (keys['KeyW'] || keys['KeyZ'] || keys['ArrowUp']) moveDir.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) moveDir.sub(forward);
      if (keys['KeyA'] || keys['KeyQ'] || keys['ArrowLeft']) moveDir.sub(right);
      if (keys['KeyD'] || keys['ArrowRight']) moveDir.add(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        playerObj.position.x += moveDir.x * 7.5 * dt;
        playerObj.position.z += moveDir.z * 7.5 * dt;
        playerObj.rotation.y = Math.atan2(moveDir.x, moveDir.z);
      }

      // Gravite / sol
      const terrainY = getTerrainHeight(playerObj.position.x, playerObj.position.z) + 0.9;
      if (playerObj.position.y <= terrainY + 0.05) {
        playerObj.position.y = terrainY;
        playerVelocityY = 0;
        isGrounded = true;
      } else {
        isGrounded = false;
        playerVelocityY -= 22 * dt;
        playerObj.position.y += playerVelocityY * dt;
      }
      if (keys['Space'] && isGrounded) {
        playerVelocityY = 8.5;
        isGrounded = false;
        SoundSynth.play('jump');
      }

      // Camera orbitale derriere le joueur
      const camDist = 6.5;
      const camX = playerObj.position.x + Math.sin(cameraAngle.yaw) * Math.cos(cameraAngle.pitch) * camDist;
      const camY = playerObj.position.y + Math.sin(cameraAngle.pitch) * camDist + 1.2;
      const camZ = playerObj.position.z + Math.cos(cameraAngle.yaw) * Math.cos(cameraAngle.pitch) * camDist;
      camTarget.set(camX, camY, camZ);
      camera.position.lerp(camTarget, 0.15);
      camera.lookAt(playerObj.position.x, playerObj.position.y + 1.0, playerObj.position.z);

      const playerWp = wpOf(playerObj, _wp);

      // Cartes de comportement (hors joueur)
      for (const ent of entities) {
        if (ent === playerObj) continue;
        runCards(ent, dt, now, playerWp);
      }

      applyPostProcess(dt, playerWp);

      // Mort / reapparition (checkpoint > spawn initial)
      if (gameState.Health <= 0 && !gameState.deathAt) {
        gameState.deathAt = now;
        showToast('Vous avez ete vaincu !');
      } else if (gameState.deathAt && now - gameState.deathAt > 1500) {
        const r = gameState.checkpoint || playerStart;
        playerObj.position.set(r.x, r.y, r.z);
        playerVelocityY = 0;
        gameState.Health = 100;
        gameState.deathAt = 0;
        updateHUD();
      }
      if (!gameState.deathAt && playerObj.position.y < -25) {
        gameState.Health = 0;
      }

      updateHUD();
      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });`;
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BANDIT_CAMP_POS, BUILDING_SPECS, PROFESSION_LABELS } from '../simulation/constants';
import {
  getClosestBuilding,
  getClosestCart,
  getClosestNpc,
  getSnapshot,
  getWeatherSpeedMultiplier,
  placeBuilding,
  stepWorldSimulation,
  triggerKingAttack,
} from '../simulation/kingdomEngine';
import {
  BuildingType,
  CartCargoType,
  GameScreenState,
  GameSnapshot,
  NpcState,
  Profession,
  WeatherCondition,
  WorldState,
} from '../simulation/types';
import {
  canPlaceBuilding,
  clampToPlayableWorld,
  groundHeightAt,
  isOnRoad,
  isWaterAt,
  riverCenterX,
} from '../simulation/worldMath';
import { kingdomAudio } from './audio';
import { computeSkyboxState } from './skyPalette';
import {
  BuildingRig,
  CharacterRig,
  createBanditModel,
  createBuildingGroup,
  createKingModel,
  createNpcModel,
  createResourceCartModel,
  createSharedMaterialLibrary,
  MaterialLibrary,
  ResourceCartRig,
  updateBuildingVisualProgress,
} from './models';
import { createProceduralTexturePack, ProceduralTexturePack } from './textures';

export interface HudProjection {
  closestNpc: {
    id: string;
    name: string;
    professionLabel: string;
    activity: string;
    screenX: number;
    screenY: number;
    visible: boolean;
  } | null;
  nearbyBuilding: {
    id: string;
    name: string;
    type: BuildingType;
    level: number;
    completed: boolean;
    progress: number;
    assignedWorkers: number;
    screenX: number;
    screenY: number;
  } | null;
  nearbyCart: {
    id: string;
    label: string;
    cargoType: CartCargoType;
    returning: boolean;
    isCaravan: boolean;
    screenX: number;
    screenY: number;
  } | null;
  buildPreview: {
    valid: boolean;
    reason?: string;
    x: number;
    z: number;
  } | null;
}

export interface KingdomSceneCallbacks {
  onSnapshot: (snap: GameSnapshot) => void;
  onProjection: (proj: HudProjection) => void;
  onOpenNpc: (npc: NpcState) => void;
  onInspectBuilding: (buildingId: string) => void;
  onBuildResult: (ok: boolean, message: string) => void;
  onToast: (message: string) => void;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

// Reusable scratch math objects (Zero GC inside render loop)
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleV = new THREE.Vector3();
const _color = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

export class KingdomSceneController {
  private container: HTMLElement;
  private worldRef: { current: WorldState };
  private callbacks: KingdomSceneCallbacks;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTexturePack;
  private mats: MaterialLibrary;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private terrainMesh: THREE.Mesh;
  private waterMesh: THREE.Mesh;
  private campFireLight: THREE.PointLight;

  private kingRig: CharacterRig;
  private npcRigs = new Map<string, CharacterRig>();
  private npcRigProfession = new Map<string, Profession>();
  private banditRigs = new Map<string, CharacterRig>();
  private buildingRigs = new Map<string, BuildingRig>();
  private cartRigs = new Map<string, ResourceCartRig>();
  private cartCargoTypes = new Map<string, string>();

  // Pooled particles, weather rain, winter snow & watchtower arrows
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private rainMesh: THREE.InstancedMesh;
  private rainDrops: Array<{ ox: number; y: number; oz: number; speed: number }> = [];
  private snowMesh: THREE.InstancedMesh;
  private snowFlakes: Array<{ ox: number; y: number; oz: number; speed: number; sway: number }> = [];
  private arrowMesh: THREE.InstancedMesh;
  private arrows: Array<{
    active: boolean;
    fromX: number;
    fromY: number;
    fromZ: number;
    toX: number;
    toY: number;
    toZ: number;
    progress: number;
  }> = [];
  private arrowCursor = 0;
  private weatherRainFactor = 0;
  private weatherFogFactor = 0;
  private readonly rainWindQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 0, -0.09));
  private cloudMesh: THREE.InstancedMesh | null = null;
  private cloudItems: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; speed: number }> = [];
  private terrainBaseColors: Float32Array | null = null;
  private terrainKindFlags: Uint8Array | null = null; // 0=grass, 1=road, 2=sand, 3=ridge
  private pineLowMesh: THREE.InstancedMesh | null = null;
  private pineTopMesh: THREE.InstancedMesh | null = null;
  private oakCanopyMesh: THREE.InstancedMesh | null = null;
  private pineShades: number[] = [];
  private oakShades: Array<{ shade: number; warm: number }> = [];
  private currentVisualSeason: string = '';
  private skyMesh: THREE.Mesh;
  private skyUniforms: {
    uZenithColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uHorizonGlowColor: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunElevation: { value: number };
    uStarVisibility: { value: number };
    uRain: { value: number };
    uFog: { value: number };
    uTime: { value: number };
  };

  // Build preview ghost
  private buildGhostGroup: THREE.Group;
  private buildGhostRing: THREE.Mesh;
  private buildGhostMat: THREE.MeshBasicMaterial;
  private buildGhostBoxMat: THREE.MeshBasicMaterial;
  private activeBuildType: BuildingType | null = null;
  private buildPreviewPos = { x: 0, z: 0, valid: false, reason: '' };

  // Input & camera state
  private keysPressed = new Set<string>();
  private justPressed = new Set<string>();
  private gameState: GameScreenState = 'title';
  private modalOpen = false;
  private camYaw = 0; // 0 = behind king looking north (-Z)
  private camPitch = 0.21;
  private camDist = 11.2;
  private camPos = new THREE.Vector3(0, 8, 25);
  private camLook = new THREE.Vector3(0, 1.5, 10);
  private isDraggingCamera = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerScreenX = 0;
  private pointerScreenY = 0;

  // Juice / timing
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private elapsedTitleTime = 0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private kingWalkDist = 0;
  private stepSoundCooldown = 0;
  private hudSyncTimer = 0;
  private hammerSoundTimer = 0;
  private birdSoundTimer = 3.5;
  private workSoundTimer = 2.4;
  private thunderTimer = 7.0;
  private luteSoundTimer = 8.0;
  private chimneySmokeTimer = 0.6;

  private resizeObserver: ResizeObserver;
  private canvasWidth = 1280;
  private canvasHeight = 720;

  constructor(
    container: HTMLElement,
    worldRef: { current: WorldState },
    callbacks: KingdomSceneCallbacks,
  ) {
    this.container = container;
    this.worldRef = worldRef;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = this.container.getBoundingClientRect();
    this.canvasWidth = Math.max(320, rect.width || window.innerWidth);
    this.canvasHeight = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9dc2d8);
    this.scene.fog = new THREE.FogExp2(0x9dc2d8, 0.0068);

    this.camera = new THREE.PerspectiveCamera(52, this.canvasWidth / this.canvasHeight, 0.25, 460);

    // Studio IBL environment for metallic crown, armor, and weapons
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm sun + cool hemisphere sky/ground contrast
    this.hemiLight = new THREE.HemisphereLight(0xa9d2ee, 0x4c4330, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff0d6, 1.85);
    this.sunLight.position.set(36, 48, 28);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 210;
    const d = 72;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Procedural textures & shared materials
    this.textures = createProceduralTexturePack(this.renderer.capabilities.getMaxAnisotropy());
    this.mats = createSharedMaterialLibrary(this.textures);

    // Atmospheric Sky Dome (gradient sky + Sun disc + Moon + Stars)
    const skyBuild = this.buildSkyDome();
    this.skyMesh = skyBuild.mesh;
    this.skyUniforms = skyBuild.uniforms;
    this.scene.add(this.skyMesh);

    // Environment terrain, water, bridge, plaza well, forest groves, bandit camp
    this.terrainMesh = this.buildTerrain();
    this.scene.add(this.terrainMesh);
    this.buildCobbleRoads();
    this.waterMesh = this.buildRiverAndBridge();
    this.buildVillageSquareCenterpiece();
    this.campFireLight = this.buildBanditCampProps();
    this.buildNatureGrovesAndRocks();

    // Build ghost preview
    this.buildGhostMat = new THREE.MeshBasicMaterial({
      color: 0x4fd180,
      transparent: true,
      opacity: 0.42,
      wireframe: false,
    });
    this.buildGhostRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.0, 28),
      this.buildGhostMat,
    );
    this.buildGhostRing.rotation.x = -Math.PI / 2;
    this.buildGhostRing.position.y = 0.08;
    this.buildGhostBoxMat = new THREE.MeshBasicMaterial({
      color: 0x4fd180,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const ghostBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.4, 3.2),
      this.buildGhostBoxMat,
    );
    ghostBox.position.y = 1.2;
    this.buildGhostGroup = new THREE.Group();
    this.buildGhostGroup.add(this.buildGhostRing, ghostBox);
    this.buildGhostGroup.visible = false;
    this.scene.add(this.buildGhostGroup);

    // Pooled instanced particle system
    const pGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const poolCount = 120;
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, poolCount);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < poolCount; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        color: new THREE.Color(0xffffff),
      });
      _mat4.makeTranslation(0, -50, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.scene.add(this.particleMesh);

    // Pooled instanced raindrop streaks (hidden unless raining)
    const rainGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 4);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xc2d9ed,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    const rainCount = 240;
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    let rSeed = 4219;
    const nextRainRand = () => {
      rSeed = (rSeed * 16807) % 2147483647;
      return (rSeed - 1) / 2147483646;
    };
    _scaleV.set(1, 1, 1);
    for (let i = 0; i < rainCount; i++) {
      const ox = (nextRainRand() - 0.5) * 38;
      const y = nextRainRand() * 20;
      const oz = (nextRainRand() - 0.5) * 38;
      this.rainDrops.push({ ox, y, oz, speed: 18 + nextRainRand() * 7 });
      _v3A.set(ox, y, oz);
      _mat4.compose(_v3A, this.rainWindQuat, _scaleV);
      this.rainMesh.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.rainMesh);

    // Pooled instanced winter snowflakes (hidden unless Winter)
    const snowGeo = new THREE.DodecahedronGeometry(0.06, 0);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xf2f7ff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const snowCount = 160;
    this.snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, snowCount);
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    _scaleV.set(1, 1, 1);
    _quat.identity();
    for (let i = 0; i < snowCount; i++) {
      const ox = (nextRainRand() - 0.5) * 40;
      const y = nextRainRand() * 18;
      const oz = (nextRainRand() - 0.5) * 40;
      this.snowFlakes.push({ ox, y, oz, speed: 2.2 + nextRainRand() * 1.4, sway: nextRainRand() * 6 });
      _v3A.set(ox, y, oz);
      _mat4.compose(_v3A, _quat, _scaleV);
      this.snowMesh.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.snowMesh);

    // Pooled instanced watchtower arrows
    const arrowGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.85, 5);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf4deb2 });
    const arrowCount = 24;
    this.arrowMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, arrowCount);
    this.arrowMesh.frustumCulled = false;
    for (let i = 0; i < arrowCount; i++) {
      this.arrows.push({
        active: false,
        fromX: 0,
        fromY: -50,
        fromZ: 0,
        toX: 0,
        toY: -50,
        toZ: 0,
        progress: 0,
      });
      _mat4.makeTranslation(0, -50, 0);
      this.arrowMesh.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.arrowMesh);

    // King actor
    this.kingRig = createKingModel(this.mats);
    this.scene.add(this.kingRig.root);

    // Sync initial buildings, NPCs, bandits
    this.syncDynamicEntities();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Start loop
    this.lastTimeMs = performance.now();
    this.scheduleNextTick();
  }

  private buildSkyDome(): {
    mesh: THREE.Mesh;
    uniforms: {
      uZenithColor: { value: THREE.Color };
      uHorizonColor: { value: THREE.Color };
      uHorizonGlowColor: { value: THREE.Color };
      uSunColor: { value: THREE.Color };
      uSunDir: { value: THREE.Vector3 };
      uSunElevation: { value: number };
      uStarVisibility: { value: number };
      uRain: { value: number };
      uFog: { value: number };
      uTime: { value: number };
    };
  } {
    const uniforms = {
      uZenithColor: { value: new THREE.Color(0x2a6fb8) },
      uHorizonColor: { value: new THREE.Color(0xb8ddf2) },
      uHorizonGlowColor: { value: new THREE.Color(0xf6dfac) },
      uSunColor: { value: new THREE.Color(0xfff4d6) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.75, -0.34).normalize() },
      uSunElevation: { value: 0.75 },
      uStarVisibility: { value: 0 },
      uRain: { value: 0 },
      uFog: { value: 0 },
      uTime: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldDir;
        varying vec3 vCelestialDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vWorldDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          vCelestialDir = normalize(position);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uHorizonGlowColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uSunElevation;
        uniform float uStarVisibility;
        uniform float uRain;
        uniform float uFog;
        uniform float uTime;
        varying vec3 vWorldDir;
        varying vec3 vCelestialDir;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash2(i);
          float b = hash2(i + vec2(1.0, 0.0));
          float c = hash2(i + vec2(0.0, 1.0));
          float d = hash2(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbmClouds(vec2 p) {
          float v = 0.0;
          v += 0.55 * noise2(p);
          v += 0.30 * noise2(p * 2.07 + vec2(4.1, 1.7));
          v += 0.15 * noise2(p * 4.13 + vec2(8.3, 5.2));
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          vec3 cel = normalize(vCelestialDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.54));

          // Solar horizon band bloom (vivid during golden sunrise & fiery sunset)
          vec3 sDir = normalize(uSunDir);
          float sunDot = max(dot(dir, sDir), 0.0);
          float horizAzimuth = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + vec3(0.0001)), normalize(vec3(sDir.x, 0.0, sDir.z) + vec3(0.0001))), 0.0);
          float lowBand = exp(-h * 6.2) * (0.35 + 0.65 * pow(horizAzimuth, 2.0));
          float twilightWeight = smoothstep(0.55, -0.02, uSunElevation) * smoothstep(-0.32, 0.02, uSunElevation);
          sky += uHorizonGlowColor * lowBand * (0.25 + twilightWeight * 0.72) * (1.0 - uRain * 0.75);

          // Sun disc & atmospheric corona glow
          float sunVis = smoothstep(-0.14, 0.10, uSunElevation) * (1.0 - uRain * 0.86) * (1.0 - uFog * 0.74);
          float halo = pow(sunDot, 10.0) * 0.45 + pow(sunDot, 96.0) * 0.72;
          float disc = smoothstep(0.9974, 0.9991, sunDot) * 1.65;
          sky += uSunColor * (halo + disc) * sunVis;

          // Drifting layered atmospheric clouds rotated across celestial dome
          if (dir.y > 0.025) {
            vec2 cloudUv = cel.xz / (dir.y + 0.19) * 1.18 + vec2(uTime * 0.009, uTime * 0.003);
            float cVal = fbmClouds(cloudUv);
            float coverage = mix(0.50, 0.30, uRain);
            float cloudAlpha = smoothstep(coverage, coverage + 0.24, cVal) * smoothstep(0.025, 0.20, dir.y) * (1.0 - uFog * 0.65);
            vec3 dayCloud = mix(vec3(0.96, 0.97, 0.99), uSunColor * 1.05, pow(sunDot, 3.0) * 0.6 + twilightWeight * 0.48);
            vec3 nightCloud = vec3(0.11, 0.16, 0.28);
            float dayMix = smoothstep(-0.12, 0.22, uSunElevation);
            vec3 cloudCol = mix(nightCloud, dayCloud, dayMix);
            cloudCol = mix(cloudCol, vec3(0.45, 0.50, 0.56) * mix(0.28, 1.0, dayMix), uRain * 0.85);
            sky = mix(sky, cloudCol, cloudAlpha * 0.76);
          }

          // Rotating Starry Midnight Vault (Milky Way ribbon + dual-layer twinkling stars + Moon)
          if (uStarVisibility > 0.01) {
            vec3 moonDir = normalize(vec3(-sDir.x, max(0.22, -sDir.y), -sDir.z));
            float moonDot = max(dot(dir, moonDir), 0.0);
            float moonDisc = smoothstep(0.9984, 0.9993, moonDot) * 1.15;
            float moonHalo = pow(moonDot, 42.0) * 0.26;
            sky += vec3(0.86, 0.92, 1.0) * (moonDisc + moonHalo) * uStarVisibility;

            if (dir.y > 0.05) {
              float horizonFade = smoothstep(0.05, 0.28, dir.y);
              // Subtle Milky Way galactic dust band rotating with cel
              float bandAxis = abs(cel.x * 0.65 + cel.z * 0.55 - cel.y * 0.52);
              float milkyBand = exp(-bandAxis * 5.2) * (0.4 + 0.6 * noise2(cel.xz * 4.5 + cel.y * 2.0));
              sky += vec3(0.10, 0.15, 0.28) * milkyBand * uStarVisibility * horizonFade;

              // Primary bright stars (smooth circular pinpoints, never blocky squares)
              vec3 gridA = cel * 72.0;
              vec3 cellA = floor(gridA);
              vec3 fracA = fract(gridA);
              float sA = hash(cellA);
              if (sA > 0.958) {
                vec3 offsetA = vec3(hash(cellA + 1.3), hash(cellA + 7.1), hash(cellA + 13.7)) * 0.6 + 0.2;
                float dA = length(fracA - offsetA);
                float pinA = smoothstep(0.16, 0.02, dA);
                float twinkle = 0.65 + 0.35 * sin(uTime * 2.6 + sA * 120.0);
                vec3 starHue = mix(vec3(0.80, 0.90, 1.0), vec3(1.0, 0.93, 0.76), fract(sA * 37.0));
                sky += starHue * 1.45 * pinA * twinkle * uStarVisibility * horizonFade;
              }

              // Fine secondary shimmer stars
              vec3 gridB = cel * 135.0 + vec3(7.3, 2.1, 5.7);
              vec3 cellB = floor(gridB);
              vec3 fracB = fract(gridB);
              float sB = hash(cellB);
              if (sB > 0.962) {
                vec3 offsetB = vec3(hash(cellB + 3.7), hash(cellB + 11.1), hash(cellB + 19.3)) * 0.6 + 0.2;
                float dB = length(fracB - offsetB);
                float pinB = smoothstep(0.18, 0.02, dB);
                float twinkleB = 0.52 + 0.48 * sin(uTime * 3.4 + sB * 180.0);
                sky += vec3(0.86, 0.92, 1.0) * 0.85 * pinB * twinkleB * uStarVisibility * horizonFade;
              }
            }
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(390, 32, 20), mat);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  private buildTerrain(): THREE.Mesh {
    const size = 480;
    const segs = 144;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const flags = new Uint8Array(pos.count);
    const colGrass = new THREE.Color(0xeef4e5);
    const colRoad = new THREE.Color(0xd9ccb8);
    const colRidge = new THREE.Color(0xa6aea2);
    const colSand = new THREE.Color(0xdccda8);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = groundHeightAt(x, z);
      pos.setY(i, y);

      const distCenter = Math.hypot(x, z);
      let c = colGrass;
      let kind = 0;
      if (isOnRoad(x, z)) {
        c = colRoad;
        kind = 1;
      } else if (isWaterAt(x, z) || Math.abs(x - riverCenterX(z)) < 8.8) {
        c = colSand;
        kind = 2;
      } else if (z < -78 || distCenter > 148) {
        c = colRidge;
        kind = 3;
      }
      flags[i] = kind;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    this.terrainBaseColors = new Float32Array(colors);
    this.terrainKindFlags = flags;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.grassMap,
      bumpMap: this.textures.grassBump,
      bumpScale: 0.11,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private scalePlaneUvs(geo: THREE.BufferGeometry, tileX: number, tileY: number): void {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * tileX, uv.getY(i) * tileY);
    }
  }

  private buildCobbleRoads(): void {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.roadMap,
      bumpMap: this.textures.roadBump,
      bumpScale: 0.09,
      roughness: 0.85,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Main North-South Royal Highway (x=0, z from -88 to +116)
    const nsGeo = new THREE.PlaneGeometry(4.8, 204, 2, 68);
    this.scalePlaneUvs(nsGeo, 1.3, 46);
    const nsRoad = new THREE.Mesh(nsGeo, roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    const nsPos = nsRoad.geometry.attributes.position;
    for (let i = 0; i < nsPos.count; i++) {
      const wx = nsPos.getX(i);
      const wz = -nsPos.getY(i) + 14;
      nsPos.setZ(i, groundHeightAt(wx, wz) + 0.04);
    }
    nsRoad.geometry.computeVertexNormals();
    nsRoad.position.set(0, 0, 14);
    nsRoad.receiveShadow = true;

    // East-West King's Highway (z=6, x from -115 to +135)
    const ewGeo = new THREE.PlaneGeometry(250, 4.4, 80, 2);
    this.scalePlaneUvs(ewGeo, 55, 1.2);
    const ewRoad = new THREE.Mesh(ewGeo, roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    const ewPos = ewRoad.geometry.attributes.position;
    for (let i = 0; i < ewPos.count; i++) {
      const wx = ewPos.getX(i) + 10;
      const wz = 6 - ewPos.getY(i);
      ewPos.setZ(i, groundHeightAt(wx, wz) + 0.035);
    }
    ewRoad.geometry.computeVertexNormals();
    ewRoad.position.set(10, 0, 6);
    ewRoad.receiveShadow = true;

    // Central Village Square Cobble Plaza at (0, 6)
    const plazaGeo = new THREE.CircleGeometry(8.6, 32);
    this.scalePlaneUvs(plazaGeo, 3.8, 3.8);
    const plaza = new THREE.Mesh(plazaGeo, roadMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, groundHeightAt(0, 6) + 0.05, 6);
    plaza.receiveShadow = true;

    this.scene.add(nsRoad, ewRoad, plaza);
  }

  private buildRiverAndBridge(): THREE.Mesh {
    const waterGeo = new THREE.PlaneGeometry(14, 420, 18, 96);
    waterGeo.rotateX(-Math.PI / 2);
    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setX(i, pos.getX(i) + riverCenterX(z));
    }
    waterGeo.computeVertexNormals();

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x35728c,
      roughness: 0.14,
      metalness: 0.42,
      transparent: true,
      opacity: 0.88,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.35;
    water.receiveShadow = true;
    this.scene.add(water);

    // Grand Arched Stone Bridge across Eastbrook River at z=6
    const bridge = new THREE.Group();
    const bx = riverCenterX(6);
    const bankY = Math.max(groundHeightAt(bx - 8.2, 6), groundHeightAt(bx + 8.2, 6));
    bridge.position.set(bx, bankY + 0.32, 6);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.42, 4.8), this.mats.stone);
    deck.castShadow = true;
    deck.receiveShadow = true;
    bridge.add(deck);

    // Stone piers resting inside the river bed
    for (const px of [-5.2, 0, 5.2]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 5.1), this.mats.darkStone);
      pier.position.set(px, -1.35, 0);
      pier.castShadow = true;
      pier.receiveShadow = true;
      bridge.add(pier);
    }

    // Approach stone ramps to meet riverbanks
    for (const side of [-1, 1]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 4.6), this.mats.stone);
      ramp.position.set(side * 8.8, -0.32, 0);
      ramp.rotation.z = side * -0.22;
      ramp.receiveShadow = true;
      bridge.add(ramp);
    }

    // Crenellated stone parapet walls & corner guard pillars
    for (const sz of [-2.2, 2.2]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.72, 0.36), this.mats.darkStone);
      wall.position.set(0, 0.55, sz);
      wall.castShadow = true;
      bridge.add(wall);
      for (const px of [-7.1, -3.5, 0, 3.5, 7.1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 0.55), this.mats.stone);
        post.position.set(px, 0.75, sz);
        post.castShadow = true;
        bridge.add(post);
      }
    }
    this.scene.add(bridge);
    return water;
  }

  private buildVillageSquareCenterpiece(): void {
    const well = new THREE.Group();
    well.position.set(0, groundHeightAt(0, 6), 6);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 0.78, 12), this.mats.stone);
    rim.position.y = 0.39;
    rim.castShadow = true;
    rim.receiveShadow = true;
    const waterPool = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f6880, roughness: 0.18, metalness: 0.25 }),
    );
    waterPool.rotation.x = -Math.PI / 2;
    waterPool.position.y = 0.6;
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), this.mats.timber);
    postL.position.set(-1.2, 1.1, 0);
    const postR = postL.clone();
    postR.position.x = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.2, 4), this.mats.shingle);
    roof.position.y = 2.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    well.add(rim, waterPool, postL, postR, roof);
    this.scene.add(well);

    // Royal Courtyard Torches along Keep avenue & North Gate
    for (const [tx, tz] of [
      [-3.8, -12],
      [3.8, -12],
      [-3.8, -4],
      [3.8, -4],
      [-4.6, -38],
      [4.6, -38],
    ]) {
      const torch = new THREE.Group();
      torch.position.set(tx, groundHeightAt(tx, tz), tz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), this.mats.timber);
      post.position.y = 1.1;
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 7, 6),
        new THREE.MeshStandardMaterial({ color: 0xffa638, emissive: 0xff6a14, emissiveIntensity: 1.55 }),
      );
      flame.position.y = 2.28;
      torch.add(post, flame);
      this.scene.add(torch);
    }
  }

  private buildBanditCampProps(): THREE.PointLight {
    const buildCampCluster = (cx: number, cz: number, withLight: boolean): THREE.PointLight | null => {
      const camp = new THREE.Group();
      camp.position.set(cx, groundHeightAt(cx, cz), cz);

      for (const [tx, tz, rot] of [
        [-4.2, -2.6, 0.4],
        [4.4, -2.2, -0.45],
      ]) {
        const tent = new THREE.Mesh(
          new THREE.ConeGeometry(2.2, 2.6, 4),
          new THREE.MeshStandardMaterial({ color: 0x4b3832, roughness: 0.9 }),
        );
        tent.position.set(tx, 1.3, tz);
        tent.rotation.y = rot;
        tent.castShadow = true;
        camp.add(tent);
      }

      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.72 + (i / 13) * Math.PI * 1.56;
        const sx = Math.cos(a) * 8.8;
        const sz = Math.sin(a) * 7.2;
        const stake = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.2, 5), this.mats.timber);
        stake.position.set(sx, 1.05, sz);
        stake.rotation.x = 0.12;
        camp.add(stake);
      }

      const fireEmber = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.48, 0),
        new THREE.MeshStandardMaterial({ color: 0xff7722, emissive: 0xff4500, emissiveIntensity: 1.8 }),
      );
      fireEmber.position.y = 0.28;
      camp.add(fireEmber);
      this.scene.add(camp);

      if (!withLight) return null;
      const light = new THREE.PointLight(0xff7728, 3.6, 18, 2);
      light.position.set(cx, camp.position.y + 1.5, cz);
      this.scene.add(light);
      return light;
    };

    const mainLight = buildCampCluster(BANDIT_CAMP_POS.x, BANDIT_CAMP_POS.z, true)!;
    buildCampCluster(95, -71, false);
    return mainLight;
  }

  private buildNatureGrovesAndRocks(): void {
    let seed = 9173;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const pineTrees: Array<{ x: number; z: number; scale: number }> = [];
    const oakTrees: Array<{ x: number; z: number; scale: number }> = [];

    for (let i = 0; i < 420; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 46 + rand() * 124;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (isOnRoad(x, z) || isWaterAt(x, z)) continue;
      if (Math.abs(x - riverCenterX(z)) < 8.5) continue;
      if (Math.hypot(x, z + 6) < 42) continue; // Keep central stronghold clear
      if (Math.hypot(x - BANDIT_CAMP_POS.x, z - BANDIT_CAMP_POS.z) < 12) continue;
      if (Math.hypot(x - 95, z + 71) < 12) continue;
      if (Math.hypot(x - 24, z + 14) < 8.5) continue;
      if (Math.hypot(x - 38, z + 22) < 8.5) continue;

      const scale = 0.85 + rand() * 0.55;
      // More pines in northern/highland zones, oaks in lush meadows
      if (z < -30 || radius > 110 || rand() < 0.55) {
        pineTrees.push({ x, z, scale });
      } else {
        oakTrees.push({ x, z, scale });
      }
    }

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.barkMap,
      roughness: 0.92,
    });

    // 1. Alpine Pine Groves (Trunk + 2-tier conifer cones)
    if (pineTrees.length > 0) {
      const pTrunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 3.0, 7);
      const pConeLowGeo = new THREE.ConeGeometry(1.9, 3.6, 7);
      const pConeTopGeo = new THREE.ConeGeometry(1.35, 3.2, 7);
      const pLeafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.0,
      });

      const pTrunks = new THREE.InstancedMesh(pTrunkGeo, trunkMat, pineTrees.length);
      const pLow = new THREE.InstancedMesh(pConeLowGeo, pLeafMat, pineTrees.length);
      const pTop = new THREE.InstancedMesh(pConeTopGeo, pLeafMat, pineTrees.length);
      pTrunks.castShadow = !this.isSoftwareGl;
      pLow.castShadow = !this.isSoftwareGl;
      pTop.castShadow = !this.isSoftwareGl;

      this.pineShades = [];
      for (let i = 0; i < pineTrees.length; i++) {
        const t = pineTrees[i];
        const y = groundHeightAt(t.x, t.z);
        _scaleV.set(t.scale, t.scale, t.scale);
        _quat.setFromEuler(new THREE.Euler(0, i * 0.7, 0));

        _v3A.set(t.x, y + 1.5 * t.scale, t.z);
        _mat4.compose(_v3A, _quat, _scaleV);
        pTrunks.setMatrixAt(i, _mat4);

        _v3A.set(t.x, y + 3.6 * t.scale, t.z);
        _mat4.compose(_v3A, _quat, _scaleV);
        pLow.setMatrixAt(i, _mat4);

        _v3A.set(t.x, y + 5.2 * t.scale, t.z);
        _mat4.compose(_v3A, _quat, _scaleV);
        pTop.setMatrixAt(i, _mat4);

        const shade = 0.78 + rand() * 0.36;
        this.pineShades.push(shade);
        _color.setRGB(0.16 * shade, 0.31 * shade, 0.17 * shade, THREE.SRGBColorSpace);
        pLow.setColorAt(i, _color);
        _color.setRGB(0.19 * shade, 0.36 * shade, 0.2 * shade, THREE.SRGBColorSpace);
        pTop.setColorAt(i, _color);
      }
      pTrunks.computeBoundingSphere();
      pLow.computeBoundingSphere();
      pTop.computeBoundingSphere();
      this.pineLowMesh = pLow;
      this.pineTopMesh = pTop;
      this.scene.add(pTrunks, pLow, pTop);
    }

    // 2. Broadleaf Oak Groves (Trunk + lush rounded canopy)
    if (oakTrees.length > 0) {
      const oTrunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 2.8, 7);
      const oCanopyGeo = new THREE.DodecahedronGeometry(2.15, 1);
      const oLeafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.0,
      });

      const oTrunks = new THREE.InstancedMesh(oTrunkGeo, trunkMat, oakTrees.length);
      const oCanopies = new THREE.InstancedMesh(oCanopyGeo, oLeafMat, oakTrees.length);
      oTrunks.castShadow = !this.isSoftwareGl;
      oCanopies.castShadow = !this.isSoftwareGl;

      this.oakShades = [];
      for (let i = 0; i < oakTrees.length; i++) {
        const t = oakTrees[i];
        const y = groundHeightAt(t.x, t.z);
        _quat.setFromEuler(new THREE.Euler(0, i * 1.1, 0));

        _scaleV.set(t.scale, t.scale, t.scale);
        _v3A.set(t.x, y + 1.4 * t.scale, t.z);
        _mat4.compose(_v3A, _quat, _scaleV);
        oTrunks.setMatrixAt(i, _mat4);

        _scaleV.set(t.scale * 1.12, t.scale * 0.86, t.scale * 1.05);
        _v3A.set(t.x, y + 3.8 * t.scale, t.z);
        _mat4.compose(_v3A, _quat, _scaleV);
        oCanopies.setMatrixAt(i, _mat4);

        const shade = 0.82 + rand() * 0.32;
        const warmTint = rand() < 0.22 ? 0.1 : 0;
        this.oakShades.push({ shade, warm: warmTint });
        _color.setRGB((0.24 + warmTint) * shade, 0.39 * shade, 0.16 * shade, THREE.SRGBColorSpace);
        oCanopies.setColorAt(i, _color);
      }
      oTrunks.computeBoundingSphere();
      oCanopies.computeBoundingSphere();
      this.oakCanopyMesh = oCanopies;
      this.scene.add(oTrunks, oCanopies);
    }

    // 3. Instanced Valley & Highland Boulders
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x77736b,
      bumpMap: this.textures.stoneBump,
      bumpScale: 0.08,
      roughness: 0.92,
      metalness: 0.04,
    });
    const rockCount = 68;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    for (let i = 0; i < rockCount; i++) {
      const a = (i / rockCount) * Math.PI * 2 + rand() * 0.18;
      const r = 74 + rand() * 94;
      const rx = Math.cos(a) * r;
      const rz = Math.sin(a) * r;
      const ry = groundHeightAt(rx, rz);
      const s = 0.9 + rand() * 1.8;
      _scaleV.set(s, s * 0.72, s);
      _quat.setFromEuler(new THREE.Euler(rand(), rand(), rand()));
      _v3A.set(rx, ry + s * 0.32, rz);
      _mat4.compose(_v3A, _quat, _scaleV);
      rocks.setMatrixAt(i, _mat4);
      _color.setScalar(0.82 + rand() * 0.28);
      rocks.setColorAt(i, _color);
    }
    rocks.computeBoundingSphere();
    this.scene.add(rocks);

    // 4. Distant Alpine Mountain Ring framing the real-world valley horizon
    const mtGeo = new THREE.ConeGeometry(34, 48, 6);
    const mtMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.02,
    });
    const mtCount = 36;
    const mountains = new THREE.InstancedMesh(mtGeo, mtMat, mtCount);
    for (let i = 0; i < mtCount; i++) {
      const a = (i / mtCount) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      const r = 202 + rand() * 34;
      const mx = Math.cos(a) * r;
      const mz = Math.sin(a) * r;
      const sx = 0.85 + rand() * 0.75;
      const sy = 0.8 + rand() * 0.9;
      _scaleV.set(sx, sy, sx);
      _quat.setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0));
      _v3A.set(mx, 14 * sy, mz);
      _mat4.compose(_v3A, _quat, _scaleV);
      mountains.setMatrixAt(i, _mat4);
      const blueStone = 0.82 + rand() * 0.22;
      _color.setRGB(0.32 * blueStone, 0.37 * blueStone, 0.42 * blueStone, THREE.SRGBColorSpace);
      mountains.setColorAt(i, _color);
    }
    mountains.computeBoundingSphere();
    this.scene.add(mountains);

    // 5. Drifting Atmospheric Clouds high overhead
    const cloudGeo = new THREE.DodecahedronGeometry(6.5, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xf7f5ef,
      roughness: 0.98,
      metalness: 0.0,
    });
    const cloudCount = 32;
    const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    cloudMesh.frustumCulled = false;
    this.cloudItems = [];
    for (let i = 0; i < cloudCount; i++) {
      const item = {
        x: (rand() - 0.5) * 420,
        y: 66 + rand() * 18,
        z: (rand() - 0.5) * 420,
        sx: 1.5 + rand() * 1.9,
        sy: 0.42 + rand() * 0.25,
        sz: 1.1 + rand() * 1.3,
        speed: 1.2 + rand() * 1.4,
      };
      this.cloudItems.push(item);
      _scaleV.set(item.sx, item.sy, item.sz);
      _quat.identity();
      _v3A.set(item.x, item.y, item.z);
      _mat4.compose(_v3A, _quat, _scaleV);
      cloudMesh.setMatrixAt(i, _mat4);
    }
    this.cloudMesh = cloudMesh;
    this.scene.add(cloudMesh);
  }

  private updateClouds(dt: number): void {
    if (!this.cloudMesh || this.cloudItems.length === 0) return;
    _quat.identity();
    for (let i = 0; i < this.cloudItems.length; i++) {
      const c = this.cloudItems[i];
      c.x += c.speed * dt;
      if (c.x > 215) c.x = -215;
      _scaleV.set(c.sx, c.sy, c.sz);
      _v3A.set(c.x, c.y, c.z);
      _mat4.compose(_v3A, _quat, _scaleV);
      this.cloudMesh.setMatrixAt(i, _mat4);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  private syncDynamicEntities(dt = 0): void {
    const world = this.worldRef.current;

    // Buildings
    const activeBuildingIds = new Set<string>();
    for (const b of world.buildings) {
      activeBuildingIds.add(b.id);
      let rig = this.buildingRigs.get(b.id);
      if (!rig) {
        rig = createBuildingGroup(b.type, this.mats);
        rig.root.position.set(b.x, groundHeightAt(b.x, b.z), b.z);
        rig.root.rotation.y = b.rotationY;
        this.scene.add(rig.root);
        this.buildingRigs.set(b.id, rig);
      }
      const isNight = world.timeOfDay < 0.22 || world.timeOfDay > 0.8;
      updateBuildingVisualProgress(rig, b.progress, isNight, b.level);
    }
    for (const [id, rig] of this.buildingRigs.entries()) {
      if (!activeBuildingIds.has(id)) {
        this.scene.remove(rig.root);
        this.buildingRigs.delete(id);
      }
    }

    // NPCs
    const activeNpcIds = new Set<string>();
    for (let i = 0; i < world.npcs.length; i++) {
      const npc = world.npcs[i];
      activeNpcIds.add(npc.id);
      let rig = this.npcRigs.get(npc.id);
      if (rig && this.npcRigProfession.get(npc.id) !== npc.profession) {
        this.scene.remove(rig.root);
        this.npcRigs.delete(npc.id);
        this.npcRigProfession.delete(npc.id);
        rig = undefined;
      }
      if (!rig) {
        rig = createNpcModel(npc.profession, this.mats, i);
        this.scene.add(rig.root);
        this.npcRigs.set(npc.id, rig);
        this.npcRigProfession.set(npc.id, npc.profession);
      }
      rig.root.position.set(npc.x, groundHeightAt(npc.x, npc.z), npc.z);
      rig.root.rotation.y = npc.facing;

      const speed = Math.hypot(npc.vx, npc.vz);
      const stride = speed > 0.2 ? Math.sin(this.elapsedTitleTime * 9 + i) * 0.55 : 0;
      rig.leftLeg.rotation.x = stride;
      rig.rightLeg.rotation.x = -stride;
      rig.leftArm.rotation.x = -stride * 0.6;
      rig.rightArm.rotation.x =
        npc.swingTimer > 0
          ? -Math.sin((npc.swingTimer / 0.3) * Math.PI) * 1.4
          : stride * 0.6;

      this.applyHitFlash(rig, npc.hitFlashTimer > 0);
    }
    for (const [id, rig] of this.npcRigs.entries()) {
      if (!activeNpcIds.has(id)) {
        this.scene.remove(rig.root);
        this.npcRigs.delete(id);
        this.npcRigProfession.delete(id);
      }
    }

    // Bandits
    const activeBanditIds = new Set<string>();
    for (let i = 0; i < world.bandits.length; i++) {
      const bandit = world.bandits[i];
      activeBanditIds.add(bandit.id);
      let rig = this.banditRigs.get(bandit.id);
      if (!rig) {
        rig = createBanditModel(bandit.archetype, this.mats);
        this.scene.add(rig.root);
        this.banditRigs.set(bandit.id, rig);
      }
      rig.root.position.set(bandit.x, groundHeightAt(bandit.x, bandit.z), bandit.z);
      rig.root.rotation.y = bandit.facing;

      if (bandit.state === 'ko') {
        rig.bodyGroup.rotation.x = -Math.PI * 0.45 * (1 - Math.max(0, bandit.koTimer / 0.55));
        if (rig.telegraphRing) rig.telegraphRing.visible = false;
      } else {
        rig.bodyGroup.rotation.x = 0;
        const speed = Math.hypot(bandit.vx, bandit.vz);
        const stride = speed > 0.2 ? Math.sin(this.elapsedTitleTime * 9 + i * 2) * 0.55 : 0;
        rig.leftLeg.rotation.x = stride;
        rig.rightLeg.rotation.x = -stride;
        rig.rightArm.rotation.x = bandit.state === 'windup' ? -1.55 : stride * 0.6;
        if (rig.telegraphRing) {
          rig.telegraphRing.visible = bandit.state === 'windup';
        }
      }
      this.applyHitFlash(rig, bandit.hitFlashTimer > 0);
    }
    for (const [id, rig] of this.banditRigs.entries()) {
      if (!activeBanditIds.has(id)) {
        this.scene.remove(rig.root);
        this.banditRigs.delete(id);
      }
    }

    // Physical Logistics Resource Carts & Trade Caravans
    const activeCartIds = new Set<string>();
    const weatherMult = getWeatherSpeedMultiplier(world.weather);
    const carts = world.carts ?? [];
    for (let i = 0; i < carts.length; i++) {
      const cart = carts[i];
      activeCartIds.add(cart.id);
      const rigKey = `${cart.cargoType}_${cart.isCaravan ? 1 : 0}`;
      let rig = this.cartRigs.get(cart.id);
      if (rig && this.cartCargoTypes.get(cart.id) !== rigKey) {
        this.scene.remove(rig.root);
        this.cartRigs.delete(cart.id);
        this.cartCargoTypes.delete(cart.id);
        rig = undefined;
      }
      if (!rig) {
        rig = createResourceCartModel(cart.cargoType, this.mats, Boolean(cart.isCaravan));
        this.scene.add(rig.root);
        this.cartRigs.set(cart.id, rig);
        this.cartCargoTypes.set(cart.id, rigKey);
      }

      rig.root.position.set(cart.x, groundHeightAt(cart.x, cart.z), cart.z);
      rig.root.rotation.y = cart.facing;
      rig.cargoGroup.visible = !cart.returning;

      const rollSpeed = cart.speed * weatherMult;
      const wheelStep = (rollSpeed * dt) / 0.36;
      for (const w of rig.wheels) {
        w.rotation.x += wheelStep;
      }
      const trot = Math.sin(this.elapsedTitleTime * 11 + i * 1.4) * 0.42;
      if (rig.ponyLegs.length === 4) {
        rig.ponyLegs[0].rotation.x = trot;
        rig.ponyLegs[1].rotation.x = -trot;
        rig.ponyLegs[2].rotation.x = -trot;
        rig.ponyLegs[3].rotation.x = trot;
      }
      rig.bodyGroup.position.y = Math.abs(Math.sin(this.elapsedTitleTime * 10 + i)) * 0.025;
    }
    for (const [id, rig] of this.cartRigs.entries()) {
      if (!activeCartIds.has(id)) {
        this.scene.remove(rig.root);
        this.cartRigs.delete(id);
        this.cartCargoTypes.delete(id);
      }
    }
  }

  private applyHitFlash(rig: CharacterRig, flashing: boolean): void {
    for (const m of rig.flashMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && mat.emissive) {
        mat.emissive.setHex(flashing ? 0xffffff : 0x000000);
        mat.emissiveIntensity = flashing ? 0.85 : 0;
      }
    }
  }

  public spawnParticles(x: number, y: number, z: number, colorHex: number, count: number, speedScale = 1): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      const a = Math.random() * Math.PI * 2;
      const spd = (1.5 + Math.random() * 3.5) * speedScale;
      slot.vx = Math.cos(a) * spd;
      slot.vy = (2.2 + Math.random() * 3.6) * speedScale;
      slot.vz = Math.sin(a) * spd;
      slot.life = 0.45 + Math.random() * 0.25;
      slot.maxLife = slot.life;
      slot.color.setHex(colorHex);
    }
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeTranslation(0, -50, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 11 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = Math.max(0.05, p.life / p.maxLife);
      _scaleV.setScalar(s);
      _quat.identity();
      _v3A.set(p.x, p.y, p.z);
      _mat4.compose(_v3A, _quat, _scaleV);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateRain(weather: WeatherCondition, dt: number): void {
    const isRaining = weather === 'rainy' || this.weatherRainFactor > 0.08;
    if (!isRaining) {
      this.rainMesh.visible = false;
      return;
    }

    this.rainMesh.visible = true;
    const mat = this.rainMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.56 * Math.max(0.2, this.weatherRainFactor);

    const king = this.worldRef.current.king;
    _scaleV.set(1, 1, 1);

    for (let i = 0; i < this.rainDrops.length; i++) {
      const drop = this.rainDrops[i];
      drop.y -= drop.speed * dt;
      drop.ox += 1.4 * dt;
      if (drop.y < 0.2) {
        drop.y += 20;
        if (drop.ox > 19) drop.ox -= 38;
      }
      _v3A.set(king.x + drop.ox, drop.y, king.z + drop.oz);
      _mat4.compose(_v3A, this.rainWindQuat, _scaleV);
      this.rainMesh.setMatrixAt(i, _mat4);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private spawnArrowProjectile(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
  ): void {
    const slot = this.arrows[this.arrowCursor];
    this.arrowCursor = (this.arrowCursor + 1) % this.arrows.length;
    slot.active = true;
    slot.fromX = fromX;
    slot.fromY = fromY;
    slot.fromZ = fromZ;
    slot.toX = toX;
    slot.toY = toY;
    slot.toZ = toZ;
    slot.progress = 0;
  }

  private updateArrows(dt: number): void {
    let dirty = false;
    _scaleV.set(1, 1, 1);
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i];
      if (!a.active) continue;
      dirty = true;
      a.progress += dt * 3.8;
      if (a.progress >= 1) {
        a.active = false;
        _mat4.makeTranslation(0, -50, 0);
        this.arrowMesh.setMatrixAt(i, _mat4);
        continue;
      }
      const t = a.progress;
      const x = a.fromX + (a.toX - a.fromX) * t;
      const z = a.fromZ + (a.toZ - a.fromZ) * t;
      const y = a.fromY + (a.toY - a.fromY) * t + Math.sin(t * Math.PI) * 1.4;
      _v3A.set(x, y, z);
      _v3B.set(a.toX - a.fromX, a.toY - a.fromY + Math.cos(t * Math.PI) * 1.4, a.toZ - a.fromZ).normalize();
      _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v3B);
      _mat4.compose(_v3A, _quat, _scaleV);
      this.arrowMesh.setMatrixAt(i, _mat4);
    }
    if (dirty) {
      this.arrowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateSeasonVisuals(season: string): void {
    if (this.currentVisualSeason === season) return;
    this.currentVisualSeason = season;

    if (this.terrainBaseColors && this.terrainKindFlags) {
      const attr = this.terrainMesh.geometry.attributes.color as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < this.terrainKindFlags.length; i++) {
        const kind = this.terrainKindFlags[i];
        const r = this.terrainBaseColors[i * 3];
        const g = this.terrainBaseColors[i * 3 + 1];
        const b = this.terrainBaseColors[i * 3 + 2];
        if (kind === 0) {
          if (season === 'Winter') {
            arr[i * 3] = 0.92;
            arr[i * 3 + 1] = 0.95;
            arr[i * 3 + 2] = 0.98;
          } else if (season === 'Autumn') {
            arr[i * 3] = r * 1.05;
            arr[i * 3 + 1] = g * 0.9;
            arr[i * 3 + 2] = b * 0.72;
          } else if (season === 'Summer') {
            arr[i * 3] = r * 0.94;
            arr[i * 3 + 1] = g * 1.03;
            arr[i * 3 + 2] = b * 0.92;
          } else {
            arr[i * 3] = r;
            arr[i * 3 + 1] = g;
            arr[i * 3 + 2] = b;
          }
        } else if (kind === 3 && season === 'Winter') {
          arr[i * 3] = 0.88;
          arr[i * 3 + 1] = 0.92;
          arr[i * 3 + 2] = 0.96;
        } else {
          arr[i * 3] = r;
          arr[i * 3 + 1] = g;
          arr[i * 3 + 2] = b;
        }
      }
      attr.needsUpdate = true;
    }

    const tMat = this.terrainMesh.material as THREE.MeshStandardMaterial;
    const desiredMap = season === 'Winter' ? null : this.textures.grassMap;
    if (tMat.map !== desiredMap) {
      tMat.map = desiredMap;
      tMat.roughness = season === 'Winter' ? 0.78 : 0.9;
      tMat.needsUpdate = true;
    }

    if (this.pineLowMesh && this.pineTopMesh) {
      for (let i = 0; i < this.pineShades.length; i++) {
        const shade = this.pineShades[i];
        if (season === 'Winter') {
          _color.setRGB(0.45 * shade, 0.56 * shade, 0.55 * shade, THREE.SRGBColorSpace);
          this.pineLowMesh.setColorAt(i, _color);
          _color.setRGB(0.76 * shade, 0.84 * shade, 0.88 * shade, THREE.SRGBColorSpace);
          this.pineTopMesh.setColorAt(i, _color);
        } else {
          _color.setRGB(0.16 * shade, 0.31 * shade, 0.17 * shade, THREE.SRGBColorSpace);
          this.pineLowMesh.setColorAt(i, _color);
          _color.setRGB(0.19 * shade, 0.36 * shade, 0.2 * shade, THREE.SRGBColorSpace);
          this.pineTopMesh.setColorAt(i, _color);
        }
      }
      if (this.pineLowMesh.instanceColor) this.pineLowMesh.instanceColor.needsUpdate = true;
      if (this.pineTopMesh.instanceColor) this.pineTopMesh.instanceColor.needsUpdate = true;
    }

    if (this.oakCanopyMesh) {
      for (let i = 0; i < this.oakShades.length; i++) {
        const { shade, warm } = this.oakShades[i];
        if (season === 'Autumn') {
          const isRed = i % 3 === 0;
          _color.setRGB(
            (isRed ? 0.68 : 0.72) * shade,
            (isRed ? 0.28 : 0.44) * shade,
            0.12 * shade,
            THREE.SRGBColorSpace,
          );
        } else if (season === 'Winter') {
          _color.setRGB(0.62 * shade, 0.68 * shade, 0.74 * shade, THREE.SRGBColorSpace);
        } else {
          _color.setRGB((0.24 + warm) * shade, 0.39 * shade, 0.16 * shade, THREE.SRGBColorSpace);
        }
        this.oakCanopyMesh.setColorAt(i, _color);
      }
      if (this.oakCanopyMesh.instanceColor) this.oakCanopyMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateSnow(season: string, dt: number): void {
    if (season !== 'Winter') {
      this.snowMesh.visible = false;
      return;
    }
    this.snowMesh.visible = true;
    const king = this.worldRef.current.king;
    _scaleV.set(1, 1, 1);
    _quat.identity();
    for (let i = 0; i < this.snowFlakes.length; i++) {
      const f = this.snowFlakes[i];
      f.y -= f.speed * dt;
      f.ox += Math.sin(this.elapsedTitleTime * 1.4 + f.sway) * 0.6 * dt;
      if (f.y < 0.2) f.y += 18;
      _v3A.set(king.x + f.ox, f.y, king.z + f.oz);
      _mat4.compose(_v3A, _quat, _scaleV);
      this.snowMesh.setMatrixAt(i, _mat4);
    }
    this.snowMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLightingByTimeOfDay(timeOfDay: number, weather: WeatherCondition, dt: number): void {
    const weatherLerp = 1 - Math.exp(-3.2 * dt);
    this.weatherRainFactor = THREE.MathUtils.lerp(
      this.weatherRainFactor,
      weather === 'rainy' ? 1 : 0,
      weatherLerp,
    );
    this.weatherFogFactor = THREE.MathUtils.lerp(
      this.weatherFogFactor,
      weather === 'foggy' ? 1 : 0,
      weatherLerp,
    );

    const skyState = computeSkyboxState(
      timeOfDay,
      weather,
      this.weatherRainFactor,
      this.weatherFogFactor,
      this.elapsedTitleTime,
    );

    const { r, g, b } = skyState.horizonColor;
    (this.scene.background as THREE.Color).setRGB(r, g, b);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setRGB(r, g, b);
      this.scene.fog.density =
        0.0034 + this.weatherRainFactor * 0.0075 + this.weatherFogFactor * 0.022;
    }

    const king = this.worldRef.current.king;
    const sunX = skyState.sunDir.x * 58;
    const sunY = Math.max(12, skyState.sunElevation * 56 + 14);
    const sunZ = skyState.sunDir.z * 58;
    this.sunLight.position.set(king.x + sunX, sunY, king.z + sunZ);
    this.sunLight.target.position.set(king.x, 0, king.z);
    this.sunLight.color.setRGB(
      skyState.sunLightColor.r,
      skyState.sunLightColor.g,
      skyState.sunLightColor.b,
    );
    this.sunLight.intensity = skyState.sunIntensity;

    this.hemiLight.color.setRGB(skyState.hemiSkyColor.r, skyState.hemiSkyColor.g, skyState.hemiSkyColor.b);
    this.hemiLight.groundColor.setRGB(
      skyState.hemiGroundColor.r,
      skyState.hemiGroundColor.g,
      skyState.hemiGroundColor.b,
    );
    this.hemiLight.intensity = skyState.hemiIntensity;

    // Rotate & shade Dynamic Skybox Dome
    this.skyMesh.position.set(king.x, 0, king.z);
    this.skyMesh.rotation.y = skyState.skyRotationY;
    this.skyUniforms.uSunDir.value.set(skyState.sunDir.x, skyState.sunDir.y, skyState.sunDir.z);
    this.skyUniforms.uSunElevation.value = skyState.sunElevation;
    this.skyUniforms.uStarVisibility.value = skyState.starVisibility;
    this.skyUniforms.uRain.value = this.weatherRainFactor;
    this.skyUniforms.uFog.value = this.weatherFogFactor;
    this.skyUniforms.uTime.value = this.elapsedTitleTime;
    this.skyUniforms.uHorizonColor.value.setRGB(r, g, b);
    this.skyUniforms.uZenithColor.value.setRGB(
      skyState.zenithColor.r,
      skyState.zenithColor.g,
      skyState.zenithColor.b,
    );
    this.skyUniforms.uHorizonGlowColor.value.setRGB(
      skyState.horizonGlowColor.r,
      skyState.horizonGlowColor.g,
      skyState.horizonGlowColor.b,
    );
    this.skyUniforms.uSunColor.value.setRGB(
      skyState.sunColor.r,
      skyState.sunColor.g,
      skyState.sunColor.b,
    );

    if (this.cloudMesh) {
      const cMat = this.cloudMesh.material as THREE.MeshStandardMaterial;
      const daylightWeight = THREE.MathUtils.clamp((skyState.sunElevation + 0.25) / 0.65, 0.28, 1);
      const cr = THREE.MathUtils.lerp(skyState.sunColor.r * 0.98, 0.45, this.weatherRainFactor) * daylightWeight;
      const cg = THREE.MathUtils.lerp(skyState.sunColor.g * 0.96, 0.49, this.weatherRainFactor) * daylightWeight;
      const cb = THREE.MathUtils.lerp(skyState.sunColor.b * 0.95, 0.54, this.weatherRainFactor) * daylightWeight;
      cMat.color.setRGB(cr, cg, cb);
    }

    kingdomAudio.updateAmbience(weather);

    // Flicker bandit camp fire
    this.campFireLight.intensity = 2.6 + Math.sin(this.elapsedTitleTime * 9) * 0.7;
  }

  private stepKingMovement(dt: number): void {
    const world = this.worldRef.current;
    const king = world.king;

    if (this.justPressed.has('KeyH')) {
      king.mounted = !king.mounted;
      kingdomAudio.playFootstep(true);
      this.callbacks.onToast(king.mounted ? 'Mounted Royal Warhorse' : 'Dismounted Warhorse');
    }

    // Shield Block stance (hold KeyC)
    king.blocking = this.keysPressed.has('KeyC') && king.stamina > 4;

    if (this.justPressed.has('KeyF')) {
      if (
        triggerKingAttack(world, {
          completedBuildings: [],
          combatHits: [],
          banditsKo: [],
          arrowShots: [],
          kingHurt: false,
          blockedHit: false,
          dailyTick: false,
          familyArrived: false,
          births: 0,
          deaths: 0,
          marriages: 0,
          cartDeliveries: [],
          cartRaided: false,
          questCompleted: [],
        })
      ) {
        kingdomAudio.playSwordSlash();
        this.spawnParticles(
          king.x + Math.sin(king.facing) * 1.4,
          king.y + 1.2,
          king.z + Math.cos(king.facing) * 1.4,
          0xf2c96b,
          6,
          0.7,
        );
      }
    }

    // Camera yaw rotate with Q / E
    if (this.keysPressed.has('KeyQ')) this.camYaw += 1.9 * dt;
    if (this.keysPressed.has('KeyE') && !getClosestNpc(world)) {
      // Reserve E for interaction when near NPC; allow rotate when away or use Q/mouse drag
    }

    let moveForward = 0;
    let moveRight = 0;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) moveForward += 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) moveForward -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) moveRight += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) moveRight -= 1;

    const sprinting = (this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight')) && king.stamina > 8;
    const baseSpeed = (king.mounted ? 11.2 : 6.4) * getWeatherSpeedMultiplier(world.weather);
    const moveSpeed = sprinting ? baseSpeed * 1.42 : baseSpeed;

    if (moveForward !== 0 || moveRight !== 0) {
      const len = Math.hypot(moveForward, moveRight);
      const nf = moveForward / len;
      const nr = moveRight / len;

      // Camera forward vector projected onto XZ plane
      // When camYaw = 0, camera is at +Z looking toward -Z (north)
      const camFwdX = -Math.sin(this.camYaw);
      const camFwdZ = -Math.cos(this.camYaw);
      const camRightX = Math.cos(this.camYaw);
      const camRightZ = -Math.sin(this.camYaw);

      const dirX = camFwdX * nf + camRightX * nr;
      const dirZ = camFwdZ * nf + camRightZ * nr;

      const nextPos = clampToPlayableWorld(king.x + dirX * moveSpeed * dt, king.z + dirZ * moveSpeed * dt);
      king.x = nextPos.x;
      king.z = nextPos.z;

      // Smoothly turn king toward travel direction
      const targetFacing = Math.atan2(dirX, dirZ);
      let diff = targetFacing - king.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      king.facing += diff * (1 - Math.exp(-12 * dt));

      this.kingWalkDist += moveSpeed * dt;
      if (sprinting) {
        king.stamina = Math.max(0, king.stamina - 18 * dt);
      }

      this.stepSoundCooldown -= dt;
      if (king.grounded && this.stepSoundCooldown <= 0) {
        this.stepSoundCooldown = king.mounted ? 0.24 : sprinting ? 0.26 : 0.38;
        kingdomAudio.playFootstep(king.mounted);
      }
    } else {
      this.kingWalkDist *= 0.85;
    }

    // Jump
    if (this.justPressed.has('Space') && king.grounded) {
      king.vy = king.mounted ? 8.2 : 7.0;
      king.grounded = false;
      kingdomAudio.playFootstep(king.mounted);
    }

    const groundY = groundHeightAt(king.x, king.z);
    if (!king.grounded || king.y > groundY) {
      king.vy -= 21 * dt;
      king.y += king.vy * dt;
      if (king.y <= groundY) {
        king.y = groundY;
        king.vy = 0;
        king.grounded = true;
      }
    } else {
      king.y = groundY;
    }

    // Animate King Rig + Horse
    this.kingRig.root.position.set(king.x, king.y, king.z);
    this.kingRig.root.rotation.y = king.facing;

    if (this.kingRig.horseGroup) {
      this.kingRig.horseGroup.visible = king.mounted;
    }
    this.kingRig.bodyGroup.position.y = king.mounted ? 1.05 : 0;

    const moving = moveForward !== 0 || moveRight !== 0;
    const gaitAngle = moving ? Math.sin(this.kingWalkDist * 2.4) * 0.58 : 0;

    if (king.mounted && this.kingRig.horseLegs) {
      this.kingRig.leftLeg.rotation.x = -0.35;
      this.kingRig.rightLeg.rotation.x = -0.35;
      this.kingRig.horseLegs[0].rotation.x = gaitAngle;
      this.kingRig.horseLegs[1].rotation.x = -gaitAngle;
      this.kingRig.horseLegs[2].rotation.x = -gaitAngle;
      this.kingRig.horseLegs[3].rotation.x = gaitAngle;
    } else {
      this.kingRig.leftLeg.rotation.x = gaitAngle;
      this.kingRig.rightLeg.rotation.x = -gaitAngle;
    }

    if (this.kingRig.weaponMeshes) {
      const wType = king.weapon ?? 'broadsword';
      this.kingRig.weaponMeshes.broadsword.visible = wType === 'broadsword';
      this.kingRig.weaponMeshes.waraxe.visible = wType === 'waraxe';
      this.kingRig.weaponMeshes.royal_halberd.visible = wType === 'royal_halberd';
    }

    if (king.blocking) {
      this.kingRig.leftArm.rotation.x = -0.95;
      if (this.kingRig.shieldGroup) this.kingRig.shieldGroup.rotation.y = 0.25;
    } else {
      this.kingRig.leftArm.rotation.x = -gaitAngle * 0.45;
      if (this.kingRig.shieldGroup) this.kingRig.shieldGroup.rotation.y = -0.35;
    }

    if (king.attackTimer > 0) {
      const p = 1 - king.attackTimer / 0.28;
      this.kingRig.rightArm.rotation.x = -Math.PI * 0.7 + p * Math.PI * 1.1;
      this.kingRig.rightArm.rotation.z = -0.35 + p * 0.6;
    } else {
      this.kingRig.rightArm.rotation.x = gaitAngle * 0.45;
      this.kingRig.rightArm.rotation.z = 0;
    }
    if (this.kingRig.cape) {
      this.kingRig.cape.rotation.x = moving ? 0.34 + Math.sin(this.kingWalkDist * 3) * 0.08 : 0.08;
    }
    this.applyHitFlash(this.kingRig, king.hitFlashTimer > 0);
  }

  private updateCamera(dt: number): void {
    const world = this.worldRef.current;

    if (this.gameState === 'title') {
      this.elapsedTitleTime += dt;
      const orbitAngle = this.elapsedTitleTime * 0.12;
      const targetX = Math.sin(orbitAngle) * 32;
      const targetZ = Math.cos(orbitAngle) * 28 - 4;
      this.camPos.set(targetX, 17, targetZ);
      this.camLook.set(0, 2.2, -6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    this.elapsedTitleTime += dt;
    const king = world.king;
    const desiredOffsetX = Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const desiredOffsetY = Math.sin(this.camPitch) * this.camDist + (king.mounted ? 2.4 : 1.7);
    const desiredOffsetZ = Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;

    _v3A.set(king.x + desiredOffsetX, Math.max(groundHeightAt(king.x + desiredOffsetX, king.z + desiredOffsetZ) + 1.5, king.y + desiredOffsetY), king.z + desiredOffsetZ);
    const skyTiltLift = this.camPitch < 0.14 ? (0.14 - this.camPitch) * 6.5 : 0;
    _v3B.set(king.x, king.y + (king.mounted ? 2.6 : 2.15) + skyTiltLift, king.z - 1.5);

    const dampFactor = 1 - Math.exp(-9.5 * dt);
    this.camPos.lerp(_v3A, dampFactor);
    this.camLook.lerp(_v3B, dampFactor);

    this.camera.position.copy(this.camPos);
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
    }
    this.camera.lookAt(this.camLook);
  }

  private updateBuildGhost(): void {
    if (!this.activeBuildType || this.gameState !== 'playing' || this.modalOpen) {
      this.buildGhostGroup.visible = false;
      return;
    }

    _pointerNdc.set(
      (this.pointerScreenX / this.canvasWidth) * 2 - 1,
      -(this.pointerScreenY / this.canvasHeight) * 2 + 1,
    );
    _raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = _raycaster.intersectObject(this.terrainMesh, false);
    if (hits.length === 0) {
      this.buildGhostGroup.visible = false;
      return;
    }

    const pt = hits[0].point;
    const spec = BUILDING_SPECS[this.activeBuildType];
    const check = canPlaceBuilding(pt.x, pt.z, spec.footprintRadius, this.worldRef.current.buildings);

    this.buildPreviewPos = {
      x: Number(pt.x.toFixed(1)),
      z: Number(pt.z.toFixed(1)),
      valid: check.valid,
      reason: check.reason ?? '',
    };

    this.buildGhostGroup.visible = true;
    this.buildGhostGroup.position.set(pt.x, groundHeightAt(pt.x, pt.z) + 0.05, pt.z);
    const ghostHex = check.valid ? 0x4fd180 : 0xe05246;
    this.buildGhostMat.color.setHex(ghostHex);
    this.buildGhostBoxMat.color.setHex(ghostHex);
  }

  private emitHudProjections(): void {
    const world = this.worldRef.current;
    let closestPayload: HudProjection['closestNpc'] = null;
    let buildingPayload: HudProjection['nearbyBuilding'] = null;
    let cartPayload: HudProjection['nearbyCart'] = null;

    if (this.gameState === 'playing' && !this.modalOpen && !this.activeBuildType) {
      const npc = getClosestNpc(world, 4.6);
      if (npc) {
        _v3A.set(npc.x, groundHeightAt(npc.x, npc.z) + 2.25, npc.z);
        _v3A.project(this.camera);
        if (_v3A.z >= -1 && _v3A.z <= 1) {
          closestPayload = {
            id: npc.id,
            name: npc.name,
            professionLabel: PROFESSION_LABELS[npc.profession],
            activity: npc.activity,
            screenX: ((_v3A.x + 1) / 2) * this.canvasWidth,
            screenY: ((-_v3A.y + 1) / 2) * this.canvasHeight,
            visible: true,
          };
        }
      }

      const b = getClosestBuilding(world, 8.4);
      if (b) {
        _v3A.set(b.x, groundHeightAt(b.x, b.z) + 3.4, b.z);
        _v3A.project(this.camera);
        if (_v3A.z >= -1 && _v3A.z <= 1) {
          buildingPayload = {
            id: b.id,
            name: b.name,
            type: b.type,
            level: b.level,
            completed: b.completed,
            progress: b.progress,
            assignedWorkers: b.assignedWorkers,
            screenX: ((_v3A.x + 1) / 2) * this.canvasWidth,
            screenY: ((-_v3A.y + 1) / 2) * this.canvasHeight,
          };
        }
      }

      const cart = getClosestCart(world, 5.2);
      if (cart) {
        _v3A.set(cart.x, groundHeightAt(cart.x, cart.z) + 1.85, cart.z);
        _v3A.project(this.camera);
        if (_v3A.z >= -1 && _v3A.z <= 1) {
          const dest = world.buildings.find((bld) => bld.id === cart.destinationBuildingId);
          const label = cart.isCaravan
            ? `${cart.factionId === 'ironmarch' ? 'Ironmarch' : 'Oakhaven'} Trade Caravan`
            : `${cart.cargoType.replace('_', ' ')} Wagon`;
          cartPayload = {
            id: cart.id,
            label: `${label} -> ${dest?.name ?? 'Hub'}`,
            cargoType: cart.cargoType,
            returning: cart.returning,
            isCaravan: Boolean(cart.isCaravan),
            screenX: ((_v3A.x + 1) / 2) * this.canvasWidth,
            screenY: ((-_v3A.y + 1) / 2) * this.canvasHeight,
          };
        }
      }
    }

    this.callbacks.onProjection({
      closestNpc: closestPayload,
      nearbyBuilding: buildingPayload,
      nearbyCart: cartPayload,
      buildPreview: this.activeBuildType ? { ...this.buildPreviewPos } : null,
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    const world = this.worldRef.current;

    if (this.gameState === 'title') {
      // Living background village simulation on title screen!
      stepWorldSimulation(world, dt * 0.65);
      this.syncDynamicEntities(dt * 0.65);
      this.updateLightingByTimeOfDay(world.timeOfDay, world.weather, dt);
      this.updateRain(world.weather, dt);
      this.updateClouds(dt);
      this.waterMesh.position.y = -0.35 + Math.sin(this.elapsedTitleTime * 1.4) * 0.025;
      this.updateCamera(dt);
    } else if (this.gameState === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else if (!this.modalOpen) {
        this.stepKingMovement(dt);
        const simEvents = stepWorldSimulation(world, dt);

        if (simEvents.combatHits.length > 0) {
          kingdomAudio.playMetalClash();
          this.hitstopTimer = 0.045;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.45);
          for (const h of simEvents.combatHits) {
            this.spawnParticles(h.x, groundHeightAt(h.x, h.z) + 1.1, h.z, 0xffaa44, h.heavy ? 14 : 6, 1.1);
          }
        }
        if (simEvents.banditsKo.length > 0) {
          kingdomAudio.playCoin();
          for (const ko of simEvents.banditsKo) {
            this.spawnParticles(ko.x, groundHeightAt(ko.x, ko.z) + 1.0, ko.z, 0xe8c456, 18, 1.2);
          }
        }
        if (simEvents.kingHurt) {
          kingdomAudio.playHurt();
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.65);
        }
        if (simEvents.blockedHit) {
          kingdomAudio.playShieldBlock();
          this.spawnParticles(world.king.x, world.king.y + 1.2, world.king.z, 0x9ec9f2, 10, 0.9);
        }
        if (simEvents.arrowShots.length > 0) {
          kingdomAudio.playBowShot();
          for (const shot of simEvents.arrowShots) {
            this.spawnArrowProjectile(shot.fromX, shot.fromY, shot.fromZ, shot.toX, shot.toY, shot.toZ);
          }
        }
        if (simEvents.cartRaided) {
          kingdomAudio.playHurt();
          this.callbacks.onToast('Supply wagon ambushed by raiders!');
        }
        for (const qTitle of simEvents.questCompleted) {
          kingdomAudio.playRoyalHorn();
          kingdomAudio.playBellChime();
          this.callbacks.onToast(`Quest Complete: ${qTitle}!`);
        }
        for (const builtName of simEvents.completedBuildings) {
          kingdomAudio.playRoyalHorn();
          kingdomAudio.playBellChime();
          this.callbacks.onToast(`${builtName} completed & staffed!`);
        }
        if (
          (simEvents.familyArrived || simEvents.births > 0 || simEvents.marriages > 0) &&
          simEvents.completedBuildings.length === 0
        ) {
          kingdomAudio.playBellChime();
        }
        for (const del of simEvents.cartDeliveries) {
          const colorHex =
            del.isCaravan
              ? 0xffd75e
              : del.cargoType === 'timber'
                ? 0xc4955c
                : del.cargoType === 'stone'
                  ? 0xb8c0c8
                  : del.cargoType === 'iron_arms'
                    ? 0x9ec5e6
                    : 0xf0c95c;
          this.spawnParticles(
            del.x,
            groundHeightAt(del.x, del.z) + 1.2,
            del.z,
            colorHex,
            del.isCaravan ? 12 : 6,
            0.55,
          );
          if (del.isCaravan) {
            kingdomAudio.playCoin();
          }
        }

        // Contextual natural ambience & workplace soundscape (birds, thunder, anvil, axe/pickaxe, tavern lute)
        if (world.weather === 'sunny' && world.timeOfDay > 0.22 && world.timeOfDay < 0.78) {
          this.birdSoundTimer -= dt;
          if (this.birdSoundTimer <= 0) {
            this.birdSoundTimer = 4.2 + Math.random() * 5.0;
            kingdomAudio.playBirdChirp();
          }
        } else if (world.weather === 'rainy') {
          this.thunderTimer -= dt;
          if (this.thunderTimer <= 0) {
            this.thunderTimer = 9 + Math.random() * 10;
            kingdomAudio.playThunder();
          }
        }

        this.luteSoundTimer -= dt;
        if (this.luteSoundTimer <= 0) {
          this.luteSoundTimer = 7.5 + Math.random() * 6.0;
          const socialHub = world.buildings.find(
            (b) =>
              b.completed &&
              (b.type === 'tavern' || b.type === 'market') &&
              Math.hypot(b.x - world.king.x, b.z - world.king.z) < 22,
          );
          if (socialHub) {
            kingdomAudio.playTavernLute();
          }
        }

        this.chimneySmokeTimer -= dt;
        if (this.chimneySmokeTimer <= 0) {
          this.chimneySmokeTimer = 0.65;
          for (const b of world.buildings) {
            if (!b.completed) continue;
            if ((b.type === 'cottage' || b.type === 'bakery' || b.type === 'tavern') && Math.hypot(b.x - world.king.x, b.z - world.king.z) < 42) {
              this.spawnParticles(b.x + 1.2, groundHeightAt(b.x, b.z) + 4.3, b.z - 0.8, 0xcfd5dc, 1, 0.22);
            } else if (b.type === 'blacksmith' && Math.hypot(b.x - world.king.x, b.z - world.king.z) < 35) {
              this.spawnParticles(b.x + 1.1, groundHeightAt(b.x, b.z) + 2.2, b.z + 0.9, 0xff9234, 2, 0.35);
            }
          }
        }

        this.workSoundTimer -= dt;
        if (this.workSoundTimer <= 0) {
          this.workSoundTimer = 2.1 + Math.random() * 1.6;
          const nearbyWorker = world.npcs.find(
            (n) =>
              n.activity === 'working' &&
              (n.profession === 'blacksmith' || n.profession === 'woodcutter' || n.profession === 'miner') &&
              Math.hypot(n.x - world.king.x, n.z - world.king.z) < 26,
          );
          if (nearbyWorker) {
            if (nearbyWorker.profession === 'blacksmith') {
              kingdomAudio.playAnvilClink();
            } else {
              kingdomAudio.playAxeChop();
            }
          }
        }

        // Hammer audio cue if any builder is actively building near king
        if (world.buildings.some((b) => !b.completed)) {
          this.hammerSoundTimer -= dt;
          if (this.hammerSoundTimer <= 0) {
            this.hammerSoundTimer = 1.6;
            const activeSite = world.buildings.find((b) => !b.completed);
            if (activeSite && Math.hypot(activeSite.x - world.king.x, activeSite.z - world.king.z) < 28) {
              kingdomAudio.playHammer();
              this.spawnParticles(
                activeSite.x + (Math.random() - 0.5) * 2,
                groundHeightAt(activeSite.x, activeSite.z) + 1.4,
                activeSite.z + (Math.random() - 0.5) * 2,
                0xd8b888,
                5,
                0.55,
              );
            }
          }
        }
      }

      // Interact key [E] for NPC or [G] for nearby Building inspection
      if (!this.modalOpen && this.justPressed.has('KeyE')) {
        const npc = getClosestNpc(world, 4.6);
        if (npc) {
          this.callbacks.onOpenNpc(npc);
        }
      }
      if (!this.modalOpen && this.justPressed.has('KeyG')) {
        const b = getClosestBuilding(world, 8.4);
        if (b) {
          this.callbacks.onInspectBuilding(b.id);
        }
      }

      this.syncDynamicEntities(this.modalOpen ? 0 : dt);
      this.updateSeasonVisuals(world.season);
      this.updateLightingByTimeOfDay(world.timeOfDay, world.weather, dt);
      this.updateRain(world.weather, dt);
      this.updateSnow(world.season, dt);
      this.updateClouds(dt);
      this.waterMesh.position.y = -0.35 + Math.sin(this.elapsedTitleTime * 1.4) * 0.025;
      this.updateCamera(dt);
      this.updateBuildGhost();
      this.updateParticles(dt);
      this.updateArrows(dt);

      // Rotate windmill blades & flutter banners
      for (const rig of this.buildingRigs.values()) {
        if (rig.windmillBlades) rig.windmillBlades.rotation.z += dt * 1.1;
        if (rig.bannerCloth) rig.bannerCloth.rotation.y = Math.sin(this.elapsedTitleTime * 3.2) * 0.22;
      }

      // Throttled HUD sync (~10Hz)
      this.hudSyncTimer -= dt;
      if (this.hudSyncTimer <= 0 || world.outcome !== 'ongoing') {
        this.hudSyncTimer = 0.1;
        this.callbacks.onSnapshot(getSnapshot(world));
        this.emitHudProjections();
      }
    }

    this.justPressed.clear();
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public setGameState(state: GameScreenState, modalOpen: boolean): void {
    this.gameState = state;
    this.modalOpen = modalOpen;
    if (modalOpen || state !== 'playing') {
      this.keysPressed.clear();
      this.justPressed.clear();
    }
  }

  public setActiveBuildType(type: BuildingType | null): void {
    this.activeBuildType = type;
    if (!type) {
      this.buildGhostGroup.visible = false;
    }
  }

  public triggerManualAttack(): void {
    if (this.gameState !== 'playing' || this.modalOpen) return;
    const world = this.worldRef.current;
    if (
      triggerKingAttack(world, {
        completedBuildings: [],
        combatHits: [],
        banditsKo: [],
        arrowShots: [],
        kingHurt: false,
        blockedHit: false,
        dailyTick: false,
        familyArrived: false,
        births: 0,
        deaths: 0,
        marriages: 0,
        cartDeliveries: [],
        cartRaided: false,
        questCompleted: [],
      })
    ) {
      kingdomAudio.playSwordSlash();
      this.spawnParticles(
        world.king.x + Math.sin(world.king.facing) * 1.4,
        world.king.y + 1.2,
        world.king.z + Math.cos(world.king.facing) * 1.4,
        0xf2c96b,
        6,
        0.7,
      );
      this.callbacks.onSnapshot(getSnapshot(world));
    }
  }

  public resetWorldMeshes(): void {
    for (const rig of this.buildingRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.buildingRigs.clear();
    for (const rig of this.npcRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.npcRigs.clear();
    this.npcRigProfession.clear();
    for (const rig of this.banditRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.banditRigs.clear();
    for (const rig of this.cartRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.cartRigs.clear();
    this.cartCargoTypes.clear();
    this.syncDynamicEntities(0);
  }

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    this.canvasWidth = Math.max(320, rect.width || window.innerWidth);
    this.canvasHeight = Math.max(240, rect.height || window.innerHeight);
    this.camera.aspect = this.canvasWidth / this.canvasHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!this.keysPressed.has(e.code)) {
      this.justPressed.add(e.code);
    }
    this.keysPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keysPressed.clear();
    this.justPressed.clear();
    this.isDraggingCamera = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.gameState !== 'playing' || this.modalOpen) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerScreenX = e.clientX - rect.left;
    this.pointerScreenY = e.clientY - rect.top;

    if (e.button === 0 && this.activeBuildType) {
      this.updateBuildGhost();
      if (this.buildPreviewPos.valid) {
        const res = placeBuilding(
          this.worldRef.current,
          this.activeBuildType,
          this.buildPreviewPos.x,
          this.buildPreviewPos.z,
          0,
        );
        if (res.ok && res.building) {
          kingdomAudio.playHammer();
          this.spawnParticles(
            res.building.x,
            groundHeightAt(res.building.x, res.building.z) + 0.5,
            res.building.z,
            0xd8b888,
            14,
            0.9,
          );
          this.syncDynamicEntities();
          this.callbacks.onSnapshot(getSnapshot(this.worldRef.current));
          this.callbacks.onBuildResult(true, `Placed ${res.building.name}! Builders are en route.`);
        } else {
          this.callbacks.onBuildResult(false, res.reason ?? 'Cannot build here');
        }
      } else {
        this.callbacks.onBuildResult(false, this.buildPreviewPos.reason || 'Invalid build site');
      }
      return;
    }

    if (e.button === 2 || e.button === 0) {
      this.isDraggingCamera = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerScreenX = e.clientX - rect.left;
    this.pointerScreenY = e.clientY - rect.top;

    if (this.isDraggingCamera && this.gameState === 'playing' && !this.modalOpen) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.camYaw -= dx * 0.0055;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0045, -0.08, 0.95);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (
      this.isDraggingCamera &&
      e.button === 0 &&
      !this.activeBuildType &&
      this.gameState === 'playing' &&
      !this.modalOpen
    ) {
      // Quick left click without dragging swings the royal broadsword
      const moved = Math.hypot(e.clientX - this.lastPointerX, e.clientY - this.lastPointerY);
      if (moved < 3) {
        this.triggerManualAttack();
      }
    }
    this.isDraggingCamera = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.gameState !== 'playing' || this.modalOpen) return;
    this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.008, 6.5, 22);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.textures.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}

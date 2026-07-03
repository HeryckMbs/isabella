import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './style.css';
import { stageLabels, story, type StoryStage } from './content/story';

type Phase = StoryStage;

interface GalleryPhoto {
  id: string;
  caption: string;
  year: string;
  featured: boolean;
  puzzle: boolean;
  width: number | null;
  height: number | null;
  src: string;
  thumb: string;
}

interface PhotoManifest {
  generatedAt: string;
  photos: GalleryPhoto[];
}

interface IsabellaRig {
  head: THREE.Group;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftHair: THREE.Object3D;
  rightHair: THREE.Object3D;
  backHair: THREE.Object3D;
}

interface HeryckRig {
  body: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
}

type RealisticAvatarBoneName =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftArm'
  | 'leftForeArm'
  | 'rightShoulder'
  | 'rightArm'
  | 'rightForeArm'
  | 'leftUpLeg'
  | 'leftLeg'
  | 'leftFoot'
  | 'rightUpLeg'
  | 'rightLeg'
  | 'rightFoot'
  | 'ponytailRoot'
  | 'ponytail1'
  | 'ponytail2'
  | 'ponytail3';

interface RealisticAvatarBone {
  object: THREE.Object3D;
  restRotation: THREE.Euler;
  restPosition: THREE.Vector3;
}

type RealisticAvatarRig = Partial<Record<RealisticAvatarBoneName, RealisticAvatarBone>>;

interface RealisticAvatarState {
  model: THREE.Group | null;
  mixer: THREE.AnimationMixer | null;
  idleAction: THREE.AnimationAction | null;
  walkAction: THREE.AnimationAction | null;
  rig: RealisticAvatarRig;
  loadState: 'fallback' | 'loading' | 'loaded' | 'error';
  source: string;
}

interface Seed {
  mesh: THREE.Group;
  collected: boolean;
}

interface CareLight {
  orb: THREE.Group;
  target: THREE.Group;
  home: THREE.Vector3;
  targetPosition: THREE.Vector3;
  delivered: boolean;
}

function requireElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Elemento obrigatorio nao encontrado: ${selector}`);
  }
  return element;
}

declare global {
  interface Window {
    __jardimDebug?: {
      setPhase: (nextPhase: Phase) => void;
      completeTrail: () => void;
      completeLights: () => void;
      solvePuzzle: () => void;
      getPlayerState: () => { x: number; z: number; input: number; walk: number };
      getAvatarState: () => { state: string; source: string; loaded: boolean; bones: string[] };
      setAvatarBoneRotation: (bone: RealisticAvatarBoneName, x: number, y: number, z: number) => boolean;
      setPlayerPosition: (x: number, z: number) => void;
    };
  }
}

const canvas = requireElement<HTMLCanvasElement>('#game');
const stageLabel = requireElement<HTMLSpanElement>('#stage-label');
const progressLabel = requireElement<HTMLSpanElement>('#progress-label');
const narratorText = requireElement<HTMLParagraphElement>('#narrator-text');
const speaker = requireElement<HTMLSpanElement>('#speaker');
const joystick = requireElement<HTMLDivElement>('#joystick');
const joystickThumb = requireElement<HTMLDivElement>('#joystick-thumb');
const objectivePointer = requireElement<HTMLDivElement>('#objective-pointer');
const interactionButton = requireElement<HTMLButtonElement>('#interaction-button');
const puzzlePanel = requireElement<HTMLElement>('#puzzle-panel');
const puzzleGrid = requireElement<HTMLDivElement>('#puzzle-grid');
const loadingScreen = requireElement<HTMLDivElement>('#loading-screen');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: new URLSearchParams(window.location.search).has('debug'),
  powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ed7f3);
scene.fog = new THREE.Fog(0x8ed7f3, 20, 58);

const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
camera.position.set(0, 4.2, 7.5);

const clock = new THREE.Clock();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
let softGlowTexture: THREE.CanvasTexture | null = null;

const world = new THREE.Group();
const galleryGroup = new THREE.Group();
const flowerGroup = new THREE.Group();
const waterDetailGroup = new THREE.Group();
scene.add(world, galleryGroup);
world.add(flowerGroup, waterDetailGroup);

const animatedWaterObjects: THREE.Object3D[] = [];
const waterFoamObjects: THREE.Object3D[] = [];
const waterfallStripObjects: THREE.Object3D[] = [];
const waterMistObjects: THREE.Object3D[] = [];
const joystickVector = new THREE.Vector2();
const keyboardVector = new THREE.Vector2();
const inputVector = new THREE.Vector2();
const smoothedInputVector = new THREE.Vector2();
const cameraTarget = new THREE.Vector3();
const playerVelocity = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const pressedKeys = new Set<string>();

const REALISTIC_ISABELLA_MODEL_URL = './models/isabella.glb';
const REALISTIC_ISABELLA_TARGET_HEIGHT = 2.1;

let phase: Phase = 'intro';
let narrationIndex = 0;
let manifest: PhotoManifest = { generatedAt: '', photos: [] };
let puzzleImage = '';
let puzzleTiles: Array<number | null> = [0, 1, 2, 3, 5, null, 6, 4, 7];
let bloomProgress = 0;
let galleryYaw = 0;
let focusedPhoto = 0;
let galleryCreated = false;
let currentLightIndex = 0;
let heryckRevealLevel = 0;
let galleryDragActive = false;
let lastGalleryPointerX = 0;
let galleryDragDistance = 0;
let phaseTimer: number | null = null;
let narrationTimer: number | null = null;
let queuedPhase: Phase | null = null;
let isabellaWalkCycle = 0;
let isabellaMoveBlend = 0;
let puzzlePanelOpen = false;
let puzzleSolved = false;

const puzzleStationPosition = new THREE.Vector3(0.2, 0, -15.1);
const puzzleStation = new THREE.Group();
const puzzleInteractionRadius = 8.2;

function createToonGradientTexture() {
  const colors = new Uint8Array([
    92, 92, 92, 255,
    150, 150, 150, 255,
    218, 218, 218, 255,
    255, 255, 255, 255
  ]);
  const texture = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const toonGradientMap = createToonGradientTexture();
const inkOutlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x191611,
  side: THREE.BackSide
});

function toonMaterial(parameters: THREE.MeshToonMaterialParameters) {
  return new THREE.MeshToonMaterial({
    gradientMap: toonGradientMap,
    ...parameters
  });
}

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x78d46d, roughness: 0.84 }),
  grassDark: new THREE.MeshStandardMaterial({ color: 0x53aa64, roughness: 0.9 }),
  path: new THREE.MeshStandardMaterial({ color: 0xdcc274, roughness: 0.78 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x74d4eb,
    roughness: 0.25,
    metalness: 0.02,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide
  }),
  river: new THREE.MeshStandardMaterial({
    color: 0x4ed8ee,
    roughness: 0.18,
    metalness: 0.03,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
  }),
  riverDeep: new THREE.MeshStandardMaterial({
    color: 0x238fb7,
    roughness: 0.2,
    metalness: 0.04,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide
  }),
  foam: new THREE.MeshBasicMaterial({ color: 0xf7ffff, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0xa9713f, roughness: 0.82 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x527c93, roughness: 0.75 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x9aa89e, roughness: 0.88 }),
  white: toonMaterial({ color: 0xffffff }),
  whiteDetail: toonMaterial({ color: 0xe8fff6 }),
  leather: toonMaterial({ color: 0x3a2418 }),
  softBlack: toonMaterial({ color: 0x0c0d10 }),
  clothWrap: toonMaterial({ color: 0xd7d8d3 }),
  isabellaSkin: toonMaterial({ color: 0xd8a27f }),
  isabellaSkinWarm: toonMaterial({ color: 0xf0bd95 }),
  isabellaShirt: toonMaterial({ color: 0x101215 }),
  isabellaShorts: toonMaterial({ color: 0x17191d }),
  isabellaHair: toonMaterial({ color: 0x241913 }),
  isabellaHairLight: toonMaterial({ color: 0x6d442b }),
  isabellaPurple: toonMaterial({ color: 0x7441d8 }),
  heryckDetail: toonMaterial({ color: 0x4b8e72 }),
  memory: new THREE.MeshStandardMaterial({
    color: 0xffce58,
    emissive: 0xb56f16,
    emissiveIntensity: 0.45,
    roughness: 0.55
  }),
  light: new THREE.MeshStandardMaterial({
    color: 0xf9fff2,
    emissive: 0xfff4a5,
    emissiveIntensity: 1.9,
    roughness: 0.24
  })
};

function createLights() {
  const hemi = new THREE.HemisphereLight(0xdaf7ff, 0x6da864, 1.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1c2, 2.6);
  sun.position.set(6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 34;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);
}

function makeMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  castShadow = true,
  receiveShadow = true
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radiusTop: number, radiusBottom: number, material: THREE.Material) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const cylinder = makeMesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 8), material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return cylinder;
}

function seededNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createBladeGeometry(baseColor: number, midColor: number, tipColor: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.08, 0, 0,
    0.08, 0, 0,
    -0.045, 0.42, 0.012,
    0.045, 0.42, -0.012,
    0, 0.86, 0
  ]);
  const indices = [0, 1, 2, 1, 3, 2, 2, 3, 4];
  const colors = [baseColor, baseColor, midColor, midColor, tipColor].flatMap((color) => {
    const threeColor = new THREE.Color(color);
    return [threeColor.r, threeColor.g, threeColor.b];
  });

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function isNearPath(x: number, z: number) {
  const pathCenterX = 0.2 + (z + 4) * Math.tan(-0.08);
  return Math.abs(x - pathCenterX) < 2.4 && z > -24 && z < 16;
}

function isNearWater(x: number, z: number) {
  return (
    (Math.abs(z - 5.2) < 0.85 && x > -5.4 && x < 7.2) ||
    (Math.abs(x + 8.8) < 1.7 && z > -13.5 && z < 8.5) ||
    (Math.abs(x - 2.8) < 1.2 && z > -16.5 && z < -0.5)
  );
}

function createStylizedGrassField() {
  const grassMaterialA = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const grassMaterialB = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const bladeGeometries = [
    createBladeGeometry(0x2f8d42, 0x61c45f, 0xa7e46d),
    createBladeGeometry(0x287d3b, 0x53b85f, 0xd4ed77),
    createBladeGeometry(0x3b994c, 0x78d15e, 0xf2f0a0)
  ];
  const bladeMaterials = [grassMaterialA, grassMaterialB, grassMaterialA];
  const counts = [920, 720, 460];
  const spreadX = 31;
  const spreadZ = 33;
  const originZ = -4.2;
  const dummy = new THREE.Object3D();

  bladeGeometries.forEach((geometry, meshIndex) => {
    const mesh = new THREE.InstancedMesh(geometry, bladeMaterials[meshIndex], counts[meshIndex]);
    mesh.name = 'stylized-instanced-grass';
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    let placed = 0;
    let attempts = 0;
    while (placed < counts[meshIndex] && attempts < counts[meshIndex] * 12) {
      attempts += 1;
      const seed = attempts + meshIndex * 10000;
      const x = (seededNoise(seed) - 0.5) * spreadX;
      const z = originZ + (seededNoise(seed + 31.7) - 0.5) * spreadZ;
      const nearPath = isNearPath(x, z);
      const denseEdge = Math.abs(x - (0.2 + (z + 4) * Math.tan(-0.08))) < 4.2;

      if (nearPath || isNearWater(x, z)) continue;
      if (!denseEdge && seededNoise(seed + 91.2) < 0.28) continue;

      const height = 0.34 + seededNoise(seed + 4.4) * 0.36 + (denseEdge ? 0.16 : 0);
      const width = 0.42 + seededNoise(seed + 8.8) * 0.5;
      dummy.position.set(x, 0.028 + seededNoise(seed + 2) * 0.02, z);
      dummy.rotation.set(
        0.12 * Math.sin(seed),
        seededNoise(seed + 6.1) * Math.PI * 2,
        (seededNoise(seed + 7.2) - 0.5) * 0.3
      );
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    world.add(mesh);
  });
}

function resetWaterMotionObjects() {
  animatedWaterObjects.length = 0;
  waterFoamObjects.length = 0;
  waterfallStripObjects.length = 0;
  waterMistObjects.length = 0;
}

function trackWaterMotion<T extends THREE.Object3D>(object: T, collection: THREE.Object3D[], name: string, seedOffset = 0) {
  object.name = name;
  object.userData.basePosition = object.position.clone();
  object.userData.motionSeed = seedOffset + collection.length * 0.731;
  collection.push(object);
  return object;
}

function createRibbonGeometry(points: THREE.Vector3[], widths: number[]) {
  const sampleCount = Math.max((points.length - 1) * 10, points.length);
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
  const sampledPoints = Array.from({ length: sampleCount + 1 }, (_, index) => curve.getPoint(index / sampleCount));
  const sampledWidths = sampledPoints.map((_, index) => {
    const widthPosition = (index / sampleCount) * (widths.length - 1);
    const low = Math.floor(widthPosition);
    const high = Math.min(widths.length - 1, low + 1);
    return THREE.MathUtils.lerp(widths[low], widths[high], widthPosition - low);
  });
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  sampledPoints.forEach((point, index) => {
    const previous = sampledPoints[Math.max(0, index - 1)];
    const next = sampledPoints[Math.min(sampledPoints.length - 1, index + 1)];
    const tangent = next.clone().sub(previous);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const halfWidth = sampledWidths[index] / 2;
    const left = point.clone().add(normal.clone().multiplyScalar(halfWidth));
    const right = point.clone().add(normal.clone().multiplyScalar(-halfWidth));

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, index / (sampledPoints.length - 1), 1, index / (sampledPoints.length - 1));

    if (index < sampledPoints.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createVerticalWaterRibbon(points: THREE.Vector3[], widths: number[], wiggle = 0.08) {
  const sampleCount = Math.max((points.length - 1) * 12, points.length);
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const point = curve.getPoint(t);
    const widthPosition = t * (widths.length - 1);
    const low = Math.floor(widthPosition);
    const high = Math.min(widths.length - 1, low + 1);
    const width = THREE.MathUtils.lerp(widths[low], widths[high], widthPosition - low);
    const sideWave = Math.sin(t * Math.PI * 5) * wiggle + Math.sin(t * Math.PI * 11) * wiggle * 0.35;

    positions.push(
      point.x - width * 0.5 + sideWave,
      point.y,
      point.z + Math.cos(t * Math.PI * 4) * wiggle * 0.2,
      point.x + width * 0.5 + sideWave * 0.45,
      point.y,
      point.z + Math.sin(t * Math.PI * 3) * wiggle * 0.18
    );
    uvs.push(0, t, 1, t);

    if (index < sampleCount) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWaterDecalTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const scale = size / 90;
  const toCanvasPoint = ([x, z]: [number, number]) => ({
    x: (x + 45) * scale,
    y: (45 - z) * scale
  });

  const drawSmoothPath = (points: Array<[number, number]>) => {
    const first = toCanvasPoint(points[0]);
    context.beginPath();
    context.moveTo(first.x, first.y);

    for (let index = 1; index < points.length - 1; index += 1) {
      const current = toCanvasPoint(points[index]);
      const next = toCanvasPoint(points[index + 1]);
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }

    const last = toCanvasPoint(points[points.length - 1]);
    context.lineTo(last.x, last.y);
  };

  const strokePath = (points: Array<[number, number]>, width: number, color: string, alpha: number, dash: number[] = []) => {
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width * scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.setLineDash(dash.map((value) => value * scale));
    drawSmoothPath(points);
    context.stroke();
    context.restore();
  };

  const drawRiver = (points: Array<[number, number]>, width: number) => {
    strokePath(points, width * 1.36, '#238fb7', 0.22);
    strokePath(points, width * 1.08, '#31c9dc', 0.82);
    strokePath(points, width * 0.68, '#65e8ef', 0.38);
    strokePath(points, width * 0.08, '#f7ffff', 0.72, [0.74, 0.52]);
  };

  const mainRiver = [
    [-11.7, 8],
    [-9.8, 3.2],
    [-9.1, -3.2],
    [-7.7, -9.5],
    [-5.4, -15.4],
    [-3.4, -21.8]
  ] as Array<[number, number]>;

  const branchRiver = [
    [7.8, -1],
    [5.6, -4.4],
    [3.8, -8.4],
    [0.8, -12.2],
    [-2.8, -15.6]
  ] as Array<[number, number]>;

  const foregroundCreek = [
    [-4.6, 5.55],
    [-2.1, 5.15],
    [0.4, 5.42],
    [3.6, 4.95],
    [6.2, 5.35]
  ] as Array<[number, number]>;

  const waterfallPool = [
    [-8.55, -14.2],
    [-7.55, -13.72],
    [-6.15, -13.6],
    [-4.75, -13.84],
    [-4.05, -14.42]
  ] as Array<[number, number]>;

  drawRiver(mainRiver, 2.35);
  drawRiver(branchRiver, 1.22);
  drawRiver(foregroundCreek, 0.9);
  drawRiver(waterfallPool, 1.7);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.needsUpdate = true;
  return texture;
}

function createWaterDecal() {
  const texture = createWaterDecalTexture();
  if (!texture) return;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const decal = makeMesh(new THREE.PlaneGeometry(90, 90), material, false, false);
  decal.name = 'canvas-water-decal';
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.052;
  decal.renderOrder = 2;
  world.add(decal);
}

function createRiverAndWaterfall() {
  waterDetailGroup.clear();

  const mainRiverPoints = [
    new THREE.Vector3(-11.7, 0.026, 8),
    new THREE.Vector3(-9.8, 0.028, 3.2),
    new THREE.Vector3(-9.1, 0.03, -3.2),
    new THREE.Vector3(-7.7, 0.03, -9.5),
    new THREE.Vector3(-5.4, 0.032, -15.4),
    new THREE.Vector3(-3.4, 0.034, -21.8)
  ];

  for (let i = 0; i < 5; i += 1) {
    const step = makeMesh(new THREE.DodecahedronGeometry(0.22 + (i % 2) * 0.05, 0), materials.stone);
    step.position.set(-1.5 + i * 0.68, 0.13, 5.28 + Math.sin(i) * 0.18);
    step.scale.set(1.15, 0.32, 0.78);
    step.rotation.set(i * 0.2, i * 0.5, i * 0.14);
    waterDetailGroup.add(step);
  }

  for (let i = 0; i < 18; i += 1) {
    const point = mainRiverPoints[i % mainRiverPoints.length];
    const rock = makeMesh(new THREE.DodecahedronGeometry(0.18 + (i % 4) * 0.06, 0), materials.stone);
    rock.position.set(point.x + Math.sin(i * 1.8) * 1.6, 0.13, point.z + Math.cos(i * 1.1) * 0.82);
    rock.scale.y = 0.42 + (i % 3) * 0.12;
    rock.rotation.set(i * 0.31, i * 0.47, i * 0.13);
    waterDetailGroup.add(rock);
  }

  const waterfall = new THREE.Group();
  waterfall.position.set(-6.4, 0, -14.6);
  waterfall.rotation.y = -0.28;

  const cliffMaterial = new THREE.MeshStandardMaterial({ color: 0x69786c, roughness: 0.96 });
  const cliffDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x465847, roughness: 0.98 });
  const cliffRocks = [
    [-2.2, 1.5, -0.46, 1.0, 2.0, 0.46, 0.1],
    [-1.18, 1.95, -0.58, 1.18, 2.42, 0.5, 0.7],
    [0.18, 1.82, -0.62, 0.92, 2.18, 0.46, 1.4],
    [1.35, 1.45, -0.5, 0.96, 1.92, 0.44, 2.2],
    [2.18, 1.08, -0.36, 0.72, 1.38, 0.36, 2.9],
    [-2.72, 0.72, -0.28, 0.62, 1.06, 0.36, 3.5],
    [-0.72, 0.66, -0.32, 0.72, 0.98, 0.38, 4.1],
    [1.08, 0.58, -0.24, 0.66, 0.9, 0.34, 4.8]
  ] as const;

  cliffRocks.forEach(([x, y, z, sx, sy, sz, rotation], index) => {
    const rock = makeMesh(new THREE.DodecahedronGeometry(0.86, 1), index % 3 === 0 ? cliffDarkMaterial : cliffMaterial);
    rock.position.set(x, y, z);
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(0.2 + index * 0.19, rotation, -0.08 + index * 0.07);
    waterfall.add(rock);
  });

  for (let i = 0; i < 11; i += 1) {
    const ledge = makeMesh(new THREE.DodecahedronGeometry(0.22 + (i % 3) * 0.09, 0), materials.stone);
    ledge.position.set(-2.45 + i * 0.48, 0.32 + (i % 5) * 0.32, -0.08 + Math.sin(i) * 0.11);
    ledge.scale.set(1.05, 0.26 + (i % 2) * 0.12, 0.42);
    ledge.rotation.set(i * 0.28, i * 0.43, i * 0.19);
    waterfall.add(ledge);
  }

  for (let i = 0; i < 5; i += 1) {
    const fallMaterial = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? 0xd9fbff : 0x9ee8f4,
      transparent: true,
      opacity: i === 2 ? 0.72 : 0.56,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const x = -0.86 + i * 0.42;
    const fall = makeMesh(
      createVerticalWaterRibbon(
        [
          new THREE.Vector3(x - 0.12, 3.0 - (i % 2) * 0.16, 0.34),
          new THREE.Vector3(x + Math.sin(i) * 0.12, 2.2, 0.38 + (i % 2) * 0.04),
          new THREE.Vector3(x - Math.cos(i) * 0.09, 1.25, 0.44),
          new THREE.Vector3(x + Math.sin(i * 1.7) * 0.14, 0.34, 0.52)
        ],
        [0.52, 0.42, 0.58, 0.32],
        0.06 + i * 0.01
      ),
      fallMaterial,
      false,
      false
    );
    trackWaterMotion(fall, waterfallStripObjects, 'waterfall-strip', i * 0.72);
    waterfall.add(fall);
  }

  const poolPoints = [
    new THREE.Vector3(-2.25, 0.055, 0.42),
    new THREE.Vector3(-1.2, 0.058, 0.84),
    new THREE.Vector3(0.18, 0.06, 0.94),
    new THREE.Vector3(1.55, 0.058, 0.76),
    new THREE.Vector3(2.38, 0.055, 0.34)
  ];
  const splashPool = makeMesh(createRibbonGeometry(poolPoints, [1.18, 1.7, 2.05, 1.5, 0.92]), materials.water, false, true);
  trackWaterMotion(splashPool, animatedWaterObjects, 'animated-water', 4.5);
  waterfall.add(splashPool);

  for (let i = 0; i < 4; i += 1) {
    const foam = makeMesh(
      createRibbonGeometry(
        poolPoints.map((point, index) => point.clone().add(new THREE.Vector3(Math.sin(i + index) * 0.08, 0.035, -0.12 + i * 0.08))),
        [0.06, 0.12, 0.16, 0.12, 0.06]
      ),
      materials.foam,
      false,
      false
    );
    trackWaterMotion(foam, waterFoamObjects, 'water-foam', 4 + i * 0.4);
    waterfall.add(foam);
  }

  for (let i = 0; i < 16; i += 1) {
    const mist = makeMesh(
      new THREE.SphereGeometry(0.06 + (i % 4) * 0.018, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 }),
      false,
      false
    );
    mist.position.set(Math.sin(i * 1.4) * 1.5, 0.42 + (i % 5) * 0.11, 0.58 + Math.cos(i) * 0.35);
    trackWaterMotion(mist, waterMistObjects, 'water-mist', i * 0.49);
    waterfall.add(mist);
  }

  waterDetailGroup.add(waterfall);
}

function createTerrain() {
  resetWaterMotionObjects();

  const ground = makeMesh(new THREE.PlaneGeometry(90, 90, 24, 24), materials.grass, false, true);
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);

  const path = makeMesh(new THREE.PlaneGeometry(4, 42), materials.path, false, true);
  path.rotation.x = -Math.PI / 2;
  path.rotation.z = -0.08;
  path.position.set(0.2, 0.012, -4);
  world.add(path);

  createWaterDecal();
  createRiverAndWaterfall();
  createStylizedGrassField();

  for (let i = 0; i < 9; i += 1) {
    const hill = makeMesh(new THREE.SphereGeometry(3 + Math.random() * 2.4, 16, 8), materials.grassDark);
    hill.scale.y = 0.22;
    hill.position.set(-25 + i * 6.4, -0.34, -24 - Math.sin(i) * 2);
    world.add(hill);
  }
}

function createTree(x: number, z: number, scale = 1, variant = 0) {
  const tree = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: variant % 2 === 0 ? 0x8a6037 : 0x6f5131, roughness: 0.92 });
  const barkDark = new THREE.MeshStandardMaterial({ color: 0x4e3925, roughness: 0.96 });
  const leafPalette = [0x3f8f52, 0x56a764, 0x6fbd68, 0x2f7e4f].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );

  const height = (2.2 + (variant % 3) * 0.26) * scale;
  const trunkLean = new THREE.Vector3(Math.sin(variant * 1.7) * 0.18 * scale, height, Math.cos(variant * 1.3) * 0.12 * scale);
  const trunk = cylinderBetween(new THREE.Vector3(0, 0.08 * scale, 0), trunkLean, 0.12 * scale, 0.25 * scale, bark);
  tree.add(trunk);

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + variant * 0.4;
    const rootEnd = new THREE.Vector3(Math.cos(angle) * 0.55 * scale, 0.04 * scale, Math.sin(angle) * 0.42 * scale);
    tree.add(cylinderBetween(new THREE.Vector3(0, 0.08 * scale, 0), rootEnd, 0.035 * scale, 0.08 * scale, barkDark));
  }

  for (let i = 0; i < 5; i += 1) {
    const ring = makeMesh(new THREE.TorusGeometry((0.19 - i * 0.012) * scale, 0.006 * scale, 5, 18), barkDark, false, false);
    ring.position.copy(trunkLean).multiplyScalar((i + 2.2) / 8);
    ring.rotation.x = Math.PI / 2 + 0.15 * Math.sin(i + variant);
    ring.rotation.z = variant + i * 0.55;
    tree.add(ring);
  }

  const branchStarts = [
    new THREE.Vector3(0.02 * scale, height * 0.56, 0),
    new THREE.Vector3(-0.03 * scale, height * 0.68, 0.02 * scale),
    new THREE.Vector3(0, height * 0.78, -0.02 * scale),
    new THREE.Vector3(0.02 * scale, height * 0.86, 0)
  ];

  const branchEnds = branchStarts.map((start, index) => {
    const angle = variant * 0.9 + index * 1.7;
    return start
      .clone()
      .add(new THREE.Vector3(Math.cos(angle) * (0.62 + index * 0.08) * scale, (0.42 - index * 0.04) * scale, Math.sin(angle) * 0.56 * scale));
  });

  branchEnds.forEach((end, index) => {
    const start = branchStarts[index];
    tree.add(cylinderBetween(start, end, 0.035 * scale, 0.09 * scale, bark));
    const twigEnd = end
      .clone()
      .add(new THREE.Vector3(Math.cos(index + variant) * 0.26 * scale, 0.2 * scale, Math.sin(index * 2 + variant) * 0.22 * scale));
    tree.add(cylinderBetween(end, twigEnd, 0.014 * scale, 0.034 * scale, barkDark));
  });

  const canopyCenters = [
    trunkLean.clone().add(new THREE.Vector3(0, 0.34 * scale, 0)),
    ...branchEnds.map((end) => end.clone().add(new THREE.Vector3(0, 0.28 * scale, 0)))
  ];

  canopyCenters.forEach((center, index) => {
    const leaf = makeMesh(new THREE.SphereGeometry((0.58 + (index % 2) * 0.1) * scale, 14, 10), leafPalette[(index + variant) % leafPalette.length]);
    leaf.position.copy(center);
    leaf.scale.set(1.25 - index * 0.05, 0.82 + (index % 3) * 0.08, 1.0 + (index % 2) * 0.22);
    tree.add(leaf);
  });

  for (let i = 0; i < 10; i += 1) {
    const angle = variant + i * 1.11;
    const leaf = makeMesh(new THREE.ConeGeometry(0.055 * scale, 0.16 * scale, 5), leafPalette[(i + 2) % leafPalette.length], false, false);
    leaf.position.set(Math.cos(angle) * (0.55 + (i % 4) * 0.16) * scale, (1.65 + (i % 5) * 0.16) * scale, Math.sin(angle) * (0.5 + (i % 3) * 0.13) * scale);
    leaf.rotation.set(Math.sin(i) * 0.5, angle, Math.cos(i) * 0.4);
    tree.add(leaf);
  }

  tree.position.set(x, 0, z);
  tree.rotation.y = variant * 0.37;
  world.add(tree);
}

function createCottage(x: number, z: number, scale = 1) {
  const house = new THREE.Group();
  const body = makeMesh(new THREE.BoxGeometry(2.4 * scale, 1.5 * scale, 2 * scale), materials.wood);
  body.position.y = 0.75 * scale;

  const roof = makeMesh(new THREE.ConeGeometry(1.9 * scale, 1.25 * scale, 4), materials.roof);
  roof.position.y = 1.85 * scale;
  roof.rotation.y = Math.PI / 4;

  const door = makeMesh(new THREE.BoxGeometry(0.48 * scale, 0.92 * scale, 0.05), materials.path, false, false);
  door.position.set(0, 0.48 * scale, 1.03 * scale);

  house.add(body, roof, door);
  house.position.set(x, 0, z);
  house.rotation.y = -0.25 + Math.random() * 0.4;
  world.add(house);
}

function createVillage() {
  createCottage(-7.4, -9.4, 1.18);
  createCottage(6.2, -12.6, 1.05);
  createCottage(10.4, -5.8, 0.86);

  const treePositions = [
    [-9.6, -6.6, 1.1],
    [-8.9, 3.5, 1.2],
    [10.6, 1.7, 1],
    [11.8, -7.4, 1.35],
    [-13.2, -11.4, 1.25],
    [13.4, -15.8, 1.45],
    [-10.5, 10.8, 1],
    [10.5, 9.6, 1.2],
    [-14.6, 2.1, 0.92],
    [-12.8, 6.9, 0.82],
    [13.4, 5.8, 0.92],
    [15.2, -1.8, 0.78],
    [-7.2, -15.2, 0.88],
    [7.9, -17.6, 0.96],
    [-16.5, -16.5, 1.05],
    [16.8, -13.2, 1.12],
    [-5.4, 13.3, 0.78],
    [5.8, 13.9, 0.84],
    [-4.7, 5.2, 0.62],
    [4.9, 4.2, 0.58],
    [-4.9, 0.4, 0.66],
    [5.1, -1.6, 0.64],
    [-5.2, -5.8, 0.72],
    [5.4, -7.1, 0.7],
    [-3.05, 4.8, 0.42],
    [3.08, 2.4, 0.44],
    [-3.12, -1.2, 0.48],
    [3.16, -4.2, 0.5]
  ] as const;

  treePositions.forEach(([x, z, scale], index) => {
    createTree(x, z, scale, index);
  });

  for (let i = 0; i < 12; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (12 + (i % 4) * 1.6);
    const z = -18 + i * 2.7;
    createTree(x, z, 0.64 + (i % 3) * 0.09, i + 20);
  }

  for (let i = 0; i < 16; i += 1) {
    const rock = makeMesh(new THREE.DodecahedronGeometry(0.34 + Math.random() * 0.28, 0), materials.stone);
    rock.scale.y = 0.55 + Math.random() * 0.35;
    rock.position.set(-13 + Math.random() * 26, 0.2, -17 + Math.random() * 25);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    world.add(rock);
  }
}

function createShirtTexture() {
  const shirtCanvas = document.createElement('canvas');
  shirtCanvas.width = 512;
  shirtCanvas.height = 512;
  const context = shirtCanvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#101215';
  context.fillRect(0, 0, shirtCanvas.width, shirtCanvas.height);

  const gradient = context.createLinearGradient(150, 210, 360, 330);
  gradient.addColorStop(0, '#f4f8ff');
  gradient.addColorStop(0.45, '#89d8ff');
  gradient.addColorStop(1, '#f59e9c');

  context.save();
  context.translate(256, 280);
  context.fillStyle = gradient;
  context.strokeStyle = '#f4f8ff';
  context.lineWidth = 8;
  context.font = '900 64px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('2018', 0, -58);
  context.strokeText('2018', 0, -58);

  context.beginPath();
  context.ellipse(0, 16, 96, 56, -0.12, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#101215';
  context.beginPath();
  context.moveTo(-56, 12);
  context.lineTo(10, -28);
  context.lineTo(74, 40);
  context.lineTo(18, 20);
  context.lineTo(-28, 62);
  context.closePath();
  context.fill();

  context.fillStyle = '#f4f8ff';
  context.font = '800 32px system-ui, sans-serif';
  context.fillText('MEMORIA', 0, 104);
  context.restore();

  const texture = new THREE.CanvasTexture(shirtCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function createTransparentPatchTexture(label: string) {
  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = 256;
  patchCanvas.height = 196;
  const context = patchCanvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
  const gradient = context.createLinearGradient(42, 42, 210, 156);
  gradient.addColorStop(0, '#f8fbff');
  gradient.addColorStop(0.55, '#9edfff');
  gradient.addColorStop(1, '#f0a7a4');

  context.strokeStyle = gradient;
  context.fillStyle = gradient;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 12;

  context.beginPath();
  context.moveTo(44, 118);
  context.lineTo(98, 70);
  context.lineTo(130, 112);
  context.lineTo(166, 54);
  context.lineTo(214, 126);
  context.stroke();

  context.beginPath();
  context.ellipse(128, 104, 82, 46, -0.05, 0, Math.PI * 2);
  context.stroke();

  context.font = '900 34px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 128, 42);

  const texture = new THREE.CanvasTexture(patchCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLimbSegment(length: number, radiusTop: number, radiusBottom: number, material: THREE.Material) {
  const segment = makeMesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 16), material);
  segment.position.y = -length / 2;
  return segment;
}

function createFaceDetail(color: number, radius = 0.018) {
  return makeMesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color }), false, false);
}

function createFaceFeatureTexture() {
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 256;
  faceCanvas.height = 256;
  const context = faceCanvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.fillStyle = '#241913';
  context.beginPath();
  context.ellipse(88, 104, 13, 17, -0.08, 0, Math.PI * 2);
  context.ellipse(168, 104, 13, 17, 0.08, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#241913';
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(70, 78);
  context.quadraticCurveTo(90, 68, 112, 78);
  context.moveTo(144, 78);
  context.quadraticCurveTo(166, 68, 186, 78);
  context.stroke();

  context.strokeStyle = '#a46a58';
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(128, 112);
  context.quadraticCurveTo(120, 132, 132, 138);
  context.stroke();

  context.strokeStyle = '#8a3f36';
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(86, 162);
  context.quadraticCurveTo(128, 197, 172, 162);
  context.stroke();

  context.fillStyle = 'rgba(238, 142, 130, 0.42)';
  context.beginPath();
  context.ellipse(66, 142, 18, 10, -0.12, 0, Math.PI * 2);
  context.ellipse(190, 142, 18, 10, 0.12, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(faceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHairStrand(points: THREE.Vector3[], radius: number, material: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points);
  return makeMesh(new THREE.TubeGeometry(curve, 14, radius, 6, false), material);
}

function createDetailedHand(material: THREE.Material, thumbSide: -1 | 1) {
  const hand = new THREE.Group();
  const palm = makeMesh(new THREE.SphereGeometry(0.065, 12, 8), material);
  palm.scale.set(0.82, 1, 0.62);

  const fingerPositions = [-0.035, 0, 0.035];
  fingerPositions.forEach((x, index) => {
    const finger = createLimbSegment(0.105 - index * 0.012, 0.011, 0.01, material);
    finger.position.set(x, -0.045, 0.018);
    finger.rotation.z = x * -1.6;
    hand.add(finger);
  });

  const thumb = createLimbSegment(0.105, 0.014, 0.012, material);
  thumb.position.set(thumbSide * 0.058, -0.012, 0.012);
  thumb.rotation.z = thumbSide * 0.95;

  hand.add(palm, thumb);
  return hand;
}

function createSandal(skinMaterial: THREE.Material, soleMaterial: THREE.Material, strapMaterial: THREE.Material) {
  const sandal = new THREE.Group();

  const sole = makeMesh(new THREE.CapsuleGeometry(0.06, 0.19, 6, 14), soleMaterial);
  sole.position.set(0, -0.012, 0.065);
  sole.rotation.x = Math.PI / 2;
  sole.scale.set(1.04, 0.86, 0.56);

  const toes = makeMesh(new THREE.SphereGeometry(0.052, 10, 6), skinMaterial);
  toes.position.set(0, 0.025, 0.16);
  toes.scale.set(1.25, 0.35, 0.62);

  const frontStrap = cylinderBetween(
    new THREE.Vector3(-0.072, 0.038, 0.105),
    new THREE.Vector3(0.072, 0.038, 0.105),
    0.012,
    0.012,
    strapMaterial
  );
  const ankleStrap = cylinderBetween(
    new THREE.Vector3(-0.062, 0.07, -0.005),
    new THREE.Vector3(0.062, 0.07, -0.005),
    0.011,
    0.011,
    strapMaterial
  );
  const sideStrap = cylinderBetween(
    new THREE.Vector3(0.06, 0.04, 0.11),
    new THREE.Vector3(0.045, 0.068, -0.008),
    0.009,
    0.009,
    strapMaterial
  );

  sandal.add(sole, toes, frontStrap, ankleStrap, sideStrap);
  return sandal;
}

function createClothWrap(material: THREE.Material) {
  const wrap = new THREE.Group();
  [-0.06, 0.02, 0.1].forEach((y, index) => {
    const band = makeMesh(new THREE.TorusGeometry(0.07 - index * 0.004, 0.012, 6, 18), material);
    band.position.y = y;
    band.rotation.x = Math.PI / 2;
    band.rotation.z = index * 0.38;
    wrap.add(band);
  });
  return wrap;
}

function createSatchel() {
  const bag = new THREE.Group();

  const shell = makeMesh(new THREE.SphereGeometry(0.17, 14, 10), materials.leather);
  shell.scale.set(1.05, 1.25, 0.48);
  const flap = makeMesh(new THREE.BoxGeometry(0.24, 0.09, 0.035), materials.softBlack);
  flap.position.set(0, 0.085, 0.07);
  flap.rotation.x = -0.15;
  const clasp = makeMesh(new THREE.SphereGeometry(0.022, 8, 6), materials.isabellaPurple, false, false);
  clasp.position.set(0, 0.035, 0.095);

  bag.add(shell, flap, clasp);
  return bag;
}

function addInkOutline(root: THREE.Group, scale = 1.045) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name.includes('outline')) return;
    if (child.geometry.type === 'PlaneGeometry') return;
    meshes.push(child);
  });

  meshes.forEach((mesh) => {
    const outline = new THREE.Mesh(mesh.geometry, inkOutlineMaterial);
    outline.name = `${mesh.name || 'mesh'}-outline`;
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale).multiplyScalar(scale);
    outline.visible = mesh.visible;
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = -1;
    mesh.parent?.add(outline);
  });
}

function createIsabellaAvatar() {
  const root = new THREE.Group();
  root.name = 'isabella-avatar';

  const shirtTexture = createShirtTexture();
  const frontPatchTexture = createTransparentPatchTexture('2018');
  const backPatchTexture = createTransparentPatchTexture('ISA');
  const faceFeatureTexture = createFaceFeatureTexture();
  const shirtMaterial = materials.isabellaShirt.clone();
  if (shirtTexture) {
    shirtMaterial.map = shirtTexture;
    shirtMaterial.needsUpdate = true;
  }

  const torso = new THREE.Group();
  torso.position.y = 1.27;

  const shirtProfile = [
    new THREE.Vector2(0.12, 0.56),
    new THREE.Vector2(0.3, 0.47),
    new THREE.Vector2(0.34, 0.18),
    new THREE.Vector2(0.31, -0.14),
    new THREE.Vector2(0.35, -0.43),
    new THREE.Vector2(0.2, -0.51)
  ];
  const shirt = makeMesh(new THREE.LatheGeometry(shirtProfile, 32), shirtMaterial);
  shirt.scale.set(0.86, 0.94, 0.46);
  shirt.position.y = 0.05;
  shirt.rotation.x = 0.025;

  const backPrint = makeMesh(
    new THREE.PlaneGeometry(0.42, 0.34),
    new THREE.MeshBasicMaterial({ map: backPatchTexture, transparent: true, opacity: 0.9 }),
    false,
    false
  );
  backPrint.position.set(0, 0.03, -0.21);
  backPrint.rotation.y = Math.PI;

  const frontPrint = makeMesh(
    new THREE.PlaneGeometry(0.44, 0.34),
    new THREE.MeshBasicMaterial({ map: frontPatchTexture, transparent: true, opacity: 0.92 }),
    false,
    false
  );
  frontPrint.position.set(0, 0.08, 0.21);

  const neck = makeMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 16), materials.isabellaSkinWarm);
  neck.position.y = 0.55;

  const collar = makeMesh(new THREE.TorusGeometry(0.155, 0.015, 8, 26), materials.softBlack);
  collar.position.y = 0.49;
  collar.scale.z = 0.34;
  collar.rotation.x = Math.PI / 2;

  const waistBand = makeMesh(new THREE.TorusGeometry(0.29, 0.018, 8, 28), materials.softBlack);
  waistBand.position.y = -0.43;
  waistBand.scale.z = 0.44;
  waistBand.rotation.x = Math.PI / 2;

  torso.add(shirt, collar, waistBand, backPrint, frontPrint, neck);
  root.add(torso);

  const head = new THREE.Group();
  head.position.y = 2.02;

  const face = makeMesh(new THREE.SphereGeometry(0.262, 32, 20), materials.isabellaSkinWarm);
  face.scale.set(0.78, 1.08, 0.62);
  face.position.y = -0.025;

  const nose = makeMesh(new THREE.ConeGeometry(0.035, 0.09, 12), materials.isabellaSkin);
  nose.position.set(0, -0.025, 0.205);
  nose.rotation.x = Math.PI / 2;

  const leftEye = createFaceDetail(0x2a1f1a, 0.019);
  leftEye.position.set(-0.085, 0.065, 0.205);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.085;

  const smile = makeMesh(
    new THREE.TorusGeometry(0.083, 0.007, 6, 24, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x7e3d32 }),
    false,
    false
  );
  smile.position.set(0.012, -0.12, 0.212);
  smile.rotation.set(0, 0, Math.PI);
  smile.scale.x = 1.12;

  const leftBrow = makeMesh(new THREE.BoxGeometry(0.09, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: 0x241913 }), false, false);
  leftBrow.position.set(-0.085, 0.125, 0.205);
  leftBrow.rotation.z = 0.16;
  const rightBrow = leftBrow.clone();
  rightBrow.position.x = 0.085;
  rightBrow.rotation.z = -0.16;

  const faceFeatures = makeMesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({ map: faceFeatureTexture, transparent: true, opacity: 0.96 }),
    false,
    false
  );
  faceFeatures.position.set(0, -0.015, 0.181);

  const leftEar = makeMesh(new THREE.SphereGeometry(0.045, 10, 8), materials.isabellaSkinWarm);
  leftEar.position.set(-0.22, 0.0, -0.015);
  leftEar.scale.set(0.5, 0.9, 0.34);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.22;

  head.add(face, leftEar, rightEar, nose, faceFeatures);

  const hairCap = makeMesh(new THREE.SphereGeometry(0.282, 32, 16), materials.isabellaHair);
  hairCap.scale.set(0.94, 0.78, 0.82);
  hairCap.position.set(0, 0.085, -0.04);

  const partLine = makeMesh(new THREE.BoxGeometry(0.018, 0.01, 0.26), materials.isabellaHairLight, false, false);
  partLine.position.set(0.025, 0.22, 0.1);
  partLine.rotation.x = 0.45;

  const backHair = makeMesh(new THREE.CapsuleGeometry(0.13, 0.98, 8, 18), materials.isabellaHair);
  backHair.name = 'isabella-back-hair';
  backHair.position.set(0, -0.38, -0.19);
  backHair.scale.set(1.08, 1.06, 0.32);

  const leftHair = makeMesh(new THREE.CapsuleGeometry(0.056, 0.84, 8, 14), materials.isabellaHair);
  leftHair.name = 'isabella-left-hair';
  leftHair.position.set(-0.21, -0.34, 0.035);
  leftHair.rotation.z = -0.06;
  leftHair.scale.set(0.72, 1, 0.45);

  const rightHair = leftHair.clone();
  rightHair.name = 'isabella-right-hair';
  rightHair.position.x = 0.21;
  rightHair.rotation.z = 0.06;

  const frontStrands = new THREE.Group();
  const strandMaterial = materials.isabellaHairLight;
  frontStrands.add(
    createHairStrand(
      [new THREE.Vector3(-0.11, 0.18, 0.17), new THREE.Vector3(-0.2, 0.0, 0.17), new THREE.Vector3(-0.23, -0.24, 0.09)],
      0.018,
      strandMaterial
    ),
    createHairStrand(
      [new THREE.Vector3(0.11, 0.18, 0.17), new THREE.Vector3(0.21, 0.0, 0.17), new THREE.Vector3(0.24, -0.28, 0.08)],
      0.017,
      strandMaterial
    )
  );

  const hairPanels = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const x = -0.18 + i * 0.06;
    const panel = makeMesh(new THREE.CapsuleGeometry(0.026 + (i % 2) * 0.006, 0.82 + (i % 3) * 0.08, 6, 10), i % 3 === 1 ? materials.isabellaHairLight : materials.isabellaHair);
    panel.position.set(x, -0.38 - (i % 2) * 0.04, -0.245 + Math.abs(i - 3) * 0.012);
    panel.rotation.z = (i - 3) * 0.035;
    panel.scale.z = 0.5;
    hairPanels.add(panel);
  }

  const backStrands = new THREE.Group();
  for (let i = 0; i < 18; i += 1) {
    const x = -0.21 + i * 0.025;
    const strand = createHairStrand(
      [
        new THREE.Vector3(x * 0.55, 0.08, -0.25),
        new THREE.Vector3(x, -0.24 - Math.sin(i) * 0.03, -0.31),
        new THREE.Vector3(x * 1.08, -0.72 + Math.cos(i) * 0.04, -0.22)
      ],
      i % 2 === 0 ? 0.012 : 0.009,
      i % 3 === 0 ? materials.isabellaHairLight : materials.isabellaHair
    );
    backStrands.add(strand);
  }

  head.add(hairCap, partLine, backHair, leftHair, rightHair, frontStrands, hairPanels, backStrands);
  root.add(head);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.34, 1.5, 0.015);
  leftArm.rotation.z = 0.18;
  const rightArm = new THREE.Group();
  rightArm.position.set(0.34, 1.5, 0.015);
  rightArm.rotation.z = -0.18;

  const leftSleeve = createLimbSegment(0.29, 0.095, 0.085, materials.isabellaShirt);
  leftSleeve.scale.z = 0.78;
  const rightSleeve = leftSleeve.clone();
  const leftForearm = createLimbSegment(0.56, 0.052, 0.043, materials.isabellaSkinWarm);
  leftForearm.position.y = -0.5;
  const rightForearm = leftForearm.clone();
  const leftElbow = makeMesh(new THREE.SphereGeometry(0.052, 10, 8), materials.isabellaSkinWarm);
  leftElbow.position.y = -0.3;
  leftElbow.scale.set(0.86, 0.62, 0.82);
  const rightElbow = leftElbow.clone();
  const leftHand = createDetailedHand(materials.isabellaSkinWarm, -1);
  leftHand.position.set(0, -0.86, 0.018);
  leftHand.rotation.z = -0.12;
  leftHand.scale.setScalar(0.78);
  const rightHand = createDetailedHand(materials.isabellaSkinWarm, 1);
  rightHand.position.set(0, -0.86, 0.018);
  rightHand.rotation.z = 0.12;
  rightHand.scale.setScalar(0.78);

  const purpleBand = makeMesh(new THREE.TorusGeometry(0.067, 0.014, 8, 22), materials.isabellaPurple);
  purpleBand.position.set(0, -0.78, 0);
  purpleBand.scale.setScalar(0.78);
  purpleBand.rotation.x = Math.PI / 2;

  const bracelet = makeMesh(new THREE.TorusGeometry(0.058, 0.007, 8, 22), new THREE.MeshStandardMaterial({ color: 0xd9c8aa, metalness: 0.35, roughness: 0.38 }));
  bracelet.position.set(0, -0.76, 0);
  bracelet.scale.setScalar(0.78);
  bracelet.rotation.x = Math.PI / 2;

  leftArm.add(leftSleeve, leftForearm, leftElbow, leftHand, purpleBand);
  rightArm.add(rightSleeve, rightForearm, rightElbow, rightHand, bracelet);
  root.add(leftArm, rightArm);

  const shorts = makeMesh(new THREE.CapsuleGeometry(0.135, 0.32, 8, 22), materials.isabellaShorts);
  shorts.position.y = 0.86;
  shorts.rotation.z = Math.PI / 2;
  shorts.scale.set(0.72, 1.08, 0.58);
  const leftShortLeg = makeMesh(new THREE.CapsuleGeometry(0.085, 0.17, 6, 16), materials.isabellaShorts);
  leftShortLeg.position.set(-0.115, 0.73, 0.01);
  leftShortLeg.scale.set(0.86, 0.82, 0.6);
  const rightShortLeg = leftShortLeg.clone();
  rightShortLeg.position.x = 0.12;
  root.add(shorts, leftShortLeg, rightShortLeg);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.115, 0.9, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.115, 0.9, 0);

  const leftThigh = createLimbSegment(0.53, 0.062, 0.052, materials.isabellaSkinWarm);
  const leftCalf = createLimbSegment(0.55, 0.049, 0.038, materials.isabellaSkinWarm);
  leftCalf.position.y = -0.5;
  const leftKnee = makeMesh(new THREE.SphereGeometry(0.055, 10, 8), materials.isabellaSkinWarm);
  leftKnee.position.y = -0.5;
  leftKnee.scale.set(0.82, 0.55, 0.76);
  const leftWrap = createClothWrap(materials.clothWrap);
  leftWrap.position.y = -0.78;
  leftWrap.scale.setScalar(0.74);
  const leftShoe = createSandal(materials.isabellaSkinWarm, materials.softBlack, materials.leather);
  leftShoe.position.set(0, -1.05, 0.065);
  leftShoe.scale.setScalar(0.78);

  const rightThigh = leftThigh.clone();
  const rightCalf = leftCalf.clone();
  const rightKnee = leftKnee.clone();
  const rightWrap = createClothWrap(materials.clothWrap);
  rightWrap.position.y = -0.78;
  rightWrap.scale.setScalar(0.74);
  const rightShoe = leftShoe.clone();

  leftLeg.add(leftThigh, leftCalf, leftKnee, leftWrap, leftShoe);
  rightLeg.add(rightThigh, rightCalf, rightKnee, rightWrap, rightShoe);
  root.add(leftLeg, rightLeg);

  const rig: IsabellaRig = {
    head,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftHair,
    rightHair,
    backHair
  };
  root.userData.rig = rig;
  addInkOutline(root, 1.012);
  return root;
}

function createCharacter(name: 'isabella' | 'heryck') {
  if (name === 'isabella') {
    return createIsabellaAvatar();
  }

  const group = new THREE.Group();

  const body = new THREE.Group();
  body.position.y = 0.74;
  const torsoProfile = [
    new THREE.Vector2(0.13, 0.3),
    new THREE.Vector2(0.23, 0.23),
    new THREE.Vector2(0.25, -0.08),
    new THREE.Vector2(0.18, -0.3),
    new THREE.Vector2(0.12, -0.34)
  ];
  const torsoShell = makeMesh(new THREE.LatheGeometry(torsoProfile, 20), materials.white);
  torsoShell.scale.z = 0.68;
  const chestRidge = makeMesh(new THREE.CapsuleGeometry(0.026, 0.35, 5, 12), materials.whiteDetail);
  chestRidge.position.set(0, 0.02, 0.18);
  chestRidge.rotation.z = Math.PI / 2;
  const shoulderBar = makeMesh(new THREE.CapsuleGeometry(0.085, 0.36, 6, 14), materials.white);
  shoulderBar.position.y = 0.23;
  shoulderBar.rotation.z = Math.PI / 2;
  const waistRing = makeMesh(new THREE.TorusGeometry(0.18, 0.018, 6, 20), materials.whiteDetail);
  waistRing.position.y = -0.29;
  waistRing.scale.z = 0.58;
  waistRing.rotation.x = Math.PI / 2;
  body.add(torsoShell, chestRidge, shoulderBar, waistRing);

  const neck = makeMesh(new THREE.CylinderGeometry(0.075, 0.086, 0.14, 12), materials.white);
  neck.position.y = 1.03;
  const head = makeMesh(new THREE.SphereGeometry(0.22, 18, 12), materials.white);
  head.position.y = 1.18;
  head.scale.set(0.86, 1.02, 0.78);
  const nose = makeMesh(new THREE.ConeGeometry(0.028, 0.075, 10), materials.whiteDetail);
  nose.position.set(0, 1.17, 0.17);
  nose.rotation.x = Math.PI / 2;
  const leftEar = makeMesh(new THREE.SphereGeometry(0.045, 8, 6), materials.white);
  leftEar.position.set(-0.18, 1.19, 0);
  leftEar.scale.set(0.45, 0.82, 0.36);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.18;

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.12, 0.43, 0);
  const leftThigh = createLimbSegment(0.23, 0.07, 0.062, materials.white);
  const leftKnee = makeMesh(new THREE.SphereGeometry(0.058, 10, 8), materials.whiteDetail);
  leftKnee.position.y = -0.23;
  const leftCalf = createLimbSegment(0.25, 0.057, 0.046, materials.white);
  leftCalf.position.y = -0.23;
  const leftFoot = makeMesh(new THREE.CapsuleGeometry(0.052, 0.18, 6, 12), materials.white);
  leftFoot.position.set(0, -0.49, 0.08);
  leftFoot.rotation.x = Math.PI / 2;
  leftFoot.scale.set(1, 0.92, 0.78);
  leftLeg.add(leftThigh, leftKnee, leftCalf, leftFoot);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.12, 0.43, 0);
  const rightThigh = leftThigh.clone();
  const rightKnee = leftKnee.clone();
  const rightCalf = leftCalf.clone();
  const rightFoot = leftFoot.clone();
  rightLeg.add(rightThigh, rightKnee, rightCalf, rightFoot);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.33, 0.9, 0);
  leftArm.rotation.z = 0.22;
  const leftUpperArm = createLimbSegment(0.22, 0.055, 0.05, materials.white);
  const leftElbow = makeMesh(new THREE.SphereGeometry(0.045, 8, 6), materials.whiteDetail);
  leftElbow.position.y = -0.22;
  const leftForearm = createLimbSegment(0.24, 0.046, 0.04, materials.white);
  leftForearm.position.y = -0.22;
  const leftHand = createDetailedHand(materials.white, -1);
  leftHand.position.set(0, -0.49, 0.012);
  leftHand.scale.setScalar(0.66);
  leftArm.add(leftUpperArm, leftElbow, leftForearm, leftHand);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.33, 0.9, 0);
  rightArm.rotation.z = -0.22;
  const rightUpperArm = leftUpperArm.clone();
  const rightElbow = leftElbow.clone();
  const rightForearm = leftForearm.clone();
  const rightHand = createDetailedHand(materials.white, 1);
  rightHand.position.set(0, -0.49, 0.012);
  rightHand.scale.setScalar(0.66);
  rightArm.add(rightUpperArm, rightElbow, rightForearm, rightHand);

  group.add(body, neck, head, nose, leftEar, rightEar, leftLeg, rightLeg, leftArm, rightArm);

  const scarf = makeMesh(new THREE.TorusGeometry(0.24, 0.035, 8, 20), materials.heryckDetail);
  scarf.name = 'reveal-scarf';
  scarf.position.y = 1.0;
  scarf.rotation.x = Math.PI / 2;
  scarf.visible = false;
  group.add(scarf);

  const face = new THREE.Group();
  face.name = 'reveal-face';
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x25463d });
  const eyeL = makeMesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial, false, false);
  eyeL.position.set(-0.07, 1.2, 0.2);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.07;
  face.add(eyeL, eyeR);
  face.visible = false;
  group.add(face);

  const chest = makeMesh(new THREE.BoxGeometry(0.34, 0.16, 0.045), materials.heryckDetail);
  chest.name = 'reveal-chest';
  chest.position.set(0, 0.74, 0.25);
  chest.visible = false;
  group.add(chest);

  group.userData.rig = {
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg
  } satisfies HeryckRig;

  addInkOutline(group, 1.035);
  return group;
}

const isabella = createCharacter('isabella');
isabella.position.set(0, 0, 7.2);
const realisticIsabellaAvatar: RealisticAvatarState = {
  model: null,
  mixer: null,
  idleAction: null,
  walkAction: null,
  rig: {},
  loadState: 'fallback',
  source: REALISTIC_ISABELLA_MODEL_URL
};
isabella.userData.realisticAvatar = realisticIsabellaAvatar;
world.add(isabella);

const heryck = createCharacter('heryck');
heryck.position.set(-1.05, 0, 6.4);
heryck.scale.setScalar(0.86);
world.add(heryck);

function loadRealisticIsabellaAvatar() {
  const state = getRealisticAvatarState();
  if (state.loadState === 'loading' || state.loadState === 'loaded') return;

  state.loadState = 'loading';
  gltfLoader.load(
    REALISTIC_ISABELLA_MODEL_URL,
    (gltf) => applyRealisticIsabellaAvatar(gltf),
    undefined,
    (error) => {
      state.loadState = 'fallback';
      console.info('[avatar] modelo realista indisponivel; mantendo fallback procedural.', error);
    }
  );
}

function applyRealisticIsabellaAvatar(gltf: GLTF) {
  const state = getRealisticAvatarState();
  const model = gltf.scene;
  model.name = 'isabella-realistic-avatar';

  prepareLoadedAvatarMaterials(model);
  normalizeLoadedAvatar(model);
  customizeRealisticIsabellaModel(model);

  isabella.children.forEach((child) => {
    child.visible = false;
  });
  isabella.add(model);

  const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(model) : null;
  const idleClip = findAvatarClip(gltf.animations, ['idle', 'breath', 'stand', 'rest']);
  const walkClip = findAvatarClip(gltf.animations, ['walk', 'run', 'move']);

  state.model = model;
  state.mixer = mixer;
  state.idleAction = mixer && idleClip ? mixer.clipAction(idleClip) : null;
  state.walkAction = mixer && walkClip ? mixer.clipAction(walkClip) : null;
  state.rig = collectRealisticAvatarRig(model);
  state.loadState = 'loaded';

  state.idleAction?.play();
  state.walkAction?.play();
  state.idleAction?.setEffectiveWeight(1);
  state.walkAction?.setEffectiveWeight(0);
}

function getRealisticAvatarState() {
  return isabella.userData.realisticAvatar as RealisticAvatarState;
}

function prepareLoadedAvatarMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.castShadow = true;
    child.receiveShadow = true;
    const materialsList = Array.isArray(child.material) ? child.material : [child.material];

    materialsList.forEach((material) => {
      if (!material) return;

      const materialWithMaps = material as THREE.MeshStandardMaterial;
      if (materialWithMaps.map) {
        materialWithMaps.map.colorSpace = THREE.SRGBColorSpace;
      }
      material.needsUpdate = true;
    });
  });
}

function customizeRealisticIsabellaModel(model: THREE.Group) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const materialsList = Array.isArray(child.material) ? child.material : [child.material];
    materialsList.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;

      const materialName = material.name.toLowerCase();
      if (materialName.includes('casualsuit')) {
        material.color.set(0x121214);
        material.roughness = 0.86;
        material.metalness = 0.02;
      }

      if (materialName.includes('ponytail') || child.name.toLowerCase().includes('ponytail')) {
        material.color.set(0x1b110b);
        material.roughness = 0.72;
      }
    });
  });

  model.add(createRealisticLongHairOverlay());
  model.add(createRealisticShirtPrint());
}

function createRealisticLongHairOverlay() {
  const hair = new THREE.Group();
  hair.name = 'isabella-long-hair-overlay';

  const hairMaterial = new THREE.MeshStandardMaterial({
    color: 0x17100c,
    roughness: 0.82,
    metalness: 0.02
  });
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d2d18,
    roughness: 0.76,
    metalness: 0.02
  });

  const backCurtain = makeMesh(new THREE.CapsuleGeometry(0.12, 0.54, 10, 22), hairMaterial);
  backCurtain.name = 'isabella-realistic-back-hair';
  backCurtain.position.set(0, 1.51, -0.2);
  backCurtain.scale.set(0.92, 1.04, 0.42);
  hair.add(backCurtain);

  const leftMass = makeMesh(new THREE.CapsuleGeometry(0.052, 0.58, 8, 18), hairMaterial);
  leftMass.name = 'isabella-realistic-left-hair';
  leftMass.position.set(-0.17, 1.54, -0.015);
  leftMass.rotation.z = -0.1;
  leftMass.scale.set(0.72, 1.02, 0.46);
  hair.add(leftMass);

  const rightMass = leftMass.clone();
  rightMass.name = 'isabella-realistic-right-hair';
  rightMass.position.x = 0.19;
  rightMass.rotation.z = 0.12;
  hair.add(rightMass);

  const crown = makeMesh(new THREE.SphereGeometry(0.17, 28, 18), hairMaterial);
  crown.name = 'isabella-realistic-hair-crown';
  crown.position.set(0, 1.9, -0.045);
  crown.scale.set(0.92, 0.48, 0.72);
  hair.add(crown);

  const part = createHairStrand(
    [
      new THREE.Vector3(-0.015, 2.01, 0.12),
      new THREE.Vector3(0.035, 1.94, 0.13),
      new THREE.Vector3(0.07, 1.82, 0.1)
    ],
    0.007,
    highlightMaterial
  );
  part.name = 'isabella-realistic-hair-part';
  hair.add(part);

  for (let i = 0; i < 26; i += 1) {
    const t = i / 25;
    const side = t < 0.5 ? -1 : 1;
    const edge = Math.abs(t - 0.5) * 2;
    const x = THREE.MathUtils.lerp(-0.18, 0.18, t);
    const shoulderX = x + side * THREE.MathUtils.lerp(0.04, 0.12, edge);
    const material = i % 5 === 0 ? highlightMaterial : hairMaterial;
    const strand = createHairStrand(
      [
        new THREE.Vector3(x * 0.55, 1.89 - edge * 0.025, -0.08 + edge * 0.035),
        new THREE.Vector3(x, 1.58 - Math.sin(i * 1.7) * 0.025, -0.17 + edge * 0.03),
        new THREE.Vector3(shoulderX, 1.12 + Math.cos(i * 0.9) * 0.035, -0.11 + edge * 0.035)
      ],
      i % 2 === 0 ? 0.01 : 0.0075,
      material
    );
    strand.name = `isabella-realistic-hair-strand-${i}`;
    hair.add(strand);
  }

  return hair;
}

function createRealisticShirtPrint() {
  const texture = createTransparentPatchTexture('2018');
  const print = makeMesh(
    new THREE.PlaneGeometry(0.46, 0.3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.88 }),
    false,
    false
  );
  print.name = 'isabella-realistic-shirt-print';
  print.position.set(0, 1.23, 0.265);
  return print;
}

function normalizeLoadedAvatar(model: THREE.Group) {
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 0.001);
  model.scale.setScalar(REALISTIC_ISABELLA_TARGET_HEIGHT / height);
  model.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= box.min.y;
  model.position.z -= center.z;
  model.userData.basePosition = model.position.clone();
}

function findAvatarClip(clips: THREE.AnimationClip[], names: string[]) {
  return (
    clips.find((clip) => names.some((name) => clip.name.toLowerCase().includes(name))) ??
    null
  );
}

function collectRealisticAvatarRig(model: THREE.Group): RealisticAvatarRig {
  const byName = new Map<string, THREE.Object3D>();
  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  model.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) {
      skinnedMeshes.push(child);
    }
  });

  const preferredSkinnedMesh =
    skinnedMeshes.find((mesh) => mesh.name.toLowerCase().includes('h_dds_highres')) ??
    skinnedMeshes
      .slice()
      .sort((a, b) => {
        const aCount = a.geometry.getAttribute('position')?.count ?? 0;
        const bCount = b.geometry.getAttribute('position')?.count ?? 0;
        return bCount - aCount;
      })[0];

  if (preferredSkinnedMesh) {
    preferredSkinnedMesh.skeleton.bones.forEach((bone) => {
      const key = bone.name.toLowerCase();
      if (key && !byName.has(key)) {
        byName.set(key, bone);
      }
    });
  }

  skinnedMeshes.forEach((mesh) => {
    mesh.skeleton.bones.forEach((bone) => {
      const key = bone.name.toLowerCase();
      if (key && !byName.has(key)) {
        byName.set(key, bone);
      }
    });
  });

  model.traverse((child) => {
    if (byName.size > 0) return;
    const key = child.name.toLowerCase();
    if (key && !byName.has(key)) {
      byName.set(key, child);
    }
  });

  const getBone = (...names: string[]) => {
    const object = names
      .map((name) => byName.get(name.toLowerCase()))
      .find((candidate): candidate is THREE.Object3D => Boolean(candidate));
    if (!object) return undefined;

    return {
      object,
      restRotation: object.rotation.clone(),
      restPosition: object.position.clone()
    };
  };

  return {
    hips: getBone('Hips'),
    spine: getBone('Spine'),
    spine1: getBone('Spine1'),
    spine2: getBone('Spine2'),
    neck: getBone('Neck'),
    head: getBone('Head'),
    leftShoulder: getBone('LeftShoulder'),
    leftArm: getBone('LeftArm'),
    leftForeArm: getBone('LeftForeArm'),
    rightShoulder: getBone('RightShoulder'),
    rightArm: getBone('RightArm'),
    rightForeArm: getBone('RightForeArm'),
    leftUpLeg: getBone('LeftUpLeg'),
    leftLeg: getBone('LeftLeg'),
    leftFoot: getBone('LeftFoot'),
    rightUpLeg: getBone('RightUpLeg'),
    rightLeg: getBone('RightLeg'),
    rightFoot: getBone('RightFoot'),
    ponytailRoot: getBone('PonytailRoot'),
    ponytail1: getBone('Ponytail1'),
    ponytail2: getBone('Ponytail2'),
    ponytail3: getBone('Ponytail3')
  };
}

function updateHeryckReveal(level: number) {
  heryckRevealLevel = Math.max(heryckRevealLevel, level);
  heryck.traverse((child) => {
    if (child.name === 'reveal-scarf') child.visible = heryckRevealLevel >= 1;
    if (child.name === 'reveal-face') child.visible = heryckRevealLevel >= 2;
    if (child.name === 'reveal-chest') child.visible = heryckRevealLevel >= 3;
  });
}

function createSeeds() {
  const positions = [
    new THREE.Vector3(-1.6, 0, 4.1),
    new THREE.Vector3(1.7, 0, 1),
    new THREE.Vector3(-1.4, 0, -2.5),
    new THREE.Vector3(2.1, 0, -6.1),
    new THREE.Vector3(0.2, 0, -10.2)
  ];

  return positions.map((position, index) => {
    const group = new THREE.Group();
    const seed = makeMesh(new THREE.SphereGeometry(0.18, 18, 12), materials.memory);
    seed.position.y = 0.56;
    const glow = makeMesh(
      new THREE.TorusGeometry(0.34, 0.018, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff1a3, transparent: true, opacity: 0.58 }),
      false,
      false
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.32;
    group.add(seed, glow);
    group.position.copy(position);
    group.userData.floatOffset = index * 0.7;
    world.add(group);
    return { mesh: group, collected: false };
  });
}

function getSoftGlowTexture() {
  if (softGlowTexture) return softGlowTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 124);
  gradient.addColorStop(0, 'rgba(255,255,245,1)');
  gradient.addColorStop(0.24, 'rgba(255,240,148,0.76)');
  gradient.addColorStop(0.58, 'rgba(116,210,255,0.28)');
  gradient.addColorStop(1, 'rgba(116,210,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  softGlowTexture = new THREE.CanvasTexture(canvas);
  softGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return softGlowTexture;
}

function createGroundPetalGeometry(width = 0.28, length = 0.74) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-width * 0.58, length * 0.2, -width * 0.48, length * 0.72, 0, length);
  shape.bezierCurveTo(width * 0.48, length * 0.72, width * 0.58, length * 0.2, 0, 0);

  const geometry = new THREE.ShapeGeometry(shape, 18);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -length * 0.18);
  geometry.computeVertexNormals();
  return geometry;
}

function createGuidingLightOrb(index: number) {
  const group = new THREE.Group();
  group.name = `care-light-${index}`;
  group.userData.motionSeed = index * 0.83 + 0.41;

  const visual = new THREE.Group();
  visual.name = 'care-light-visual';
  group.add(visual);

  const coreMaterial = materials.light.clone();
  coreMaterial.emissiveIntensity = 2.8;
  const core = makeMesh(new THREE.IcosahedronGeometry(0.2, 2), coreMaterial, false, false);
  core.name = 'care-light-core';
  visual.add(core);

  const heart = makeMesh(
    new THREE.SphereGeometry(0.09, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xfffff2, transparent: true, opacity: 0.95 }),
    false,
    false
  );
  heart.name = 'care-light-heart';
  visual.add(heart);

  const glowTexture = getSoftGlowTexture();
  if (glowTexture) {
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xfff2a6,
        transparent: true,
        opacity: 0.84,
        depthWrite: false
      })
    );
    halo.name = 'care-light-halo';
    halo.scale.set(1.38, 1.38, 1);
    visual.add(halo);

    const verticalHalo = halo.clone();
    verticalHalo.name = 'care-light-vertical-halo';
    verticalHalo.material = (halo.material as THREE.SpriteMaterial).clone();
    verticalHalo.scale.set(0.72, 1.65, 1);
    visual.add(verticalHalo);
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4b8,
    transparent: true,
    opacity: 0.54,
    depthWrite: false
  });
  for (let i = 0; i < 3; i += 1) {
    const ring = makeMesh(new THREE.TorusGeometry(0.28 + i * 0.045, 0.008, 6, 48), ringMaterial.clone(), false, false);
    ring.name = `care-light-ring-${i}`;
    ring.rotation.set(Math.PI / 2, i * 1.1, i * 0.9);
    visual.add(ring);
  }

  const rayMaterial = new THREE.MeshBasicMaterial({
    color: 0xf8ffff,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  for (let i = 0; i < 4; i += 1) {
    const ray = makeMesh(new THREE.PlaneGeometry(0.08, 0.78), rayMaterial.clone(), false, false);
    ray.name = `care-light-ray-${i}`;
    ray.position.y = -0.02;
    ray.rotation.y = (i / 4) * Math.PI;
    visual.add(ray);
  }

  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8c9, transparent: true, opacity: 0.78 });
  for (let i = 0; i < 12; i += 1) {
    const particle = makeMesh(new THREE.SphereGeometry(0.024 + (i % 3) * 0.006, 8, 6), particleMaterial.clone(), false, false);
    particle.name = 'care-light-particle';
    particle.userData.angle = (i / 12) * Math.PI * 2;
    particle.userData.radius = 0.34 + (i % 4) * 0.055;
    particle.userData.speed = 0.55 + (i % 5) * 0.12;
    particle.userData.height = -0.18 + (i % 6) * 0.07;
    visual.add(particle);
  }

  const point = new THREE.PointLight(0xfff0ae, 1.15, 5.2, 1.9);
  point.name = 'care-light-point';
  point.castShadow = false;
  group.add(point);

  return group;
}

function createGuidingLightTarget(index: number) {
  const target = new THREE.Group();
  target.name = `care-light-target-${index}`;
  target.userData.motionSeed = index * 0.91 + 0.62;

  const ground = new THREE.Group();
  ground.name = 'care-light-ground-mandala';
  target.add(ground);

  const petalGeometry = createGroundPetalGeometry();
  const petalMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xffe597, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0x9ff3d6, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false })
  ];

  for (let i = 0; i < 12; i += 1) {
    const petal = makeMesh(petalGeometry, petalMaterials[i % 2].clone(), false, false);
    petal.name = 'care-light-petal';
    petal.position.y = 0.095 + (i % 2) * 0.004;
    petal.rotation.y = (i / 12) * Math.PI * 2;
    petal.scale.setScalar(0.84 + (i % 3) * 0.045);
    ground.add(petal);
  }

  const outerRing = makeMesh(
    new THREE.TorusGeometry(0.72, 0.018, 8, 72),
    new THREE.MeshBasicMaterial({ color: 0xffefb0, transparent: true, opacity: 0.72, depthWrite: false }),
    false,
    false
  );
  outerRing.name = 'care-light-outer-ring';
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.118;

  const innerRing = makeMesh(
    new THREE.TorusGeometry(0.42, 0.012, 8, 54),
    new THREE.MeshBasicMaterial({ color: 0xcffeff, transparent: true, opacity: 0.58, depthWrite: false }),
    false,
    false
  );
  innerRing.name = 'care-light-inner-ring';
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.132;
  ground.add(outerRing, innerRing);

  const basinMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7d2b4,
    roughness: 0.72,
    metalness: 0.05,
    emissive: 0x4b4522,
    emissiveIntensity: 0.08
  });
  const basin = makeMesh(new THREE.OctahedronGeometry(0.28, 2), basinMaterial);
  basin.name = 'care-light-receiver';
  basin.position.y = 0.42;
  basin.scale.set(1.32, 0.46, 1.32);
  target.add(basin);

  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff5c7,
    emissive: 0xffd36c,
    emissiveIntensity: 1.8,
    roughness: 0.34,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92
  });
  const floatingCrystal = makeMesh(new THREE.OctahedronGeometry(0.22, 2), crystalMaterial, false, false);
  floatingCrystal.name = 'care-light-target-crystal';
  floatingCrystal.position.y = 1.05;
  floatingCrystal.scale.set(0.76, 1.18, 0.76);
  target.add(floatingCrystal);

  for (let i = 0; i < 7; i += 1) {
    const shard = makeMesh(new THREE.TetrahedronGeometry(0.08 + (i % 3) * 0.012, 1), crystalMaterial.clone(), false, false);
    const angle = (i / 7) * Math.PI * 2;
    shard.name = 'care-light-target-shard';
    shard.userData.angle = angle;
    shard.userData.radius = 0.36 + (i % 2) * 0.06;
    shard.userData.height = 0.76 + (i % 4) * 0.07;
    shard.position.set(Math.cos(angle) * shard.userData.radius, shard.userData.height, Math.sin(angle) * shard.userData.radius);
    shard.rotation.set(i * 0.7, angle, i * 0.34);
    target.add(shard);
  }

  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4b0,
    transparent: true,
    opacity: 0.54,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  for (let i = 0; i < 3; i += 1) {
    const flame = makeMesh(new THREE.PlaneGeometry(0.22 - i * 0.038, 0.54 - i * 0.07), flameMaterial.clone(), false, false);
    flame.name = 'care-light-target-flame';
    flame.position.y = 0.76 + i * 0.04;
    flame.rotation.y = (i / 3) * Math.PI;
    target.add(flame);
  }

  const glowTexture = getSoftGlowTexture();
  if (glowTexture) {
    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xfff0a2,
        transparent: true,
        opacity: 0.48,
        depthWrite: false
      })
    );
    beacon.name = 'care-light-target-beacon';
    beacon.position.y = 1.0;
    beacon.scale.set(1.32, 1.72, 1);
    target.add(beacon);
  }

  return target;
}

function createCareLights() {
  const configs = [
    {
      home: new THREE.Vector3(-4.8, 0.65, 2),
      target: new THREE.Vector3(-6.5, 0, -5.2)
    },
    {
      home: new THREE.Vector3(4.7, 0.65, -1.5),
      target: new THREE.Vector3(6.8, 0, -8.8)
    },
    {
      home: new THREE.Vector3(0.6, 0.65, -8.2),
      target: new THREE.Vector3(-1.3, 0, -13.7)
    }
  ];

  return configs.map((config, index) => {
    const orb = createGuidingLightOrb(index);
    orb.position.copy(config.home);
    world.add(orb);

    const target = createGuidingLightTarget(index);
    target.position.copy(config.target);
    target.visible = false;
    world.add(target);

    return {
      orb,
      target,
      home: config.home.clone(),
      targetPosition: config.target.clone(),
      delivered: false
    };
  });
}

function createPuzzleStation() {
  const station = puzzleStation;
  station.clear();
  station.position.copy(puzzleStationPosition);
  station.visible = false;

  const base = makeMesh(new THREE.CylinderGeometry(0.85, 1.05, 0.32, 8), materials.stone);
  base.position.y = 0.16;

  const table = makeMesh(new THREE.BoxGeometry(1.85, 0.18, 1.18), materials.wood);
  table.position.y = 0.62;
  table.rotation.y = -0.1;

  const board = makeMesh(
    new THREE.BoxGeometry(1.48, 0.08, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xfffbec, roughness: 0.58 }),
    true,
    false
  );
  board.position.set(0, 0.85, -0.05);
  board.rotation.x = -0.42;
  board.rotation.y = -0.1;

  const imagePlane = makeMesh(
    new THREE.PlaneGeometry(1.22, 0.86),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    false,
    false
  );
  imagePlane.position.set(0, 0.91, 0.13);
  imagePlane.rotation.x = -0.42;
  imagePlane.rotation.y = -0.1;

  if (puzzleImage) {
    textureLoader.load(puzzleImage, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = imagePlane.material as THREE.MeshBasicMaterial;
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  const glow = makeMesh(
    new THREE.TorusGeometry(1.15, 0.025, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0xffe085, transparent: true, opacity: 0.78 }),
    false,
    false
  );
  glow.name = 'puzzle-station-glow';
  glow.position.y = 0.08;
  glow.rotation.x = Math.PI / 2;

  station.add(base, table, board, imagePlane, glow);
  world.add(station);
}

const seeds = createSeeds();
const careLights = createCareLights();

function createFlowerInstances() {
  const count = 190;
  const stemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 0.32, 5);
  const headGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4f9f63, roughness: 0.85 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1f3, roughness: 0.55 });
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const flowerData: Array<{ x: number; z: number; scale: number; color: THREE.Color }> = [];
  const colors = [0xfff5f7, 0xffd1df, 0xffee90, 0xbfe7ff, 0xffffff];

  for (let i = 0; i < count; i += 1) {
    const nearPath = Math.random() > 0.42;
    const x = nearPath ? -5 + Math.random() * 10 : -16 + Math.random() * 32;
    const z = nearPath ? -15 + Math.random() * 24 : -19 + Math.random() * 28;
    flowerData.push({
      x,
      z,
      scale: 0.62 + Math.random() * 0.8,
      color: new THREE.Color(colors[i % colors.length])
    });
    heads.setColorAt(i, flowerData[i].color);
  }

  flowerGroup.userData.flowerData = flowerData;
  flowerGroup.userData.stems = stems;
  flowerGroup.userData.heads = heads;
  flowerGroup.add(stems, heads);
  updateFlowerMatrices(0);
}

function updateFlowerMatrices(progress: number) {
  const flowerData = flowerGroup.userData.flowerData as Array<{ x: number; z: number; scale: number }> | undefined;
  const stems = flowerGroup.userData.stems as THREE.InstancedMesh | undefined;
  const heads = flowerGroup.userData.heads as THREE.InstancedMesh | undefined;
  if (!flowerData || !stems || !heads) return;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < flowerData.length; i += 1) {
    const flower = flowerData[i];
    const personalProgress = THREE.MathUtils.clamp(progress * 1.22 - (i / flowerData.length) * 0.28, 0, 1);
    const s = flower.scale * easeOutCubic(personalProgress);

    position.set(flower.x, 0.16 * s, flower.z);
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    stems.setMatrixAt(i, matrix);

    position.set(flower.x, 0.36 * s, flower.z);
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    heads.setMatrixAt(i, matrix);
  }

  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function updateHud() {
  stageLabel.textContent = stageLabels[phase];
  narratorText.textContent = story[phase][narrationIndex] ?? story[phase][0];
  speaker.textContent = phase === 'gallery' ? 'Heryck' : 'Heryck';

  if (phase === 'puzzle' && puzzlePanelOpen) {
    narratorText.textContent = 'Agora monte a foto. Toque nas pecas ao lado do espaco vazio para aproximar a lembranca.';
  }

  const collected = seeds.filter((seed) => seed.collected).length;
  const delivered = careLights.filter((light) => light.delivered).length;

  if (phase === 'trail') progressLabel.textContent = `${collected}/${seeds.length} sementes`;
  else if (phase === 'lights') progressLabel.textContent = `${delivered}/${careLights.length} luzes`;
  else if (phase === 'puzzle') progressLabel.textContent = puzzlePanelOpen ? '3x3' : 'perto da mesa';
  else if (phase === 'bloom') progressLabel.textContent = 'florescendo';
  else if (phase === 'gallery') {
    const current = manifest.photos[focusedPhoto];
    progressLabel.textContent = current ? `${current.year}` : 'galeria';
  } else progressLabel.textContent = '2018 - hoje';

  puzzlePanel.classList.toggle('hidden', phase !== 'puzzle' || !puzzlePanelOpen);
}

function setPhase(nextPhase: Phase) {
  clearScheduledFlow();
  phase = nextPhase;
  narrationIndex = 0;

  if (phase === 'trail') {
    updateHeryckReveal(0);
  }

  if (phase === 'lights') {
    updateHeryckReveal(1);
    careLights.forEach((light, index) => {
      light.target.visible = index === currentLightIndex;
      light.orb.visible = !light.delivered;
    });
    puzzleStation.visible = false;
  }

  if (phase === 'puzzle') {
    updateHeryckReveal(2);
    puzzlePanelOpen = false;
    puzzleSolved = false;
    puzzleTiles = [0, 1, 2, 3, 5, null, 6, 4, 7];
    renderPuzzle();
    puzzleStation.visible = true;
    narratorText.textContent = 'A lembranca esta na mesa do jardim. Caminhe ate ela e interaja para montar a foto.';
  }

  if (phase === 'bloom') {
    updateHeryckReveal(3);
    bloomProgress = 0;
    puzzleStation.visible = false;
  }

  if (phase === 'gallery') {
    updateHeryckReveal(3);
    galleryYaw = 0;
    galleryGroup.rotation.y = 0;
    camera.position.set(0, 1.55, 0);
    camera.lookAt(0, 1.45, -1);
    createGallery();
    world.visible = false;
    galleryGroup.visible = true;
  } else {
    world.visible = true;
    galleryGroup.visible = false;
  }

  updateHud();

  if (phase === 'intro') {
    scheduleAutoNarration('intro', () => setPhase('trail'));
  }
}

function clearScheduledFlow() {
  if (phaseTimer !== null) {
    window.clearTimeout(phaseTimer);
    phaseTimer = null;
  }
  if (narrationTimer !== null) {
    window.clearTimeout(narrationTimer);
    narrationTimer = null;
  }
  queuedPhase = null;
}

function schedulePhase(nextPhase: Phase, delayMs: number) {
  if (queuedPhase === nextPhase) return;
  if (phaseTimer !== null) window.clearTimeout(phaseTimer);
  queuedPhase = nextPhase;
  phaseTimer = window.setTimeout(() => {
    phaseTimer = null;
    queuedPhase = null;
    setPhase(nextPhase);
  }, delayMs);
}

function scheduleAutoNarration(stage: StoryStage, afterComplete?: () => void) {
  const startPhase = phase;
  const lines = story[stage];

  narrationTimer = window.setTimeout(() => {
    if (phase !== startPhase) return;

    if (narrationIndex < lines.length - 1) {
      narrationIndex += 1;
      updateHud();
      scheduleAutoNarration(stage, afterComplete);
      return;
    }

    afterComplete?.();
  }, 3200);
}

function renderPuzzle() {
  puzzleGrid.replaceChildren();
  puzzleTiles.forEach((tile, index) => {
    const tileButton = document.createElement('button');
    tileButton.type = 'button';
    tileButton.className = tile === null ? 'puzzle-tile puzzle-empty' : 'puzzle-tile';
    tileButton.setAttribute('aria-label', tile === null ? 'Espaco vazio' : `Peca ${tile + 1}`);

    if (tile !== null) {
      const col = tile % 3;
      const row = Math.floor(tile / 3);
      tileButton.style.backgroundImage = puzzleImage ? `url("${puzzleImage}")` : '';
      tileButton.style.backgroundPosition = `${col * 50}% ${row * 50}%`;
    }

    tileButton.addEventListener('click', () => movePuzzleTile(index));
    puzzleGrid.appendChild(tileButton);
  });
}

function openPuzzlePanel() {
  if (phase !== 'puzzle' || puzzlePanelOpen || puzzleSolved) return;
  if (isabella.position.distanceTo(puzzleStationPosition) > puzzleInteractionRadius) return;

  puzzlePanelOpen = true;
  interactionButton.classList.add('hidden');
  narratorText.textContent = 'Agora monte a foto. Toque nas pecas ao lado do espaco vazio para aproximar a lembranca.';
  updateHud();
}

function movePuzzleTile(index: number) {
  if (!puzzlePanelOpen || puzzleSolved) return;
  const emptyIndex = puzzleTiles.indexOf(null);
  if (!arePuzzleSlotsAdjacent(index, emptyIndex)) return;

  [puzzleTiles[index], puzzleTiles[emptyIndex]] = [puzzleTiles[emptyIndex], puzzleTiles[index]];
  renderPuzzle();

  if (isPuzzleSolved()) {
    puzzleSolved = true;
    puzzlePanelOpen = false;
    puzzleStation.visible = false;
    updateHud();
    setTimeout(() => setPhase('bloom'), 360);
  }
}

function arePuzzleSlotsAdjacent(a: number, b: number) {
  const ax = a % 3;
  const ay = Math.floor(a / 3);
  const bx = b % 3;
  const by = Math.floor(b / 3);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function isPuzzleSolved() {
  return puzzleTiles.every((tile, index) => (index === 8 ? tile === null : tile === index));
}

function solvePuzzle() {
  puzzlePanelOpen = true;
  puzzleTiles = [0, 1, 2, 3, 4, 5, 6, 7, null];
  renderPuzzle();
  puzzleSolved = true;
  puzzlePanelOpen = false;
  puzzleStation.visible = false;
  setTimeout(() => setPhase('bloom'), 340);
}

function createGallery() {
  if (galleryCreated) return;
  galleryCreated = true;
  galleryGroup.clear();

  const photos = manifest.photos.length > 0 ? manifest.photos : createFallbackPhotos();
  const radius = 3.85;

  photos.forEach((photo, index) => {
    const angle = (index / photos.length) * Math.PI * 2;
    const y = 1.32 + Math.sin(index * 0.9) * 0.42 + Math.floor(index / 8) * 0.26;
    const aspect = photo.width && photo.height ? photo.width / photo.height : 0.78;
    const height = 1.42;
    const width = THREE.MathUtils.clamp(height * aspect, 0.88, 1.72);

    const holder = new THREE.Group();
    holder.position.set(Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
    holder.lookAt(0, y, 0);

    const frame = makeMesh(
      new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xfffbec, roughness: 0.65 }),
      false,
      false
    );
    frame.position.z = -0.035;

    const plane = makeMesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      false,
      false
    );
    plane.position.z = 0.012;
    plane.userData.photoIndex = index;

    if (photo.src) {
      textureLoader.load(photo.src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        const material = plane.material as THREE.MeshBasicMaterial;
        material.map = texture;
        material.needsUpdate = true;
      });
    }

    const caption = createCaptionSprite(`${photo.year} - ${photo.caption}`);
    caption.position.set(0, -height / 2 - 0.18, 0.04);
    holder.add(frame, plane, caption);
    galleryGroup.add(holder);
  });
}

function createFallbackPhotos(): GalleryPhoto[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `placeholder-${index}`,
    caption: 'Espaco reservado para uma foto escolhida.',
    year: '2018+',
    featured: index === 0,
    puzzle: index === 0,
    width: 900,
    height: 1200,
    src: '',
    thumb: ''
  }));
}

function createCaptionSprite(text: string) {
  const captionCanvas = document.createElement('canvas');
  const context = captionCanvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  captionCanvas.width = 760;
  captionCanvas.height = 132;
  context.fillStyle = 'rgba(248,255,249,0.88)';
  context.roundRect(0, 0, captionCanvas.width, captionCanvas.height, 26);
  context.fill();
  context.fillStyle = '#17312a';
  context.font = '700 34px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  wrapCanvasText(context, text, captionCanvas.width / 2, 66, 690, 38);

  const texture = new THREE.CanvasTexture(captionCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.65, 0.29, 1);
  return sprite;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  lines.push(current);

  const visibleLines = lines.slice(0, 2);
  const startY = y - ((visibleLines.length - 1) * lineHeight) / 2;
  visibleLines.forEach((line, index) => {
    context.fillText(line, x, startY + index * lineHeight);
  });
}

function focusNextPhoto() {
  const photos = manifest.photos.length || 8;
  focusedPhoto = (focusedPhoto + 1) % photos;
  galleryYaw = -(focusedPhoto / photos) * Math.PI * 2;
  const current = manifest.photos[focusedPhoto];
  if (current) {
    narrationIndex = 0;
    narratorText.textContent = current.caption;
    progressLabel.textContent = current.year;
  }
}

function updatePlayer(delta: number, elapsed: number) {
  if (!['trail', 'lights', 'intro', 'puzzle'].includes(phase) || puzzlePanelOpen) {
    updateIsabellaAnimation(delta, elapsed);
    return;
  }

  const speed = phase === 'intro' ? 3.4 : 4.2;
  const rawInput = readInputVector();
  const inputResponse = rawInput.lengthSq() > 0.0001 ? 14 : 10;
  smoothedInputVector.x = THREE.MathUtils.damp(smoothedInputVector.x, rawInput.x, inputResponse, delta);
  smoothedInputVector.y = THREE.MathUtils.damp(smoothedInputVector.y, rawInput.y, inputResponse, delta);

  if (rawInput.lengthSq() === 0 && smoothedInputVector.lengthSq() < 0.0004) {
    smoothedInputVector.set(0, 0);
  }

  const input = smoothedInputVector;
  playerVelocity.set(input.x, 0, input.y);
  const inputPower = THREE.MathUtils.clamp(playerVelocity.length(), 0, 1);
  const moving = inputPower > 0.035;

  if (moving) {
    const easedPower = Math.pow(inputPower, 1.08);
    playerVelocity.normalize().multiplyScalar(speed * easedPower * delta);
    isabella.position.add(playerVelocity);
    isabella.position.x = THREE.MathUtils.clamp(isabella.position.x, -13, 13);
    isabella.position.z = THREE.MathUtils.clamp(isabella.position.z, -17, 9);
    isabella.rotation.y = Math.atan2(input.x, input.y);
  }

  isabellaMoveBlend = THREE.MathUtils.damp(isabellaMoveBlend, moving ? inputPower : 0, 8, delta);
  if (moving) {
    isabellaWalkCycle += delta * (2.6 + inputPower * 5.2) * inputPower;
  }
  updateIsabellaAnimation(delta, elapsed);

  const companionTarget = tempVector.copy(isabella.position).add(new THREE.Vector3(-1.05, 0, 0.8));
  const heryckWas = heryck.position.clone();
  heryck.position.lerp(companionTarget, 1 - Math.pow(0.001, delta));
  updateHeryckAnimation(delta, elapsed, heryck.position.distanceTo(heryckWas));
  heryck.lookAt(isabella.position.x, heryck.position.y, isabella.position.z);
}

function updateIsabellaAnimation(delta: number, elapsed: number) {
  if (getRealisticAvatarState().loadState === 'loaded') return;

  const rig = isabella.userData.rig as IsabellaRig | undefined;
  if (!rig) return;

  const walk = Math.sin(isabellaWalkCycle);
  const counterWalk = Math.sin(isabellaWalkCycle + Math.PI);
  const stepBounce = Math.abs(Math.sin(isabellaWalkCycle * 2));
  const idleBreath = Math.sin(elapsed * 1.7) * (1 - isabellaMoveBlend);
  const hairSway = Math.sin(elapsed * 2.2 + isabellaWalkCycle * 0.35) * (0.25 + isabellaMoveBlend * 0.75);

  rig.torso.position.y = 1.27 + idleBreath * 0.01 + stepBounce * 0.02 * isabellaMoveBlend;
  rig.torso.rotation.z = walk * 0.025 * isabellaMoveBlend;
  rig.torso.rotation.x = 0.02 + stepBounce * 0.014 * isabellaMoveBlend;

  rig.head.position.y = 2.02 + idleBreath * 0.008 + stepBounce * 0.014 * isabellaMoveBlend;
  rig.head.rotation.y = Math.sin(elapsed * 0.75) * 0.08 * (1 - isabellaMoveBlend) + walk * 0.035 * isabellaMoveBlend;
  rig.head.rotation.z = Math.sin(elapsed * 0.55) * 0.035 * (1 - isabellaMoveBlend);

  rig.leftArm.rotation.x = counterWalk * 0.46 * isabellaMoveBlend;
  rig.rightArm.rotation.x = walk * 0.46 * isabellaMoveBlend;
  rig.leftArm.rotation.z = 0.26 + Math.sin(elapsed * 1.1) * 0.025 * (1 - isabellaMoveBlend);
  rig.rightArm.rotation.z = -0.26 - Math.sin(elapsed * 1.1) * 0.025 * (1 - isabellaMoveBlend);

  rig.leftLeg.rotation.x = walk * 0.48 * isabellaMoveBlend;
  rig.rightLeg.rotation.x = counterWalk * 0.48 * isabellaMoveBlend;
  rig.leftLeg.rotation.z = Math.max(0, -walk) * 0.035 * isabellaMoveBlend;
  rig.rightLeg.rotation.z = Math.max(0, walk) * -0.035 * isabellaMoveBlend;

  rig.leftHair.rotation.z = -0.08 + hairSway * 0.055;
  rig.rightHair.rotation.z = 0.08 + hairSway * 0.05;
  rig.backHair.rotation.x = hairSway * 0.04;
  rig.backHair.rotation.z = hairSway * 0.035;
}

function updateRealisticIsabellaAvatar(delta: number, elapsed: number) {
  const state = getRealisticAvatarState();
  if (state.loadState !== 'loaded' || !state.model) return;

  state.mixer?.update(delta);

  if (state.idleAction && state.walkAction) {
    state.idleAction.setEffectiveWeight(1 - isabellaMoveBlend);
    state.walkAction.setEffectiveWeight(isabellaMoveBlend);
  } else {
    updateRealisticAvatarBones(state.rig, elapsed);
  }

  const basePosition = state.model.userData.basePosition as THREE.Vector3 | undefined;
  if (basePosition) {
    const stepBounce = Math.abs(Math.sin(isabellaWalkCycle * 2)) * 0.026 * isabellaMoveBlend;
    const idleBreath = Math.sin(elapsed * 1.45) * 0.004 * (1 - isabellaMoveBlend);
    state.model.position.y = basePosition.y + stepBounce + idleBreath;
  }
}

function updateRealisticAvatarBones(rig: RealisticAvatarRig, elapsed: number) {
  const walk = Math.sin(isabellaWalkCycle);
  const counterWalk = Math.sin(isabellaWalkCycle + Math.PI);
  const stepBounce = Math.abs(Math.sin(isabellaWalkCycle * 2));
  const move = isabellaMoveBlend;
  const idle = 1 - move;
  const idleBreath = Math.sin(elapsed * 1.45);
  const hairSway = Math.sin(elapsed * 2.4 + isabellaWalkCycle * 0.45);

  poseBone(rig.hips, -0.025 * move + idleBreath * 0.008 * idle, 0, walk * 0.045 * move);
  if (rig.hips) {
    rig.hips.object.position.y = rig.hips.restPosition.y + stepBounce * 0.02 * move + idleBreath * 0.004 * idle;
  }

  poseBone(rig.spine, -0.025 * move + idleBreath * 0.008 * idle, 0, -walk * 0.025 * move);
  poseBone(rig.spine1, 0.035 * move + idleBreath * 0.01 * idle, 0, -walk * 0.018 * move);
  poseBone(rig.spine2, 0.045 * move + idleBreath * 0.012 * idle, 0, -walk * 0.012 * move);
  poseBone(rig.neck, -0.02 * move, Math.sin(elapsed * 0.75) * 0.045 * idle, walk * 0.015 * move);
  poseBone(rig.head, -0.018 * move, Math.sin(elapsed * 0.72) * 0.045 * idle, Math.sin(elapsed * 0.54) * 0.024 * idle);

  poseBone(rig.leftShoulder, 0, 0, 0.12 + 0.04 * move);
  poseBone(rig.rightShoulder, 0, 0, -0.12 - 0.04 * move);
  poseBone(rig.leftArm, counterWalk * 0.42 * move - 0.16, 0, 0.52 + Math.sin(elapsed * 1.1) * 0.02 * idle);
  poseBone(rig.rightArm, walk * 0.42 * move - 0.16, 0, -0.52 - Math.sin(elapsed * 1.1) * 0.02 * idle);
  poseBone(rig.leftForeArm, Math.max(0, walk) * 0.18 * move - 0.2, 0, 0.08);
  poseBone(rig.rightForeArm, Math.max(0, counterWalk) * 0.18 * move - 0.2, 0, -0.08);

  poseBone(rig.leftUpLeg, walk * 0.5 * move, 0, -0.018 * move);
  poseBone(rig.rightUpLeg, counterWalk * 0.5 * move, 0, 0.018 * move);
  poseBone(rig.leftLeg, Math.max(0, -walk) * 0.62 * move, 0, 0);
  poseBone(rig.rightLeg, Math.max(0, -counterWalk) * 0.62 * move, 0, 0);
  poseBone(rig.leftFoot, Math.max(0, walk) * -0.22 * move + stepBounce * 0.04 * move, 0, 0);
  poseBone(rig.rightFoot, Math.max(0, counterWalk) * -0.22 * move + stepBounce * 0.04 * move, 0, 0);

  poseBone(rig.ponytailRoot, hairSway * 0.045, 0, hairSway * 0.028);
  poseBone(rig.ponytail1, hairSway * 0.075 + move * 0.05, 0, hairSway * 0.034);
  poseBone(rig.ponytail2, hairSway * 0.095 + move * 0.08, 0, hairSway * 0.044);
  poseBone(rig.ponytail3, hairSway * 0.12 + move * 0.1, 0, hairSway * 0.056);
}

function poseBone(bone: RealisticAvatarBone | undefined, x = 0, y = 0, z = 0) {
  if (!bone) return;

  bone.object.rotation.set(
    bone.restRotation.x + x,
    bone.restRotation.y + y,
    bone.restRotation.z + z
  );
}

function updateHeryckAnimation(delta: number, elapsed: number, movementDistance: number) {
  const rig = heryck.userData.rig as HeryckRig | undefined;
  if (!rig) return;

  const moveAmount = THREE.MathUtils.clamp(movementDistance / Math.max(delta, 0.001) / 2.2, 0, 1);
  const cycle = elapsed * (5.8 + moveAmount * 3.2);
  const walk = Math.sin(cycle) * moveAmount;
  const counterWalk = Math.sin(cycle + Math.PI) * moveAmount;
  const bounce = Math.abs(Math.sin(cycle * 2)) * moveAmount;
  const idle = Math.sin(elapsed * 1.6) * (1 - moveAmount);

  rig.body.position.y = 0.74 + bounce * 0.035 + idle * 0.01;
  rig.body.rotation.z = walk * 0.045;
  rig.leftLeg.position.z = walk * 0.055;
  rig.rightLeg.position.z = counterWalk * 0.055;
  rig.leftLeg.rotation.x = walk * 0.58;
  rig.rightLeg.rotation.x = counterWalk * 0.58;
  rig.leftLeg.rotation.z = Math.max(0, -walk) * 0.045;
  rig.rightLeg.rotation.z = Math.max(0, walk) * -0.045;
  rig.leftArm.rotation.x = counterWalk * 0.42;
  rig.rightArm.rotation.x = walk * 0.42;
  rig.leftArm.rotation.z = 0.22 + idle * 0.035;
  rig.rightArm.rotation.z = -0.22 - idle * 0.035;
}

function updateCamera(delta: number) {
  if (phase === 'gallery') {
    galleryYaw += readInputVector().x * delta * 1.4;
    galleryGroup.rotation.y = THREE.MathUtils.damp(galleryGroup.rotation.y, galleryYaw, 5, delta);
    camera.position.set(0, 1.55, 0);
    camera.lookAt(0, 1.45, -1);
    updateGalleryCaptionFromYaw();
    return;
  }

  const target = cameraTarget.set(isabella.position.x * 0.46, 4.85, isabella.position.z + 5.55);
  camera.position.lerp(target, 1 - Math.pow(0.002, delta));
  camera.lookAt(isabella.position.x, 1.25, isabella.position.z - 0.25);
}

function currentObjectivePosition() {
  if (phase === 'trail') {
    const nextSeed = seeds.find((seed) => !seed.collected);
    return nextSeed?.mesh.position ?? null;
  }

  if (phase === 'lights') {
    return careLights[currentLightIndex]?.targetPosition ?? null;
  }

  if (phase === 'puzzle' && !puzzlePanelOpen && !puzzleSolved) {
    return puzzleStationPosition;
  }

  return null;
}

function updateObjectivePointer() {
  const objective = currentObjectivePosition();
  if (!objective) {
    objectivePointer.classList.add('hidden');
    return;
  }

  const projected = objective.clone();
  projected.y += 0.8;
  projected.project(camera);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  const rawX = (projected.x * 0.5 + 0.5) * width;
  const rawY = (-projected.y * 0.5 + 0.5) * height;
  const margin = 42;
  const clampedX = THREE.MathUtils.clamp(rawX, margin, width - margin);
  const clampedY = THREE.MathUtils.clamp(rawY, 146, height - 126);
  const angle = Math.atan2(rawY - centerY, rawX - centerX) + Math.PI / 2;

  objectivePointer.classList.remove('hidden');
  objectivePointer.style.transform = `translate3d(${clampedX - centerX}px, ${clampedY - centerY}px, 0) rotate(${angle}rad)`;
}

function pulseNextObjective() {
  const objective = currentObjectivePosition();
  if (!objective) return;

  if (phase === 'trail') {
    narratorText.textContent = 'A proxima semente esta marcada no jardim. Siga a seta dourada.';
  } else if (phase === 'lights') {
    narratorText.textContent = 'Leve a luz ate o ponto marcado pela seta dourada.';
  }
}

function updateInteractionButton() {
  const canInteract =
    phase === 'puzzle' &&
    !puzzlePanelOpen &&
    !puzzleSolved &&
    isabella.position.distanceTo(puzzleStationPosition) < puzzleInteractionRadius;

  interactionButton.classList.toggle('hidden', !canInteract);
}

function updatePuzzleStation(delta: number, elapsed: number) {
  if (!puzzleStation.visible) return;

  puzzleStation.rotation.y = Math.sin(elapsed * 0.7) * 0.025;
  const glow = puzzleStation.getObjectByName('puzzle-station-glow');
  if (glow) {
    glow.rotation.z += delta * 1.2;
    glow.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.035);
  }
}

function updateWaterDetails(_delta: number, elapsed: number) {
  animatedWaterObjects.forEach((object) => {
    const base = object.userData.basePosition as THREE.Vector3;
    const seed = object.userData.motionSeed as number;
    object.position.y = base.y + Math.sin(elapsed * 1.35 + seed) * 0.006;
  });

  waterFoamObjects.forEach((object) => {
    const base = object.userData.basePosition as THREE.Vector3;
    const seed = object.userData.motionSeed as number;
    object.position.x = base.x + Math.sin(elapsed * 0.72 + seed) * 0.08;
    object.position.z = base.z + Math.cos(elapsed * 0.86 + seed) * 0.055;
  });

  waterfallStripObjects.forEach((object) => {
    const base = object.userData.basePosition as THREE.Vector3;
    const seed = object.userData.motionSeed as number;
    object.position.x = base.x + Math.sin(elapsed * 1.9 + seed) * 0.018;
    object.position.y = base.y + Math.sin(elapsed * 2.6 + seed) * 0.018;
    object.position.z = base.z + Math.cos(elapsed * 2.1 + seed) * 0.012;
    object.scale.x = 1 + Math.sin(elapsed * 2.2 + seed) * 0.035;
  });

  waterMistObjects.forEach((object) => {
    const base = object.userData.basePosition as THREE.Vector3;
    const seed = object.userData.motionSeed as number;
    const rise = THREE.MathUtils.euclideanModulo(elapsed * (0.08 + seed * 0.006) + seed * 0.11, 0.86);
    object.position.y = base.y + rise;
    object.position.x = base.x + Math.sin(elapsed * 1.35 + seed) * 0.04;
    object.position.z = base.z + Math.cos(elapsed * 1.05 + seed) * 0.035;
    object.scale.setScalar(0.72 + Math.sin(elapsed * 2 + seed) * 0.08);
  });
}

function updateGalleryCaptionFromYaw() {
  const total = manifest.photos.length || 8;
  const wrappedYaw = THREE.MathUtils.euclideanModulo(-galleryGroup.rotation.y, Math.PI * 2);
  const nextIndex = Math.round((wrappedYaw / (Math.PI * 2)) * total) % total;
  if (nextIndex === focusedPhoto) return;

  focusedPhoto = nextIndex;
  const current = manifest.photos[focusedPhoto];
  if (current) {
    narratorText.textContent = current.caption;
    progressLabel.textContent = current.year;
  }
}

function updateSeeds(elapsed: number) {
  seeds.forEach((seed, index) => {
    if (seed.collected) return;
    seed.mesh.position.y = Math.sin(elapsed * 2 + seed.mesh.userData.floatOffset) * 0.06;
    seed.mesh.rotation.y += 0.025;

    if (phase === 'trail' && seed.mesh.position.distanceTo(isabella.position) < 1.6) {
      seed.collected = true;
      seed.mesh.visible = false;
      narrationIndex = Math.min(index + 1, story.trail.length - 1);
      updateHeryckReveal(1);
      updateHud();

      if (seeds.every((item) => item.collected)) {
        narratorText.textContent = 'Todas as sementes encontraram lugar. O caminho pode seguir.';
        schedulePhase('lights', 1700);
      }
    }
  });
}

function updateCareLights(delta: number, elapsed: number) {
  careLights.forEach((light, index) => {
    animateGuidingLightVisual(light, index, delta, elapsed);
  });

  if (phase !== 'lights') return;

  const current = careLights[currentLightIndex];
  if (!current || current.delivered) return;

  current.target.visible = true;
  const playerDistance = current.orb.position.distanceTo(isabella.position);

  if (playerDistance < 2.4) {
    const guidePosition = tempVector.copy(isabella.position).add(new THREE.Vector3(0, 1.08, -0.42));
    current.orb.position.lerp(guidePosition, 1 - Math.pow(0.01, delta));
  } else {
    current.orb.position.lerp(current.home, 1 - Math.pow(0.06, delta));
  }

  if (current.orb.position.distanceTo(current.targetPosition) < 1.3) {
    current.delivered = true;
    current.orb.visible = false;
    current.target.visible = false;
    currentLightIndex += 1;
    narrationIndex = Math.min(currentLightIndex, story.lights.length - 1);
    updateHeryckReveal(2);

    const next = careLights[currentLightIndex];
    if (next) {
      next.target.visible = true;
    } else {
      narratorText.textContent = 'As luzes chegaram. Falta apenas juntar as pecas.';
      schedulePhase('puzzle', 1700);
    }
    updateHud();
  }
}

function animateGuidingLightVisual(light: CareLight, index: number, delta: number, elapsed: number) {
  const seed = light.orb.userData.motionSeed as number;
  const visual = light.orb.getObjectByName('care-light-visual');
  if (visual) {
    const hover = Math.sin(elapsed * 2.2 + seed) * 0.08;
    const pulse = 1 + Math.sin(elapsed * 3.4 + seed) * 0.045;
    visual.position.y = hover;
    visual.rotation.y += delta * (0.92 + index * 0.18);
    visual.scale.setScalar(pulse);
  }

  const core = light.orb.getObjectByName('care-light-core');
  if (core) {
    core.rotation.x += delta * 1.4;
    core.rotation.y -= delta * 1.1;
  }

  const point = light.orb.getObjectByName('care-light-point') as THREE.PointLight | null;
  if (point) {
    point.intensity = 1.05 + Math.sin(elapsed * 3 + seed) * 0.18;
  }

  light.orb.traverse((child) => {
    if (child.name.startsWith('care-light-ring-')) {
      child.rotation.x += delta * 0.65;
      child.rotation.z -= delta * 0.42;
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.42 + Math.sin(elapsed * 2.6 + seed) * 0.12;
    }

    if (child.name.startsWith('care-light-ray-')) {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.18 + Math.sin(elapsed * 2.1 + seed + child.id) * 0.08;
      child.scale.y = 0.88 + Math.sin(elapsed * 2.8 + child.id) * 0.08;
    }

    if (child.name === 'care-light-particle') {
      const baseAngle = child.userData.angle as number;
      const radius = child.userData.radius as number;
      const speed = child.userData.speed as number;
      const height = child.userData.height as number;
      const angle = baseAngle + elapsed * speed;
      child.position.set(
        Math.cos(angle) * radius,
        height + Math.sin(elapsed * 2.4 + baseAngle) * 0.055,
        Math.sin(angle) * radius
      );
    }

    if (child.name === 'care-light-halo' || child.name === 'care-light-vertical-halo') {
      const sprite = child as THREE.Sprite;
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = child.name === 'care-light-halo'
        ? 0.68 + Math.sin(elapsed * 2.5 + seed) * 0.14
        : 0.32 + Math.sin(elapsed * 2.1 + seed) * 0.1;
    }
  });

  if (light.target.visible) {
    const targetSeed = light.target.userData.motionSeed as number;
    light.target.rotation.y += delta * 0.34;

    light.target.traverse((child) => {
      if (child.name === 'care-light-petal') {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.36 + Math.sin(elapsed * 2.2 + targetSeed + child.id) * 0.08;
      }

      if (child.name === 'care-light-receiver') {
        child.rotation.y -= delta * 0.72;
        child.position.y = 0.42 + Math.sin(elapsed * 2.4 + targetSeed) * 0.025;
      }

      if (child.name === 'care-light-target-crystal') {
        child.rotation.y += delta * 1.25;
        child.rotation.z = Math.sin(elapsed * 1.9 + targetSeed) * 0.08;
        child.position.y = 1.05 + Math.sin(elapsed * 2.8 + targetSeed) * 0.055;
      }

      if (child.name === 'care-light-target-shard') {
        const baseAngle = child.userData.angle as number;
        const radius = child.userData.radius as number;
        const height = child.userData.height as number;
        const angle = baseAngle + elapsed * 0.42;
        child.position.set(
          Math.cos(angle) * radius,
          height + Math.sin(elapsed * 2.3 + baseAngle) * 0.035,
          Math.sin(angle) * radius
        );
        child.rotation.x += delta * 0.8;
        child.rotation.y += delta * 1.1;
      }

      if (child.name === 'care-light-target-flame') {
        child.rotation.y += delta * 1.4;
        child.scale.y = 0.92 + Math.sin(elapsed * 3.2 + targetSeed + child.id) * 0.1;
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.58 + Math.sin(elapsed * 3.7 + child.id) * 0.16;
      }

      if (child.name === 'care-light-target-beacon') {
        const sprite = child as THREE.Sprite;
        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity = 0.34 + Math.sin(elapsed * 2.6 + targetSeed) * 0.1;
        sprite.scale.set(1.22 + Math.sin(elapsed * 2.4 + targetSeed) * 0.08, 1.68, 1);
      }
    });
  }
}

function updateBloom(delta: number) {
  if (phase !== 'bloom') return;
  bloomProgress = Math.min(1, bloomProgress + delta * 0.28);
  updateFlowerMatrices(bloomProgress);
  scene.fog = new THREE.Fog(0x9ee6f7, 26 - bloomProgress * 10, 62);
  scene.background = new THREE.Color().lerpColors(new THREE.Color(0x8ed7f3), new THREE.Color(0xbbeedc), bloomProgress);

  if (bloomProgress > 0.98) {
    schedulePhase('gallery', 1200);
  }
}

function update(delta: number, elapsed: number) {
  updatePlayer(delta, elapsed);
  updateRealisticIsabellaAvatar(delta, elapsed);
  updateCamera(delta);
  updateSeeds(elapsed);
  updateCareLights(delta, elapsed);
  updatePuzzleStation(delta, elapsed);
  updateWaterDetails(delta, elapsed);
  updateBloom(delta);
  updateObjectivePointer();
  updateInteractionButton();
  renderer.render(scene, camera);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  update(delta, clock.elapsedTime);
  requestAnimationFrame(animate);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setupJoystick() {
  const activePointers = new Set<number>();

  joystick.addEventListener('pointerdown', (event) => {
    activePointers.add(event.pointerId);
    try {
      joystick.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used in tests do not always create an active browser pointer.
    }
    updateJoystickFromPointer(event);
  });

  joystick.addEventListener('pointermove', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    updateJoystickFromPointer(event);
  });

  const end = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    joystickVector.set(0, 0);
    if (pressedKeys.size === 0) {
      smoothedInputVector.set(0, 0);
    }
    joystickThumb.style.transform = 'translate3d(0, 0, 0)';
  };

  joystick.addEventListener('pointerup', end);
  joystick.addEventListener('pointercancel', end);
}

function setupKeyboardFallback() {
  const handledKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's']);

  window.addEventListener('keydown', (event) => {
    if (!handledKeys.has(event.key)) return;
    event.preventDefault();
    pressedKeys.add(event.key);
  });

  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.key);
  });
}

function readInputVector() {
  keyboardVector.set(0, 0);
  if (pressedKeys.has('ArrowLeft') || pressedKeys.has('a')) keyboardVector.x -= 1;
  if (pressedKeys.has('ArrowRight') || pressedKeys.has('d')) keyboardVector.x += 1;
  if (pressedKeys.has('ArrowUp') || pressedKeys.has('w')) keyboardVector.y -= 1;
  if (pressedKeys.has('ArrowDown') || pressedKeys.has('s')) keyboardVector.y += 1;
  if (keyboardVector.lengthSq() > 1) keyboardVector.normalize();

  inputVector.copy(joystickVector).add(keyboardVector);
  if (inputVector.lengthSq() > 1) inputVector.normalize();
  return inputVector;
}

function updateJoystickFromPointer(event: PointerEvent) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const max = rect.width * 0.34;
  const rawDx = event.clientX - centerX;
  const rawDy = event.clientY - centerY;
  const distance = Math.hypot(rawDx, rawDy);
  const angle = Math.atan2(rawDy, rawDx);
  const clampedDistance = Math.min(distance, max);
  const visualX = Math.cos(angle) * clampedDistance;
  const visualY = Math.sin(angle) * clampedDistance;
  const rawIntensity = clampedDistance / max;
  const deadzone = 0.1;

  if (rawIntensity <= deadzone || distance < 1) {
    joystickVector.set(0, 0);
  } else {
    const normalizedIntensity = (rawIntensity - deadzone) / (1 - deadzone);
    const curvedIntensity = Math.pow(normalizedIntensity, 1.55);
    joystickVector.set(Math.cos(angle) * curvedIntensity, Math.sin(angle) * curvedIntensity);
  }

  joystickThumb.style.transform = `translate3d(${visualX}px, ${visualY}px, 0)`;
}

function setupGalleryDrag() {
  canvas.addEventListener('pointerdown', (event) => {
    if (phase !== 'gallery') return;
    galleryDragActive = true;
    lastGalleryPointerX = event.clientX;
    galleryDragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!galleryDragActive || phase !== 'gallery') return;
    const dx = event.clientX - lastGalleryPointerX;
    lastGalleryPointerX = event.clientX;
    galleryDragDistance += Math.abs(dx);
    galleryYaw += dx * 0.006;
  });

  const end = () => {
    if (phase === 'gallery' && galleryDragActive && galleryDragDistance < 8) {
      focusNextPhoto();
    }
    galleryDragActive = false;
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

async function loadManifest() {
  try {
    const response = await fetch('./gallery/photo-manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = (await response.json()) as PhotoManifest;
  } catch (error) {
    console.warn('[gallery] manifesto de fotos indisponivel, usando placeholders.', error);
    manifest = { generatedAt: '', photos: [] };
  }

  const puzzlePhoto = manifest.photos.find((photo) => photo.puzzle) ?? manifest.photos[0];
  puzzleImage = puzzlePhoto?.src ?? '';
}

function boot() {
  createLights();
  createTerrain();
  createVillage();
  createPuzzleStation();
  createFlowerInstances();

  careLights.forEach((light) => {
    light.orb.visible = false;
    light.target.visible = false;
  });

  window.addEventListener('resize', resize);
  interactionButton.addEventListener('click', openPuzzlePanel);
  setupJoystick();
  setupKeyboardFallback();
  setupGalleryDrag();
  resize();
  setPhase('intro');
  loadRealisticIsabellaAvatar();
  setupDebugHooks();
  animate();
}

function setupDebugHooks() {
  if (!new URLSearchParams(window.location.search).has('debug')) return;

  window.__jardimDebug = {
    setPhase,
    completeTrail: () => {
      seeds.forEach((seed) => {
        seed.collected = true;
        seed.mesh.visible = false;
      });
      updateHud();
    },
    completeLights: () => {
      careLights.forEach((light) => {
        light.delivered = true;
        light.orb.visible = false;
        light.target.visible = false;
      });
      currentLightIndex = careLights.length;
      updateHud();
    },
    solvePuzzle,
    getPlayerState: () => ({
      x: isabella.position.x,
      z: isabella.position.z,
      input: smoothedInputVector.length(),
      walk: isabellaMoveBlend
    }),
    getAvatarState: () => {
      const avatarState = getRealisticAvatarState();
      return {
        state: avatarState.loadState,
        source: avatarState.source,
        loaded: avatarState.loadState === 'loaded',
        bones: Object.keys(avatarState.rig)
      };
    },
    setAvatarBoneRotation: (bone, x, y, z) => {
      const avatarBone = getRealisticAvatarState().rig[bone];
      if (!avatarBone) return false;
      avatarBone.object.rotation.set(
        avatarBone.restRotation.x + x,
        avatarBone.restRotation.y + y,
        avatarBone.restRotation.z + z
      );
      return true;
    },
    setPlayerPosition: (x: number, z: number) => {
      isabella.position.set(x, 0, z);
      heryck.position.set(x - 1.05, 0, z + 0.8);
    }
  };
}

loadManifest()
  .catch((error) => {
    console.warn('[boot] falha ao carregar manifesto.', error);
  })
  .finally(() => {
    boot();
    loadingScreen.style.opacity = '0';
    window.setTimeout(() => loadingScreen.classList.add('hidden'), 380);
  });

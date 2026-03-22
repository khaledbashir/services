"use client";

import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

interface Screen {
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  pixel_pitch: number | null;
  width_ft: number | null;
  height_ft: number | null;
  brightness_nits: number | null;
  environment: string | null;
  location_zone: string | null;
  is_active: boolean;
}

interface Props {
  screens: Screen[];
  venueName: string;
}

// Rocket Mortgage FieldHouse display positions in 3D space
// Mapped from activation guide: scoreboard, ribbon, power portal, concourse, courtside
const SCREEN_POSITIONS: Record<string, {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
  type: 'scoreboard' | 'ribbon' | 'fascia' | 'courtside' | 'concourse' | 'portal';
}> = {
  // Center-hung scoreboard (4 faces)
  'center hung - north': { pos: [0, 16, -2.6], rot: [0, 0, 0], scale: [8, 4.5, 1], type: 'scoreboard' },
  'center hung - south': { pos: [0, 16, 2.6], rot: [0, Math.PI, 0], scale: [8, 4.5, 1], type: 'scoreboard' },
  'center hung - east': { pos: [4.1, 16, 0], rot: [0, -Math.PI / 2, 0], scale: [5, 4.5, 1], type: 'scoreboard' },
  'center hung - west': { pos: [-4.1, 16, 0], rot: [0, Math.PI / 2, 0], scale: [5, 4.5, 1], type: 'scoreboard' },
  'scoreboard - bottom': { pos: [0, 13.5, 0], rot: [Math.PI / 2, 0, 0], scale: [8, 5, 1], type: 'scoreboard' },
  // Upper ring ribbon
  'upper ribbon': { pos: [0, 10, 0], rot: [0, 0, 0], scale: [1, 1, 1], type: 'ribbon' },
  // Lower ring ribbon
  'lower ribbon': { pos: [0, 5.5, 0], rot: [0, 0, 0], scale: [1, 1, 1], type: 'ribbon' },
  // Fascia boards
  'upper fascia - north': { pos: [0, 12, -28], rot: [0, 0, 0], scale: [20, 1.5, 1], type: 'fascia' },
  'upper fascia - south': { pos: [0, 12, 28], rot: [0, Math.PI, 0], scale: [20, 1.5, 1], type: 'fascia' },
  'upper fascia - east': { pos: [22, 12, 0], rot: [0, -Math.PI / 2, 0], scale: [20, 1.5, 1], type: 'fascia' },
  'upper fascia - west': { pos: [-22, 12, 0], rot: [0, Math.PI / 2, 0], scale: [20, 1.5, 1], type: 'fascia' },
  // Courtside LED boards
  'courtside - north': { pos: [0, 0.6, -13], rot: [0, 0, 0], scale: [18, 1, 1], type: 'courtside' },
  'courtside - south': { pos: [0, 0.6, 13], rot: [0, Math.PI, 0], scale: [18, 1, 1], type: 'courtside' },
  'courtside - east': { pos: [15, 0.6, 0], rot: [0, -Math.PI / 2, 0], scale: [12, 1, 1], type: 'courtside' },
  'courtside - west': { pos: [-15, 0.6, 0], rot: [0, Math.PI / 2, 0], scale: [12, 1, 1], type: 'courtside' },
  // Power Portal entry
  'power portal': { pos: [0, 6, -34], rot: [0, 0, 0], scale: [12, 8, 1], type: 'portal' },
  // Concourse displays
  'concourse - nw': { pos: [-26, 7, -18], rot: [0, Math.PI / 4, 0], scale: [6, 3, 1], type: 'concourse' },
  'concourse - ne': { pos: [26, 7, -18], rot: [0, -Math.PI / 4, 0], scale: [6, 3, 1], type: 'concourse' },
  'concourse - sw': { pos: [-26, 7, 18], rot: [0, 3 * Math.PI / 4, 0], scale: [6, 3, 1], type: 'concourse' },
  'concourse - se': { pos: [26, 7, 18], rot: [0, -3 * Math.PI / 4, 0], scale: [6, 3, 1], type: 'concourse' },
};

const TYPE_COLORS: Record<string, number> = {
  scoreboard: 0x0A52EF,
  ribbon: 0x03B8FF,
  fascia: 0x6366f1,
  courtside: 0x10b981,
  concourse: 0xf59e0b,
  portal: 0xec4899,
};

const TYPE_LABELS: Record<string, string> = {
  scoreboard: 'Center-Hung Scoreboard',
  ribbon: 'Ribbon Board',
  fascia: 'Upper Fascia',
  courtside: 'Courtside LED',
  concourse: 'Concourse Display',
  portal: 'Power Portal',
};

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number]; label: string }> = {
  all: { pos: [28, 20, 32], target: [0, 6, 0], label: 'Overview' },
  scoreboard: { pos: [0, 12, 20], target: [0, 15, 0], label: 'Scoreboard' },
  courtside: { pos: [10, 3, 18], target: [0, 0.6, 0], label: 'Courtside' },
  portal: { pos: [0, 8, -28], target: [0, 6, -34], label: 'Power Portal' },
  concourse: { pos: [30, 12, 0], target: [0, 7, 0], label: 'Concourse' },
};

function makeScreenTexture(name: string, type: string, color: number, w = 512, h = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;

  // Dark background with subtle grid
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, 0.15)`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Glow border
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // ANC logo text
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px system-ui";
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText("ANC", w / 2, h / 2 - 20);

  ctx.font = "16px system-ui";
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
  const displayName = name.length > 30 ? name.slice(0, 27) + '...' : name;
  ctx.fillText(displayName, w / 2, h / 2 + 15);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Helper: create octagonal shape (like Gainbridge Fieldhouse)
function makeOctagonShape(radius: number, squeeze = 0.75): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * squeeze;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

function buildArena(scene: THREE.Scene) {
  // ── LIGHTING: bright arena atmosphere ──
  scene.add(new THREE.AmbientLight(0x6680bb, 0.6));

  // Stadium flood lights — white, strong, overhead
  [
    { pos: [0, 38, 0], intensity: 300, color: 0xffeedd },
    { pos: [20, 35, -15], intensity: 150, color: 0xffffff },
    { pos: [-20, 35, 15], intensity: 150, color: 0xffffff },
    { pos: [15, 35, 20], intensity: 120, color: 0xeeeeff },
    { pos: [-15, 35, -20], intensity: 120, color: 0xeeeeff },
  ].forEach(({ pos, intensity, color }) => {
    const s = new THREE.SpotLight(color, intensity, 100, 0.9, 0.4);
    s.position.set(pos[0], pos[1], pos[2]);
    s.castShadow = true;
    scene.add(s);
  });

  // Accent rim lights around arena
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const p = new THREE.PointLight(0x4488ff, 20, 60);
    p.position.set(Math.cos(angle) * 32, 10, Math.sin(angle) * 32 * 0.75);
    scene.add(p);
  }

  // ── FLOOR ──
  const floorShape = makeOctagonShape(42);
  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
    color: 0x1a1a30, roughness: 0.8,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor);

  // ── COURT (basketball) ──
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 15),
    new THREE.MeshStandardMaterial({ color: 0xD4A446, roughness: 0.65 })
  );
  court.rotation.x = -Math.PI / 2; court.position.y = 0.01; scene.add(court);

  // Court paint (key areas)
  [-10, 10].forEach(x => {
    const paint = new THREE.Mesh(
      new THREE.PlaneGeometry(5.7, 12),
      new THREE.MeshStandardMaterial({ color: 0x002D62, roughness: 0.7 })
    );
    paint.rotation.x = -Math.PI / 2; paint.position.set(x, 0.015, 0);
    scene.add(paint);
  });

  // Court lines
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  // Center circle
  const circle = new THREE.Mesh(new THREE.RingGeometry(1.8, 1.9, 32), lineMat);
  circle.rotation.x = -Math.PI / 2; circle.position.y = 0.02; scene.add(circle);
  // Center line
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 15), lineMat);
  cl.rotation.x = -Math.PI / 2; cl.position.y = 0.02; scene.add(cl);
  // Boundary
  const boundary = new THREE.Mesh(new THREE.RingGeometry(0, 0.04, 4), lineMat);
  boundary.rotation.x = -Math.PI / 2; boundary.position.y = 0.02; scene.add(boundary);
  // 3-point arcs
  [-10, 10].forEach(x => {
    const arc = new THREE.Mesh(new THREE.RingGeometry(5.8, 5.9, 32, 1, -Math.PI / 2, Math.PI), lineMat);
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    arc.position.set(x, 0.02, 0);
    scene.add(arc);
  });

  // ── SEATING BOWL (octagonal tiers) ──
  const seatMat1 = new THREE.MeshStandardMaterial({ color: 0x002D62, roughness: 0.75 }); // dark navy (Pacers)
  const seatMat2 = new THREE.MeshStandardMaterial({ color: 0x1a3366, roughness: 0.75 }); // lighter navy
  const seatMat3 = new THREE.MeshStandardMaterial({ color: 0x253d6e, roughness: 0.75 }); // upper deck

  const tiers = [
    { inner: 16, outer: 22, y: 0, h: 4, mat: seatMat1 },
    { inner: 23, outer: 28, y: 4.5, h: 5, mat: seatMat2 },
    { inner: 29, outer: 36, y: 10, h: 8, mat: seatMat3 },
  ];

  tiers.forEach(tier => {
    // Create octagonal ring using extrude
    const outerShape = makeOctagonShape(tier.outer);
    const innerShape = makeOctagonShape(tier.inner);
    outerShape.holes.push(new THREE.Path(innerShape.getPoints()));
    const extrudeSettings = { depth: tier.h, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
    const mesh = new THREE.Mesh(geo, tier.mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = tier.y;
    scene.add(mesh);
  });

  // Tier edge lights (gold accent like Pacers)
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xFFB81C, emissive: new THREE.Color(0xFFB81C), emissiveIntensity: 0.8,
  });
  [4, 9.5, 18].forEach(y => {
    // Octagonal edge ring
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
      pts.push(new THREE.Vector2(Math.cos(angle) * 25, Math.sin(angle) * 25 * 0.75));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(p.x, y, p.y))
    );
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xFFB81C, linewidth: 2 }));
    scene.add(line);
  });

  // ── OUTER WALL (octagonal) ──
  const wallShape = makeOctagonShape(38);
  const wallInner = makeOctagonShape(37.5);
  wallShape.holes.push(new THREE.Path(wallInner.getPoints()));
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: 22, bevelEnabled: false });
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
    color: 0x1e1e3a, roughness: 0.7,
  }));
  wall.rotation.x = -Math.PI / 2; wall.position.y = 0;
  scene.add(wall);

  // ── CEILING ──
  const ceilShape = makeOctagonShape(39);
  const ceilGeo = new THREE.ShapeGeometry(ceilShape);
  const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshStandardMaterial({
    color: 0x1a1a35, roughness: 0.9, side: THREE.BackSide,
  }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 24; scene.add(ceil);

  // Ceiling trusses
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x333355, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI;
    const truss = new THREE.Mesh(new THREE.BoxGeometry(78, 0.4, 0.4), trussMat);
    truss.position.y = 23;
    truss.rotation.y = angle;
    scene.add(truss);
  }

  // ── SCOREBOARD (center-hung, open frame) ──
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x333355, metalness: 0.8, roughness: 0.3 });

  // Horizontal frame bars
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.25, 6.5), frameMat);
  frameTop.position.set(0, 18.6, 0); scene.add(frameTop);
  const frameBot = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.25, 6.5), frameMat);
  frameBot.position.set(0, 13.2, 0); scene.add(frameBot);

  // Corner struts
  [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3]].forEach(([x, z]) => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.4, 0.25), frameMat);
    strut.position.set(x, 15.9, z); scene.add(strut);
  });

  // Cables to ceiling
  [[-3, -2], [3, -2], [-3, 2], [3, 2]].forEach(([x, z]) => {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x444466 })
    );
    cable.position.set(x, 22.5, z); scene.add(cable);
  });

  // ── CONCOURSE ENTRANCES (gates) ──
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x252545, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const gateR = 37;
    const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 1.5), gateMat);
    gate.position.set(Math.cos(angle) * gateR, 2.5, Math.sin(angle) * gateR * 0.75);
    gate.rotation.y = -angle;
    scene.add(gate);
  }
}

export default function VenueMap3D({ screens, venueName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animIdRef = useRef<number>(0);
  const composerRef = useRef<EffectComposer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const screenMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const [activeView, setActiveView] = useState<string>('all');
  const [hoveredScreen, setHoveredScreen] = useState<string | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);
  const [isReady, setIsReady] = useState(false);

  const camTarget = useRef({ pos: new THREE.Vector3(28, 20, 32), look: new THREE.Vector3(0, 6, 0) });
  const camCurrent = useRef({ pos: new THREE.Vector3(28, 20, 32), look: new THREE.Vector3(0, 6, 0) });

  // Match DB screens to 3D positions by fuzzy name match
  function matchScreenToPosition(screenName: string): string | null {
    const lower = screenName.toLowerCase();
    const keys = Object.keys(SCREEN_POSITIONS);
    // Direct match
    const direct = keys.find(k => lower.includes(k) || k.includes(lower));
    if (direct) return direct;
    // Partial match
    if (lower.includes('center') || lower.includes('scoreboard') || lower.includes('videoboard')) {
      if (lower.includes('north') || lower.includes('front')) return 'center hung - north';
      if (lower.includes('south') || lower.includes('back')) return 'center hung - south';
      if (lower.includes('east') || lower.includes('right')) return 'center hung - east';
      if (lower.includes('west') || lower.includes('left')) return 'center hung - west';
      if (lower.includes('bottom') || lower.includes('under')) return 'scoreboard - bottom';
      return 'center hung - north';
    }
    if (lower.includes('ribbon')) return lower.includes('upper') || lower.includes('top') ? 'upper ribbon' : 'lower ribbon';
    if (lower.includes('fascia')) {
      if (lower.includes('north')) return 'upper fascia - north';
      if (lower.includes('south')) return 'upper fascia - south';
      if (lower.includes('east')) return 'upper fascia - east';
      return 'upper fascia - west';
    }
    if (lower.includes('courtside') || lower.includes('court')) {
      if (lower.includes('north')) return 'courtside - north';
      if (lower.includes('south')) return 'courtside - south';
      if (lower.includes('east')) return 'courtside - east';
      return 'courtside - west';
    }
    if (lower.includes('portal') || lower.includes('entry') || lower.includes('entrance')) return 'power portal';
    if (lower.includes('concourse')) {
      if (lower.includes('nw') || lower.includes('northwest')) return 'concourse - nw';
      if (lower.includes('ne') || lower.includes('northeast')) return 'concourse - ne';
      if (lower.includes('sw') || lower.includes('southwest')) return 'concourse - sw';
      return 'concourse - se';
    }
    return null;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 250);
    camera.position.set(28, 20, 32);
    cameraRef.current = camera;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020510, 0.008);
    buildArena(scene);

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.6, 0.4, 0.85
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composerRef.current = composer;

    // Build screen meshes
    const meshMap = new Map<string, THREE.Mesh>();
    const allScreenMeshes: THREE.Mesh[] = [];

    // Place screens from DB data or defaults
    Object.entries(SCREEN_POSITIONS).forEach(([key, config]) => {
      const color = TYPE_COLORS[config.type] || 0x0A52EF;
      const dbScreen = screens.find(s => matchScreenToPosition(s.display_name) === key);
      const displayName = dbScreen?.display_name || TYPE_LABELS[config.type] || key;

      if (config.type === 'ribbon') {
        // Ribbon as octagonal ring (matches arena shape)
        const radius = key === 'upper ribbon' ? 27 : 24;
        const tex = makeScreenTexture(displayName, config.type, color, 2048, 256);
        tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(8, 1); tex.needsUpdate = true;
        const ribMat = new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex,
          emissive: new THREE.Color("#ffffff"), emissiveIntensity: 5,
          toneMapped: false, side: THREE.DoubleSide,
        });
        // Build octagonal ribbon from 8 flat panels
        const ribGroup = new THREE.Group();
        ribGroup.name = key;
        for (let i = 0; i < 8; i++) {
          const a1 = (i / 8) * Math.PI * 2 - Math.PI / 8;
          const a2 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 8;
          const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius * 0.75;
          const x2 = Math.cos(a2) * radius, z2 = Math.sin(a2) * radius * 0.75;
          const segLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(segLen, 1.5), ribMat.clone());
          panel.position.set((x1 + x2) / 2, config.pos[1], (z1 + z2) / 2);
          panel.rotation.y = Math.atan2(x1 - x2, z1 - z2);
          ribGroup.add(panel);
          allScreenMeshes.push(panel);
        }
        scene.add(ribGroup);
        meshMap.set(key, ribGroup.children[0] as THREE.Mesh);
      } else {
        // Flat screen
        const tex = makeScreenTexture(displayName, config.type, color);
        const mat = new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex,
          emissive: new THREE.Color("#ffffff"), emissiveIntensity: 5, toneMapped: false,
        });
        const geo = new THREE.PlaneGeometry(config.scale[0], config.scale[1]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(config.pos[0], config.pos[1], config.pos[2]);
        mesh.rotation.set(config.rot[0], config.rot[1], config.rot[2]);
        mesh.name = key;
        scene.add(mesh);
        meshMap.set(key, mesh);
        allScreenMeshes.push(mesh);

        // Frame
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 });
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(config.scale[0] + 0.3, config.scale[1] + 0.3, 0.15),
          frameMat
        );
        frame.position.copy(mesh.position);
        frame.rotation.copy(mesh.rotation);
        frame.position.add(new THREE.Vector3(0, 0, -0.08).applyEuler(mesh.rotation));
        scene.add(frame);
      }
    });

    screenMeshesRef.current = meshMap;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Mouse interaction
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = (e: MouseEvent) => {
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(allScreenMeshes);
      if (intersects.length > 0) {
        const name = intersects[0].object.name;
        const dbScreen = screens.find(s => matchScreenToPosition(s.display_name) === name);
        if (dbScreen) {
          setSelectedScreen(dbScreen);
        } else {
          // Show position info even without DB data
          const config = SCREEN_POSITIONS[name];
          setSelectedScreen({
            display_name: TYPE_LABELS[config?.type || ''] || name,
            manufacturer: null, model: null, pixel_pitch: null,
            width_ft: null, height_ft: null, brightness_nits: null,
            environment: config?.type || null, location_zone: name,
            is_active: true,
          });
        }
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);

    // Animation
    const clock = new THREE.Clock();
    function animate() {
      animIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Camera lerp
      camCurrent.current.pos.lerp(camTarget.current.pos, Math.min(2 * delta, 1));
      camCurrent.current.look.lerp(camTarget.current.look, Math.min(2 * delta, 1));
      camera.position.copy(camCurrent.current.pos);
      controls.target.copy(camCurrent.current.look);
      controls.update();

      // Screen pulse
      const pulse = 1 + Math.sin(elapsed * 1.5) * 0.06;
      allScreenMeshes.forEach(mesh => {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 2.5 * pulse;
      });

      // Ribbon scroll
      allScreenMeshes.forEach(mesh => {
        if (mesh.geometry instanceof THREE.CylinderGeometry) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m.map) m.map.offset.x += delta * 0.02;
        }
      });

      // Raycaster hover
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(allScreenMeshes);
      if (intersects.length > 0) {
        const name = intersects[0].object.name;
        setHoveredScreen(name);
        container!.style.cursor = 'pointer';
        // Brighten hovered
        const m = (intersects[0].object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 5;
      } else {
        setHoveredScreen(null);
        container!.style.cursor = 'grab';
      }

      composer.render();
    }
    animate();
    setIsReady(true);

    // Resize
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(animIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [screens]);

  // Camera view change
  useEffect(() => {
    const view = VIEWS[activeView] || VIEWS.all;
    camTarget.current.pos.set(...view.pos);
    camTarget.current.look.set(...view.target);
    if (controlsRef.current) {
      controlsRef.current.autoRotate = activeView === 'all';
    }
  }, [activeView]);

  const hoveredConfig = hoveredScreen ? SCREEN_POSITIONS[hoveredScreen] : null;

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-slate-950" style={{ height: '600px' }}>
      {/* Loading */}
      {!isReady && (
        <div className="absolute inset-0 z-30 bg-slate-950 flex flex-col items-center justify-center">
          <div className="relative w-14 h-14 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-t-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-slate-400 font-medium">Loading Venue...</p>
          <p className="text-[10px] text-slate-600 mt-1">Initializing 3D environment</p>
        </div>
      )}

      {/* View controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Camera View</p>
          <div className="flex flex-col gap-1">
            {Object.entries(VIEWS).map(([key, view]) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                className={`text-xs px-3 py-1.5 rounded transition-all text-left ${
                  activeView === key
                    ? 'bg-[#0A52EF] text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Display Types</p>
          <div className="flex flex-col gap-1">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }} />
                <span className="text-[10px] text-slate-400">{TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredScreen && hoveredConfig && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/70 backdrop-blur-md rounded-lg px-4 py-3 border border-white/10 min-w-[180px]">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${(TYPE_COLORS[hoveredConfig.type] || 0x0A52EF).toString(16).padStart(6, '0')}` }} />
              <span className="text-xs text-white font-medium">{TYPE_LABELS[hoveredConfig.type]}</span>
            </div>
            <p className="text-[10px] text-slate-400 capitalize">{hoveredScreen}</p>
            <p className="text-[10px] text-blue-400 mt-1">Click for specs</p>
          </div>
        </div>
      )}

      {/* Selected screen detail panel */}
      {selectedScreen && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/10 w-[280px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedScreen.display_name}</h3>
              <button onClick={() => setSelectedScreen(null)} className="text-slate-500 hover:text-white text-xs">x</button>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              {selectedScreen.manufacturer && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Manufacturer</p>
                  <p className="text-xs text-white mt-0.5">{selectedScreen.manufacturer}</p>
                </div>
              )}
              {selectedScreen.model && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Model</p>
                  <p className="text-xs text-white mt-0.5">{selectedScreen.model}</p>
                </div>
              )}
              {selectedScreen.pixel_pitch && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Pixel Pitch</p>
                  <p className="text-xs text-white mt-0.5">{selectedScreen.pixel_pitch}mm</p>
                </div>
              )}
              {(selectedScreen.width_ft || selectedScreen.height_ft) && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Dimensions</p>
                  <p className="text-xs text-white mt-0.5">{selectedScreen.width_ft}' x {selectedScreen.height_ft}'</p>
                </div>
              )}
              {selectedScreen.brightness_nits && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Brightness</p>
                  <p className="text-xs text-white mt-0.5">{Number(selectedScreen.brightness_nits).toLocaleString()} nits</p>
                </div>
              )}
              {selectedScreen.environment && (
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Environment</p>
                  <p className="text-xs text-white mt-0.5 capitalize">{selectedScreen.environment}</p>
                </div>
              )}
              {selectedScreen.location_zone && (
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-500 font-medium">Location</p>
                  <p className="text-xs text-white mt-0.5 capitalize">{selectedScreen.location_zone}</p>
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-4 py-2 border border-white/10">
          <p className="text-xs text-white font-semibold text-center">{venueName}</p>
          <p className="text-[10px] text-slate-500 text-center mt-0.5">Interactive 3D Venue Map</p>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Footer */}
      <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-600">
        ANC Venue Vision
      </div>
    </div>
  );
}

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

// Screen positions mapped to 3D space
const SCREEN_POSITIONS: Record<string, {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
  type: 'scoreboard' | 'ribbon' | 'fascia' | 'courtside' | 'concourse' | 'portal';
}> = {
  'center hung - north': { pos: [0, 38, -6.5], rot: [0, 0, 0], scale: [20, 11, 1], type: 'scoreboard' },
  'center hung - south': { pos: [0, 38, 6.5], rot: [0, Math.PI, 0], scale: [20, 11, 1], type: 'scoreboard' },
  'center hung - east': { pos: [10.5, 38, 0], rot: [0, -Math.PI / 2, 0], scale: [12, 11, 1], type: 'scoreboard' },
  'center hung - west': { pos: [-10.5, 38, 0], rot: [0, Math.PI / 2, 0], scale: [12, 11, 1], type: 'scoreboard' },
  'scoreboard - bottom': { pos: [0, 32, 0], rot: [Math.PI / 2, 0, 0], scale: [20, 12, 1], type: 'scoreboard' },
  'upper ribbon': { pos: [0, 24, 0], rot: [0, 0, 0], scale: [1, 1, 1], type: 'ribbon' },
  'lower ribbon': { pos: [0, 12, 0], rot: [0, 0, 0], scale: [1, 1, 1], type: 'ribbon' },
  'upper fascia - north': { pos: [0, 28, -55], rot: [0, 0, 0], scale: [40, 3, 1], type: 'fascia' },
  'upper fascia - south': { pos: [0, 28, 55], rot: [0, Math.PI, 0], scale: [40, 3, 1], type: 'fascia' },
  'upper fascia - east': { pos: [44, 28, 0], rot: [0, -Math.PI / 2, 0], scale: [40, 3, 1], type: 'fascia' },
  'upper fascia - west': { pos: [-44, 28, 0], rot: [0, Math.PI / 2, 0], scale: [40, 3, 1], type: 'fascia' },
  'courtside - north': { pos: [0, 1.2, -26], rot: [0, 0, 0], scale: [36, 2, 1], type: 'courtside' },
  'courtside - south': { pos: [0, 1.2, 26], rot: [0, Math.PI, 0], scale: [36, 2, 1], type: 'courtside' },
  'courtside - east': { pos: [30, 1.2, 0], rot: [0, -Math.PI / 2, 0], scale: [24, 2, 1], type: 'courtside' },
  'courtside - west': { pos: [-30, 1.2, 0], rot: [0, Math.PI / 2, 0], scale: [24, 2, 1], type: 'courtside' },
  'power portal': { pos: [0, 12, -68], rot: [0, 0, 0], scale: [24, 16, 1], type: 'portal' },
  'concourse - nw': { pos: [-52, 14, -36], rot: [0, Math.PI / 4, 0], scale: [12, 6, 1], type: 'concourse' },
  'concourse - ne': { pos: [52, 14, -36], rot: [0, -Math.PI / 4, 0], scale: [12, 6, 1], type: 'concourse' },
  'concourse - sw': { pos: [-52, 14, 36], rot: [0, 3 * Math.PI / 4, 0], scale: [12, 6, 1], type: 'concourse' },
  'concourse - se': { pos: [52, 14, 36], rot: [0, -3 * Math.PI / 4, 0], scale: [12, 6, 1], type: 'concourse' },
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
  all: { pos: [65, 50, 75], target: [0, 15, 0], label: 'Overview' },
  scoreboard: { pos: [0, 30, 45], target: [0, 38, 0], label: 'Scoreboard' },
  courtside: { pos: [25, 6, 40], target: [0, 1, 0], label: 'Courtside' },
  portal: { pos: [0, 15, -55], target: [0, 12, -68], label: 'Power Portal' },
  concourse: { pos: [60, 25, 0], target: [0, 14, 0], label: 'Concourse' },
};

/* ── Screen texture (MeshBasicMaterial — always bright, fog-immune) ── */
function makeScreenTexture(name: string, color: number, w = 512, h = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;

  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;

  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#030812");
  grad.addColorStop(1, "#0a1628");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // LED pixel grid
  ctx.strokeStyle = `rgba(${r},${g},${b},0.06)`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Corner markers
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 40, 2);
  ctx.strokeRect(12, 12, 2, 30);
  ctx.strokeRect(w - 52, h - 14, 40, 2);
  ctx.strokeRect(w - 14, h - 42, 2, 30);

  // ANC text with glow
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 52px 'Work Sans', system-ui";
  ctx.shadowColor = `rgb(${r},${g},${b})`;
  ctx.shadowBlur = 30;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillText("ANC", w / 2, h / 2 - 20);
  ctx.shadowBlur = 0;

  ctx.font = "300 18px 'Work Sans', system-ui";
  ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
  const displayName = name.length > 35 ? name.slice(0, 32) + '...' : name;
  ctx.fillText(displayName, w / 2, h / 2 + 25);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/* ── Court texture with wood grain and lines ── */
function makeCourtTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1600; c.height = 960;
  const ctx = c.getContext("2d")!;

  // Hardwood base
  ctx.fillStyle = '#b8803a';
  ctx.fillRect(0, 0, 1600, 960);

  // Wood plank lines
  ctx.strokeStyle = 'rgba(100,60,20,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 1600; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 960); ctx.stroke(); }
  for (let j = 0; j < 960; j += 80) {
    ctx.strokeStyle = 'rgba(80,50,15,0.08)';
    ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(1600, j); ctx.stroke();
  }

  // Paint areas
  ctx.fillStyle = 'rgba(0,40,180,0.12)';
  ctx.fillRect(60, 280, 300, 400);
  ctx.fillRect(1240, 280, 300, 400);

  // Court lines
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, 1480, 840); // boundary
  ctx.beginPath(); ctx.moveTo(800, 60); ctx.lineTo(800, 900); ctx.stroke(); // center
  ctx.beginPath(); ctx.arc(800, 480, 100, 0, Math.PI * 2); ctx.stroke(); // center circle
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(260, 480, 100, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(1340, 480, 100, Math.PI / 2, -Math.PI / 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
  ctx.strokeRect(60, 280, 300, 400);
  ctx.strokeRect(1240, 280, 300, 400);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(160, 480, 320, -1.2, 1.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(1440, 480, 320, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/* ── Build arena (ported from /3d project) ── */
function buildArena(scene: THREE.Scene) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a10, metalness: 0.95, roughness: 0.15 });

  // ── Ground ──
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x08090e, roughness: 0.98 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; floor.receiveShadow = true; scene.add(floor);

  // ── Arena bowl (2 tiers) ──
  const bowlMaker = (rx: number, rz: number, h: number, yBase: number, color: number) => {
    const shape = new THREE.Shape();
    const segs = 48;
    const innerRX = rx * 0.84, innerRZ = rz * 0.84;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.cos(a) * rx, Math.sin(a) * rz);
      else shape.lineTo(Math.cos(a) * rx, Math.sin(a) * rz);
    }
    shape.closePath();
    const hole = new THREE.Path();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i === 0) hole.moveTo(Math.cos(a) * innerRX, Math.sin(a) * innerRZ);
      else hole.lineTo(Math.cos(a) * innerRX, Math.sin(a) * innerRZ);
    }
    hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = yBase;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  };

  bowlMaker(50, 35, 12, 0, 0x1a2844);     // Lower bowl
  bowlMaker(53, 37, 3, 11, 0x1e3050);      // Suite ring
  bowlMaker(58, 42, 14, 12, 0x162238);     // Upper bowl

  // ── Seating rows (torus rings) ──
  const seatRows: { r: number; y: number; color: string; sz: number }[] = [];
  for (let i = 0; i < 6; i++) seatRows.push({ r: 32 + i * 2.5, y: 1 + i * 1.8, color: i < 3 ? '#1a3a5f' : '#15304a', sz: 0.68 });
  for (let i = 0; i < 6; i++) seatRows.push({ r: 47 + i * 1.5, y: 13 + i * 2, color: i < 3 ? '#162850' : '#122040', sz: 0.7 });
  seatRows.forEach(row => {
    const seat = new THREE.Mesh(
      new THREE.TorusGeometry(row.r, 0.2, 4, 48),
      new THREE.MeshStandardMaterial({ color: row.color, roughness: 0.92, metalness: 0.02 })
    );
    seat.rotation.x = -Math.PI / 2; seat.position.y = row.y; seat.scale.set(1, 1, row.sz);
    scene.add(seat);
  });

  // ── Roof ring ──
  const roofRing = new THREE.Mesh(
    new THREE.TorusGeometry(55, 3, 6, 48),
    new THREE.MeshStandardMaterial({ color: 0x1e1e2a, metalness: 0.85, roughness: 0.2 })
  );
  roofRing.rotation.x = -Math.PI / 2; roofRing.position.y = 28; roofRing.scale.set(1, 1, 0.72);
  scene.add(roofRing);

  // ── Court ──
  const courtTex = makeCourtTexture();
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 30),
    new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.55, metalness: 0.05 })
  );
  court.rotation.x = -Math.PI / 2; court.position.y = 0.1; court.receiveShadow = true;
  scene.add(court);

  // ── Stadium flood lights (visible glowing boxes) ──
  const lightPositions: [number, number, number][] = [[-30, 42, -20], [30, 42, -20], [-30, 42, 20], [30, 42, 20]];
  lightPositions.forEach(pos => {
    const spot = new THREE.SpotLight(0xfff8f0, 40, 150, 0.7, 0.4, 2);
    spot.position.set(pos[0], pos[1], pos[2]);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
    // Visible light fixture
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(8, 1.2, 3.5),
      new THREE.MeshStandardMaterial({ color: 0xfff5e0, emissive: new THREE.Color(0xfff5e0), emissiveIntensity: 1.5, toneMapped: false })
    );
    fixture.position.set(pos[0], pos[1], pos[2]);
    scene.add(fixture);
  });

  // ── Scoreboard housing ──
  const sbFrame = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 14), frameMat);
  sbFrame.position.set(0, 38, 0); scene.add(sbFrame);

  // Cables
  [[-12, -6], [12, -6], [-12, 6], [12, 6]].forEach(([x, z]) => {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 12, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a38, metalness: 0.9, roughness: 0.15 })
    );
    cable.position.set(x, 50, z); scene.add(cable);
  });

  // ── Tunnel entrances ──
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(a => {
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(5, 7, 5),
      new THREE.MeshStandardMaterial({ color: 0x020208, roughness: 1 })
    );
    t.position.set(Math.sin(a) * 36, 3.5, Math.cos(a) * 36 * 0.7);
    t.rotation.y = a; scene.add(t);
    // Gate glow
    const gl = new THREE.PointLight(0x0A52EF, 3, 15, 2);
    gl.position.set(Math.sin(a) * 34, 3, Math.cos(a) * 34 * 0.7);
    scene.add(gl);
  });

  // ── Scorer's table ──
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.6, metalness: 0.3 })
  );
  table.position.set(0, 0.5, -11); scene.add(table);
}

/* ── Name matcher ── */
function matchScreenToPosition(screenName: string): string | null {
  const lower = screenName.toLowerCase();
  const keys = Object.keys(SCREEN_POSITIONS);
  const direct = keys.find(k => lower.includes(k) || k.includes(lower));
  if (direct) return direct;
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

/* ── Main component ── */
export default function VenueMap3D({ screens, venueName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animIdRef = useRef<number>(0);

  const [activeView, setActiveView] = useState<string>('all');
  const [hoveredScreen, setHoveredScreen] = useState<string | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);
  const [isReady, setIsReady] = useState(false);

  const camTarget = useRef({ pos: new THREE.Vector3(65, 50, 75), look: new THREE.Vector3(0, 15, 0) });
  const camCurrent = useRef({ pos: new THREE.Vector3(65, 50, 75), look: new THREE.Vector3(0, 15, 0) });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(65, 50, 75);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000a1a, 250, 900);

    // ── Lighting (from /3d project) ──
    scene.add(new THREE.AmbientLight(0x1a2540, 0.4));

    const dirMain = new THREE.DirectionalLight(0xfff5e8, 1.2);
    dirMain.position.set(80, 180, 60);
    dirMain.castShadow = true;
    dirMain.shadow.mapSize.set(2048, 2048);
    dirMain.shadow.camera.near = 1;
    dirMain.shadow.camera.far = 500;
    dirMain.shadow.camera.left = -150;
    dirMain.shadow.camera.right = 150;
    dirMain.shadow.camera.top = 150;
    dirMain.shadow.camera.bottom = -150;
    dirMain.shadow.bias = -0.0002;
    scene.add(dirMain);

    const dirFill = new THREE.DirectionalLight(0x4488cc, 0.3);
    dirFill.position.set(-60, 100, -40); scene.add(dirFill);

    const dirRim = new THREE.DirectionalLight(0x6688bb, 0.2);
    dirRim.position.set(0, 50, -120); scene.add(dirRim);

    const hemi = new THREE.HemisphereLight(0x1a3050, 0x0a0a14, 0.3);
    scene.add(hemi);

    // ── Build arena ──
    buildArena(scene);

    // ── Post-processing ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.9, 0.4, 0.3 // intensity, radius, threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ── Place LED screens ──
    const allScreenMeshes: THREE.Mesh[] = [];
    const meshMap = new Map<string, THREE.Mesh>();

    Object.entries(SCREEN_POSITIONS).forEach(([key, config]) => {
      const color = TYPE_COLORS[config.type] || 0x0A52EF;
      const dbScreen = screens.find(s => matchScreenToPosition(s.display_name) === key);
      const displayName = dbScreen?.display_name || TYPE_LABELS[config.type] || key;

      if (config.type === 'ribbon') {
        // Ribbon: ring of panels
        const radius = key === 'upper ribbon' ? 52 : 44;
        const tex = makeScreenTexture(displayName, color, 2048, 256);
        tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(8, 1); tex.needsUpdate = true;
        const ribGeo = new THREE.CylinderGeometry(radius, radius, 2.5, 64, 1, true);
        const ribMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.BackSide, fog: false });
        const ribbon = new THREE.Mesh(ribGeo, ribMat);
        ribbon.position.set(config.pos[0], config.pos[1], config.pos[2]);
        ribbon.scale.set(1, 1, 0.7);
        ribbon.name = key;
        scene.add(ribbon);
        meshMap.set(key, ribbon);
        allScreenMeshes.push(ribbon);
        // Light spill
        const spill = new THREE.PointLight(color, 2, radius, 2);
        spill.position.set(0, config.pos[1], 0); scene.add(spill);
      } else {
        // Flat LED screen — MeshBasicMaterial so it's always bright
        const tex = makeScreenTexture(displayName, color);
        // Bezel/frame
        const bezel = new THREE.Mesh(
          new THREE.BoxGeometry(config.scale[0] + 0.8, config.scale[1] + 0.8, 0.15),
          new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.9, roughness: 0.2 })
        );
        bezel.position.set(config.pos[0], config.pos[1], config.pos[2]);
        bezel.rotation.set(config.rot[0], config.rot[1], config.rot[2]);
        bezel.position.add(new THREE.Vector3(0, 0, -0.1).applyEuler(new THREE.Euler(config.rot[0], config.rot[1], config.rot[2])));
        scene.add(bezel);

        // LED face — BasicMaterial = fog-immune, always bright
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(config.scale[0], config.scale[1]), mat);
        mesh.position.set(config.pos[0], config.pos[1], config.pos[2]);
        mesh.rotation.set(config.rot[0], config.rot[1], config.rot[2]);
        mesh.name = key;
        scene.add(mesh);
        meshMap.set(key, mesh);
        allScreenMeshes.push(mesh);

        // Light spill from screen
        const spillColor = color;
        const spill = new THREE.PointLight(spillColor, 1.2, config.scale[0] * 2, 2);
        const spillOffset = new THREE.Vector3(0, 0, 4).applyEuler(new THREE.Euler(config.rot[0], config.rot[1], config.rot[2]));
        spill.position.set(config.pos[0] + spillOffset.x, config.pos[1] + spillOffset.y, config.pos[2] + spillOffset.z);
        scene.add(spill);
      }
    });

    // ── Controls ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 15;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // ── Mouse ──
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(allScreenMeshes);
      if (hits.length > 0) {
        const name = hits[0].object.name;
        const db = screens.find(s => matchScreenToPosition(s.display_name) === name);
        const cfg = SCREEN_POSITIONS[name];
        setSelectedScreen(db || {
          display_name: TYPE_LABELS[cfg?.type || ''] || name,
          manufacturer: null, model: null, pixel_pitch: null,
          width_ft: null, height_ft: null, brightness_nits: null,
          environment: cfg?.type || null, location_zone: name, is_active: true,
        });
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);

    // ── Animate ──
    const clock = new THREE.Clock();
    function animate() {
      animIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      camCurrent.current.pos.lerp(camTarget.current.pos, Math.min(2 * delta, 1));
      camCurrent.current.look.lerp(camTarget.current.look, Math.min(2 * delta, 1));
      camera.position.copy(camCurrent.current.pos);
      controls.target.copy(camCurrent.current.look);
      controls.update();

      // Ribbon scroll
      allScreenMeshes.forEach(mesh => {
        if (mesh.geometry instanceof THREE.CylinderGeometry) {
          const m = mesh.material as THREE.MeshBasicMaterial;
          if (m.map) m.map.offset.x += delta * 0.015;
        }
      });

      // Hover detection
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(allScreenMeshes);
      if (hits.length > 0) {
        setHoveredScreen(hits[0].object.name);
        container!.style.cursor = 'pointer';
      } else {
        setHoveredScreen(null);
        container!.style.cursor = 'grab';
      }

      composer.render();
    }
    animate();
    setIsReady(true);

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

  useEffect(() => {
    const view = VIEWS[activeView] || VIEWS.all;
    camTarget.current.pos.set(...view.pos);
    camTarget.current.look.set(...view.target);
  }, [activeView]);

  const hoveredConfig = hoveredScreen ? SCREEN_POSITIONS[hoveredScreen] : null;

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-[#030812]" style={{ height: '600px' }}>
      {!isReady && (
        <div className="absolute inset-0 z-30 bg-[#030812] flex flex-col items-center justify-center">
          <div className="relative w-16 h-16 mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-[#0A52EF]/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-t-[#0A52EF] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-4 rounded-full border border-[#03B8FF]/30 animate-pulse" />
          </div>
          <p className="text-sm text-slate-300 font-semibold tracking-wide">Loading Arena</p>
          <p className="text-[10px] text-slate-500 mt-1">Initializing 3D environment</p>
        </div>
      )}

      {/* Camera controls */}
      <div className="absolute top-4 left-4 z-20">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Camera View</p>
          <div className="flex flex-col gap-1">
            {Object.entries(VIEWS).map(([key, view]) => (
              <button key={key} onClick={() => setActiveView(key)}
                className={`text-xs px-3 py-1.5 rounded transition-all text-left ${activeView === key ? 'bg-[#0A52EF] text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
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
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2 mb-0.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }} />
              <span className="text-[10px] text-slate-400">{TYPE_LABELS[type]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredScreen && hoveredConfig && !selectedScreen && (
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

      {/* Selected screen detail */}
      {selectedScreen && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/10 w-[280px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedScreen.display_name}</h3>
              <button onClick={() => setSelectedScreen(null)} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              {selectedScreen.manufacturer && <div><p className="text-[10px] text-slate-500 font-medium">Manufacturer</p><p className="text-xs text-white mt-0.5">{selectedScreen.manufacturer}</p></div>}
              {selectedScreen.model && <div><p className="text-[10px] text-slate-500 font-medium">Model</p><p className="text-xs text-white mt-0.5">{selectedScreen.model}</p></div>}
              {selectedScreen.pixel_pitch && <div><p className="text-[10px] text-slate-500 font-medium">Pixel Pitch</p><p className="text-xs text-white mt-0.5">{selectedScreen.pixel_pitch}mm</p></div>}
              {(selectedScreen.width_ft || selectedScreen.height_ft) && <div><p className="text-[10px] text-slate-500 font-medium">Dimensions</p><p className="text-xs text-white mt-0.5">{selectedScreen.width_ft}' x {selectedScreen.height_ft}'</p></div>}
              {selectedScreen.brightness_nits && <div><p className="text-[10px] text-slate-500 font-medium">Brightness</p><p className="text-xs text-white mt-0.5">{Number(selectedScreen.brightness_nits).toLocaleString()} nits</p></div>}
              {selectedScreen.environment && <div><p className="text-[10px] text-slate-500 font-medium">Environment</p><p className="text-xs text-white mt-0.5 capitalize">{selectedScreen.environment}</p></div>}
              {selectedScreen.location_zone && <div className="col-span-2"><p className="text-[10px] text-slate-500 font-medium">Location</p><p className="text-xs text-white mt-0.5 capitalize">{selectedScreen.location_zone}</p></div>}
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

      <div ref={containerRef} className="absolute inset-0" />

      <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-600">
        ANC Venue Vision
      </div>
    </div>
  );
}

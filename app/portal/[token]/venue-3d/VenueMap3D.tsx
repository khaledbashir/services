"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

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

interface ScreenZone {
  id: string;
  label: string;
  type: 'scoreboard' | 'ribbon' | 'fascia' | 'courtside' | 'concourse';
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  color: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREEN LAYOUT
   ═══════════════════════════════════════════════════════════════════════ */

const ZONES: ScreenZone[] = [
  // Center-hung scoreboard (4 faces + bottom)
  { id: 'sb-n', label: 'Scoreboard North', type: 'scoreboard', position: [0, 38, -7], rotation: [0, 0, 0], width: 20, height: 11, color: '#0A52EF' },
  { id: 'sb-s', label: 'Scoreboard South', type: 'scoreboard', position: [0, 38, 7], rotation: [0, Math.PI, 0], width: 20, height: 11, color: '#0A52EF' },
  { id: 'sb-e', label: 'Scoreboard East', type: 'scoreboard', position: [11, 38, 0], rotation: [0, -Math.PI / 2, 0], width: 13, height: 11, color: '#0A52EF' },
  { id: 'sb-w', label: 'Scoreboard West', type: 'scoreboard', position: [-11, 38, 0], rotation: [0, Math.PI / 2, 0], width: 13, height: 11, color: '#0A52EF' },
  { id: 'sb-bot', label: 'Scoreboard Bottom', type: 'scoreboard', position: [0, 32.5, 0], rotation: [Math.PI / 2, 0, 0], width: 20, height: 13, color: '#0A52EF' },
  // Ribbon boards
  { id: 'rib-n', label: 'Ribbon North', type: 'ribbon', position: [0, 22, -42], rotation: [0, 0, 0], width: 50, height: 2.5, color: '#03B8FF' },
  { id: 'rib-s', label: 'Ribbon South', type: 'ribbon', position: [0, 22, 42], rotation: [0, Math.PI, 0], width: 50, height: 2.5, color: '#03B8FF' },
  { id: 'rib-e', label: 'Ribbon East', type: 'ribbon', position: [34, 22, 0], rotation: [0, -Math.PI / 2, 0], width: 40, height: 2.5, color: '#03B8FF' },
  { id: 'rib-w', label: 'Ribbon West', type: 'ribbon', position: [-34, 22, 0], rotation: [0, Math.PI / 2, 0], width: 40, height: 2.5, color: '#03B8FF' },
  // Fascia
  { id: 'fas-n', label: 'Upper Fascia North', type: 'fascia', position: [0, 28, -54], rotation: [0, 0, 0], width: 45, height: 3, color: '#6366f1' },
  { id: 'fas-s', label: 'Upper Fascia South', type: 'fascia', position: [0, 28, 54], rotation: [0, Math.PI, 0], width: 45, height: 3, color: '#6366f1' },
  // Courtside
  { id: 'cs-n', label: 'Courtside North', type: 'courtside', position: [0, 1.2, -16], rotation: [0, 0, 0], width: 30, height: 1.8, color: '#10b981' },
  { id: 'cs-s', label: 'Courtside South', type: 'courtside', position: [0, 1.2, 16], rotation: [0, Math.PI, 0], width: 30, height: 1.8, color: '#10b981' },
  { id: 'cs-e', label: 'Courtside East', type: 'courtside', position: [20, 1.2, 0], rotation: [0, -Math.PI / 2, 0], width: 18, height: 1.8, color: '#10b981' },
  { id: 'cs-w', label: 'Courtside West', type: 'courtside', position: [-20, 1.2, 0], rotation: [0, Math.PI / 2, 0], width: 18, height: 1.8, color: '#10b981' },
  // Concourse
  { id: 'con-nw', label: 'Concourse NW', type: 'concourse', position: [-44, 14, -30], rotation: [0, Math.PI / 4, 0], width: 10, height: 5, color: '#f59e0b' },
  { id: 'con-ne', label: 'Concourse NE', type: 'concourse', position: [44, 14, -30], rotation: [0, -Math.PI / 4, 0], width: 10, height: 5, color: '#f59e0b' },
  { id: 'con-sw', label: 'Concourse SW', type: 'concourse', position: [-44, 14, 30], rotation: [0, 3 * Math.PI / 4, 0], width: 10, height: 5, color: '#f59e0b' },
  { id: 'con-se', label: 'Concourse SE', type: 'concourse', position: [44, 14, 30], rotation: [0, -3 * Math.PI / 4, 0], width: 10, height: 5, color: '#f59e0b' },
];

const TYPE_LABELS: Record<string, string> = {
  scoreboard: 'Center-Hung Scoreboard', ribbon: 'Ribbon Board', fascia: 'Upper Fascia',
  courtside: 'Courtside LED', concourse: 'Concourse Display',
};

/* ═══════════════════════════════════════════════════════════════════════
   LED SCREEN TEXTURE
   ═══════════════════════════════════════════════════════════════════════ */

function makeLEDTexture(label: string, color: string, w: number, h: number, selected: boolean): THREE.CanvasTexture {
  const cw = 512, ch = Math.max(64, Math.round(512 * (h / w)));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d")!;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, cw, ch);
  grad.addColorStop(0, "#030812"); grad.addColorStop(1, "#0a1628");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);

  // LED pixel grid
  ctx.strokeStyle = `${color}10`; ctx.lineWidth = 0.5;
  for (let x = 0; x < cw; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
  for (let y = 0; y < ch; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

  // Corner markers
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 40, 2); ctx.strokeRect(12, 12, 2, 30);
  ctx.strokeRect(cw - 52, ch - 14, 40, 2); ctx.strokeRect(cw - 14, ch - 42, 2, 30);

  // ANC text
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${ch > 128 ? 52 : 32}px system-ui`;
  ctx.shadowColor = color; ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.fillText("ANC", cw / 2, ch / 2 - (ch > 128 ? 20 : 8));
  ctx.shadowBlur = 0;
  ctx.font = `300 ${ch > 128 ? 18 : 12}px system-ui`;
  ctx.fillStyle = `${color}bb`;
  ctx.fillText(label.length > 30 ? label.slice(0, 27) + '...' : label, cw / 2, ch / 2 + (ch > 128 ? 25 : 10));

  // Selection border
  if (selected) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, cw - 4, ch - 4);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ═══════════════════════════════════════════════════════════════════════
   LED SCREEN COMPONENT (ported from /3d)
   ═══════════════════════════════════════════════════════════════════════ */

function LEDScreen({ zone, selected, onSelect }: { zone: ScreenZone; selected: boolean; onSelect: () => void }) {
  const texture = useMemo(() => makeLEDTexture(zone.label, zone.color, zone.width, zone.height, selected), [zone, selected]);

  return (
    <group position={zone.position} rotation={zone.rotation}>
      {/* Frame */}
      <mesh position={[0, 0, -0.2]}>
        <boxGeometry args={[zone.width + 1, zone.height + 1, 0.3]} />
        <meshStandardMaterial color="#0a0a10" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Bezel */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[zone.width + 0.4, zone.height + 0.4, 0.08]} />
        <meshStandardMaterial color="#111118" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Light spill */}
      <pointLight position={[0, 0, 4]} color={zone.color} intensity={1.2} distance={zone.width * 2} decay={2} />
      {/* Selection glow */}
      {selected && (
        <mesh position={[0, 0, -0.06]}>
          <planeGeometry args={[zone.width + 3, zone.height + 3]} />
          <meshBasicMaterial color="#0A52EF" transparent opacity={0.15} />
        </mesh>
      )}
      {/* LED face — MeshBasicMaterial = always bright, fog immune */}
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <planeGeometry args={[zone.width, zone.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   COURT (ported from /3d Arena.tsx)
   ═══════════════════════════════════════════════════════════════════════ */

function Court() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 960;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b8803a'; ctx.fillRect(0, 0, 1600, 960);
    ctx.strokeStyle = 'rgba(100,60,20,0.12)'; ctx.lineWidth = 1;
    for (let i = 0; i < 1600; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 960); ctx.stroke(); }
    for (let j = 0; j < 960; j += 80) { ctx.strokeStyle = 'rgba(80,50,15,0.08)'; ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(1600, j); ctx.stroke(); }
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * 1600, y = Math.random() * 960;
      ctx.fillStyle = `rgba(${100 + Math.random() * 30},${60 + Math.random() * 20},${15 + Math.random() * 10},0.04)`;
      ctx.fillRect(x, y, 20 + Math.random() * 40, 960);
    }
    ctx.fillStyle = 'rgba(0,40,180,0.12)'; ctx.fillRect(60, 280, 300, 400); ctx.fillRect(1240, 280, 300, 400);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, 1480, 840);
    ctx.beginPath(); ctx.moveTo(800, 60); ctx.lineTo(800, 900); ctx.stroke();
    ctx.beginPath(); ctx.arc(800, 480, 100, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,40,180,0.08)'; ctx.beginPath(); ctx.arc(800, 480, 100, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(260, 480, 100, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(1340, 480, 100, Math.PI / 2, -Math.PI / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
    ctx.strokeRect(60, 280, 300, 400); ctx.strokeRect(1240, 280, 300, 400);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(160, 480, 320, -1.2, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(1440, 480, 320, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke();
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 16; return tex;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow>
      <planeGeometry args={[50, 30]} />
      <meshStandardMaterial map={texture} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ARENA BOWL (ported from /3d Arena.tsx)
   ═══════════════════════════════════════════════════════════════════════ */

function ArenaBowl({ radiusX, radiusZ, height, yBase, color }: {
  radiusX: number; radiusZ: number; height: number; yBase: number; color: string
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const segs = 48, innerRX = radiusX * 0.84, innerRZ = radiusZ * 0.84;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.cos(a) * radiusX, Math.sin(a) * radiusZ);
      else shape.lineTo(Math.cos(a) * radiusX, Math.sin(a) * radiusZ);
    }
    shape.closePath();
    const hole = new THREE.Path();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i === 0) hole.moveTo(Math.cos(a) * innerRX, Math.sin(a) * innerRZ);
      else hole.lineTo(Math.cos(a) * innerRX, Math.sin(a) * innerRZ);
    }
    hole.closePath(); shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  }, [radiusX, radiusZ, height]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, yBase, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

function Seats() {
  const rows: { r: number; y: number; color: string; sz: number }[] = [];
  for (let i = 0; i < 6; i++) rows.push({ r: 32 + i * 2.5, y: 1 + i * 1.8, color: i < 3 ? '#1a3a5f' : '#15304a', sz: 0.68 });
  for (let i = 0; i < 6; i++) rows.push({ r: 47 + i * 1.5, y: 13 + i * 2, color: i < 3 ? '#162850' : '#122040', sz: 0.7 });
  return (
    <>
      {rows.map((row, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, row.y, 0]} scale={[1, 1, row.sz]}>
          <torusGeometry args={[row.r, 0.2, 4, 48]} />
          <meshStandardMaterial color={row.color} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}
    </>
  );
}

function StadiumLights() {
  const positions: [number, number, number][] = [[-30, 42, -20], [30, 42, -20], [-30, 42, 20], [30, 42, 20]];
  return (
    <>
      {positions.map((pos, i) => (
        <group key={i}>
          <spotLight position={pos} color="#fff8f0" intensity={40} distance={150} angle={0.7} penumbra={0.4} decay={2} />
          <mesh position={pos}>
            <boxGeometry args={[8, 1.2, 3.5]} />
            <meshStandardMaterial color="#fff5e0" emissive="#fff5e0" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function ScoreboardFrame() {
  return (
    <group>
      <mesh position={[0, 38, 0]}>
        <boxGeometry args={[22, 12, 15]} />
        <meshStandardMaterial color="#0a0a10" metalness={0.95} roughness={0.15} />
      </mesh>
      {[[-12, -6], [12, -6], [-12, 6], [12, 6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 50, z]}>
          <cylinderGeometry args={[0.12, 0.12, 12, 6]} />
          <meshStandardMaterial color="#2a2a38" metalness={0.9} roughness={0.15} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CAMERA CONTROLLER (ported from /3d)
   ═══════════════════════════════════════════════════════════════════════ */

function CameraController() {
  const { camera, gl } = useThree();
  const target = useRef({ angle: 0.4, pitch: 0.5, distance: 130 });
  const current = useRef({ angle: 0.4, pitch: 0.5, distance: 130 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: MouseEvent) => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
    const onUp = () => { isDragging.current = false; };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x, dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      target.current.angle -= dx * 0.005;
      target.current.pitch = Math.max(0.1, Math.min(1.2, target.current.pitch + dy * 0.005));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      target.current.distance = Math.max(40, Math.min(300, target.current.distance + e.deltaY * 0.15));
    };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) { isDragging.current = true; lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } };
    const onTouchEnd = () => { isDragging.current = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastMouse.current.x, dy = e.touches[0].clientY - lastMouse.current.y;
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      target.current.angle -= dx * 0.005;
      target.current.pitch = Math.max(0.1, Math.min(1.2, target.current.pitch + dy * 0.005));
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove); el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [gl]);

  useFrame(() => {
    const t = current.current;
    t.angle += (target.current.angle - t.angle) * 0.06;
    t.pitch += (target.current.pitch - t.pitch) * 0.06;
    t.distance += (target.current.distance - t.distance) * 0.06;
    camera.position.x = Math.sin(t.angle) * Math.cos(t.pitch) * t.distance;
    camera.position.y = Math.sin(t.pitch) * t.distance + 20;
    camera.position.z = Math.cos(t.angle) * Math.cos(t.pitch) * t.distance;
    camera.lookAt(0, 15, 0);
  });

  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   VENUE SCENE
   ═══════════════════════════════════════════════════════════════════════ */

function VenueScene({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <ambientLight color="#1a2540" intensity={0.4} />
      <directionalLight position={[80, 180, 60]} intensity={1.2} color="#fff5e8" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-near={1} shadow-camera-far={500}
        shadow-camera-left={-150} shadow-camera-right={150} shadow-camera-top={150} shadow-camera-bottom={-150} shadow-bias={-0.0002} />
      <directionalLight position={[-60, 100, -40]} intensity={0.3} color="#4488cc" />
      <directionalLight position={[0, 50, -120]} intensity={0.2} color="#6688bb" />
      <hemisphereLight color="#1a3050" groundColor="#0a0a14" intensity={0.3} />
      <Environment preset="night" background={false} />
      <fog attach="fog" args={['#000a1a', 250, 900]} />

      <CameraController />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#08090e" roughness={0.98} />
      </mesh>

      {/* Arena structure */}
      <ArenaBowl radiusX={50} radiusZ={35} height={12} yBase={0} color="#1a2844" />
      <ArenaBowl radiusX={53} radiusZ={37} height={3} yBase={11} color="#1e3050" />
      <ArenaBowl radiusX={58} radiusZ={42} height={14} yBase={12} color="#162238" />

      {/* Roof ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 28, 0]} scale={[1, 1, 0.72]}>
        <torusGeometry args={[55, 3, 6, 48]} />
        <meshStandardMaterial color="#1e1e2a" metalness={0.85} roughness={0.2} />
      </mesh>

      <Court />
      <Seats />
      <StadiumLights />
      <ScoreboardFrame />

      {/* LED Screens */}
      {ZONES.map(zone => (
        <LEDScreen key={zone.id} zone={zone} selected={selectedId === zone.id} onSelect={() => onSelect(zone.id)} />
      ))}

      {/* Tunnel entrances */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
        <group key={i}>
          <mesh position={[Math.sin(a) * 36, 3.5, Math.cos(a) * 36 * 0.7]} rotation={[0, a, 0]}>
            <boxGeometry args={[5, 7, 5]} />
            <meshStandardMaterial color="#020208" roughness={1} />
          </mesh>
          <pointLight position={[Math.sin(a) * 34, 3, Math.cos(a) * 34 * 0.7]} color="#0A52EF" intensity={3} distance={15} decay={2} />
        </group>
      ))}

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.3} luminanceSmoothing={0.85} mipmapBlur />
        <Vignette darkness={0.4} offset={0.3} />
      </EffectComposer>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════ */

export default function VenueMap3D({ screens, venueName }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedZone = selectedId ? ZONES.find(z => z.id === selectedId) : null;

  // Match DB screen to zone
  const getDbScreen = useCallback((zone: ScreenZone): Screen | null => {
    const match = screens.find(s => {
      const l = s.display_name.toLowerCase();
      if (zone.type === 'scoreboard' && (l.includes('scoreboard') || l.includes('center') || l.includes('video'))) return true;
      if (zone.type === 'ribbon' && l.includes('ribbon')) return true;
      if (zone.type === 'fascia' && l.includes('fascia')) return true;
      if (zone.type === 'courtside' && (l.includes('courtside') || l.includes('court'))) return true;
      if (zone.type === 'concourse' && l.includes('concourse')) return true;
      return false;
    });
    return match || null;
  }, [screens]);

  const dbScreen = selectedZone ? getDbScreen(selectedZone) : null;

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-[#030812]" style={{ height: '600px' }}>
      <Canvas
        camera={{ fov: 55, near: 0.1, far: 2000, position: [0, 120, 200] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        shadows
        dpr={[1, 2]}
        onCreated={({ gl }) => { gl.setClearColor('#000a1a'); }}
      >
        <VenueScene selectedId={selectedId} onSelect={setSelectedId} />
      </Canvas>

      {/* Title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-4 py-2 border border-white/10">
          <p className="text-xs text-white font-semibold text-center">{venueName}</p>
          <p className="text-[10px] text-slate-500 text-center mt-0.5">Drag to orbit · Scroll to zoom · Click screens for specs</p>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20">
        <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Display Types</p>
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const zone = ZONES.find(z => z.type === type);
            return (
              <div key={type} className="flex items-center gap-2 mb-0.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone?.color || '#666' }} />
                <span className="text-[10px] text-slate-400">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected screen detail */}
      {selectedZone && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/10 w-[280px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedZone.color }} />
                <h3 className="text-sm font-semibold text-white">{selectedZone.label}</h3>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div><p className="text-[10px] text-slate-500 font-medium">Type</p><p className="text-xs text-white mt-0.5">{TYPE_LABELS[selectedZone.type]}</p></div>
              <div><p className="text-[10px] text-slate-500 font-medium">Size</p><p className="text-xs text-white mt-0.5">{selectedZone.width}' x {selectedZone.height}'</p></div>
              {dbScreen?.manufacturer && <div><p className="text-[10px] text-slate-500 font-medium">Manufacturer</p><p className="text-xs text-white mt-0.5">{dbScreen.manufacturer}</p></div>}
              {dbScreen?.model && <div><p className="text-[10px] text-slate-500 font-medium">Model</p><p className="text-xs text-white mt-0.5">{dbScreen.model}</p></div>}
              {dbScreen?.pixel_pitch && <div><p className="text-[10px] text-slate-500 font-medium">Pixel Pitch</p><p className="text-xs text-white mt-0.5">{dbScreen.pixel_pitch}mm</p></div>}
              {dbScreen?.brightness_nits && <div><p className="text-[10px] text-slate-500 font-medium">Brightness</p><p className="text-xs text-white mt-0.5">{Number(dbScreen.brightness_nits).toLocaleString()} nits</p></div>}
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

      <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-600">ANC Venue Vision</div>
    </div>
  );
}

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SensorReading, SensorStatus } from "../../lib/twin/sensors";
import type { ZoneStatus } from "../../lib/twin/types";
import {
  CDU,
  CHILLER,
  HALL,
  PIPES,
  RACK,
  RACKS_PER_ROW,
  ROW_SPACING,
  TOWER,
  rackX,
  rowZ,
  sensorPosition,
  type Vec3,
} from "./layout";

export interface SceneZone {
  zoneId: number;
  name: string;
  status: ZoneStatus;
  flowLpm: number;
  sensors: SensorReading[];
}

export interface FacilitySceneProps {
  zones: SceneZone[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Bump to fly the camera back to the overview. */
  resetKey: number;
  theme: "dark" | "light";
  reducedMotion: boolean;
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

interface Palette {
  bg: string;
  floor: string;
  yard: string;
  grid: string;
  rack: string;
  rackFront: string;
  rackTrim: string;
  edge: string;
  cdu: string;
  plant: string;
  label: string;
  ok: string;
  warn: string;
  crit: string;
  supply: string;
  ret: string;
  primary: string;
  primaryRet: string;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const light = document.documentElement.dataset.theme === "light";
  return {
    bg: v("--surface"),
    floor: light ? v("--surface-2") : "#18212c",
    yard: v("--canvas"),
    grid: v("--surface-3"),
    // Equipment stays mid-tone in dark mode so it separates from the near-black
    // background; edges outline every block in both themes.
    rack: light ? "#c9d1db" : "#3a4656",
    rackFront: light ? "#e3e8ee" : "#4b5a6c",
    rackTrim: light ? "#a7b2bf" : "#5a6a7f",
    edge: light ? "#7f8b99" : "#8fa1b6",
    cdu: light ? "#b3d0d9" : "#2e6170",
    plant: light ? "#d2d9e1" : "#475567",
    label: v("--fg-subtle"),
    ok: v("--ok"),
    warn: v("--warn"),
    crit: v("--crit"),
    supply: v("--info"),
    ret: v("--warn"),
    primary: v("--accent"),
    primaryRet: v("--violet"),
  };
}

const statusColor = (p: Palette, s: SensorStatus | "green" | "yellow" | "red") =>
  s === "crit" || s === "red" ? p.crit : s === "warn" || s === "yellow" ? p.warn : p.ok;

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Box({
  position,
  size,
  color,
  edge,
  emissive,
  emissiveIntensity = 0,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  /** Outline colour; omit for no outline. */
  edge?: string;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  const [w, h, d] = size;
  const edges = useMemo(() => (edge ? new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)) : null), [edge, w, h, d]);
  useEffect(() => () => edges?.dispose(), [edges]);
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} emissive={emissive ?? "#000000"} emissiveIntensity={emissiveIntensity} />
      {edges ? (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={edge} transparent opacity={0.7} />
        </lineSegments>
      ) : null}
    </mesh>
  );
}

/** Straight pipe segments along a polyline. */
function Pipe({ points, color, radius = 0.06 }: { points: Vec3[]; color: string; radius?: number }) {
  const segments = useMemo(
    () =>
      points.slice(1).map((b, i) => {
        const a = new THREE.Vector3(...points[i]);
        const end = new THREE.Vector3(...b);
        const mid = a.clone().add(end).multiplyScalar(0.5);
        const len = a.distanceTo(end);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(a).normalize());
        return { mid, len, q };
      }),
    [points],
  );
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={s.mid} quaternion={s.q}>
          <cylinderGeometry args={[radius, radius, s.len + radius * 2, 10]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} emissive={color} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Coolant "particles" moving along a pipe; speed follows the loop flow. */
function FlowDots({ points, color, speed, count = 6 }: { points: Vec3[]; color: string; speed: number; count?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const path = useMemo(() => {
    const v = points.map((p) => new THREE.Vector3(...p));
    const lens = v.slice(1).map((p, i) => p.distanceTo(v[i]));
    return { v, lens, total: lens.reduce((a, b) => a + b, 0) };
  }, [points]);
  useFrame(({ clock }) => {
    const t0 = clock.getElapsedTime() * speed;
    refs.current.forEach((m, k) => {
      if (!m) return;
      let d = ((t0 + (k / count) * path.total) % path.total + path.total) % path.total;
      let i = 0;
      while (i < path.lens.length - 1 && d > path.lens[i]) d -= path.lens[i++];
      m.position.lerpVectors(path.v[i], path.v[i + 1], path.lens[i] ? d / path.lens[i] : 0);
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, k) => (
        <mesh key={k} ref={(m) => (refs.current[k] = m)}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function Label({ text, position, color, scale = 1 }: { text: string; position: Vec3; color: string; scale?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "600 56px Geist, ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[3.6 * scale, 0.9 * scale, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

/* ------------------------------------------------------------------ */
/* Sensors                                                             */
/* ------------------------------------------------------------------ */

function SensorMarker({
  reading,
  position,
  palette,
  selected,
  hovered,
  onSelect,
  onHover,
  animate,
}: {
  reading: SensorReading;
  position: Vec3;
  palette: Palette;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  animate: boolean;
}) {
  const halo = useRef<THREE.Mesh>(null);
  const color = statusColor(palette, reading.status);
  const alerting = reading.status !== "ok";
  useFrame(({ clock, camera }) => {
    if (!halo.current) return;
    halo.current.lookAt(camera.position);
    const pulse = animate && alerting ? 1 + 0.35 * Math.sin(clock.getElapsedTime() * 4) : 1;
    const base = selected ? 2.4 : hovered ? 1.9 : alerting ? 1.7 : 0;
    halo.current.scale.setScalar(base * pulse);
  });
  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();
  return (
    <group position={position}>
      <mesh
        scale={selected ? 1.5 : hovered ? 1.3 : 1}
        onClick={(e) => {
          stop(e);
          onSelect(reading.id);
        }}
        onPointerOver={(e) => {
          stop(e);
          onHover(reading.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.4 : 0.9} roughness={0.3} />
      </mesh>
      <mesh ref={halo}>
        <ringGeometry args={[0.13, 0.17, 32]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Equipment                                                           */
/* ------------------------------------------------------------------ */

function ZoneRow({
  zone,
  index,
  count,
  palette,
  animate,
  children,
}: {
  zone: SceneZone;
  index: number;
  count: number;
  palette: Palette;
  animate: boolean;
  children: ReactNode;
}) {
  const z = rowZ(index, count);
  const led = statusColor(palette, zone.status);
  const speed = Math.max(0.4, zone.flowLpm / 600);
  const shift = (pts: Vec3[]): Vec3[] => pts.map(([x, y, pz]) => [x, y, pz + z]);
  return (
    <group>
      {Array.from({ length: RACKS_PER_ROW }, (_, i) => (
        <group key={i}>
          <Box position={[rackX(i), RACK.h / 2, z]} size={[RACK.w, RACK.h, RACK.d]} color={palette.rack} edge={palette.edge} />
          {/* lighter front door so the server face reads at any angle */}
          <Box position={[rackX(i), RACK.h / 2 - 0.05, z + RACK.d / 2 + 0.004]} size={[RACK.w * 0.86, RACK.h * 0.82, 0.008]} color={palette.rackFront} />
          {/* front LED strip shows the zone's thermal status */}
          <Box
            position={[rackX(i), RACK.h - 0.18, z + RACK.d / 2 + 0.005]}
            size={[RACK.w * 0.7, 0.05, 0.01]}
            color={led}
            emissive={led}
            emissiveIntensity={1.2}
          />
          <Box position={[rackX(i), 0.04, z]} size={[RACK.w + 0.04, 0.08, RACK.d + 0.04]} color={palette.rackTrim} />
        </group>
      ))}
      <Box position={[CDU.x, CDU.h / 2, z]} size={[CDU.w, CDU.h, CDU.d]} color={palette.cdu} edge={palette.edge} />
      <Box position={[CHILLER.x, CHILLER.h / 2, z]} size={[CHILLER.w, CHILLER.h, CHILLER.d]} color={palette.plant} edge={palette.edge} />
      <Box position={[TOWER.x, TOWER.h / 2, z]} size={[TOWER.w, TOWER.h, TOWER.d]} color={palette.plant} edge={palette.edge} />
      <mesh position={[TOWER.x, TOWER.h + 0.12, z]}>
        <cylinderGeometry args={[0.75, 0.75, 0.24, 28]} />
        <meshStandardMaterial color={palette.rackTrim} roughness={0.6} />
      </mesh>
      {/* weather mast */}
      <Pipe points={[[TOWER.x + TOWER.w / 2 - 0.15, TOWER.h, z], [TOWER.x + TOWER.w / 2 - 0.15, TOWER.h + 1.15, z]]} color={palette.rackTrim} radius={0.03} />

      <Pipe points={shift(PIPES.secondarySupply)} color={palette.supply} />
      <Pipe points={shift(PIPES.secondaryReturn)} color={palette.ret} />
      <Pipe points={shift(PIPES.primarySupply)} color={palette.primary} />
      <Pipe points={shift(PIPES.primaryReturn)} color={palette.primaryRet} />
      {animate ? (
        <>
          <FlowDots points={shift(PIPES.secondarySupply)} color={palette.supply} speed={speed} />
          <FlowDots points={shift(PIPES.secondaryReturn)} color={palette.ret} speed={speed} />
          <FlowDots points={shift(PIPES.primarySupply)} color={palette.primary} speed={speed * 1.2} count={5} />
          <FlowDots points={shift(PIPES.primaryReturn)} color={palette.primaryRet} speed={speed * 1.2} count={5} />
        </>
      ) : null}

      <Label text={zone.name} position={[rackX(0) - 1.5, 1.2, z]} color={palette.label} scale={0.9} />
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const HOME_TARGET = new THREE.Vector3(-1.2, 0.6, 0);
const HOME_OFFSET = new THREE.Vector3(-13, 15, 21);

function CameraRig({ focus, resetKey }: { focus: Vec3 | null; resetKey: number }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const goal = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);

  useEffect(() => {
    camera.position.copy(HOME_TARGET).add(HOME_OFFSET);
    const c = new OrbitControls(camera, gl.domElement);
    c.target.copy(HOME_TARGET);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = Math.PI * 0.46;
    c.minDistance = 4;
    c.maxDistance = 48;
    const onStart = () => {
      goal.current = null;
    };
    const onChange = () => invalidate();
    c.addEventListener("change", onChange);
    c.addEventListener("start", onStart);
    controls.current = c;
    invalidate();
    return () => {
      c.removeEventListener("change", onChange);
      c.removeEventListener("start", onStart);
      c.dispose();
    };
  }, [camera, gl, invalidate]);

  // Fly to the selected sensor, keeping the current viewing direction.
  useEffect(() => {
    const c = controls.current;
    if (!c || !focus) return;
    const target = new THREE.Vector3(...focus);
    const dir = camera.position.clone().sub(c.target).normalize();
    goal.current = { target, position: target.clone().add(dir.multiplyScalar(9)) };
    invalidate();
  }, [focus, camera, invalidate]);

  useEffect(() => {
    if (!resetKey) return;
    goal.current = { target: HOME_TARGET.clone(), position: HOME_TARGET.clone().add(HOME_OFFSET) };
    invalidate();
  }, [resetKey, invalidate]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      c.target.lerp(g.target, 0.12);
      camera.position.lerp(g.position, 0.12);
      if (c.target.distanceTo(g.target) < 0.01 && camera.position.distanceTo(g.position) < 0.01) goal.current = null;
    }
    if (c.update() || goal.current) invalidate();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function World({ zones, selectedId, hoveredId, onSelect, onHover, resetKey, theme, reducedMotion }: FacilitySceneProps) {
  // Re-read CSS variables whenever the theme flips.
  const palette = useMemo(readPalette, [theme]);
  const count = zones.length;
  const depth = Math.max(1, count) * ROW_SPACING;
  const animate = !reducedMotion;

  const focus = useMemo<Vec3 | null>(() => {
    if (!selectedId) return null;
    const [zid, kind] = selectedId.split(":");
    const index = zones.findIndex((z) => String(z.zoneId) === zid);
    return index >= 0 ? sensorPosition(kind as SensorReading["kind"], index, count) : null;
  }, [selectedId, zones, count]);

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 34, 80]} />
      <ambientLight intensity={theme === "light" ? 0.35 : 0.55} />
      <hemisphereLight args={[theme === "light" ? "#ffffff" : "#c9d6e6", theme === "light" ? "#c9d2dc" : "#1a2230", theme === "light" ? 1.2 : 1.3]} />
      <directionalLight position={[-6, 16, 14]} intensity={theme === "light" ? 1.5 : 1.9} />
      <directionalLight position={[12, 8, -10]} intensity={theme === "light" ? 0.35 : 0.6} />

      {/* yard + data hall slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={palette.yard} roughness={1} />
      </mesh>
      <gridHelper args={[80, 80, palette.grid, palette.grid]} position={[0, 0.001, 0]} />
      <Box
        position={[(HALL.minX + HALL.maxX) / 2, 0.02, 0]}
        size={[HALL.maxX - HALL.minX, 0.04, depth + 1.6]}
        color={palette.floor}
        edge={palette.edge}
      />
      <Label text="Data hall" position={[(HALL.minX + HALL.maxX) / 2, 3.6, -depth / 2 - 0.6]} color={palette.label} />
      <Label text="Chiller plant" position={[CHILLER.x, 2.6, -depth / 2 - 0.6]} color={palette.label} scale={0.85} />
      <Label text="Cooling towers" position={[TOWER.x, 4.2, -depth / 2 - 0.6]} color={palette.label} scale={0.85} />

      {zones.map((zone, i) => (
        <ZoneRow key={zone.zoneId} zone={zone} index={i} count={count} palette={palette} animate={animate}>
          {zone.sensors.map((s) => (
            <SensorMarker
              key={s.id}
              reading={s}
              position={sensorPosition(s.kind, i, count)}
              palette={palette}
              selected={s.id === selectedId}
              hovered={s.id === hoveredId}
              onSelect={onSelect}
              onHover={onHover}
              animate={animate}
            />
          ))}
        </ZoneRow>
      ))}

      <CameraRig focus={focus} resetKey={resetKey} />
    </>
  );
}

export default function FacilityScene(props: FacilitySceneProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => () => void (document.body.style.cursor = ""), []);
  return (
    <Canvas
      frameloop={props.reducedMotion ? "demand" : "always"}
      dpr={[1, 2]}
      camera={{ fov: 38, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
      onCreated={() => setReady(true)}
      className={ready ? "opacity-100 transition-opacity duration-500" : "opacity-0"}
    >
      <World {...props} />
    </Canvas>
  );
}

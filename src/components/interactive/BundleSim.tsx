import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * BundleSim
 * Interactive visualization of fiber bundles, sections, and the Möbius band.
 * Modes: "Fiber Bundle" | "Sections" | "Möbius Band"
 * Uses React Three Fiber + @react-three/drei.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'bundle' | 'sections' | 'mobius';
type BundleType = 'cylinder' | 'mobius';

// ── Parametric surface helpers ────────────────────────────────────────────────

function cylinderPoint(u: number, v: number): THREE.Vector3 {
  // u ∈ [0, 2π], v ∈ [-1, 1]
  return new THREE.Vector3(Math.cos(u), v, Math.sin(u));
}

function mobiusPoint(u: number, v: number): THREE.Vector3 {
  // u ∈ [0, 2π], v ∈ [-0.5, 0.5]
  const x = (1 + v * Math.cos(u / 2)) * Math.cos(u);
  const y = (1 + v * Math.cos(u / 2)) * Math.sin(u);
  const z = v * Math.sin(u / 2);
  return new THREE.Vector3(x, y, z);
}

function buildSurfaceGeometry(
  uSteps: number,
  vSteps: number,
  pointFn: (u: number, v: number) => THREE.Vector3,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const eps = 1e-4;

  for (let j = 0; j <= vSteps; j++) {
    for (let i = 0; i <= uSteps; i++) {
      const u = uMin + (i / uSteps) * (uMax - uMin);
      const v = vMin + (j / vSteps) * (vMax - vMin);
      const p = pointFn(u, v);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / uSteps, j / vSteps);

      // Compute normal via finite differences
      const pu = pointFn(u + eps, v).sub(pointFn(u - eps, v)).normalize();
      const pv = pointFn(u, v + eps).sub(pointFn(u, v - eps)).normalize();
      const n = new THREE.Vector3().crossVectors(pu, pv).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }

  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < uSteps; i++) {
      const a = j * (uSteps + 1) + i;
      const b = a + 1;
      const c = a + (uSteps + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function fiberColor(t: number, bundleType: BundleType): string {
  // t ∈ [0,1] around the base circle
  if (bundleType === 'cylinder') {
    const hue = Math.round(t * 260 + 200); // blue → violet
    return `hsl(${hue},70%,60%)`;
  }
  // Möbius: color shifts to show twist
  const hue = Math.round(t * 360);
  return `hsl(${hue},75%,58%)`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Parametric surface mesh (cylinder or Möbius)
const SurfaceMesh = ({
  bundleType,
  opacity = 0.55,
  uSteps = 80,
  vSteps = 30,
}: {
  bundleType: BundleType;
  opacity?: number;
  uSteps?: number;
  vSteps?: number;
}) => {
  const geo = useMemo(() => {
    if (bundleType === 'cylinder') {
      return buildSurfaceGeometry(uSteps, vSteps, cylinderPoint, 0, Math.PI * 2, -1, 1);
    }
    return buildSurfaceGeometry(uSteps, vSteps, mobiusPoint, 0, Math.PI * 2, -0.5, 0.5);
  }, [bundleType, uSteps, vSteps]);

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        color={bundleType === 'cylinder' ? '#a5b4fc' : '#f9a8d4'}
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        roughness={0.4}
        metalness={0.05}
      />
    </mesh>
  );
};

// Fibers rendered as line segments from vMin to vMax above each base point
const FibersDisplay = ({
  bundleType,
  count = 24,
  highlightIndex = -1,
}: {
  bundleType: BundleType;
  count?: number;
  highlightIndex?: number;
}) => {
  const lines = useMemo(() => {
    const result: { pts: [number, number, number][]; color: string; t: number }[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const u = t * Math.PI * 2;
      const color = fiberColor(t, bundleType);

      if (bundleType === 'cylinder') {
        const p0 = cylinderPoint(u, -1);
        const p1 = cylinderPoint(u, 1);
        result.push({
          pts: [
            [p0.x, p0.y, p0.z],
            [p1.x, p1.y, p1.z],
          ],
          color,
          t,
        });
      } else {
        const steps = 10;
        const pts: [number, number, number][] = [];
        for (let k = 0; k <= steps; k++) {
          const v = -0.5 + (k / steps) * 1.0;
          const p = mobiusPoint(u, v);
          pts.push([p.x, p.y, p.z]);
        }
        result.push({ pts, color, t });
      }
    }
    return result;
  }, [bundleType, count]);

  return (
    <>
      {lines.map((ln, i) => {
        const isHighlight = i === highlightIndex;
        return (
          <Line
            key={i}
            points={ln.pts}
            color={isHighlight ? '#fbbf24' : ln.color}
            lineWidth={isHighlight ? 4 : 1.5}
            transparent
            opacity={isHighlight ? 1 : 0.7}
          />
        );
      })}
    </>
  );
};

// Animated moving point on base circle + highlighted fiber
const AnimatedBasePoint = ({
  bundleType,
  fiberCount,
  onFiberIndex,
}: {
  bundleType: BundleType;
  fiberCount: number;
  onFiberIndex: (i: number) => void;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);
  const lastFiberRef = useRef(-1);

  useFrame((_state, delta) => {
    tRef.current = (tRef.current + delta * 0.18) % 1;
    const t = tRef.current;
    const u = t * Math.PI * 2;

    let pos: THREE.Vector3;
    if (bundleType === 'cylinder') {
      pos = cylinderPoint(u, -1.15);
    } else {
      pos = mobiusPoint(u, -0.65);
    }

    if (meshRef.current) {
      meshRef.current.position.set(pos.x, pos.y, pos.z);
    }

    const fiberIdx = Math.round(t * fiberCount) % fiberCount;
    if (fiberIdx !== lastFiberRef.current) {
      lastFiberRef.current = fiberIdx;
      onFiberIndex(fiberIdx);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  );
};

// Base circle (the base space B)
const BaseCircle = ({ bundleType }: { bundleType: BundleType }) => {
  const pts = useMemo<[number, number, number][]>(() => {
    const n = 128;
    const res: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * Math.PI * 2;
      if (bundleType === 'cylinder') {
        res.push([Math.cos(u), -1.15, Math.sin(u)]);
      } else {
        const p = mobiusPoint(u, -0.65);
        res.push([p.x, p.y, p.z]);
      }
    }
    return res;
  }, [bundleType]);

  return <Line points={pts} color="#64748b" lineWidth={2} dashed dashSize={0.1} gapSize={0.05} />;
};

// Projection arrow from a fiber midpoint to base point
const ProjectionArrow = ({
  bundleType,
  t,
}: {
  bundleType: BundleType;
  t: number;
}) => {
  const u = t * Math.PI * 2;
  let start: THREE.Vector3, end: THREE.Vector3;
  if (bundleType === 'cylinder') {
    start = cylinderPoint(u, 0);
    end = cylinderPoint(u, -1.15);
  } else {
    start = mobiusPoint(u, 0);
    end = mobiusPoint(u, -0.65);
  }

  const pts: [number, number, number][] = [
    [start.x, start.y, start.z],
    [end.x, end.y, end.z],
  ];

  return (
    <>
      <Line points={pts} color="#94a3b8" lineWidth={1.5} dashed dashSize={0.08} gapSize={0.06} />
      <mesh position={[end.x, end.y, end.z]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial color="#64748b" />
      </mesh>
    </>
  );
};

// ── Section curve component ────────────────────────────────────────────────────

function buildSectionCurve(
  controlTs: number[],
  bundleType: BundleType
): [number, number, number][] {
  const n = 120;
  const pts: [number, number, number][] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = t * Math.PI * 2;

    // Interpolate v from the control point array
    // Find nearest two control points
    const scaledT = t * (controlTs.length - 1);
    const lo = Math.floor(scaledT);
    const hi = Math.min(lo + 1, controlTs.length - 1);
    const frac = scaledT - lo;
    const v = controlTs[lo] * (1 - frac) + controlTs[hi] * frac;

    let p: THREE.Vector3;
    if (bundleType === 'cylinder') {
      p = cylinderPoint(u, v);
    } else {
      p = mobiusPoint(u, v);
    }
    pts.push([p.x, p.y, p.z]);
  }
  return pts;
}

const SectionCurve = ({
  controlTs,
  bundleType,
  color = '#10b981',
}: {
  controlTs: number[];
  bundleType: BundleType;
  color?: string;
}) => {
  const pts = useMemo(
    () => buildSectionCurve(controlTs, bundleType),
    [controlTs, bundleType]
  );
  return <Line points={pts} color={color} lineWidth={3} />;
};

// Draggable control point markers (rendered via Html overlay for simplicity)
const SectionControls = ({
  controlTs,
  onChange,
  bundleType,
}: {
  controlTs: number[];
  onChange: (idx: number, v: number) => void;
  bundleType: BundleType;
}) => {
  return (
    <>
      {controlTs.map((v, idx) => {
        const t = idx / (controlTs.length - 1);
        const u = t * Math.PI * 2;
        let p: THREE.Vector3;
        if (bundleType === 'cylinder') {
          p = cylinderPoint(u, v);
        } else {
          p = mobiusPoint(u, v);
        }
        return (
          <mesh key={idx} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[0.08, 14, 14]} />
            <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.3} />
            <Html center distanceFactor={4} className="pointer-events-auto select-none">
              <input
                type="range"
                min={bundleType === 'cylinder' ? -1 : -0.5}
                max={bundleType === 'cylinder' ? 1 : 0.5}
                step={0.01}
                value={v}
                onChange={(e) => onChange(idx, parseFloat(e.target.value))}
                className="w-14 accent-emerald-500 cursor-pointer"
                title={`Control point ${idx}`}
              />
            </Html>
          </mesh>
        );
      })}
    </>
  );
};

// ── Möbius Band mode: vector parallel transport ───────────────────────────────

const MobiusParallelTransport = ({ speed }: { speed: number }) => {
  const tRef = useRef(0);
  const arrowRef = useRef<THREE.Mesh>(null);
  const shaftRef = useRef<THREE.Mesh>(null);

  useFrame((_state, delta) => {
    tRef.current = (tRef.current + delta * speed * 0.12) % 1;
    const t = tRef.current;
    const u = t * Math.PI * 2;

    // Base point on the surface mid-fiber
    const p = mobiusPoint(u, 0);

    // The parallel-transported vector flips sign after one full loop:
    // angle = π * t  (π rotation over one full loop)
    const angle = Math.PI * t;

    // Tangent to the surface at this point (along v direction)
    const eps = 1e-3;
    const dv = mobiusPoint(u, eps).sub(mobiusPoint(u, -eps)).normalize();
    // Surface normal
    const du = mobiusPoint(u + eps, 0).sub(mobiusPoint(u - eps, 0)).normalize();
    const normal = new THREE.Vector3().crossVectors(du, dv).normalize();

    // Vector in the fiber direction, rotated by angle within the fiber plane
    const vec = dv
      .clone()
      .multiplyScalar(Math.cos(angle))
      .add(normal.clone().multiplyScalar(Math.sin(angle)));

    vec.normalize().multiplyScalar(0.45);

    const tip = p.clone().add(vec);

    if (arrowRef.current) {
      arrowRef.current.position.set(tip.x, tip.y, tip.z);
    }
    if (shaftRef.current) {
      shaftRef.current.position.set(
        (p.x + tip.x) / 2,
        (p.y + tip.y) / 2,
        (p.z + tip.z) / 2
      );
      // Orient shaft along vec
      shaftRef.current.lookAt(tip.x, tip.y, tip.z);
      shaftRef.current.rotateX(Math.PI / 2);
    }
  });

  return (
    <>
      {/* Arrow shaft */}
      <mesh ref={shaftRef}>
        <cylinderGeometry args={[0.025, 0.025, 0.45, 8]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.4} />
      </mesh>
      {/* Arrow head */}
      <mesh ref={arrowRef}>
        <coneGeometry args={[0.07, 0.14, 10]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.4} />
      </mesh>
    </>
  );
};

// Moving dot tracing the base circle of the Möbius band
const MobiusBaseTracer = ({ speed }: { speed: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);

  useFrame((_state, delta) => {
    tRef.current = (tRef.current + delta * speed * 0.12) % 1;
    const u = tRef.current * Math.PI * 2;
    const p = mobiusPoint(u, 0);
    if (meshRef.current) meshRef.current.position.set(p.x, p.y, p.z);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.07, 14, 14]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
    </mesh>
  );
};

// Colored fiber lines for Möbius band to show the twist
const MobiusFibers = ({ count }: { count: number }) => {
  const lines = useMemo(() => {
    const res: { pts: [number, number, number][]; color: string }[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const u = t * Math.PI * 2;
      const steps = 12;
      const pts: [number, number, number][] = [];
      for (let k = 0; k <= steps; k++) {
        const v = -0.5 + (k / steps) * 1.0;
        const p = mobiusPoint(u, v);
        pts.push([p.x, p.y, p.z]);
      }
      const hue = Math.round(t * 360);
      res.push({ pts, color: `hsl(${hue},80%,60%)` });
    }
    return res;
  }, [count]);

  return (
    <>
      {lines.map((ln, i) => (
        <Line key={i} points={ln.pts} color={ln.color} lineWidth={2} transparent opacity={0.8} />
      ))}
    </>
  );
};

// ── Scene camera setup ─────────────────────────────────────────────────────────

const CameraSetup = ({ mode }: { mode: Mode }) => {
  const { camera } = useThree();
  useEffect(() => {
    if (mode === 'bundle') {
      camera.position.set(3.5, 2, 3.5);
    } else if (mode === 'sections') {
      camera.position.set(3, 1.5, 3);
    } else {
      camera.position.set(3.5, 1.5, 3);
    }
    camera.lookAt(0, 0, 0);
  }, [mode, camera]);
  return null;
};

// ── Scene for Fiber Bundle mode ────────────────────────────────────────────────

const FiberBundleScene = ({
  bundleType,
  showProjection,
}: {
  bundleType: BundleType;
  showProjection: boolean;
}) => {
  const [highlightFiber, setHighlightFiber] = useState(-1);
  const [projectionT, setProjectionT] = useState(0);

  const handleFiberIdx = useCallback(
    (idx: number) => {
      setHighlightFiber(idx);
      setProjectionT(idx / 24);
    },
    []
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-4, -3, -4]} intensity={0.3} />
      <CameraSetup mode="bundle" />
      <OrbitControls enableDamping dampingFactor={0.08} />

      <SurfaceMesh bundleType={bundleType} opacity={0.4} />
      <FibersDisplay bundleType={bundleType} count={24} highlightIndex={highlightFiber} />
      <BaseCircle bundleType={bundleType} />
      <AnimatedBasePoint
        bundleType={bundleType}
        fiberCount={24}
        onFiberIndex={handleFiberIdx}
      />
      {showProjection && <ProjectionArrow bundleType={bundleType} t={projectionT} />}

      {/* Label: π: E → B */}
      <Html position={[1.6, 0, 0]} center className="pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono text-slate-600 shadow-sm whitespace-nowrap">
          π: E → B
        </div>
      </Html>
    </>
  );
};

// ── Scene for Sections mode ────────────────────────────────────────────────────

const SectionsScene = ({
  bundleType,
  controlTs,
  onControlChange,
  showControls,
}: {
  bundleType: BundleType;
  controlTs: number[];
  onControlChange: (idx: number, v: number) => void;
  showControls: boolean;
}) => {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <directionalLight position={[-4, -3, -4]} intensity={0.3} />
      <CameraSetup mode="sections" />
      <OrbitControls enableDamping dampingFactor={0.08} />

      <SurfaceMesh bundleType={bundleType} opacity={0.38} uSteps={80} vSteps={30} />
      <FibersDisplay bundleType={bundleType} count={20} />
      <BaseCircle bundleType={bundleType} />

      {/* Primary section */}
      <SectionCurve controlTs={controlTs} bundleType={bundleType} color="#10b981" />

      {/* For cylinder: show second constant section */}
      {bundleType === 'cylinder' && (
        <SectionCurve
          controlTs={controlTs.map(() => (bundleType === 'cylinder' ? -0.6 : -0.25))}
          bundleType={bundleType}
          color="#6366f1"
        />
      )}

      {showControls && (
        <SectionControls
          controlTs={controlTs}
          onChange={onControlChange}
          bundleType={bundleType}
        />
      )}

      {/* Info label */}
      <Html position={[1.7, 0.3, 0]} center className="pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-emerald-200 rounded-lg px-2 py-1 text-xs font-mono text-emerald-700 shadow-sm whitespace-nowrap">
          s: B → E, π∘s = id
        </div>
      </Html>
    </>
  );
};

// ── Scene for Möbius Band mode ─────────────────────────────────────────────────

const MobiusScene = ({
  rotationSpeed,
  fiberDensity,
}: {
  rotationSpeed: number;
  fiberDensity: number;
}) => {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 8, 4]} intensity={1.3} castShadow />
      <directionalLight position={[-5, -4, -3]} intensity={0.35} />
      <CameraSetup mode="mobius" />
      <OrbitControls enableDamping dampingFactor={0.08} autoRotate autoRotateSpeed={rotationSpeed * 0.7} />

      <SurfaceMesh bundleType="mobius" opacity={0.45} uSteps={100} vSteps={30} />
      <MobiusFibers count={fiberDensity} />
      <MobiusParallelTransport speed={rotationSpeed} />
      <MobiusBaseTracer speed={rotationSpeed} />

      {/* Label */}
      <Html position={[2.2, 0.2, 0]} center className="pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-pink-200 rounded-lg px-2 py-1 text-xs font-mono text-pink-700 shadow-sm whitespace-nowrap">
          v → −v after one loop
        </div>
      </Html>
    </>
  );
};

// ── Main exported component ────────────────────────────────────────────────────

export const BundleSim = () => {
  const [mode, setMode] = useState<Mode>('bundle');
  const [bundleType, setBundleType] = useState<BundleType>('cylinder');
  const [showProjection, setShowProjection] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(1);
  const [fiberDensity, setFiberDensity] = useState(24);

  // Section control points: 7 evenly spaced along base, each with a fiber coordinate v
  const defaultCylControls = useMemo(() => Array(7).fill(0) as number[], []);
  const defaultMobControls = useMemo(() => Array(7).fill(0) as number[], []);
  const [cylControlTs, setCylControlTs] = useState<number[]>(defaultCylControls);
  const [mobControlTs, setMobControlTs] = useState<number[]>(defaultMobControls);

  const controlTs = bundleType === 'cylinder' ? cylControlTs : mobControlTs;
  const setControlTs = bundleType === 'cylinder' ? setCylControlTs : setMobControlTs;

  const handleControlChange = useCallback(
    (idx: number, v: number) => {
      setControlTs((prev) => {
        const next = [...prev];
        next[idx] = v;
        return next;
      });
    },
    [setControlTs]
  );

  const tabs: { id: Mode; label: string }[] = [
    { id: 'bundle', label: 'Fiber Bundle' },
    { id: 'sections', label: 'Sections' },
    { id: 'mobius', label: 'Möbius Band' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-gray-800">Fiber Bundles & Sections</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Interactive visualization of fiber bundles, sections, and bundle nontriviality
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              mode === tab.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="relative" style={{ height: 450 }}>
        <Canvas
          camera={{ position: [3.5, 2, 3.5], fov: 45, near: 0.1, far: 100 }}
          dpr={[1, 2]}
          style={{ background: 'transparent' }}
        >
          {mode === 'bundle' && (
            <FiberBundleScene bundleType={bundleType} showProjection={showProjection} />
          )}
          {mode === 'sections' && (
            <SectionsScene
              bundleType={bundleType}
              controlTs={controlTs}
              onControlChange={handleControlChange}
              showControls={showControls}
            />
          )}
          {mode === 'mobius' && (
            <MobiusScene rotationSpeed={rotationSpeed} fiberDensity={fiberDensity} />
          )}
        </Canvas>
      </div>

      {/* Controls panel */}
      <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-3">
        {/* Bundle type picker (bundle + sections modes) */}
        {mode !== 'mobius' && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600">Bundle:</span>
              <div className="flex gap-1">
                {(['cylinder', 'mobius'] as BundleType[]).map((bt) => (
                  <button
                    key={bt}
                    onClick={() => setBundleType(bt)}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      bundleType === bt
                        ? 'bg-indigo-100 text-indigo-700 font-semibold border border-indigo-300'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    {bt === 'cylinder' ? 'Cylinder (trivial)' : 'Möbius (nontrivial)'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'bundle' && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProjection}
                  onChange={(e) => setShowProjection(e.target.checked)}
                  className="accent-indigo-600"
                />
                <span className="text-xs text-gray-600">Show projection π</span>
              </label>
            )}

            {mode === 'sections' && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showControls}
                  onChange={(e) => setShowControls(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span className="text-xs text-gray-600">Show section controls</span>
              </label>
            )}
          </div>
        )}

        {/* Möbius controls */}
        {mode === 'mobius' && (
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 w-24">Rotation speed</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                className="w-28 accent-pink-500"
              />
              <span className="text-xs text-gray-500 w-6">{rotationSpeed.toFixed(1)}×</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 w-24">Fiber density</span>
              <input
                type="range"
                min={8}
                max={48}
                step={4}
                value={fiberDensity}
                onChange={(e) => setFiberDensity(parseInt(e.target.value))}
                className="w-28 accent-pink-500"
              />
              <span className="text-xs text-gray-500 w-6">{fiberDensity}</span>
            </div>
          </div>
        )}

        {/* Contextual info */}
        <div className="mt-2 text-[11px] text-gray-400 leading-relaxed">
          {mode === 'bundle' && bundleType === 'cylinder' && (
            <span>
              <span className="font-medium text-indigo-500">Trivial bundle</span> — the cylinder
              E = B × F is a direct product. The yellow dot moves along the base space B; the
              highlighted fiber π⁻¹(b) is shown in gold.
            </span>
          )}
          {mode === 'bundle' && bundleType === 'mobius' && (
            <span>
              <span className="font-medium text-pink-500">Möbius band</span> — nontrivial ℝ¹-bundle
              over S¹. Fibers are colored by their angular position to reveal the half-twist.
            </span>
          )}
          {mode === 'sections' && bundleType === 'cylinder' && (
            <span>
              <span className="font-medium text-emerald-600">Global sections exist</span> for the
              cylinder. Drag the sliders on the green dots to reshape the section curve (green).
              The purple curve shows a second independent section.
            </span>
          )}
          {mode === 'sections' && bundleType === 'mobius' && (
            <span>
              <span className="font-medium text-orange-500">No nonvanishing global section</span>{' '}
              exists for the Möbius band — any section must pass through zero at some fiber due to
              the half-twist.
            </span>
          )}
          {mode === 'mobius' && (
            <span>
              The orange vector is <span className="font-medium text-orange-500">parallel transported</span> around
              the Möbius band. After one full loop it returns with the <span className="font-medium">opposite orientation</span>,
              demonstrating that the bundle is nontrivial (holonomy = −1).
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BundleSim;

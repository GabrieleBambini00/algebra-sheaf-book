import { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * InnerProductSim
 * Interactive visualization of inner products, angles, and projections.
 * Users can edit both vectors and see live dot product, norms, angle, and projection.
 * Supports modes: "dotproduct" (default), "projection", "gramschmidt"
 */

const ArcLine = ({ from, to, radius = 0.4, segments = 32 }: { from: [number, number]; to: [number, number]; radius?: number; segments?: number }) => {
  const points = useMemo(() => {
    const angle1 = Math.atan2(from[1], from[0]);
    const angle2 = Math.atan2(to[1], to[0]);
    let start = angle1;
    let end = angle2;
    // Always take the shorter arc
    let diff = end - start;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    end = start + diff;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = start + t * (end - start);
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius, 0.02]);
    }
    return pts;
  }, [from, to, radius, segments]);
  return <Line points={points} color="#8b5cf6" lineWidth={2} />;
};

const ProjectionLine = ({ a, b }: { a: [number, number]; b: [number, number] }) => {
  const projPt = useMemo(() => {
    const dot = a[0] * b[0] + a[1] * b[1];
    const lenSq = b[0] * b[0] + b[1] * b[1];
    if (lenSq < 0.0001) return [0, 0] as [number, number];
    const s = dot / lenSq;
    return [b[0] * s, b[1] * s] as [number, number];
  }, [a, b]);

  return (
    <>
      {/* Projection vector (on b) */}
      <Line points={[[0, 0, 0.01], [projPt[0], projPt[1], 0.01]]} color="#10b981" lineWidth={3} />
      <mesh position={[projPt[0], projPt[1], 0.01]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
      {/* Dashed perpendicular from a to proj */}
      <Line points={[[a[0], a[1], 0.01], [projPt[0], projPt[1], 0.01]]} color="#10b981" lineWidth={1} dashed dashSize={0.08} gapSize={0.06} />
      {/* Label */}
      <Html position={[projPt[0] + 0.15, projPt[1] - 0.2, 0.01]} center className="pointer-events-none w-max">
        <div className="bg-emerald-50/90 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-emerald-700 border border-emerald-200">
          proj
        </div>
      </Html>
    </>
  );
};

const BackgroundGrid = () => {
  const lines = useMemo(() => {
    const arr = [];
    const size = 10;
    for (let i = -size; i <= size; i++) {
      const c = i === 0 ? '#9ca3af' : '#f3f4f6';
      const w = i === 0 ? 1.5 : 0.5;
      arr.push(<Line key={`v${i}`} points={[[i, -size, -0.1], [i, size, -0.1]]} color={c} lineWidth={w} />);
      arr.push(<Line key={`h${i}`} points={[[-size, i, -0.1], [size, i, -0.1]]} color={c} lineWidth={w} />);
    }
    return arr;
  }, []);
  return <>{lines}</>;
};

const DraggableVector = ({
  vec,
  color,
  label,
  onDrag,
}: {
  vec: [number, number];
  color: string;
  label: string;
  onDrag: (x: number, y: number) => void;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: any) => {
    e.stopPropagation();
    dragging.current = true;
    (gl.domElement as HTMLElement).style.cursor = 'grabbing';
    (e.target as any).setPointerCapture?.(e.pointerId);
  }, [gl]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    (gl.domElement as HTMLElement).style.cursor = '';
  }, [gl]);

  const onPointerMove = useCallback((e: any) => {
    if (!dragging.current) return;
    e.stopPropagation();
    // Unproject mouse to world XY plane
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const ndc = new THREE.Vector3(nx, ny, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    const wx = camera.position.x + dir.x * t;
    const wy = camera.position.y + dir.y * t;
    onDrag(Math.round(wx * 4) / 4, Math.round(wy * 4) / 4); // snap to 0.25
  }, [camera, gl, onDrag]);

  return (
    <>
      <Line points={[[0, 0, 0.01], [vec[0], vec[1], 0.01]]} color={color} lineWidth={3} />
      <mesh
        ref={meshRef}
        position={[vec[0], vec[1], 0.01]}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerUp}
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={color} />
        <Html position={[0.2, 0.2, 0]} center className="pointer-events-none w-max">
          <div className="bg-white/90 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-gray-800 border border-gray-200">
            {label}
          </div>
        </Html>
      </mesh>
    </>
  );
};

export const InnerProductSim = ({
  initialA = [2, 1] as [number, number],
  initialB = [1, 2] as [number, number],
  height = '420px',
  mode = 'projection' as 'dotproduct' | 'projection' | 'gramschmidt',
}: {
  initialA?: [number, number];
  initialB?: [number, number];
  height?: string;
  mode?: 'dotproduct' | 'projection' | 'gramschmidt';
}) => {
  const [vecA, setVecA] = useState<[number, number]>(initialA);
  const [vecB, setVecB] = useState<[number, number]>(initialB);

  const dot = vecA[0] * vecB[0] + vecA[1] * vecB[1];
  const normA = Math.sqrt(vecA[0] ** 2 + vecA[1] ** 2);
  const normB = Math.sqrt(vecB[0] ** 2 + vecB[1] ** 2);
  const cosTheta = normA > 0.001 && normB > 0.001 ? dot / (normA * normB) : 0;
  const angle = Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);

  // Gram-Schmidt: u1 = a, u2 = b - proj_a(b)
  const projScalar = normA > 0.001 ? dot / (normA * normA) : 0;
  const gsU2: [number, number] = [vecB[0] - projScalar * vecA[0], vecB[1] - projScalar * vecA[1]];

  const handleInputA = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n)) {
      const next: [number, number] = [...vecA] as [number, number];
      next[idx] = n;
      setVecA(next);
    }
  };

  const handleInputB = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n)) {
      const next: [number, number] = [...vecB] as [number, number];
      next[idx] = n;
      setVecB(next);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      <div className="flex-1 relative" style={{ height }}>
        <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
          <color attach="background" args={['#fafafa']} />
          <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} maxDistance={20} minDistance={2} />
          <BackgroundGrid />

          {/* Vector a (blue) — draggable */}
          <DraggableVector vec={vecA} color="#3b82f6" label="a" onDrag={(x, y) => setVecA([x, y])} />
          {/* Vector b (red) — draggable */}
          <DraggableVector vec={vecB} color="#ef4444" label="b" onDrag={(x, y) => setVecB([x, y])} />

          {/* Angle arc */}
          {normA > 0.1 && normB > 0.1 && (
            <ArcLine from={[vecA[0] / normA, vecA[1] / normA]} to={[vecB[0] / normB, vecB[1] / normB]} radius={0.5} />
          )}

          {/* Projection visualization */}
          {(mode === 'projection' || mode === 'gramschmidt') && normB > 0.1 && (
            <ProjectionLine a={vecA} b={vecB} />
          )}

          {/* Gram-Schmidt: orthogonalized u2 */}
          {mode === 'gramschmidt' && (
            <>
              <Line points={[[0, 0, 0.02], [gsU2[0], gsU2[1], 0.02]]} color="#f59e0b" lineWidth={3} />
              <mesh position={[gsU2[0], gsU2[1], 0.02]}>
                <sphereGeometry args={[0.08, 12, 12]} />
                <meshBasicMaterial color="#f59e0b" />
                <Html position={[0.2, 0.2, 0]} center className="pointer-events-none w-max">
                  <div className="bg-amber-50/90 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-amber-700 border border-amber-200">u₂</div>
                </Html>
              </mesh>
            </>
          )}
        </Canvas>
      </div>

      {/* Compact bottom bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px]">
        {/* Vector a input */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-[10px] font-semibold text-gray-400">a</span>
          <span className="text-gray-300">[</span>
          <input type="number" step="0.25" value={vecA[0]} onChange={e => handleInputA(0, e.target.value)}
            className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-gray-300">,</span>
          <input type="number" step="0.25" value={vecA[1]} onChange={e => handleInputA(1, e.target.value)}
            className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-gray-300">]</span>
        </div>

        {/* Vector b input */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-[10px] font-semibold text-gray-400">b</span>
          <span className="text-gray-300">[</span>
          <input type="number" step="0.25" value={vecB[0]} onChange={e => handleInputB(0, e.target.value)}
            className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-red-400" />
          <span className="text-gray-300">,</span>
          <input type="number" step="0.25" value={vecB[1]} onChange={e => handleInputB(1, e.target.value)}
            className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-red-400" />
          <span className="text-gray-300">]</span>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Readouts */}
        <div className="flex items-center gap-3 flex-wrap">
          <span><span className="text-gray-400 font-semibold">a·b</span> <span className="font-mono font-bold text-gray-900">{dot.toFixed(2)}</span></span>
          <span><span className="text-gray-400 font-semibold">|a|</span> <span className="font-mono text-gray-700">{normA.toFixed(2)}</span></span>
          <span><span className="text-gray-400 font-semibold">|b|</span> <span className="font-mono text-gray-700">{normB.toFixed(2)}</span></span>
          <span><span className="text-purple-400 font-semibold">θ</span> <span className="font-mono text-purple-700">{angle.toFixed(1)}°</span></span>
          {mode === 'gramschmidt' && (
            <span><span className="text-amber-500 font-semibold">u₂</span> <span className="font-mono text-amber-700">[{gsU2[0].toFixed(2)}, {gsU2[1].toFixed(2)}]</span></span>
          )}
        </div>
      </div>
    </div>
  );
};

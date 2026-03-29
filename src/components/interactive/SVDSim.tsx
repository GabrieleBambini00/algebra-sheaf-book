import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

/**
 * SVDSim
 * Visualizes the Singular Value Decomposition of a 2x2 matrix.
 * Shows the unit circle transforming into an ellipse, with the
 * principal axes (left/right singular vectors) and singular values.
 * Editable matrix, animated transition, full 3D rotation.
 */

const UnitCircle = ({ progress, matrix, onUpdate }: any) => {
  const lineRef = useRef<any>(null);
  const segments = 64;

  const basePoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(t), Math.sin(t), 0.01]);
    }
    return pts;
  }, []);

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progress.current));
    const m00 = THREE.MathUtils.lerp(1, matrix[0], p);
    const m01 = THREE.MathUtils.lerp(0, matrix[1], p);
    const m10 = THREE.MathUtils.lerp(0, matrix[2], p);
    const m11 = THREE.MathUtils.lerp(1, matrix[3], p);

    // Transform each point of the unit circle
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const cx = Math.cos(t);
      const cy = Math.sin(t);
      positions[i * 3] = m00 * cx + m01 * cy;
      positions[i * 3 + 1] = m10 * cx + m11 * cy;
      positions[i * 3 + 2] = 0.01;
    }

    if (lineRef.current) {
      lineRef.current.geometry.setPositions(positions);
    }

    // Compute SVD of the interpolated matrix via eigenvalues of M^T M
    // M = [m00 m01; m10 m11]
    // M^T M = [m00^2+m10^2, m00*m01+m10*m11; m00*m01+m10*m11, m01^2+m11^2]
    const a = m00 * m00 + m10 * m10;
    const b = m00 * m01 + m10 * m11;
    const d = m01 * m01 + m11 * m11;

    // Eigenvalues of 2x2 symmetric: (a+d)/2 ± sqrt(((a-d)/2)^2 + b^2)
    const avg = (a + d) / 2;
    const diff = (a - d) / 2;
    const disc = Math.sqrt(diff * diff + b * b);
    const s1 = Math.sqrt(Math.max(0, avg + disc));
    const s2 = Math.sqrt(Math.max(0, avg - disc));

    // Right singular vector (eigenvector of M^T M for larger eigenvalue)
    let v1x: number, v1y: number;
    if (Math.abs(b) > 0.0001) {
      v1x = avg + disc - d;
      v1y = b;
      const n = Math.sqrt(v1x * v1x + v1y * v1y);
      v1x /= n;
      v1y /= n;
    } else {
      v1x = a >= d ? 1 : 0;
      v1y = a >= d ? 0 : 1;
    }
    // v2 is perpendicular
    const v2x = -v1y;
    const v2y = v1x;

    // Left singular vectors: u1 = M*v1 / s1, u2 = M*v2 / s2
    let u1x = 0, u1y = 0, u2x = 0, u2y = 0;
    if (s1 > 0.001) {
      u1x = (m00 * v1x + m01 * v1y) / s1;
      u1y = (m10 * v1x + m11 * v1y) / s1;
    }
    if (s2 > 0.001) {
      u2x = (m00 * v2x + m01 * v2y) / s2;
      u2y = (m10 * v2x + m11 * v2y) / s2;
    }

    if (onUpdate) {
      onUpdate({ s1, s2, v1: [v1x, v1y], v2: [v2x, v2y], u1: [u1x, u1y], u2: [u2x, u2y] });
    }
  });

  return (
    <>
      {/* Static unit circle (ghost) */}
      <Line points={basePoints} color="#e5e7eb" lineWidth={1} />
      {/* Transformed ellipse */}
      <Line ref={lineRef} points={basePoints} color="#6366f1" lineWidth={2.5} />
    </>
  );
};

const SingularVectors = ({ svd }: { svd: any }) => {
  if (!svd) return null;
  const { s1, s2, u1, u2 } = svd;
  return (
    <>
      {/* Principal axis 1 (σ₁ · u₁) */}
      {s1 > 0.01 && (
        <>
          <Line points={[[0, 0, 0.02], [u1[0] * s1, u1[1] * s1, 0.02]]} color="#ec4899" lineWidth={3} />
          <mesh position={[u1[0] * s1, u1[1] * s1, 0.02]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color="#ec4899" />
            <Html position={[0.2, 0.15, 0]} center className="pointer-events-none w-max">
              <div className="bg-pink-50/90 backdrop-blur px-1 py-0.5 rounded text-[8px] font-mono font-bold text-pink-700 border border-pink-200">σ₁u₁</div>
            </Html>
          </mesh>
        </>
      )}
      {/* Principal axis 2 (σ₂ · u₂) */}
      {s2 > 0.01 && (
        <>
          <Line points={[[0, 0, 0.02], [u2[0] * s2, u2[1] * s2, 0.02]]} color="#f97316" lineWidth={3} />
          <mesh position={[u2[0] * s2, u2[1] * s2, 0.02]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color="#f97316" />
            <Html position={[0.2, 0.15, 0]} center className="pointer-events-none w-max">
              <div className="bg-orange-50/90 backdrop-blur px-1 py-0.5 rounded text-[8px] font-mono font-bold text-orange-700 border border-orange-200">σ₂u₂</div>
            </Html>
          </mesh>
        </>
      )}
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

const AnimationController = ({ isPlaying, progress, onUpdateUI }: any) => {
  useFrame((_, delta) => {
    if (isPlaying) {
      let p = progress.current + delta * 0.35;
      if (p > 1.3) p = 0;
      progress.current = p;
      if (Math.random() < 0.2) onUpdateUI(p);
    }
  });
  return null;
};

export const SVDSim = ({
  matrix: initialMatrix = [2, 1, 0.5, 1.5],
  height = '420px',
  editable = true,
}: {
  matrix?: number[];
  height?: string;
  editable?: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const progressRef = useRef(0);
  const [uiProgress, setUiProgress] = useState(0);
  const [currentMatrix, setCurrentMatrix] = useState(initialMatrix);
  const [svd, setSvd] = useState<any>(null);

  const handleManualScrub = (e: any) => {
    const val = parseFloat(e.target.value);
    progressRef.current = val;
    setUiProgress(val);
    setIsPlaying(false);
  };

  const stepForward = () => {
    progressRef.current = Math.min(1, progressRef.current + 0.1);
    setUiProgress(progressRef.current);
    setIsPlaying(false);
  };

  const stepBack = () => {
    progressRef.current = Math.max(0, progressRef.current - 0.1);
    setUiProgress(progressRef.current);
    setIsPlaying(false);
  };

  const handleMatrixChange = (index: number, val: string) => {
    if (val === '') return;
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const newMatrix = [...currentMatrix];
      newMatrix[index] = num;
      setCurrentMatrix(newMatrix);
      progressRef.current = 0;
      setUiProgress(0);
      setIsPlaying(true);
    }
  };

  const MatrixCell = ({ val, index }: { val: number; index: number }) => (
    editable ? (
      <input type="number" step="0.5" defaultValue={val}
        onChange={e => handleMatrixChange(index, e.target.value)}
        className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-indigo-400" />
    ) : <span className="font-mono text-xs text-gray-700">{val}</span>
  );

  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      <div className="flex-1 relative" style={{ height }}>
        <Canvas camera={{ position: [0, 0, 7], fov: 50 }}>
          <color attach="background" args={['#fafafa']} />
          <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} maxDistance={20} minDistance={2} />
          <AnimationController isPlaying={isPlaying} progress={progressRef} onUpdateUI={setUiProgress} />
          <BackgroundGrid />
          <UnitCircle progress={progressRef} matrix={currentMatrix} onUpdate={setSvd} />
          <SingularVectors svd={svd} />
        </Canvas>
      </div>

      {/* Compact bottom bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2.5 font-sans flex items-center gap-4 flex-wrap text-[11px]">
        {/* Transport */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => { if (progressRef.current >= 1) progressRef.current = 0; setIsPlaying(!isPlaying); }}
            className="w-7 h-7 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-indigo-600 transition-colors active:scale-95">
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-px" />}
          </button>
          <button onClick={stepBack} className="text-gray-400 hover:text-indigo-500 transition-colors"><SkipBack className="w-3.5 h-3.5" /></button>
          <input type="range" min="0" max="1" step="0.01" value={uiProgress > 1 ? 1 : uiProgress} onChange={handleManualScrub}
            className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800 hover:accent-indigo-600" />
          <button onClick={stepForward} className="text-gray-400 hover:text-indigo-500 transition-colors"><SkipForward className="w-3.5 h-3.5" /></button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Matrix */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400">M</span>
          <span className="text-gray-300">[</span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <MatrixCell val={currentMatrix[0]} index={0} />
            <MatrixCell val={currentMatrix[1]} index={1} />
            <MatrixCell val={currentMatrix[2]} index={2} />
            <MatrixCell val={currentMatrix[3]} index={3} />
          </div>
          <span className="text-gray-300">]</span>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* SVD readouts */}
        {svd && (
          <div className="flex items-center gap-3 flex-wrap">
            <span><span className="text-pink-400 font-semibold">σ₁</span> <span className="font-mono font-bold text-pink-700">{svd.s1.toFixed(2)}</span></span>
            <span><span className="text-orange-400 font-semibold">σ₂</span> <span className="font-mono font-bold text-orange-700">{svd.s2.toFixed(2)}</span></span>
            <span><span className="text-gray-400 font-semibold">κ</span> <span className="font-mono text-gray-700">{svd.s2 > 0.001 ? (svd.s1 / svd.s2).toFixed(1) : '∞'}</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

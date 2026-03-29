import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Play, Pause, SkipBack, SkipForward, AlertTriangle } from 'lucide-react';

const UnitParallelogram = ({ progress, matrix }: { progress: React.MutableRefObject<number>; matrix: number[] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progress.current));
    const m00 = THREE.MathUtils.lerp(1, matrix[0], p);
    const m10 = THREE.MathUtils.lerp(0, matrix[2], p);
    const m01 = THREE.MathUtils.lerp(0, matrix[1], p);
    const m11 = THREE.MathUtils.lerp(1, matrix[3], p);

    const o = [0, 0, 0.01];
    const e1 = [m00, m10, 0.01];
    const e2 = [m01, m11, 0.01];
    const corner = [m00 + m01, m10 + m11, 0.01];

    const vertices = new Float32Array([
      ...o, ...e1, ...corner,
      ...o, ...corner, ...e2,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    if (meshRef.current) {
      const det = m00 * m11 - m01 * m10;
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      if (Math.abs(det) < 0.05) {
        mat.color.set('#fbbf24');
        mat.opacity = 0.6;
      } else if (det < 0) {
        mat.color.set('#f87171');
        mat.opacity = 0.25;
      } else {
        mat.color.set('#60a5fa');
        mat.opacity = 0.25;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial transparent opacity={0.25} color="#60a5fa" side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
};

const TransformingGrid = ({ matrix, progress, onUpdateMetrics }: any) => {
  const groupRef = useRef<THREE.Group>(null);

  const lines = useMemo(() => {
    const arr = [];
    const size = 15;
    for (let i = -size; i <= size; i++) {
      if (i === 0) continue;
      arr.push(<Line key={`v${i}`} points={[[i, -size, 0], [i, size, 0]]} color="#d1d5db" lineWidth={1} />);
      arr.push(<Line key={`h${i}`} points={[[-size, i, 0], [size, i, 0]]} color="#d1d5db" lineWidth={1} />);
    }
    return arr;
  }, []);

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progress.current));
    const m = new THREE.Matrix4();
    m.identity();

    const m00 = THREE.MathUtils.lerp(1, matrix[0], p);
    const m10 = THREE.MathUtils.lerp(0, matrix[2], p);
    const m01 = THREE.MathUtils.lerp(0, matrix[1], p);
    const m11 = THREE.MathUtils.lerp(1, matrix[3], p);

    m.elements[0] = m00;
    m.elements[1] = m10;
    m.elements[4] = m01;
    m.elements[5] = m11;

    if (groupRef.current) {
      groupRef.current.matrix.copy(m);
    }
    if (onUpdateMetrics) {
      const det = m00 * m11 - m01 * m10;
      onUpdateMetrics(det);
    }
  });

  return (
    <group ref={groupRef} matrixAutoUpdate={false}>
      {lines}
      <Line points={[[-15, 0, 0], [15, 0, 0]]} color="#6b7280" lineWidth={2} />
      <Line points={[[0, -15, 0], [0, 15, 0]]} color="#6b7280" lineWidth={2} />
      <Line points={[[0, 0, 0], [1, 0, 0]]} color="#3b82f6" lineWidth={4} />
      <mesh position={[1, 0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#3b82f6" />
        <Html position={[0.2, 0.2, 0]} center className="pointer-events-none w-max">
          <div className="bg-white/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-gray-800 border border-gray-200">e₁</div>
        </Html>
      </mesh>
      <Line points={[[0, 0, 0], [0, 1, 0]]} color="#ef4444" lineWidth={4} />
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#ef4444" />
        <Html position={[0.2, 0.2, 0]} center className="pointer-events-none w-max">
          <div className="bg-white/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-gray-800 border border-gray-200">e₂</div>
        </Html>
      </mesh>
    </group>
  );
};

const StaticBackgroundGrid = () => {
  const lines = useMemo(() => {
    const arr = [];
    const size = 15;
    for (let i = -size; i <= size; i++) {
      if (i === 0) continue;
      arr.push(<Line key={`sv${i}`} points={[[i, -size, -0.1], [i, size, -0.1]]} color="#f3f4f6" lineWidth={1} />);
      arr.push(<Line key={`sh${i}`} points={[[-size, i, -0.1], [size, i, -0.1]]} color="#f3f4f6" lineWidth={1} />);
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

export const DeterminantAreaSim = ({
  matrix: initialMatrix = [2, 0, 0, 2],
  height = '480px',
  editable = false,
}: {
  matrix?: number[];
  height?: string;
  editable?: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const progressRef = useRef(0);
  const [uiProgress, setUiProgress] = useState(0);
  const [currentMatrix, setCurrentMatrix] = useState(initialMatrix);

  const detRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const warnRef = useRef<HTMLSpanElement>(null);

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

  const updateMetrics = (det: number) => {
    if (detRef.current) detRef.current.innerText = det.toFixed(3);
    if (statusRef.current) {
      if (Math.abs(det) < 0.05) {
        statusRef.current.innerText = 'SINGULAR';
        statusRef.current.className = 'text-[10px] font-bold tracking-wider text-amber-600 uppercase';
      } else if (det < 0) {
        statusRef.current.innerText = 'FLIPPED';
        statusRef.current.className = 'text-[10px] font-bold tracking-wider text-red-500 uppercase';
      } else {
        statusRef.current.innerText = 'OK';
        statusRef.current.className = 'text-[10px] font-bold tracking-wider text-emerald-600 uppercase';
      }
    }
    if (warnRef.current) {
      warnRef.current.style.opacity = Math.abs(det) < 0.05 ? '1' : '0';
    }
  };

  const MatrixCell = ({ val, index }: { val: number; index: number }) => (
    editable ? (
      <input
        type="number" step="0.5"
        defaultValue={val}
        onChange={e => handleMatrixChange(index, e.target.value)}
        className="w-10 bg-gray-100 border border-gray-200 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 px-0.5 py-px"
      />
    ) : <span className="font-mono text-xs text-gray-700">{val}</span>
  );

  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {/* Canvas area */}
      <div className="flex-1 relative" style={{ height }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
          <color attach="background" args={['#fafafa']} />
          <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} maxDistance={30} minDistance={3} />
          <AnimationController isPlaying={isPlaying} progress={progressRef} onUpdateUI={setUiProgress} />
          <StaticBackgroundGrid />
          <UnitParallelogram progress={progressRef} matrix={currentMatrix} />
          <TransformingGrid matrix={currentMatrix} progress={progressRef} onUpdateMetrics={updateMetrics} />
        </Canvas>
      </div>

      {/* Compact bottom control bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2.5 font-sans flex items-center gap-4 flex-wrap">
        {/* Play + timeline */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { if (progressRef.current >= 1) progressRef.current = 0; setIsPlaying(!isPlaying); }}
            className="w-7 h-7 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-blue-600 transition-colors active:scale-95"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-px" />}
          </button>
          <button onClick={stepBack} className="text-gray-400 hover:text-blue-500 transition-colors"><SkipBack className="w-3.5 h-3.5" /></button>
          <input
            type="range" min="0" max="1" step="0.01"
            value={uiProgress > 1 ? 1 : uiProgress}
            onChange={handleManualScrub}
            className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800 hover:accent-blue-600"
          />
          <button onClick={stepForward} className="text-gray-400 hover:text-blue-500 transition-colors"><SkipForward className="w-3.5 h-3.5" /></button>
        </div>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Matrix display */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">T</span>
          <span className="text-gray-300">[</span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <MatrixCell val={currentMatrix[0]} index={0} />
            <MatrixCell val={currentMatrix[1]} index={1} />
            <MatrixCell val={currentMatrix[2]} index={2} />
            <MatrixCell val={currentMatrix[3]} index={3} />
          </div>
          <span className="text-gray-300">]</span>
        </div>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Det readout */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">det</span>
            <span className="font-mono font-bold text-sm text-gray-900"><span ref={detRef}>1.000</span></span>
          </span>
          <span ref={statusRef} className="text-[10px] font-bold tracking-wider text-emerald-600 uppercase">OK</span>
          <span ref={warnRef} className="opacity-0 transition-opacity">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </span>
        </div>
      </div>
    </div>
  );
};

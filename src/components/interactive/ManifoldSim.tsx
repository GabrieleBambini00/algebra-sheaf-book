import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * ManifoldSim
 * Interactive visualization of differentiable manifold concepts:
 *   - Charts: coordinate patches on 3D surfaces (sphere, torus, paraboloid)
 *   - Transitions: overlap regions and transition functions φ₂ ∘ φ₁⁻¹
 *   - Tangent Spaces: tangent planes and tangent vectors at a draggable point
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SurfaceType = 'sphere' | 'torus' | 'paraboloid';
type Mode = 'Charts' | 'Transitions' | 'Tangent Spaces';

interface SurfacePoint {
  u: number;
  v: number;
}

interface ChartInfo {
  id: number;
  name: string;
  color: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Surface parametrizations
// ---------------------------------------------------------------------------

function spherePoint(u: number, v: number): THREE.Vector3 {
  // u ∈ [0, 2π], v ∈ [-π/2, π/2]  (longitude, latitude)
  return new THREE.Vector3(
    Math.cos(v) * Math.cos(u),
    Math.cos(v) * Math.sin(u),
    Math.sin(v)
  );
}

function sphereNormal(u: number, v: number): THREE.Vector3 {
  return spherePoint(u, v).normalize();
}

function torusPoint(u: number, v: number, R = 1.5, r = 0.55): THREE.Vector3 {
  // u ∈ [0, 2π], v ∈ [0, 2π]
  return new THREE.Vector3(
    (R + r * Math.cos(v)) * Math.cos(u),
    (R + r * Math.cos(v)) * Math.sin(u),
    r * Math.sin(v)
  );
}

function torusNormal(u: number, v: number, R = 1.5, r = 0.55): THREE.Vector3 {
  const cx = Math.cos(u) * (R + r * Math.cos(v));
  const cy = Math.sin(u) * (R + r * Math.cos(v));
  const cz = r * Math.sin(v);
  // Normal = point - center-circle (the tube center)
  const tcx = R * Math.cos(u);
  const tcy = R * Math.sin(u);
  return new THREE.Vector3(cx - tcx, cy - tcy, cz).normalize();
}

function paraboloidPoint(u: number, v: number): THREE.Vector3 {
  // u, v ∈ [-1.4, 1.4]
  return new THREE.Vector3(u, v, u * u + v * v - 1.5);
}

function paraboloidNormal(u: number, v: number): THREE.Vector3 {
  // ∂/∂u = (1,0,2u), ∂/∂v = (0,1,2v), n = cross product
  const n = new THREE.Vector3(-2 * u, -2 * v, 1).normalize();
  return n;
}

function getSurfacePoint(type: SurfaceType, u: number, v: number): THREE.Vector3 {
  if (type === 'sphere') return spherePoint(u, v);
  if (type === 'torus') return torusPoint(u, v);
  return paraboloidPoint(u, v);
}

function getSurfaceNormal(type: SurfaceType, u: number, v: number): THREE.Vector3 {
  if (type === 'sphere') return sphereNormal(u, v);
  if (type === 'torus') return torusNormal(u, v);
  return paraboloidNormal(u, v);
}

function getSurfaceUVRange(type: SurfaceType): { uMin: number; uMax: number; vMin: number; vMax: number } {
  if (type === 'sphere') return { uMin: 0, uMax: Math.PI * 2, vMin: -Math.PI / 2, vMax: Math.PI / 2 };
  if (type === 'torus') return { uMin: 0, uMax: Math.PI * 2, vMin: 0, vMax: Math.PI * 2 };
  return { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4 };
}

// ---------------------------------------------------------------------------
// Build BufferGeometry for a parametric surface patch
// ---------------------------------------------------------------------------

function buildPatchGeometry(
  type: SurfaceType,
  uMin: number, uMax: number,
  vMin: number, vMax: number,
  uSegs = 32, vSegs = 32
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let vi = 0; vi <= vSegs; vi++) {
    for (let ui = 0; ui <= uSegs; ui++) {
      const u = uMin + (uMax - uMin) * (ui / uSegs);
      const v = vMin + (vMax - vMin) * (vi / vSegs);
      const p = getSurfacePoint(type, u, v);
      const n = getSurfaceNormal(type, u, v);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(ui / uSegs, vi / vSegs);
    }
  }

  for (let vi = 0; vi < vSegs; vi++) {
    for (let ui = 0; ui < uSegs; ui++) {
      const a = vi * (uSegs + 1) + ui;
      const b = a + 1;
      const c = a + (uSegs + 1);
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// ---------------------------------------------------------------------------
// Chart definitions per surface
// ---------------------------------------------------------------------------

function getCharts(type: SurfaceType): ChartInfo[] {
  if (type === 'sphere') {
    return [
      { id: 0, name: 'φ₁ (North)', color: '#6366f1', uMin: 0, uMax: Math.PI * 2, vMin: 0, vMax: Math.PI / 2, label: 'φ₁' },
      { id: 1, name: 'φ₂ (South)', color: '#ec4899', uMin: 0, uMax: Math.PI * 2, vMin: -Math.PI / 2, vMax: 0, label: 'φ₂' },
      { id: 2, name: 'φ₃ (East)', color: '#10b981', uMin: 0, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2, label: 'φ₃' },
    ];
  }
  if (type === 'torus') {
    return [
      { id: 0, name: 'φ₁ (Outer)', color: '#6366f1', uMin: 0, uMax: Math.PI * 2, vMin: -Math.PI / 2, vMax: Math.PI / 2, label: 'φ₁' },
      { id: 1, name: 'φ₂ (Inner)', color: '#ec4899', uMin: 0, uMax: Math.PI * 2, vMin: Math.PI / 2, vMax: 3 * Math.PI / 2, label: 'φ₂' },
      { id: 2, name: 'φ₃ (Left half)', color: '#10b981', uMin: 0, uMax: Math.PI, vMin: 0, vMax: Math.PI * 2, label: 'φ₃' },
    ];
  }
  // paraboloid
  return [
    { id: 0, name: 'φ₁ (Full)', color: '#6366f1', uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4, label: 'φ₁' },
    { id: 1, name: 'φ₂ (Right)', color: '#ec4899', uMin: 0, uMax: 1.4, vMin: -1.4, vMax: 1.4, label: 'φ₂' },
    { id: 2, name: 'φ₃ (Upper)', color: '#10b981', uMin: -1.4, uMax: 1.4, vMin: 0, vMax: 1.4, label: 'φ₃' },
  ];
}

// ---------------------------------------------------------------------------
// 3D surface mesh (base)
// ---------------------------------------------------------------------------

const SurfaceMesh = ({ type }: { type: SurfaceType }) => {
  const geo = useMemo(() => {
    const r = getSurfaceUVRange(type);
    return buildPatchGeometry(type, r.uMin, r.uMax, r.vMin, r.vMax, 48, 48);
  }, [type]);

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial
        color="#e0e7ff"
        roughness={0.6}
        metalness={0.05}
        side={THREE.DoubleSide}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Chart patch (colored region on surface)
// ---------------------------------------------------------------------------

const ChartPatch = ({
  type,
  chart,
  selected,
  onClick,
}: {
  type: SurfaceType;
  chart: ChartInfo;
  selected: boolean;
  onClick: () => void;
}) => {
  const geo = useMemo(
    () => buildPatchGeometry(type, chart.uMin, chart.uMax, chart.vMin, chart.vMax, 28, 28),
    [type, chart]
  );

  const color = new THREE.Color(chart.color);

  // Centroid label position
  const midP = useMemo(() => {
    const uMid = (chart.uMin + chart.uMax) / 2;
    const vMid = (chart.vMin + chart.vMax) / 2;
    const p = getSurfacePoint(type, uMid, vMid);
    const n = getSurfaceNormal(type, uMid, vMid);
    return p.addScaledVector(n, 0.15);
  }, [type, chart]);

  return (
    <group>
      <mesh geometry={geo} onClick={onClick} renderOrder={1}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={selected ? 0.55 : 0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Html position={[midP.x, midP.y, midP.z]} center className="pointer-events-none">
        <div
          className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono text-white border"
          style={{
            backgroundColor: chart.color + 'cc',
            borderColor: chart.color,
          }}
        >
          {chart.label}
        </div>
      </Html>
    </group>
  );
};

// ---------------------------------------------------------------------------
// R² chart panel (2D flat view) — rendered in a separate Canvas
// ---------------------------------------------------------------------------

const ChartGrid2D = ({
  chart,
  surfaceType,
  width = 180,
  height = 160,
}: {
  chart: ChartInfo | null;
  surfaceType: SurfaceType;
  width?: number;
  height?: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#f8faff';
    ctx.fillRect(0, 0, W, H);

    // Coordinate grid
    const pad = 18;
    const gridW = W - 2 * pad;
    const gridH = H - 2 * pad;

    const gridN = 6;
    ctx.strokeStyle = '#e0e7ff';
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= gridN; i++) {
      const x = pad + (i / gridN) * gridW;
      const y = pad + (i / gridN) * gridH;
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + gridH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + gridW, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    // x-axis
    ctx.beginPath(); ctx.moveTo(pad, pad + gridH / 2); ctx.lineTo(pad + gridW, pad + gridH / 2); ctx.stroke();
    // y-axis
    ctx.beginPath(); ctx.moveTo(pad + gridW / 2, pad); ctx.lineTo(pad + gridW / 2, pad + gridH); ctx.stroke();

    // Axis arrows
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath(); ctx.moveTo(pad + gridW, pad + gridH / 2); ctx.lineTo(pad + gridW - 6, pad + gridH / 2 - 3); ctx.lineTo(pad + gridW - 6, pad + gridH / 2 + 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(pad + gridW / 2, pad); ctx.lineTo(pad + gridW / 2 - 3, pad + 6); ctx.lineTo(pad + gridW / 2 + 3, pad + 6); ctx.fill();

    // Chart region — fill the entire domain region
    ctx.fillStyle = chart.color + '44';
    ctx.strokeStyle = chart.color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(pad + 4, pad + 4, gridW - 8, gridH - 8);
    ctx.strokeRect(pad + 4, pad + 4, gridW - 8, gridH - 8);

    // Sample a few points on the domain
    const pts = 5;
    ctx.fillStyle = chart.color + 'bb';
    for (let ui = 0; ui <= pts; ui++) {
      for (let vi = 0; vi <= pts; vi++) {
        const fx = pad + 4 + (ui / pts) * (gridW - 8);
        const fy = pad + 4 + (vi / pts) * (gridH - 8);
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.fillText('u', pad + gridW - 4, pad + gridH / 2 - 5);
    ctx.fillText('v', pad + gridW / 2 + 5, pad + 10);

    ctx.fillStyle = chart.color;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${chart.label}: U → ℝ²`, pad + 4, H - 5);

    void surfaceType; // suppress lint warning
  }, [chart, surfaceType, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg border border-gray-200"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
};

// ---------------------------------------------------------------------------
// Charts Mode Scene
// ---------------------------------------------------------------------------

const ChartsScene = ({
  surfaceType,
  selectedChart,
  onSelectChart,
}: {
  surfaceType: SurfaceType;
  selectedChart: number | null;
  onSelectChart: (id: number) => void;
}) => {
  const charts = useMemo(() => getCharts(surfaceType), [surfaceType]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={0.8} castShadow />
      <directionalLight position={[-2, -3, -2]} intensity={0.25} />
      <SurfaceMesh type={surfaceType} />
      {charts.map(chart => (
        <ChartPatch
          key={chart.id}
          type={surfaceType}
          chart={chart}
          selected={selectedChart === chart.id}
          onClick={() => onSelectChart(chart.id)}
        />
      ))}
      <OrbitControls enableZoom enablePan enableRotate makeDefault />
    </>
  );
};

// ---------------------------------------------------------------------------
// Overlap highlight geometry
// ---------------------------------------------------------------------------

function buildOverlapGeometry(type: SurfaceType): THREE.BufferGeometry {
  const charts = getCharts(type);
  const c1 = charts[0];
  const c2 = charts[1];
  const oUMin = Math.max(c1.uMin, c2.uMin);
  const oUMax = Math.min(c1.uMax, c2.uMax);
  const oVMin = Math.max(c1.vMin, c2.vMin);
  const oVMax = Math.min(c1.vMax, c2.vMax);

  if (oUMin >= oUMax || oVMin >= oVMax) {
    // No overlap — return empty
    return new THREE.BufferGeometry();
  }
  return buildPatchGeometry(type, oUMin, oUMax, oVMin, oVMax, 24, 24);
}

// ---------------------------------------------------------------------------
// Animated transition point
// ---------------------------------------------------------------------------

const TransitionPoint = ({
  surfaceType,
  animT,
}: {
  surfaceType: SurfaceType;
  animT: React.MutableRefObject<number>;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const charts = useMemo(() => getCharts(surfaceType), [surfaceType]);
  const c1 = charts[0];
  const c2 = charts[1];

  // Compute overlap
  const oUMin = Math.max(c1.uMin, c2.uMin);
  const oUMax = Math.min(c1.uMax, c2.uMax);
  const oVMin = Math.max(c1.vMin, c2.vMin);
  const oVMax = Math.min(c1.vMax, c2.vMax);
  const hasOverlap = oUMin < oUMax && oVMin < oVMax;

  useFrame((_, delta) => {
    animT.current = (animT.current + delta * 0.4) % 1;
    if (meshRef.current && hasOverlap) {
      // Move point along u in overlap region
      const t = animT.current;
      const u = oUMin + t * (oUMax - oUMin);
      const vMid = (oVMin + oVMax) / 2;
      const p = getSurfacePoint(surfaceType, u, vMid);
      const n = getSurfaceNormal(surfaceType, u, vMid);
      const lifted = p.clone().addScaledVector(n, 0.06);
      meshRef.current.position.set(lifted.x, lifted.y, lifted.z);
    }
  });

  if (!hasOverlap) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Transition Function 2D canvas
// ---------------------------------------------------------------------------

const TransitionCanvas2D = ({
  surfaceType,
  animT,
  width = 340,
  height = 130,
}: {
  surfaceType: SurfaceType;
  animT: number;
  width?: number;
  height?: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8faff';
    ctx.fillRect(0, 0, W, H);

    const pad = 16;
    const half = (W - 3 * pad) / 2;
    const chartH = H - 2 * pad - 14;

    const charts = getCharts(surfaceType);
    const c1 = charts[0];
    const c2 = charts[1];

    // Chart 1 box (left)
    ctx.strokeStyle = c1.color;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = c1.color + '22';
    ctx.fillRect(pad, pad, half, chartH);
    ctx.strokeRect(pad, pad, half, chartH);

    // Chart 2 box (right)
    ctx.strokeStyle = c2.color;
    ctx.fillStyle = c2.color + '22';
    ctx.fillRect(pad * 2 + half, pad, half, chartH);
    ctx.strokeRect(pad * 2 + half, pad, half, chartH);

    // Labels
    ctx.fillStyle = c1.color;
    ctx.font = 'bold 9px monospace';
    ctx.fillText('φ₁(U₁∩U₂) ⊂ ℝ²', pad + 2, H - 4);
    ctx.fillStyle = c2.color;
    ctx.fillText('φ₂(U₁∩U₂) ⊂ ℝ²', pad * 2 + half + 2, H - 4);

    // Arrow in middle
    const arrowX = pad + half + pad / 2;
    const arrowY = pad + chartH / 2;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + half + 3, arrowY);
    ctx.lineTo(pad + half + pad - 3, arrowY);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(pad + half + pad - 3, arrowY);
    ctx.lineTo(pad + half + pad - 8, arrowY - 3);
    ctx.lineTo(pad + half + pad - 8, arrowY + 3);
    ctx.fill();
    ctx.font = '7px sans-serif';
    ctx.fillText('τ₁₂', arrowX - 5, arrowY - 4);

    // Grid lines
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = '#e0e7ff';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad + (i / 4) * half, pad);
      ctx.lineTo(pad + (i / 4) * half, pad + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, pad + (i / 4) * chartH);
      ctx.lineTo(pad + half, pad + (i / 4) * chartH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad * 2 + half + (i / 4) * half, pad);
      ctx.lineTo(pad * 2 + half + (i / 4) * half, pad + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad * 2 + half, pad + (i / 4) * chartH);
      ctx.lineTo(pad * 2 + 2 * half, pad + (i / 4) * chartH);
      ctx.stroke();
    }

    // Animated point
    const t = animT;
    const px1 = pad + 4 + t * (half - 8);
    const py1 = pad + chartH / 2;

    // Map: transition function. For illustration use a simple nonlinear map.
    // φ₂ ∘ φ₁⁻¹ : for sphere this wraps / reflects. We simulate a mild warp.
    const tNorm = t * 2 - 1; // [-1, 1]
    const px2 = pad * 2 + half + (half / 2 + tNorm * (half / 2 - 8) * 0.9 * (1 + 0.15 * Math.sin(tNorm * Math.PI)));
    const py2 = pad + chartH / 2 + tNorm * 8 * Math.sin(tNorm * Math.PI);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(px1, py1, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(px2, py2, 4, 0, Math.PI * 2); ctx.fill();

    // Dashed curve in chart 1 (trajectory)
    ctx.strokeStyle = '#f59e0b88';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad + 4, pad + chartH / 2);
    ctx.lineTo(px1, py1);
    ctx.stroke();

    // Dashed curve in chart 2
    ctx.beginPath();
    ctx.moveTo(pad * 2 + half + 4, pad + chartH / 2);
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const st = (s / steps) * t;
      const sn = st * 2 - 1;
      const sx = pad * 2 + half + (half / 2 + sn * (half / 2 - 8) * 0.9 * (1 + 0.15 * Math.sin(sn * Math.PI)));
      const sy = pad + chartH / 2 + sn * 8 * Math.sin(sn * Math.PI);
      if (s === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }, [surfaceType, animT]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg border border-gray-200"
    />
  );
};

// ---------------------------------------------------------------------------
// Compute Jacobian of the transition map (numerical)
// ---------------------------------------------------------------------------

function computeJacobian(surfaceType: SurfaceType, t: number): number[][] {
  const charts = getCharts(surfaceType);
  const c1 = charts[0];
  const c2 = charts[1];

  const oUMin = Math.max(c1.uMin, c2.uMin);
  const oUMax = Math.min(c1.uMax, c2.uMax);
  const oVMin = Math.max(c1.vMin, c2.vMin);
  const oVMax = Math.min(c1.vMax, c2.vMax);

  if (oUMin >= oUMax || oVMin >= oVMax) return [[1, 0], [0, 1]];

  const u = oUMin + t * (oUMax - oUMin);
  const v = (oVMin + oVMax) / 2;

  const h = 0.0001;
  // Transition: φ₁ maps (u,v) to (u,v) (identity for illustration)
  // φ₂ ∘ φ₁⁻¹ in practice involves surface geometry. We compute numerically
  // by perturbing (u,v) and seeing how the 3D point changes in both charts' coordinates.
  // For simplicity, we compute ∂(u₂,v₂)/∂(u₁,v₁) ≈ identity + small warp.

  // A rough approximation: the Jacobian is the ratio of metric tensors
  // We use numeric central differences on a simple parameterization.
  const p  = getSurfacePoint(surfaceType, u, v);
  const pu = getSurfacePoint(surfaceType, u + h, v);
  const pv = getSurfacePoint(surfaceType, u, v + h);

  const dpu = pu.clone().sub(p).divideScalar(h);
  const dpv = pv.clone().sub(p).divideScalar(h);

  const j00 = dpu.length();
  const j11 = dpv.length();
  const dot = dpu.dot(dpv) / (dpu.length() * dpv.length() + 1e-10);

  // Return approximate Jacobian of transition (identity-like with scale info)
  return [
    [+(j00).toFixed(3), +(dot * j11).toFixed(3)],
    [+(dot * j00).toFixed(3), +(j11).toFixed(3)],
  ];
}

// ---------------------------------------------------------------------------
// Transitions Mode Scene
// ---------------------------------------------------------------------------

const TransitionsScene = ({
  surfaceType,
  animT,
}: {
  surfaceType: SurfaceType;
  animT: React.MutableRefObject<number>;
}) => {
  const charts = useMemo(() => getCharts(surfaceType), [surfaceType]);
  const overlapGeo = useMemo(() => buildOverlapGeometry(surfaceType), [surfaceType]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={0.8} />
      <directionalLight position={[-2, -3, -2]} intensity={0.2} />
      <SurfaceMesh type={surfaceType} />

      {/* Show first two charts */}
      {charts.slice(0, 2).map(chart => (
        <ChartPatch
          key={chart.id}
          type={surfaceType}
          chart={chart}
          selected={false}
          onClick={() => {}}
        />
      ))}

      {/* Overlap region highlight */}
      {overlapGeo.index && overlapGeo.index.count > 0 && (
        <mesh geometry={overlapGeo} renderOrder={2}>
          <meshStandardMaterial
            color="#f59e0b"
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      <TransitionPoint surfaceType={surfaceType} animT={animT} />
      <OrbitControls enableZoom enablePan enableRotate makeDefault />
    </>
  );
};

// ---------------------------------------------------------------------------
// Draggable point on surface (Tangent Space mode)
// ---------------------------------------------------------------------------

const TangentPlane = ({
  pos,
  normal,
  tangentU,
  tangentV,
  vecU,
  vecV,
}: {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  tangentU: THREE.Vector3;
  tangentV: THREE.Vector3;
  vecU: number;
  vecV: number;
}) => {
  const discGeo = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.5, 40);
    return geo;
  }, []);

  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return q;
  }, [normal]);

  const tangentVec = useMemo(() => {
    return tangentU.clone().multiplyScalar(vecU).add(tangentV.clone().multiplyScalar(vecV));
  }, [tangentU, tangentV, vecU, vecV]);

  const tipPos = useMemo(() => pos.clone().addScaledVector(tangentVec, 1), [pos, tangentVec]);

  return (
    <>
      {/* Tangent plane disc */}
      <mesh geometry={discGeo} position={pos} quaternion={quat} renderOrder={3}>
        <meshStandardMaterial
          color="#818cf8"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Tangent U basis vector (red) */}
      <Line
        points={[pos.toArray() as [number,number,number], pos.clone().addScaledVector(tangentU, 0.4).toArray() as [number,number,number]]}
        color="#ef4444"
        lineWidth={2.5}
      />
      {/* Tangent V basis vector (green) */}
      <Line
        points={[pos.toArray() as [number,number,number], pos.clone().addScaledVector(tangentV, 0.4).toArray() as [number,number,number]]}
        color="#22c55e"
        lineWidth={2.5}
      />

      {/* Tangent vector arrow (yellow) */}
      {tangentVec.length() > 0.01 && (
        <>
          <Line
            points={[pos.toArray() as [number,number,number], tipPos.toArray() as [number,number,number]]}
            color="#f59e0b"
            lineWidth={3}
          />
          <mesh position={tipPos}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.4} />
          </mesh>
        </>
      )}

      {/* Normal vector (blue) */}
      <Line
        points={[pos.toArray() as [number,number,number], pos.clone().addScaledVector(normal, 0.45).toArray() as [number,number,number]]}
        color="#3b82f6"
        lineWidth={2}
      />

      {/* Labels */}
      <Html position={pos.clone().addScaledVector(tangentU, 0.48).toArray()} center className="pointer-events-none">
        <span className="text-[8px] font-mono font-bold text-red-600 bg-white/80 px-0.5 rounded">∂/∂u</span>
      </Html>
      <Html position={pos.clone().addScaledVector(tangentV, 0.48).toArray()} center className="pointer-events-none">
        <span className="text-[8px] font-mono font-bold text-green-600 bg-white/80 px-0.5 rounded">∂/∂v</span>
      </Html>
      <Html position={pos.clone().addScaledVector(normal, 0.52).toArray()} center className="pointer-events-none">
        <span className="text-[8px] font-mono font-bold text-blue-600 bg-white/80 px-0.5 rounded">n</span>
      </Html>
    </>
  );
};

// ---------------------------------------------------------------------------
// Draggable surface point handler
// ---------------------------------------------------------------------------

const DraggablePoint = ({
  surfaceType,
  uvRef,
  onDrag,
}: {
  surfaceType: SurfaceType;
  uvRef: React.MutableRefObject<{ u: number; v: number }>;
  onDrag: (uv: SurfacePoint) => void;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const isDragging = useRef(false);
  const { camera, gl, raycaster, pointer } = useThree();

  // Build a full surface mesh for raycasting
  const rayCastGeo = useMemo(() => {
    const r = getSurfaceUVRange(surfaceType);
    return buildPatchGeometry(surfaceType, r.uMin, r.uMax, r.vMin, r.vMax, 64, 64);
  }, [surfaceType]);

  const rayCastMesh = useMemo(() => {
    const m = new THREE.Mesh(rayCastGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    return m;
  }, [rayCastGeo]);

  // Store UV in the geometry for reverse lookup
  const findUVFromHit = useCallback(
    (hit: THREE.Intersection) => {
      const uv = hit.uv;
      if (!uv) return null;
      const r = getSurfaceUVRange(surfaceType);
      return {
        u: r.uMin + uv.x * (r.uMax - r.uMin),
        v: r.vMin + uv.y * (r.vMax - r.vMin),
      };
    },
    [surfaceType]
  );

  useFrame(() => {
    if (meshRef.current) {
      const { u, v } = uvRef.current;
      const p = getSurfacePoint(surfaceType, u, v);
      const n = getSurfaceNormal(surfaceType, u, v);
      const lifted = p.clone().addScaledVector(n, 0.07);
      meshRef.current.position.set(lifted.x, lifted.y, lifted.z);
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    isDragging.current = true;
    gl.domElement.style.cursor = 'grabbing';
  };

  const handlePointerMove = useCallback(() => {
    if (!isDragging.current) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(rayCastMesh);
    if (hits.length > 0) {
      const uv = findUVFromHit(hits[0]);
      if (uv) {
        uvRef.current = uv;
        onDrag(uv);
      }
    }
  }, [camera, findUVFromHit, gl, onDrag, pointer, rayCastMesh, raycaster, uvRef]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    gl.domElement.style.cursor = 'grab';
  }, [gl]);

  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    return () => {
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gl, handlePointerMove, handlePointerUp]);

  return (
    <mesh
      ref={meshRef}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => { gl.domElement.style.cursor = 'grab'; }}
      onPointerLeave={() => { if (!isDragging.current) gl.domElement.style.cursor = 'default'; }}
    >
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Compute tangent basis at (u,v)
// ---------------------------------------------------------------------------

function computeTangentBasis(
  type: SurfaceType,
  u: number,
  v: number
): { tangentU: THREE.Vector3; tangentV: THREE.Vector3; normal: THREE.Vector3 } {
  const h = 0.0001;
  const p0 = getSurfacePoint(type, u, v);
  const pu = getSurfacePoint(type, u + h, v);
  const pv = getSurfacePoint(type, u, v + h);

  const tangentU = pu.sub(p0).normalize();
  const tangentV = pv.sub(p0).normalize();
  const normal = getSurfaceNormal(type, u, v);
  return { tangentU, tangentV, normal };
}

// ---------------------------------------------------------------------------
// Tangent Spaces Scene
// ---------------------------------------------------------------------------

const TangentSpacesScene = ({
  surfaceType,
  uvRef,
  vecU,
  vecV,
  onDrag,
}: {
  surfaceType: SurfaceType;
  uvRef: React.MutableRefObject<SurfacePoint>;
  vecU: number;
  vecV: number;
  onDrag: (uv: SurfacePoint) => void;
}) => {
  const [uv, setUV] = useState<SurfacePoint>(uvRef.current);

  const handleDrag = useCallback(
    (newUV: SurfacePoint) => {
      setUV({ ...newUV });
      onDrag(newUV);
    },
    [onDrag]
  );

  const basis = useMemo(() => computeTangentBasis(surfaceType, uv.u, uv.v), [surfaceType, uv]);
  const pos = useMemo(() => {
    const p = getSurfacePoint(surfaceType, uv.u, uv.v);
    const n = getSurfaceNormal(surfaceType, uv.u, uv.v);
    return p.addScaledVector(n, 0.02);
  }, [surfaceType, uv]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={0.8} />
      <directionalLight position={[-2, -3, -2]} intensity={0.2} />
      <SurfaceMesh type={surfaceType} />
      <TangentPlane
        pos={pos}
        normal={basis.normal}
        tangentU={basis.tangentU}
        tangentV={basis.tangentV}
        vecU={vecU}
        vecV={vecV}
      />
      <DraggablePoint surfaceType={surfaceType} uvRef={uvRef} onDrag={handleDrag} />
      <OrbitControls enableZoom enablePan enableRotate makeDefault />
    </>
  );
};

// ---------------------------------------------------------------------------
// Transitions scene animation driver
// ---------------------------------------------------------------------------

const TransitionsAnimDriver = ({
  animTRef,
  setAnimT,
}: {
  animTRef: React.MutableRefObject<number>;
  setAnimT: (t: number) => void;
}) => {
  useFrame((_, delta) => {
    animTRef.current = (animTRef.current + delta * 0.35) % 1;
    if (Math.random() < 0.15) setAnimT(animTRef.current);
  });
  return null;
};

// ---------------------------------------------------------------------------
// Wrapper scene for Transitions mode (to access useFrame)
// ---------------------------------------------------------------------------

const TransitionsModeScene = ({
  surfaceType,
  setAnimT,
}: {
  surfaceType: SurfaceType;
  setAnimT: (t: number) => void;
}) => {
  const animTRef = useRef(0);
  return (
    <>
      <TransitionsScene surfaceType={surfaceType} animT={animTRef} />
      <TransitionsAnimDriver animTRef={animTRef} setAnimT={setAnimT} />
    </>
  );
};

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

const TabBtn = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
      active
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`}
  >
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ManifoldSim = () => {
  const [mode, setMode] = useState<Mode>('Charts');
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('sphere');
  const [selectedChart, setSelectedChart] = useState<number | null>(null);
  const [animT, setAnimT] = useState(0);
  const [vecU, setVecU] = useState(0.6);
  const [vecV, setVecV] = useState(0.4);
  const [currentUV, setCurrentUV] = useState<SurfacePoint>({ u: 1.0, v: 0.5 });
  const uvRef = useRef<SurfacePoint>({ u: 1.0, v: 0.5 });

  const charts = useMemo(() => getCharts(surfaceType), [surfaceType]);
  const selectedChartInfo = selectedChart !== null ? charts[selectedChart] : null;
  const jacobian = useMemo(() => computeJacobian(surfaceType, animT), [surfaceType, animT]);

  const handleDrag = useCallback((uv: SurfacePoint) => {
    setCurrentUV({ ...uv });
  }, []);

  // Reset selected chart when surface changes
  useEffect(() => {
    setSelectedChart(null);
    // Reset UV to a valid point on the surface
    const r = getSurfaceUVRange(surfaceType);
    const newUV = { u: (r.uMin + r.uMax) / 2, v: (r.vMin + r.vMax) / 2 };
    uvRef.current = newUV;
    setCurrentUV(newUV);
  }, [surfaceType]);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white/70 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Manifold</span>
          <span className="text-gray-200">|</span>
          <div className="flex gap-1">
            {(['Charts', 'Transitions', 'Tangent Spaces'] as Mode[]).map(m => (
              <TabBtn key={m} label={m} active={mode === m} onClick={() => setMode(m)} />
            ))}
          </div>
        </div>
        <select
          value={surfaceType}
          onChange={e => setSurfaceType(e.target.value as SurfaceType)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="sphere">Sphere S²</option>
          <option value="torus">Torus T²</option>
          <option value="paraboloid">Paraboloid</option>
        </select>
      </div>

      {/* 3D Canvas */}
      <div className="relative" style={{ height: '450px' }}>
        <Canvas camera={{ position: [0, 2.2, 4.5], fov: 45 }} shadows>
          <color attach="background" args={['#f8faff']} />
          {mode === 'Charts' && (
            <ChartsScene
              surfaceType={surfaceType}
              selectedChart={selectedChart}
              onSelectChart={setSelectedChart}
            />
          )}
          {mode === 'Transitions' && (
            <TransitionsModeScene surfaceType={surfaceType} setAnimT={setAnimT} />
          )}
          {mode === 'Tangent Spaces' && (
            <TangentSpacesScene
              surfaceType={surfaceType}
              uvRef={uvRef}
              vecU={vecU}
              vecV={vecV}
              onDrag={handleDrag}
            />
          )}
        </Canvas>

        {/* Charts mode: floating R² chart panel */}
        {mode === 'Charts' && (
          <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur rounded-xl border border-gray-200 shadow-md p-3 flex flex-col items-center gap-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {selectedChartInfo ? `Chart ${selectedChartInfo.name}` : 'Select a chart'}
            </div>
            <ChartGrid2D chart={selectedChartInfo} surfaceType={surfaceType} width={175} height={145} />
          </div>
        )}

        {/* Charts mode: chart list */}
        {mode === 'Charts' && (
          <div className="absolute top-4 left-4 flex flex-col gap-1.5">
            {charts.map(chart => (
              <button
                key={chart.id}
                onClick={() => setSelectedChart(chart.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                  selectedChart === chart.id
                    ? 'text-white shadow-sm scale-105'
                    : 'bg-white/80 text-gray-600 hover:scale-105'
                }`}
                style={{
                  borderColor: chart.color,
                  backgroundColor: selectedChart === chart.id ? chart.color : undefined,
                }}
              >
                {chart.name}
              </button>
            ))}
          </div>
        )}

        {/* Tangent Spaces mode: vector controls */}
        {mode === 'Tangent Spaces' && (
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur rounded-xl border border-gray-200 shadow-md p-3 min-w-[170px]">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Tangent Vector
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-red-600">v^u = {vecU.toFixed(2)}</span>
                <input
                  type="range" min="-1" max="1" step="0.05" value={vecU}
                  onChange={e => setVecU(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer accent-red-500"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-green-600">v^v = {vecV.toFixed(2)}</span>
                <input
                  type="range" min="-1" max="1" step="0.05" value={vecV}
                  onChange={e => setVecV(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer accent-green-500"
                />
              </label>
            </div>
            <div className="mt-2.5 pt-2 border-t border-gray-100 text-[9px] font-mono text-gray-500 space-y-0.5">
              <div>p = ({currentUV.u.toFixed(2)}, {currentUV.v.toFixed(2)})</div>
              <div className="text-amber-600">v = {vecU.toFixed(2)}∂/∂u + {vecV.toFixed(2)}∂/∂v</div>
            </div>
          </div>
        )}

        {/* Tangent Spaces mode: legend */}
        {mode === 'Tangent Spaces' && (
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl border border-gray-200 shadow-md px-3 py-2 flex flex-col gap-1">
            <div className="text-[9px] font-semibold text-gray-400 uppercase">Legend</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-500"></div><span className="text-[9px] text-gray-600">∂/∂u (tangent u)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-500"></div><span className="text-[9px] text-gray-600">∂/∂v (tangent v)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-500"></div><span className="text-[9px] text-gray-600">Tangent vector v</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-500"></div><span className="text-[9px] text-gray-600">Normal n</span></div>
            <div className="text-[8px] text-gray-400 mt-1">Drag yellow dot to move</div>
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-5 py-3 text-[11px] text-gray-500 flex items-start gap-6 flex-wrap">
        {mode === 'Charts' && (
          <>
            <div>
              <span className="font-semibold text-gray-600">Atlas: </span>
              <span className="font-mono">{`{(U₁,φ₁), (U₂,φ₂), (U₃,φ₃)}`}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-600">Chart map: </span>
              <span className="font-mono">φ: U → ℝ²</span>
            </div>
            {selectedChartInfo && (
              <div>
                <span className="font-semibold text-gray-600">Domain: </span>
                <span className="font-mono">
                  u ∈ [{selectedChartInfo.uMin.toFixed(2)}, {selectedChartInfo.uMax.toFixed(2)}],
                  v ∈ [{selectedChartInfo.vMin.toFixed(2)}, {selectedChartInfo.vMax.toFixed(2)}]
                </span>
              </div>
            )}
            {!selectedChartInfo && (
              <div className="text-gray-400 italic">Click a chart region to inspect its R² domain</div>
            )}
          </>
        )}

        {mode === 'Transitions' && (
          <>
            <div>
              <span className="font-semibold text-gray-600">Transition: </span>
              <span className="font-mono">τ₁₂ = φ₂ ∘ φ₁⁻¹ : φ₁(U₁∩U₂) → φ₂(U₁∩U₂)</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-gray-600">Jacobian Dτ₁₂:</span>
              <div className="font-mono bg-white border border-gray-200 rounded px-2 py-1 text-[10px] leading-relaxed">
                <div>[{jacobian[0][0].toFixed(3)}, {jacobian[0][1].toFixed(3)}]</div>
                <div>[{jacobian[1][0].toFixed(3)}, {jacobian[1][1].toFixed(3)}]</div>
              </div>
            </div>
            <div className="flex-1">
              <TransitionCanvas2D surfaceType={surfaceType} animT={animT} width={320} height={110} />
            </div>
          </>
        )}

        {mode === 'Tangent Spaces' && (
          <>
            <div>
              <span className="font-semibold text-gray-600">Tangent space: </span>
              <span className="font-mono">T_pM = span{'{∂/∂u, ∂/∂v}'}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-600">Vector: </span>
              <span className="font-mono text-amber-600">v = {vecU.toFixed(2)}·∂/∂u + {vecV.toFixed(2)}·∂/∂v</span>
            </div>
            <div>
              <span className="font-semibold text-gray-600">dim T_pM = 2</span>
            </div>
            <div className="text-gray-400 italic text-[10px]">
              Drag the yellow point along the surface to see how the tangent plane varies
            </div>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

/**
 * BilinearFormSim
 * Interactive SVG-based visualization of bilinear forms, quadratic forms,
 * and their geometry. Modes: Quadratic Form | Bilinear Form | Signature.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Matrix2x2 = [number, number, number, number]; // [a, b, c, d] = [[a,b],[c,d]]
type Vec2 = [number, number];
type Mode = 'quadratic' | 'bilinear' | 'signature';

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Evaluate quadratic form Q(v) = v^T A v for symmetric A */
function quadForm(A: Matrix2x2, v: Vec2): number {
  const [a, b, , d] = A;
  // A symmetric: A = [[a,b],[b,d]]
  return a * v[0] * v[0] + 2 * b * v[0] * v[1] + d * v[1] * v[1];
}

/** Evaluate bilinear form B(u,v) = u^T A v for symmetric A */
function bilinearForm(A: Matrix2x2, u: Vec2, v: Vec2): number {
  const [a, b, , d] = A;
  return a * u[0] * v[0] + b * (u[0] * v[1] + u[1] * v[0]) + d * u[1] * v[1];
}

/** Eigenvalues of 2x2 symmetric matrix [[a,b],[b,d]] */
function eigenvalues2x2(A: Matrix2x2): [number, number] {
  const [a, b, , d] = A;
  const tr = a + d;
  const det = a * d - b * b;
  const disc = Math.sqrt(Math.max(0, (tr / 2) * (tr / 2) - det));
  return [tr / 2 + disc, tr / 2 - disc];
}

/** Eigenvector for eigenvalue λ of [[a,b],[b,d]] */
function eigenvector2x2(A: Matrix2x2, lambda: number): Vec2 {
  const [a, b, , d] = A;
  // (A - λI)v = 0
  const r0x = a - lambda;
  const r0y = b;
  const r1x = b;
  const r1y = d - lambda;
  // pick the larger row to avoid near-zero
  let vx: number, vy: number;
  if (Math.abs(r0x) + Math.abs(r0y) >= Math.abs(r1x) + Math.abs(r1y)) {
    if (Math.abs(r0x) > Math.abs(r0y)) { vx = -r0y; vy = r0x; }
    else { vx = r0y; vy = -r0x; }
  } else {
    if (Math.abs(r1x) > Math.abs(r1y)) { vx = -r1y; vy = r1x; }
    else { vx = r1y; vy = -r1x; }
  }
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 1e-9) return [1, 0];
  return [vx / len, vy / len];
}

/** Classify based on eigenvalues */
function classify(eigs: [number, number]): string {
  const eps = 1e-8;
  const [l1, l2] = eigs;
  if (Math.abs(l1) < eps || Math.abs(l2) < eps) return 'degenerate';
  if (l1 > eps && l2 > eps) return 'positive definite';
  if (l1 < -eps && l2 < -eps) return 'negative definite';
  return 'indefinite';
}

function signature(eigs: [number, number]): [number, number] {
  const eps = 1e-8;
  const p = eigs.filter(e => e > eps).length;
  const q = eigs.filter(e => e < -eps).length;
  return [p, q];
}

// ─── SVG coordinate helpers ───────────────────────────────────────────────────

const W = 700;
const H = 500;
// Math coordinate centre and scale
const CX = 350;
const CY = 250;
const SCALE = 55; // pixels per unit

function toSVG(mx: number, my: number): [number, number] {
  return [CX + mx * SCALE, CY - my * SCALE];
}
function toMath(sx: number, sy: number): Vec2 {
  return [(sx - CX) / SCALE, -(sy - CY) / SCALE];
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function heatColor(val: number, maxAbs: number): string {
  if (maxAbs < 1e-9) return 'rgb(255,255,255)';
  const t = Math.max(-1, Math.min(1, val / maxAbs));
  if (t > 0) {
    // white → blue
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - t));
    const b = 255;
    return `rgb(${r},${g},${b})`;
  } else {
    // white → red
    const abs = -t;
    const r = 255;
    const g = Math.round(255 * (1 - abs));
    const b = Math.round(255 * (1 - abs));
    return `rgb(${r},${g},${b})`;
  }
}

// ─── Heatmap Component ────────────────────────────────────────────────────────

const HEAT_GRID = 40; // number of cells per axis

const Heatmap = React.memo(({ A, animT }: { A: Matrix2x2; animT: number }) => {
  const cells = useMemo(() => {
    const range = 5.5; // math units shown
    const step = (2 * range) / HEAT_GRID;
    const result: { x: number; y: number; w: number; h: number; color: string }[] = [];
    // Find max abs for normalization
    let maxAbs = 0;
    for (let i = 0; i < HEAT_GRID; i++) {
      for (let j = 0; j < HEAT_GRID; j++) {
        const mx = -range + (i + 0.5) * step;
        const my = -range + (j + 0.5) * step;
        const val = Math.abs(quadForm(A, [mx, my]));
        if (val > maxAbs) maxAbs = val;
      }
    }
    for (let i = 0; i < HEAT_GRID; i++) {
      for (let j = 0; j < HEAT_GRID; j++) {
        const mx = -range + (i + 0.5) * step;
        const my = -range + (j + 0.5) * step;
        const val = quadForm(A, [mx, my]);
        const [sx, sy] = toSVG(-range + i * step, range - j * step);
        const pw = step * SCALE;
        const ph = step * SCALE;
        result.push({ x: sx, y: sy, w: pw, h: ph, color: heatColor(val, maxAbs * 0.7) });
      }
    }
    return result;
  }, [A]);

  // Interpolated A for animation (lerp toward diagonalized)
  const Aeff = useMemo<Matrix2x2>(() => {
    if (animT <= 0) return A;
    const eigs = eigenvalues2x2(A);
    const v1 = eigenvector2x2(A, eigs[0]);
    const v2: Vec2 = [-v1[1], v1[0]];
    // Diagonalized matrix in rotated frame: [[λ1,0],[0,λ2]]
    // Rotate back: A_diag in original = P diag P^T
    // For display, lerp off-diagonal to 0
    const t = Math.min(1, animT);
    const newA: Matrix2x2 = [
      A[0] * (1 - t) + (eigs[0] * v1[0] * v1[0] + eigs[1] * v2[0] * v2[0]) * t,
      A[1] * (1 - t) + (eigs[0] * v1[0] * v1[1] + eigs[1] * v2[0] * v2[1]) * t,
      A[2] * (1 - t) + (eigs[0] * v1[0] * v1[1] + eigs[1] * v2[0] * v2[1]) * t,
      A[3] * (1 - t) + (eigs[0] * v1[1] * v1[1] + eigs[1] * v2[1] * v2[1]) * t,
    ];
    return newA;
  }, [A, animT]);

  const animCells = useMemo(() => {
    if (animT <= 0) return null;
    const range = 5.5;
    const step = (2 * range) / HEAT_GRID;
    const result: { x: number; y: number; w: number; h: number; color: string }[] = [];
    let maxAbs = 0;
    for (let i = 0; i < HEAT_GRID; i++) {
      for (let j = 0; j < HEAT_GRID; j++) {
        const mx = -range + (i + 0.5) * step;
        const my = -range + (j + 0.5) * step;
        const val = Math.abs(quadForm(Aeff, [mx, my]));
        if (val > maxAbs) maxAbs = val;
      }
    }
    for (let i = 0; i < HEAT_GRID; i++) {
      for (let j = 0; j < HEAT_GRID; j++) {
        const mx = -range + (i + 0.5) * step;
        const my = -range + (j + 0.5) * step;
        const val = quadForm(Aeff, [mx, my]);
        const [sx, sy] = toSVG(-range + i * step, range - j * step);
        const pw = step * SCALE;
        const ph = step * SCALE;
        result.push({ x: sx, y: sy, w: pw, h: ph, color: heatColor(val, maxAbs * 0.7) });
      }
    }
    return result;
  }, [Aeff, animT]);

  const displayCells = animT > 0 && animCells ? animCells : cells;

  return (
    <g opacity={0.55}>
      {displayCells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} fill={c.color} />
      ))}
    </g>
  );
});

// ─── Level Curves Component ───────────────────────────────────────────────────

/** Marching squares–style contour: sample Q on a grid, trace iso-levels */
function buildContourPath(A: Matrix2x2, cVal: number, range: number, steps: number): string {
  // For Q(v) = c, use implicit SVG path via marching squares (simplified edge crossings)
  const cellSize = (2 * range) / steps;
  const segments: [number, number, number, number][] = [];

  const q = (ix: number, iy: number) => {
    const mx = -range + ix * cellSize;
    const my = -range + iy * cellSize;
    return quadForm(A, [mx, my]) - cVal;
  };

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const v00 = q(i, j);
      const v10 = q(i + 1, j);
      const v01 = q(i, j + 1);
      const v11 = q(i + 1, j + 1);

      const interp = (a: number, b: number) => Math.abs(a - b) < 1e-12 ? 0.5 : a / (a - b);

      const edgePoints: [number, number][] = [];

      // Bottom edge (j → j, i → i+1)
      if ((v00 < 0) !== (v10 < 0)) {
        const t = interp(v00, v10);
        edgePoints.push([-range + (i + t) * cellSize, -range + j * cellSize]);
      }
      // Top edge (j+1)
      if ((v01 < 0) !== (v11 < 0)) {
        const t = interp(v01, v11);
        edgePoints.push([-range + (i + t) * cellSize, -range + (j + 1) * cellSize]);
      }
      // Left edge (i → i, j → j+1)
      if ((v00 < 0) !== (v01 < 0)) {
        const t = interp(v00, v01);
        edgePoints.push([-range + i * cellSize, -range + (j + t) * cellSize]);
      }
      // Right edge (i+1)
      if ((v10 < 0) !== (v11 < 0)) {
        const t = interp(v10, v11);
        edgePoints.push([-range + (i + 1) * cellSize, -range + (j + t) * cellSize]);
      }

      if (edgePoints.length === 2) {
        const [sx1, sy1] = toSVG(edgePoints[0][0], edgePoints[0][1]);
        const [sx2, sy2] = toSVG(edgePoints[1][0], edgePoints[1][1]);
        segments.push([sx1, sy1, sx2, sy2]);
      }
    }
  }

  return segments.map(([x1, y1, x2, y2]) => `M ${x1} ${y1} L ${x2} ${y2}`).join(' ');
}

const LevelCurves = React.memo(({ A, animT }: { A: Matrix2x2; animT: number }) => {
  const Aeff = useMemo<Matrix2x2>(() => {
    if (animT <= 0) return A;
    const eigs = eigenvalues2x2(A);
    const v1 = eigenvector2x2(A, eigs[0]);
    const v2: Vec2 = [-v1[1], v1[0]];
    const t = Math.min(1, animT);
    return [
      A[0] * (1 - t) + (eigs[0] * v1[0] * v1[0] + eigs[1] * v2[0] * v2[0]) * t,
      A[1] * (1 - t) + (eigs[0] * v1[0] * v1[1] + eigs[1] * v2[0] * v2[1]) * t,
      A[2] * (1 - t) + (eigs[0] * v1[0] * v1[1] + eigs[1] * v2[0] * v2[1]) * t,
      A[3] * (1 - t) + (eigs[0] * v1[1] * v1[1] + eigs[1] * v2[1] * v2[1]) * t,
    ];
  }, [A, animT]);

  const curves = useMemo(() => {
    const levels = [-8, -4, -2, -1, 1, 2, 4, 8];
    return levels.map(c => ({
      c,
      path: buildContourPath(Aeff, c, 5.5, 80),
      color: c > 0 ? '#3b82f6' : '#ef4444',
      opacity: 0.5 + 0.1 * Math.log2(Math.abs(c)),
      strokeWidth: Math.abs(c) === 1 ? 2 : 1,
    }));
  }, [Aeff]);

  // Zero locus
  const zeroPath = useMemo(() => buildContourPath(Aeff, 0, 5.5, 80), [Aeff]);

  return (
    <g>
      {curves.map(({ c, path, color, opacity, strokeWidth }) =>
        path ? <path key={c} d={path} stroke={color} strokeWidth={strokeWidth}
          strokeOpacity={opacity} fill="none" /> : null
      )}
      {/* Zero locus (null cone) */}
      <path d={zeroPath} stroke="#1f2937" strokeWidth={2.5} fill="none" strokeOpacity={0.85} />
    </g>
  );
});

// ─── Grid & Axes ──────────────────────────────────────────────────────────────

const GridAxes = () => {
  const gridLines: JSX.Element[] = [];
  for (let i = -5; i <= 5; i++) {
    const [sx1] = toSVG(i, -5.5);
    const [, sy1] = toSVG(-5.5, i);
    const [sx2] = toSVG(i, 5.5);
    const [, sy2] = toSVG(5.5, i);
    const isMajor = i === 0;
    gridLines.push(
      <line key={`v${i}`} x1={sx1} y1={toSVG(i, -5.5)[1]} x2={sx2} y2={toSVG(i, 5.5)[1]}
        stroke={isMajor ? '#9ca3af' : '#e5e7eb'} strokeWidth={isMajor ? 1.5 : 0.5} />,
      <line key={`h${i}`} x1={toSVG(-5.5, i)[0]} y1={sy1} x2={toSVG(5.5, i)[0]} y2={sy2}
        stroke={isMajor ? '#9ca3af' : '#e5e7eb'} strokeWidth={isMajor ? 1.5 : 0.5} />
    );
  }
  // Tick labels
  const ticks: JSX.Element[] = [];
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const [tx] = toSVG(i, 0);
    const [, ty] = toSVG(0, i);
    ticks.push(
      <text key={`xt${i}`} x={tx} y={CY + 14} textAnchor="middle" fontSize={9}
        fill="#9ca3af" fontFamily="monospace">{i}</text>,
      <text key={`yt${i}`} x={CX - 12} y={ty + 3} textAnchor="end" fontSize={9}
        fill="#9ca3af" fontFamily="monospace">{i}</text>
    );
  }
  return <g>{gridLines}{ticks}</g>;
};

// ─── Arrow helper ─────────────────────────────────────────────────────────────

function Arrow({ from, to, color, width = 2, label, labelOffset = [6, -8] }: {
  from: Vec2; to: Vec2; color: string; width?: number;
  label?: string; labelOffset?: [number, number];
}) {
  const [x1, y1] = toSVG(...from);
  const [x2, y2] = toSVG(...to);
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;
  const ux = dx / len; const uy = dy / len;
  const headLen = Math.min(12, len * 0.3);
  const p1x = x2 - ux * headLen - uy * headLen * 0.4;
  const p1y = y2 - uy * headLen + ux * headLen * 0.4;
  const p2x = x2 - ux * headLen + uy * headLen * 0.4;
  const p2y = y2 - uy * headLen - ux * headLen * 0.4;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} />
      <polygon points={`${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={color} />
      {label && (
        <text x={x2 + labelOffset[0]} y={y2 + labelOffset[1]}
          fontSize={11} fill={color} fontFamily="monospace" fontWeight="bold">
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Draggable point ──────────────────────────────────────────────────────────

function DraggablePoint({ pos, color, label, onDrag }: {
  pos: Vec2; color: string; label: string;
  onDrag: (v: Vec2) => void;
}) {
  const [sx, sy] = toSVG(...pos);
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerUp = () => { dragging.current = false; };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mathPt = toMath(px * scaleX, py * scaleY);
    // Snap to 0.25
    onDrag([Math.round(mathPt[0] * 4) / 4, Math.round(mathPt[1] * 4) / 4]);
  };

  return (
    <g onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}
      style={{ cursor: 'grab' }}>
      <circle cx={sx} cy={sy} r={10} fill="transparent" />
      <circle cx={sx} cy={sy} r={6} fill={color} stroke="white" strokeWidth={2} />
      <text x={sx + 9} y={sy - 9} fontSize={12} fill={color} fontFamily="monospace" fontWeight="bold">{label}</text>
    </g>
  );
}

// ─── Matrix Editor ────────────────────────────────────────────────────────────

function MatrixEditor({ A, onChange, label = 'A' }: {
  A: Matrix2x2; onChange: (A: Matrix2x2) => void; label?: string;
}) {
  const handleChange = (idx: number, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const next: Matrix2x2 = [...A] as Matrix2x2;
    next[idx] = num;
    // Keep symmetric: entries 1 and 2 are both the off-diagonal
    if (idx === 1) next[2] = num;
    if (idx === 2) next[1] = num;
    onChange(next);
  };

  const inputCls = "w-12 bg-gray-100 border border-gray-200 rounded text-center text-xs text-gray-900 px-0.5 py-px focus:outline-none focus:ring-1 focus:ring-indigo-400 font-mono";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-gray-400">{label}</span>
      <span className="text-gray-300 text-sm">[</span>
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
        <input type="number" step="0.5" value={A[0]} onChange={e => handleChange(0, e.target.value)} className={inputCls} />
        <input type="number" step="0.5" value={A[1]} onChange={e => handleChange(1, e.target.value)} className={inputCls} />
        <input type="number" step="0.5" value={A[2]} onChange={e => handleChange(2, e.target.value)} className={inputCls} />
        <input type="number" step="0.5" value={A[3]} onChange={e => handleChange(3, e.target.value)} className={inputCls} />
      </div>
      <span className="text-gray-300 text-sm">]</span>
    </div>
  );
}

// ─── Mode: Quadratic Form ─────────────────────────────────────────────────────

function QuadraticMode({ A, onChange }: { A: Matrix2x2; onChange: (A: Matrix2x2) => void }) {
  const [v, setV] = useState<Vec2>([2, 1]);
  const Qv = quadForm(A, v);
  const [vsx, vsy] = toSVG(...v);

  return (
    <div className="flex flex-col h-full">
      {/* SVG */}
      <div className="flex-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
          style={{ background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)' }}>
          <Heatmap A={A} animT={0} />
          <GridAxes />
          <LevelCurves A={A} animT={0} />
          {/* Vector v */}
          <Arrow from={[0, 0]} to={v} color="#7c3aed" width={2.5} />
          {/* Q(v) dot on "gauge": circle sized by Q */}
          <circle cx={vsx} cy={vsy} r={Math.min(18, Math.max(3, Math.abs(Qv) * 1.5))}
            fill={Qv > 0 ? '#3b82f640' : Qv < 0 ? '#ef444440' : '#6b728040'}
            stroke={Qv > 0 ? '#3b82f6' : Qv < 0 ? '#ef4444' : '#6b7280'}
            strokeWidth={1.5} />
          <DraggablePoint pos={v} color="#7c3aed" label="v" onDrag={setV} />
          {/* Q(v) label near vector tip */}
          <rect x={vsx + 12} y={vsy - 26} width={80} height={20} rx={4}
            fill="white" stroke="#e5e7eb" strokeWidth={1} />
          <text x={vsx + 52} y={vsy - 12} textAnchor="middle" fontSize={11}
            fill="#7c3aed" fontFamily="monospace" fontWeight="bold">
            Q(v) = {Qv.toFixed(2)}
          </text>
        </svg>
      </div>
      {/* Controls bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2 flex items-center gap-4 flex-wrap text-[11px]">
        <MatrixEditor A={A} onChange={onChange} />
        <div className="w-px h-5 bg-gray-200" />
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-600" />
          <span className="text-gray-500 font-semibold">v</span>
          <span className="font-mono text-gray-700">[{v[0].toFixed(2)}, {v[1].toFixed(2)}]</span>
        </span>
        <div className="w-px h-5 bg-gray-200" />
        <span>
          <span className="text-gray-400 font-semibold">Q(v)</span>{' '}
          <span className={`font-mono font-bold ${Qv > 0.01 ? 'text-blue-600' : Qv < -0.01 ? 'text-red-600' : 'text-gray-600'}`}>
            {Qv.toFixed(3)}
          </span>
        </span>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-gray-400 text-[10px]">
          <span className="inline-block w-3 h-1 bg-gray-800 rounded mr-1" />null locus
          {' '}<span className="inline-block w-3 h-1 bg-blue-500 rounded mx-1" />Q &gt; 0
          {' '}<span className="inline-block w-3 h-1 bg-red-500 rounded mx-1" />Q &lt; 0
        </span>
      </div>
    </div>
  );
}

// ─── Mode: Bilinear Form ──────────────────────────────────────────────────────

function BilinearMode({ A, onChange }: { A: Matrix2x2; onChange: (A: Matrix2x2) => void }) {
  const [u, setU] = useState<Vec2>([2, 0.5]);
  const [v, setV] = useState<Vec2>([0.5, 2]);

  const Buu = quadForm(A, u);
  const Bvv = quadForm(A, v);
  const upv: Vec2 = [u[0] + v[0], u[1] + v[1]];
  const Bupv = quadForm(A, upv);
  const Buv = bilinearForm(A, u, v);
  const polarLHS = Bupv - Buu - Bvv;
  const isOrtho = Math.abs(Buv) < 0.05;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
          style={{ background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)' }}>
          <Heatmap A={A} animT={0} />
          <GridAxes />
          <LevelCurves A={A} animT={0} />

          {/* u+v dashed */}
          <Arrow from={[0, 0]} to={upv} color="#9ca3af" width={1.5} />

          {/* parallelogram ghost */}
          {(() => {
            const [ux, uy] = toSVG(...u);
            const [vx, vy] = toSVG(...v);
            const [ox, oy] = toSVG(0, 0);
            const [cx, cy] = toSVG(upv[0], upv[1]);
            return (
              <polygon
                points={`${ox},${oy} ${ux},${uy} ${cx},${cy} ${vx},${vy}`}
                fill={isOrtho ? '#10b98120' : '#8b5cf620'}
                stroke={isOrtho ? '#10b981' : '#8b5cf6'}
                strokeWidth={1} strokeDasharray={isOrtho ? '4 2' : '0'} />
            );
          })()}

          {/* Vectors */}
          <Arrow from={[0, 0]} to={u} color="#3b82f6" width={2.5} label="u" labelOffset={[7, -8]} />
          <Arrow from={[0, 0]} to={v} color="#ef4444" width={2.5} label="v" labelOffset={[7, -8]} />

          {/* B(u,v) display box */}
          <rect x={W - 170} y={12} width={155} height={isOrtho ? 76 : 60} rx={6}
            fill="white" stroke="#e5e7eb" strokeWidth={1.5} />
          <text x={W - 92} y={32} textAnchor="middle" fontSize={11} fill="#6b7280" fontFamily="monospace">B(u,v) = u·Av</text>
          <text x={W - 92} y={50} textAnchor="middle" fontSize={14} fill="#7c3aed" fontFamily="monospace" fontWeight="bold">
            {Buv.toFixed(3)}
          </text>
          <text x={W - 92} y={66} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="monospace">
            2B = {polarLHS.toFixed(3)}
          </text>
          {isOrtho && (
            <text x={W - 92} y={82} textAnchor="middle" fontSize={10} fill="#10b981" fontFamily="monospace" fontWeight="bold">
              B-orthogonal!
            </text>
          )}

          <DraggablePoint pos={u} color="#3b82f6" label="u" onDrag={setU} />
          <DraggablePoint pos={v} color="#ef4444" label="v" onDrag={setV} />
        </svg>
      </div>
      <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2 flex items-center gap-4 flex-wrap text-[11px]">
        <MatrixEditor A={A} onChange={onChange} />
        <div className="w-px h-5 bg-gray-200" />
        <span>
          <span className="text-blue-500 font-semibold">B(u,v)</span>{' '}
          <span className={`font-mono font-bold ${isOrtho ? 'text-emerald-600' : 'text-purple-700'}`}>
            {Buv.toFixed(3)}
          </span>
        </span>
        <span>
          <span className="text-gray-400 font-semibold">Q(u+v)−Q(u)−Q(v)</span>{' '}
          <span className="font-mono text-gray-700">{polarLHS.toFixed(3)}</span>
        </span>
        <span className="text-gray-400 text-[10px] italic">= 2B(u,v)</span>
      </div>
    </div>
  );
}

// ─── Mode: Signature ─────────────────────────────────────────────────────────

function SignatureMode({ A, onChange }: { A: Matrix2x2; onChange: (A: Matrix2x2) => void }) {
  const [animT, setAnimT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
      return;
    }
    const tick = (time: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      setAnimT(t => {
        const next = t + dt * 0.6;
        if (next >= 1.15) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const eigs = useMemo(() => eigenvalues2x2(A), [A]);
  const [l1, l2] = eigs;
  const v1 = useMemo(() => eigenvector2x2(A, l1), [A, l1]);
  const v2: Vec2 = [-v1[1], v1[0]];
  const [p, q] = signature(eigs);
  const cls = classify(eigs);

  const classColor = cls === 'positive definite' ? '#10b981'
    : cls === 'negative definite' ? '#ef4444'
      : cls === 'degenerate' ? '#f59e0b'
        : '#8b5cf6';

  const handleReset = () => { setAnimT(0); setPlaying(false); };
  const handlePlay = () => { setAnimT(0); setPlaying(true); };

  // Animated eigenvectors (fade in during animation)
  const eigAlpha = Math.min(1, animT * 2);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
          style={{ background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)' }}>
          <Heatmap A={A} animT={animT} />
          <GridAxes />
          <LevelCurves A={A} animT={animT} />

          {/* Eigenvectors */}
          {eigAlpha > 0.05 && (
            <g opacity={eigAlpha}>
              {/* v1 direction */}
              <Arrow from={[0, 0]} to={[v1[0] * 3.5, v1[1] * 3.5]}
                color={l1 > 0 ? '#3b82f6' : '#ef4444'} width={2}
                label={`λ₁=${l1.toFixed(2)}`} labelOffset={[6, -6]} />
              <Arrow from={[0, 0]} to={[-v1[0] * 3.5, -v1[1] * 3.5]}
                color={l1 > 0 ? '#3b82f6' : '#ef4444'} width={2} />
              {/* v2 direction */}
              <Arrow from={[0, 0]} to={[v2[0] * 3.5, v2[1] * 3.5]}
                color={l2 > 0 ? '#3b82f6' : '#ef4444'} width={2}
                label={`λ₂=${l2.toFixed(2)}`} labelOffset={[6, -6]} />
              <Arrow from={[0, 0]} to={[-v2[0] * 3.5, -v2[1] * 3.5]}
                color={l2 > 0 ? '#3b82f6' : '#ef4444'} width={2} />
            </g>
          )}

          {/* Info box */}
          <rect x={12} y={12} width={175} height={90} rx={6}
            fill="white" fillOpacity={0.92} stroke="#e5e7eb" strokeWidth={1.5} />
          <text x={99} y={30} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily="monospace">
            eigenvalues
          </text>
          <text x={99} y={48} textAnchor="middle" fontSize={12} fill="#1f2937" fontFamily="monospace" fontWeight="bold">
            λ₁={l1.toFixed(3)}, λ₂={l2.toFixed(3)}
          </text>
          <text x={99} y={64} textAnchor="middle" fontSize={11} fill="#6b7280" fontFamily="monospace">
            sig = ({p}, {q})
          </text>
          <text x={99} y={82} textAnchor="middle" fontSize={11} fill={classColor} fontFamily="monospace" fontWeight="bold">
            {cls}
          </text>
        </svg>
      </div>
      <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2 flex items-center gap-4 flex-wrap text-[11px]">
        <MatrixEditor A={A} onChange={e => { onChange(e); handleReset(); }} />
        <div className="w-px h-5 bg-gray-200" />
        {/* Animate diagonalization button */}
        <button
          onClick={playing ? handleReset : handlePlay}
          className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
        >
          {playing ? 'Reset' : 'Diagonalize'}
        </button>
        <input type="range" min={0} max={1} step={0.01}
          value={Math.min(1, animT)}
          onChange={e => { setAnimT(parseFloat(e.target.value)); setPlaying(false); }}
          className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
        <div className="w-px h-5 bg-gray-200" />
        <span style={{ color: classColor }} className="font-bold text-[10px] uppercase tracking-wider">
          {cls}
        </span>
        <span className="text-gray-500">sig = <span className="font-mono font-bold text-gray-800">({p},{q})</span></span>
        <span className="text-gray-400 text-[10px]">
          <span className="inline-block w-3 h-1 bg-blue-500 rounded mx-1" />λ &gt; 0
          <span className="inline-block w-3 h-1 bg-red-500 rounded mx-1 ml-2" />λ &lt; 0
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_A: Matrix2x2 = [2, 0.5, 0.5, 1];

export const BilinearFormSim = ({
  initialMatrix = DEFAULT_A,
}: {
  initialMatrix?: Matrix2x2;
}) => {
  const [mode, setMode] = useState<Mode>('quadratic');
  const [A, setA] = useState<Matrix2x2>(initialMatrix);

  const tabs: { id: Mode; label: string }[] = [
    { id: 'quadratic', label: 'Quadratic Form' },
    { id: 'bilinear', label: 'Bilinear Form' },
    { id: 'signature', label: 'Signature' },
  ];

  const handleMatrixChange = useCallback((newA: Matrix2x2) => setA(newA), []);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 bg-white/70 backdrop-blur-sm px-3 pt-2 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${
              mode === tab.id
                ? 'bg-white border border-b-white border-gray-200 text-indigo-700 shadow-sm -mb-px'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mode content */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        {mode === 'quadratic' && <QuadraticMode A={A} onChange={handleMatrixChange} />}
        {mode === 'bilinear' && <BilinearMode A={A} onChange={handleMatrixChange} />}
        {mode === 'signature' && <SignatureMode A={A} onChange={handleMatrixChange} />}
      </div>
    </div>
  );
};

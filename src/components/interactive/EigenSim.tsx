import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

/**
 * EigenSim
 * Interactive SVG visualization of eigenvalues, eigenvectors, and diagonalization
 * for a 2×2 real matrix. Supports three modes:
 *   - eigenvectors: unit circle image, eigenvector arrows, animated transformation
 *   - diagonalization: A = PDP⁻¹ decomposition, drag vector to see eigenbasis decomposition
 *   - dynamics: iterated application A^n on a set of points, spiral for complex eigenvalues
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'eigenvectors' | 'diagonalization' | 'dynamics';

interface ComplexNum {
  re: number;
  im: number;
}

interface EigenResult {
  lambda1: ComplexNum;
  lambda2: ComplexNum;
  // Real eigenvectors (only valid when eigenvalues are real)
  v1: [number, number] | null;
  v2: [number, number] | null;
  isComplex: boolean;
  discriminant: number;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Compute eigenvalues/vectors for 2×2 matrix [[a,b],[c,d]] */
function computeEigen(a: number, b: number, c: number, d: number): EigenResult {
  // Characteristic polynomial: λ² - (a+d)λ + (ad-bc) = 0
  const trace = a + d;
  const det = a * d - b * c;
  const discriminant = trace * trace - 4 * det;

  if (discriminant >= 0) {
    const sqrtDisc = Math.sqrt(discriminant);
    const lambda1 = (trace + sqrtDisc) / 2;
    const lambda2 = (trace - sqrtDisc) / 2;

    // Eigenvector for lambda1
    let v1: [number, number] | null = null;
    let v2: [number, number] | null = null;

    const computeVec = (lambda: number): [number, number] | null => {
      // (A - λI)v = 0
      // Row 1: (a-λ)x + b*y = 0
      // Row 2: c*x + (d-λ)y = 0
      const rowA = [a - lambda, b];
      const rowB = [c, d - lambda];

      // Find a non-trivial solution
      if (Math.abs(rowA[0]) > 1e-10 || Math.abs(rowA[1]) > 1e-10) {
        if (Math.abs(rowA[0]) > Math.abs(rowA[1])) {
          // x = -b/row[0], y = 1
          const vx = -rowA[1] / rowA[0];
          const vy = 1;
          const norm = Math.sqrt(vx * vx + vy * vy);
          return [vx / norm, vy / norm];
        } else {
          // x = 1, y = -row[0]/row[1]
          const vx = 1;
          const vy = -rowA[0] / rowA[1];
          const norm = Math.sqrt(vx * vx + vy * vy);
          return [vx / norm, vy / norm];
        }
      } else if (Math.abs(rowB[0]) > 1e-10 || Math.abs(rowB[1]) > 1e-10) {
        if (Math.abs(rowB[0]) > Math.abs(rowB[1])) {
          const vx = -rowB[1] / rowB[0];
          const vy = 1;
          const norm = Math.sqrt(vx * vx + vy * vy);
          return [vx / norm, vy / norm];
        } else {
          const vx = 1;
          const vy = -rowB[0] / rowB[1];
          const norm = Math.sqrt(vx * vx + vy * vy);
          return [vx / norm, vy / norm];
        }
      }
      return [1, 0]; // degenerate
    };

    v1 = computeVec(lambda1);
    v2 = Math.abs(lambda1 - lambda2) > 1e-10 ? computeVec(lambda2) : null;
    if (v2 === null && v1 !== null) {
      // Repeated eigenvalue — take any perpendicular
      v2 = [-v1[1], v1[0]];
    }

    return {
      lambda1: { re: lambda1, im: 0 },
      lambda2: { re: lambda2, im: 0 },
      v1,
      v2,
      isComplex: false,
      discriminant,
    };
  } else {
    // Complex eigenvalues: λ = (trace ± i√|disc|) / 2
    const imagPart = Math.sqrt(-discriminant) / 2;
    return {
      lambda1: { re: trace / 2, im: imagPart },
      lambda2: { re: trace / 2, im: -imagPart },
      v1: null,
      v2: null,
      isComplex: true,
      discriminant,
    };
  }
}

/** Apply 2×2 matrix [[a,b],[c,d]] to vector [x,y] */
function matApply(a: number, b: number, c: number, d: number, x: number, y: number): [number, number] {
  return [a * x + b * y, c * x + d * y];
}

/** Compute A^n applied to [x, y] iteratively */
function matPow(a: number, b: number, c: number, d: number, n: number, x: number, y: number): [number, number] {
  let px = x, py = y;
  for (let i = 0; i < n; i++) {
    [px, py] = matApply(a, b, c, d, px, py);
  }
  return [px, py];
}

/** Format complex number for display */
function fmtComplex(c: ComplexNum, decimals = 2): string {
  const re = c.re.toFixed(decimals);
  const absIm = Math.abs(c.im).toFixed(decimals);
  if (Math.abs(c.im) < 1e-9) return re;
  const sign = c.im >= 0 ? '+' : '−';
  return `${re} ${sign} ${absIm}i`;
}

/** Format real number for display */
function fmt(v: number, d = 2): string {
  return v.toFixed(d);
}

// ---------------------------------------------------------------------------
// SVG coordinate helpers
// ---------------------------------------------------------------------------

const SVG_W = 500;
const SVG_H = 500;
const ORIGIN_X = SVG_W / 2;
const ORIGIN_Y = SVG_H / 2;
const SCALE = 90; // math units → SVG pixels (1 unit = 90px)

function toSVG(x: number, y: number): [number, number] {
  return [ORIGIN_X + x * SCALE, ORIGIN_Y - y * SCALE];
}

function fromSVG(sx: number, sy: number): [number, number] {
  return [(sx - ORIGIN_X) / SCALE, -(sy - ORIGIN_Y) / SCALE];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Arrow head marker defs */
const ArrowDefs: React.FC = () => (
  <defs>
    <marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" />
    </marker>
    <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
    </marker>
    <marker id="arrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#22c55e" />
    </marker>
    <marker id="arrowOrange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#f97316" />
    </marker>
    <marker id="arrowGray" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#9ca3af" />
    </marker>
    <pattern id="eigen-grid" width="18" height="18" patternUnits="userSpaceOnUse">
      <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
    </pattern>
  </defs>
);

/** Axes */
const Axes: React.FC<{ label?: boolean }> = ({ label = true }) => (
  <g>
    <line x1={0} y1={ORIGIN_Y} x2={SVG_W} y2={ORIGIN_Y} stroke="#d1d5db" strokeWidth={1} />
    <line x1={ORIGIN_X} y1={0} x2={ORIGIN_X} y2={SVG_H} stroke="#d1d5db" strokeWidth={1} />
    {label && (
      <>
        <text x={SVG_W - 8} y={ORIGIN_Y - 6} fontSize="10" fill="#9ca3af" fontFamily="sans-serif">x</text>
        <text x={ORIGIN_X + 5} y={10} fontSize="10" fill="#9ca3af" fontFamily="sans-serif">y</text>
      </>
    )}
    {/* Tick marks at ±1, ±2 */}
    {[-2, -1, 1, 2].map(v => {
      const [sx] = toSVG(v, 0);
      const [, sy] = toSVG(0, v);
      return (
        <g key={v}>
          <line x1={sx} y1={ORIGIN_Y - 3} x2={sx} y2={ORIGIN_Y + 3} stroke="#d1d5db" strokeWidth={1} />
          <line x1={ORIGIN_X - 3} y1={sy} x2={ORIGIN_X + 3} y2={sy} stroke="#d1d5db" strokeWidth={1} />
          {v !== 0 && (
            <>
              <text x={sx} y={ORIGIN_Y + 13} textAnchor="middle" fontSize="8" fill="#d1d5db" fontFamily="monospace">{v}</text>
              <text x={ORIGIN_X - 8} y={sy + 3} textAnchor="end" fontSize="8" fill="#d1d5db" fontFamily="monospace">{v}</text>
            </>
          )}
        </g>
      );
    })}
  </g>
);

/** Styled arrow from (x1,y1) to (x2,y2) in SVG coords */
const Arrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  color?: string; markerEnd?: string; strokeWidth?: number; opacity?: number; dashed?: boolean;
}> = ({ x1, y1, x2, y2, color = '#3b82f6', markerEnd = 'url(#arrowBlue)', strokeWidth = 2, opacity = 1, dashed = false }) => (
  <line
    x1={x1} y1={y1} x2={x2} y2={y2}
    stroke={color} strokeWidth={strokeWidth}
    markerEnd={markerEnd}
    opacity={opacity}
    strokeDasharray={dashed ? '4 3' : undefined}
  />
);

// ---------------------------------------------------------------------------
// Matrix input
// ---------------------------------------------------------------------------
interface MatrixInputProps {
  matrix: [number, number, number, number];
  onChange: (idx: number, val: number) => void;
}

const MatrixInput: React.FC<MatrixInputProps> = ({ matrix, onChange }) => {
  const [rawVals, setRawVals] = useState<string[]>(matrix.map(v => String(v)));

  useEffect(() => {
    setRawVals(matrix.map(v => String(v)));
  }, [matrix]);

  const handleChange = (idx: number, raw: string) => {
    const next = [...rawVals];
    next[idx] = raw;
    setRawVals(next);
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange(idx, num);
  };

  const inputCls = "w-10 h-8 text-center text-sm font-mono bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-800";

  return (
    <div className="flex items-center gap-1 select-none">
      <span className="text-gray-300 text-lg font-thin">[</span>
      <div className="grid grid-cols-2 gap-1">
        <input className={inputCls} value={rawVals[0]} onChange={e => handleChange(0, e.target.value)} />
        <input className={inputCls} value={rawVals[1]} onChange={e => handleChange(1, e.target.value)} />
        <input className={inputCls} value={rawVals[2]} onChange={e => handleChange(2, e.target.value)} />
        <input className={inputCls} value={rawVals[3]} onChange={e => handleChange(3, e.target.value)} />
      </div>
      <span className="text-gray-300 text-lg font-thin">]</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preset matrices
// ---------------------------------------------------------------------------
const PRESETS: { label: string; matrix: [number, number, number, number] }[] = [
  { label: 'Diagonal', matrix: [2, 0, 0, 0.5] },
  { label: 'Rotation 45°', matrix: [0.707, -0.707, 0.707, 0.707] },
  { label: 'Shear', matrix: [1, 1, 0, 1] },
  { label: 'Stretch', matrix: [3, 0, 0, 0.3] },
  { label: 'Complex', matrix: [0.8, -0.6, 0.6, 0.8] },
  { label: 'Saddle', matrix: [2, 0, 0, -0.5] },
];

// ---------------------------------------------------------------------------
// EigenSim main component
// ---------------------------------------------------------------------------

export const EigenSim: React.FC = () => {
  const [mode, setMode] = useState<Mode>('eigenvectors');
  const [matrix, setMatrix] = useState<[number, number, number, number]>([2, 1, 0, 0.5]);
  const [animT, setAnimT] = useState(0); // 0=identity, 1=full transform
  const [isPlaying, setIsPlaying] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const dirRef = useRef<1 | -1>(1);

  // Diagonalization mode: draggable vector
  const [diagVec, setDiagVec] = useState<[number, number]>([1.2, 0.8]);
  const draggingDiag = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Dynamics mode
  const [dynStep, setDynStep] = useState(0);
  const [dynSpeed, setDynSpeed] = useState(0.5);
  const dynAnimRef = useRef<number | null>(null);
  const dynLastTime = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Derived: eigenvalues/vectors
  // ---------------------------------------------------------------------------
  const [a, b, c, d] = matrix;
  const eigen = useMemo(() => computeEigen(a, b, c, d), [a, b, c, d]);

  // ---------------------------------------------------------------------------
  // Matrix entry editing
  // ---------------------------------------------------------------------------
  const handleMatrixChange = useCallback((idx: number, val: number) => {
    setMatrix(prev => {
      const next = [...prev] as [number, number, number, number];
      next[idx] = val;
      return next;
    });
    setAnimT(0);
    setIsPlaying(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Eigenvectors mode animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'eigenvectors' || !isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    const step = (time: number) => {
      if (time - lastTimeRef.current > 16) {
        setAnimT(prev => {
          let next = prev + dirRef.current * 0.012;
          if (next >= 1) { next = 1; dirRef.current = -1; }
          if (next <= 0) { next = 0; dirRef.current = 1; }
          return next;
        });
        lastTimeRef.current = time;
      }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, mode]);

  // ---------------------------------------------------------------------------
  // Dynamics mode animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'dynamics') {
      if (dynAnimRef.current) cancelAnimationFrame(dynAnimRef.current);
      return;
    }
    if (!isPlaying) {
      if (dynAnimRef.current) cancelAnimationFrame(dynAnimRef.current);
      return;
    }
    const interval = Math.max(100, 800 - dynSpeed * 700);
    const step = (time: number) => {
      if (time - dynLastTime.current > interval) {
        setDynStep(prev => Math.min(prev + 1, 20));
        dynLastTime.current = time;
      }
      dynAnimRef.current = requestAnimationFrame(step);
    };
    dynAnimRef.current = requestAnimationFrame(step);
    return () => { if (dynAnimRef.current) cancelAnimationFrame(dynAnimRef.current); };
  }, [isPlaying, mode, dynSpeed]);

  // Reset dynamics when mode changes or matrix changes
  useEffect(() => {
    setDynStep(0);
    setIsPlaying(false);
  }, [mode, matrix]);

  // ---------------------------------------------------------------------------
  // Interpolated matrix at time t: lerp(I, A, t)
  // ---------------------------------------------------------------------------
  const matT = useMemo((): [number, number, number, number] => {
    const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
    return [
      lerp(1, a, animT),
      lerp(0, b, animT),
      lerp(0, c, animT),
      lerp(1, d, animT),
    ];
  }, [a, b, c, d, animT]);

  // ---------------------------------------------------------------------------
  // Unit circle points (40 segments)
  // ---------------------------------------------------------------------------
  const unitCirclePoints = useMemo(() => {
    const N = 80;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const theta = (i / N) * Math.PI * 2;
      pts.push([Math.cos(theta), Math.sin(theta)]);
    }
    return pts;
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Eigenvectors mode
  // ---------------------------------------------------------------------------
  const renderEigenvectors = () => {
    const [ma, mb, mc, md] = matT;

    // Unit circle → ellipse via interpolated matrix
    const circlePathOrig = unitCirclePoints
      .map(([x, y]) => {
        const [sx, sy] = toSVG(x, y);
        return `${sx},${sy}`;
      })
      .join(' ');

    const circlePathTransformed = unitCirclePoints
      .map(([x, y]) => {
        const [tx, ty] = matApply(ma, mb, mc, md, x, y);
        const [sx, sy] = toSVG(tx, ty);
        return `${sx},${sy}`;
      })
      .join(' ');

    // Eigenvector arrows (only when real eigenvalues)
    const eigArrows: React.ReactNode[] = [];
    if (!eigen.isComplex) {
      const renderEigArrow = (vec: [number, number] | null, lambda: ComplexNum, color: string, markerId: string, label: string) => {
        if (!vec) return null;
        const scale = 2.2;
        // Under A(t), eigenvector gets scaled by lerp(1, λ, t)
        const lambdaT = 1 + (lambda.re - 1) * animT;
        const [ox, oy] = toSVG(0, 0);
        const [tx, ty] = toSVG(vec[0] * scale * lambdaT, vec[1] * scale * lambdaT);
        const [ux, uy] = toSVG(vec[0] * scale, vec[1] * scale); // untransformed direction
        return (
          <g key={label}>
            {/* untransformed eigenvector (dashed) */}
            <line x1={ox} y1={oy} x2={ux} y2={uy} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.3} />
            {/* transformed eigenvector */}
            <line x1={ox} y1={oy} x2={tx} y2={ty} stroke={color} strokeWidth={2.5} markerEnd={`url(#arrow${markerId})`} />
            {/* label: λ value */}
            <text x={tx + 6} y={ty + 4} fontSize="11" fill={color} fontFamily="monospace" fontWeight="700">
              λ={fmt(lambda.re)}
            </text>
          </g>
        );
      };

      eigArrows.push(renderEigArrow(eigen.v1, eigen.lambda1, '#3b82f6', 'Blue', 'v₁'));
      eigArrows.push(renderEigArrow(eigen.v2, eigen.lambda2, '#ef4444', 'Red', 'v₂'));
    } else {
      // Complex eigenvalues: show rotation annotation
      const r = Math.sqrt(eigen.lambda1.re ** 2 + eigen.lambda1.im ** 2);
      const theta = Math.atan2(eigen.lambda1.im, eigen.lambda1.re);
      const [cx, cy] = toSVG(0, 0);
      eigArrows.push(
        <g key="complex-annotation">
          <text x={cx + 10} y={cy - 10} fontSize="11" fill="#8b5cf6" fontFamily="monospace">
            |λ| = {r.toFixed(3)},  arg = {(theta * 180 / Math.PI).toFixed(1)}°
          </text>
          <text x={cx + 10} y={cy + 8} fontSize="10" fill="#8b5cf6" fontFamily="monospace" opacity={0.7}>
            (complex eigenvalues — rotation+scale)
          </text>
        </g>
      );
    }

    return (
      <g>
        <rect width={SVG_W} height={SVG_H} fill="url(#eigen-grid)" />
        <Axes />
        {/* Original unit circle */}
        <polyline
          points={circlePathOrig}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        {/* Transformed ellipse */}
        <polyline
          points={circlePathTransformed}
          fill="rgba(99,102,241,0.07)"
          stroke="#6366f1"
          strokeWidth={2}
        />
        {/* Eigenvectors */}
        {eigArrows}
        {/* Origin dot */}
        <circle cx={ORIGIN_X} cy={ORIGIN_Y} r={3} fill="#374151" />
        {/* t label */}
        <text x={10} y={20} fontSize="10" fill="#6b7280" fontFamily="monospace">
          t = {fmt(animT, 2)}
        </text>
      </g>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: Diagonalization mode
  // ---------------------------------------------------------------------------
  const renderDiagonalization = () => {
    if (eigen.isComplex) {
      return (
        <g>
          <rect width={SVG_W} height={SVG_H} fill="url(#eigen-grid)" />
          <Axes />
          <text x={SVG_W / 2} y={SVG_H / 2 - 10} textAnchor="middle" fontSize="13" fill="#8b5cf6" fontFamily="sans-serif">
            Complex eigenvalues — no real diagonalization
          </text>
          <text x={SVG_W / 2} y={SVG_H / 2 + 12} textAnchor="middle" fontSize="11" fill="#9ca3af" fontFamily="monospace">
            λ = {fmtComplex(eigen.lambda1)} , {fmtComplex(eigen.lambda2)}
          </text>
        </g>
      );
    }

    const { v1, v2, lambda1, lambda2 } = eigen;
    if (!v1 || !v2) return null;

    // Eigenbasis vectors (columns of P)
    const e1 = v1;
    const e2 = v2;

    // Decompose diagVec in eigenbasis: diagVec = α·v1 + β·v2
    // Solve 2×2 system [v1 | v2] [α; β] = diagVec
    const det2 = e1[0] * e2[1] - e1[1] * e2[0];
    let alpha = 0, beta = 0;
    if (Math.abs(det2) > 1e-10) {
      alpha = (diagVec[0] * e2[1] - diagVec[1] * e2[0]) / det2;
      beta = (e1[0] * diagVec[1] - e1[1] * diagVec[0]) / det2;
    }

    // A * diagVec = α·λ1·v1 + β·λ2·v2
    const result: [number, number] = [
      alpha * lambda1.re * e1[0] + beta * lambda2.re * e2[0],
      alpha * lambda1.re * e1[1] + beta * lambda2.re * e2[1],
    ];

    // Direct computation for verification
    const directResult = matApply(a, b, c, d, diagVec[0], diagVec[1]);

    const [ox, oy] = toSVG(0, 0);

    // SVG coords
    const [vx, vy] = toSVG(diagVec[0], diagVec[1]);
    const [rx, ry] = toSVG(result[0], result[1]);
    const [v1x, v1y] = toSVG(e1[0] * 2, e1[1] * 2);
    const [v2x, v2y] = toSVG(e2[0] * 2, e2[1] * 2);
    const [comp1x, comp1y] = toSVG(alpha * e1[0], alpha * e1[1]);
    const [comp2x, comp2y] = toSVG(beta * e2[0], beta * e2[1]);

    // Drag handlers
    const onPointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      draggingDiag.current = true;
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!draggingDiag.current || !svgRef.current) return;
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svg = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
      const [mx, my] = fromSVG(svg.x, svg.y);
      const clampedX = Math.max(-2.5, Math.min(2.5, mx));
      const clampedY = Math.max(-2.5, Math.min(2.5, my));
      setDiagVec([clampedX, clampedY]);
    };
    const onPointerUp = () => { draggingDiag.current = false; };

    return (
      <g onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <rect width={SVG_W} height={SVG_H} fill="url(#eigen-grid)" />
        <Axes />

        {/* Eigenvector basis arrows (dim) */}
        <line x1={ox} y1={oy} x2={v1x} y2={v1y} stroke="#3b82f6" strokeWidth={2} markerEnd="url(#arrowBlue)" opacity={0.5} strokeDasharray="5 3" />
        <line x1={ox} y1={oy} x2={v2x} y2={v2y} stroke="#ef4444" strokeWidth={2} markerEnd="url(#arrowRed)" opacity={0.5} strokeDasharray="5 3" />
        <text x={v1x + 5} y={v1y + 4} fontSize="10" fill="#3b82f6" fontFamily="monospace" opacity={0.7}>v₁ (λ={fmt(lambda1.re)})</text>
        <text x={v2x + 5} y={v2y + 4} fontSize="10" fill="#ef4444" fontFamily="monospace" opacity={0.7}>v₂ (λ={fmt(lambda2.re)})</text>

        {/* Decomposition components (faint) */}
        <line x1={ox} y1={oy} x2={comp1x} y2={comp1y} stroke="#3b82f6" strokeWidth={1.5} opacity={0.35} strokeDasharray="3 3" />
        <line x1={ox} y1={oy} x2={comp2x} y2={comp2y} stroke="#ef4444" strokeWidth={1.5} opacity={0.35} strokeDasharray="3 3" />

        {/* Input vector */}
        <line x1={ox} y1={oy} x2={vx} y2={vy} stroke="#6366f1" strokeWidth={2.5} markerEnd="url(#arrowGray)" />
        <text x={vx + 6} y={vy - 5} fontSize="11" fill="#6366f1" fontFamily="monospace" fontWeight="700">v</text>

        {/* Result vector A·v */}
        <line x1={ox} y1={oy} x2={rx} y2={ry} stroke="#22c55e" strokeWidth={2.5} markerEnd="url(#arrowGreen)" />
        <text x={rx + 6} y={ry - 5} fontSize="11" fill="#22c55e" fontFamily="monospace" fontWeight="700">Av</text>

        {/* Draggable handle */}
        <circle
          cx={vx} cy={vy} r={7}
          fill="#6366f1"
          stroke="white" strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={onPointerDown}
        />

        {/* Info panel */}
        <g transform="translate(8, 8)">
          <rect width={210} height={80} rx={6} fill="white" stroke="#e5e7eb" strokeWidth={1} opacity={0.95} />
          <text x={8} y={18} fontSize="9" fill="#9ca3af" fontFamily="monospace" fontWeight="600">DECOMPOSITION  v = αv₁ + βv₂</text>
          <text x={8} y={34} fontSize="10" fill="#374151" fontFamily="monospace">
            α = {fmt(alpha, 3)},  β = {fmt(beta, 3)}
          </text>
          <text x={8} y={50} fontSize="9" fill="#9ca3af" fontFamily="monospace" fontWeight="600">Av = αλ₁v₁ + βλ₂v₂</text>
          <text x={8} y={66} fontSize="10" fill="#22c55e" fontFamily="monospace">
            Av = ({fmt(directResult[0], 2)}, {fmt(directResult[1], 2)})
          </text>
        </g>
      </g>
    );
  };

  // ---------------------------------------------------------------------------
  // Initial points for dynamics
  // ---------------------------------------------------------------------------
  const initialPoints = useMemo(() => {
    const pts: [number, number][] = [];
    // A ring of points at radius 1
    const N = 12;
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2;
      pts.push([Math.cos(theta), Math.sin(theta)]);
    }
    // A few extra interior points
    pts.push([0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]);
    return pts;
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Dynamics mode
  // ---------------------------------------------------------------------------
  const renderDynamics = () => {
    const maxSteps = dynStep;
    const colors = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

    // For each initial point, compute trajectory up to maxSteps
    const trajectories = initialPoints.map(pt => {
      const traj: [number, number][] = [pt];
      for (let k = 1; k <= maxSteps; k++) {
        const prev = traj[k - 1];
        const next = matApply(a, b, c, d, prev[0], prev[1]);
        traj.push(next);
      }
      return traj;
    });

    // Check if points are blowing up
    const lastPts = trajectories.map(t => t[t.length - 1]);
    const maxDist = Math.max(...lastPts.map(([x, y]) => Math.sqrt(x * x + y * y)));
    const isConverging = maxDist < 1;
    const isDiverging = maxDist > 10;

    // Eigenvalue magnitude for color-coding
    const lambda1Mag = Math.sqrt(eigen.lambda1.re ** 2 + eigen.lambda1.im ** 2);
    const lambda2Mag = Math.sqrt(eigen.lambda2.re ** 2 + eigen.lambda2.im ** 2);
    const dominantMag = Math.max(lambda1Mag, lambda2Mag);

    return (
      <g>
        <rect width={SVG_W} height={SVG_H} fill="url(#eigen-grid)" />
        <Axes />

        {/* Eigenvector lines (if real) */}
        {!eigen.isComplex && eigen.v1 && (
          <line
            x1={toSVG(-eigen.v1[0] * 5, -eigen.v1[1] * 5)[0]}
            y1={toSVG(-eigen.v1[0] * 5, -eigen.v1[1] * 5)[1]}
            x2={toSVG(eigen.v1[0] * 5, eigen.v1[1] * 5)[0]}
            y2={toSVG(eigen.v1[0] * 5, eigen.v1[1] * 5)[1]}
            stroke="#3b82f6" strokeWidth={1} opacity={0.25} strokeDasharray="6 4"
          />
        )}
        {!eigen.isComplex && eigen.v2 && (
          <line
            x1={toSVG(-eigen.v2[0] * 5, -eigen.v2[1] * 5)[0]}
            y1={toSVG(-eigen.v2[0] * 5, -eigen.v2[1] * 5)[1]}
            x2={toSVG(eigen.v2[0] * 5, eigen.v2[1] * 5)[0]}
            y2={toSVG(eigen.v2[0] * 5, eigen.v2[1] * 5)[1]}
            stroke="#ef4444" strokeWidth={1} opacity={0.25} strokeDasharray="6 4"
          />
        )}

        {/* Trajectories */}
        {trajectories.map((traj, ptIdx) => {
          const color = colors[ptIdx % colors.length];
          // Draw path segments with fading opacity
          const segments: React.ReactNode[] = [];
          for (let k = 0; k < traj.length - 1; k++) {
            const [x1, y1] = traj[k];
            const [x2, y2] = traj[k + 1];
            // Clamp to visible range
            if (Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) > 4) continue;
            const [sx1, sy1] = toSVG(x1, y1);
            const [sx2, sy2] = toSVG(x2, y2);
            const fade = 0.3 + 0.7 * (k / Math.max(1, traj.length - 1));
            segments.push(
              <line key={k}
                x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                stroke={color} strokeWidth={1.5} opacity={fade}
              />
            );
          }
          // Current point dot
          const last = traj[traj.length - 1];
          if (Math.max(Math.abs(last[0]), Math.abs(last[1])) <= 4) {
            const [lx, ly] = toSVG(last[0], last[1]);
            segments.push(
              <circle key="dot" cx={lx} cy={ly} r={4} fill={color} stroke="white" strokeWidth={1.5} />
            );
          }
          return <g key={ptIdx}>{segments}</g>;
        })}

        {/* Status overlay */}
        <g transform="translate(8, 8)">
          <rect width={220} height={86} rx={6} fill="white" stroke="#e5e7eb" strokeWidth={1} opacity={0.95} />
          <text x={8} y={18} fontSize="9" fill="#9ca3af" fontFamily="monospace" fontWeight="600">DYNAMICS  step {maxSteps}</text>
          {eigen.isComplex ? (
            <>
              <text x={8} y={34} fontSize="10" fill="#8b5cf6" fontFamily="monospace">|λ| = {dominantMag.toFixed(3)} (complex)</text>
              <text x={8} y={50} fontSize="9" fill="#6b7280" fontFamily="sans-serif">Spiral {dominantMag < 1 ? 'inward (stable)' : dominantMag > 1 ? 'outward (unstable)' : '(limit cycle)'}</text>
            </>
          ) : (
            <>
              <text x={8} y={34} fontSize="10" fill="#374151" fontFamily="monospace">
                λ₁={fmt(eigen.lambda1.re)}, λ₂={fmt(eigen.lambda2.re)}
              </text>
              <text x={8} y={50} fontSize="9" fill="#6b7280" fontFamily="sans-serif">
                {isConverging ? 'Converging to origin (stable)' : isDiverging ? 'Diverging (unstable)' : 'Bounded dynamics'}
              </text>
            </>
          )}
          <text x={8} y={66} fontSize="9" fill="#9ca3af" fontFamily="monospace">|λ|_max = {dominantMag.toFixed(3)}</text>
          <rect
            x={8} y={72} width={60} height={8} rx={2}
            fill={dominantMag < 1 ? '#22c55e' : dominantMag > 1 ? '#ef4444' : '#f59e0b'}
            opacity={0.7}
          />
          <text x={72} y={80} fontSize="8" fill="#6b7280" fontFamily="monospace">
            {dominantMag < 1 ? 'stable' : dominantMag > 1 ? 'unstable' : 'neutral'}
          </text>
        </g>
      </g>
    );
  };

  // ---------------------------------------------------------------------------
  // Mode tabs
  // ---------------------------------------------------------------------------
  const tabs: { id: Mode; label: string }[] = [
    { id: 'eigenvectors', label: 'Eigenvectors' },
    { id: 'diagonalization', label: 'Diagonalization' },
    { id: 'dynamics', label: 'Dynamics' },
  ];

  // ---------------------------------------------------------------------------
  // Eigenvalue summary
  // ---------------------------------------------------------------------------
  const eigenSummary = (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <span className="text-gray-400">λ₁ =</span>
      <span className={eigen.isComplex ? 'text-purple-600 font-semibold' : 'text-blue-600 font-semibold'}>
        {fmtComplex(eigen.lambda1)}
      </span>
      <span className="text-gray-300">·</span>
      <span className="text-gray-400">λ₂ =</span>
      <span className={eigen.isComplex ? 'text-purple-600 font-semibold' : 'text-red-500 font-semibold'}>
        {fmtComplex(eigen.lambda2)}
      </span>
      {eigen.isComplex && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-500 border border-purple-100 font-sans">complex</span>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden flex flex-col font-sans">

      {/* Header: mode tabs + matrix input */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100 flex-wrap gap-3">

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                mode === tab.id
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Matrix input */}
        <MatrixInput matrix={matrix} onChange={handleMatrixChange} />
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => {
              setMatrix(p.matrix);
              setAnimT(0);
              setIsPlaying(false);
              setDynStep(0);
            }}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* SVG Canvas */}
      <div className="relative select-none bg-gray-50/40" style={{ height: '460px' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          style={{ display: 'block' }}
        >
          <ArrowDefs />
          {mode === 'eigenvectors' && renderEigenvectors()}
          {mode === 'diagonalization' && renderDiagonalization()}
          {mode === 'dynamics' && renderDynamics()}
        </svg>
      </div>

      {/* Bottom control bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 flex items-center gap-4 flex-wrap text-[11px]">

        {/* Eigenvalue summary */}
        {eigenSummary}

        <div className="w-px h-4 bg-gray-200" />

        {/* Mode-specific controls */}
        {mode === 'eigenvectors' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-indigo-600 transition-colors active:scale-95"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-px" />}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-[10px]">t</span>
              <input
                type="range" min="0" max="1" step="0.01" value={animT}
                onChange={e => { setAnimT(parseFloat(e.target.value)); setIsPlaying(false); }}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
              />
              <span className="font-mono text-gray-600">{fmt(animT, 2)}</span>
            </div>
            <button
              onClick={() => { setAnimT(0); setIsPlaying(false); }}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {mode === 'diagonalization' && (
          <span className="text-gray-400 text-[10px] italic">drag the purple vector to decompose in eigenbasis</span>
        )}

        {mode === 'dynamics' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-indigo-600 transition-colors active:scale-95"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-px" />}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-[10px]">speed</span>
              <input
                type="range" min="0" max="1" step="0.05" value={dynSpeed}
                onChange={e => setDynSpeed(parseFloat(e.target.value))}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-[10px]">step</span>
              <input
                type="range" min="0" max="20" step="1" value={dynStep}
                onChange={e => { setDynStep(parseInt(e.target.value)); setIsPlaying(false); }}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
              />
              <span className="font-mono text-gray-600">{dynStep}</span>
            </div>
            <button
              onClick={() => { setDynStep(0); setIsPlaying(false); }}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="ml-auto text-[10px] font-mono text-gray-400">
          det={fmt(a * d - b * c, 2)} · tr={fmt(a + d, 2)}
        </div>
      </div>
    </div>
  );
};

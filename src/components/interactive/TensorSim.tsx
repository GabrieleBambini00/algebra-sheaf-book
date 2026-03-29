import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

/**
 * TensorSim
 * SVG-based interactive visualization of tensor products, multilinear maps,
 * and tensor components for an algebra/sheaf theory textbook.
 *
 * Modes:
 *   "product"    — tensor product v ⊗ w as a parallelogram, bilinearity demo
 *   "multilinear" — bilinear map B: V × W → ℝ with linearity animation
 *   "components" — tensor T = Σ Tⁱʲ eᵢ ⊗ fⱼ component decomposition
 */

// ── Constants ────────────────────────────────────────────────────────────────

const VB_W = 700;
const VB_H = 500;

// Coordinate system helpers: origin in the SVG frame for each "space panel"
// Panel A (left):  origin at (165, 250)
// Panel B (right): origin at (535, 250)
// Scale: 1 unit = 60px
const SCALE = 60;

function toSvgX(ox: number, ux: number) { return ox + ux * SCALE; }
function toSvgY(oy: number, uy: number) { return oy - uy * SCALE; } // y flipped

// ── Colour palette (consistent with project) ─────────────────────────────────
const COL = {
  v:        '#3b82f6', // blue  — vector v
  w:        '#ef4444', // red   — vector w
  v1:       '#6366f1', // indigo — v₁
  v2:       '#8b5cf6', // violet — v₂
  tensor:   '#10b981', // emerald — v ⊗ w parallelogram fill
  tensorStroke: '#059669',
  alpha:    '#f59e0b', // amber  — scaled vector αv
  grid:     '#f3f4f6',
  axis:     '#9ca3af',
  text:     '#1e293b',
  subtext:  '#64748b',
  badge:    '#f1f5f9',
  badgeBorder: '#cbd5e1',
} as const;

// ── Shared SVG primitives ─────────────────────────────────────────────────────

function Arrow({
  x1, y1, x2, y2, color, width = 2, dashed = false, markerId,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; width?: number; dashed?: boolean; markerId: string;
}) {
  return (
    <>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8"
          refX="7" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L8,3.5 z" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={width}
        strokeDasharray={dashed ? '5 4' : undefined}
        markerEnd={`url(#${markerId})`} />
    </>
  );
}

function Grid({ ox, oy, range = 3 }: { ox: number; oy: number; range?: number }) {
  const lines: React.ReactNode[] = [];
  for (let i = -range; i <= range; i++) {
    const isAxis = i === 0;
    lines.push(
      <line key={`gv${i}`}
        x1={toSvgX(ox, i)} y1={toSvgY(oy, -range - 0.5)}
        x2={toSvgX(ox, i)} y2={toSvgY(oy, range + 0.5)}
        stroke={isAxis ? COL.axis : COL.grid} strokeWidth={isAxis ? 1.5 : 0.8} />,
      <line key={`gh${i}`}
        x1={toSvgX(ox, -range - 0.5)} y1={toSvgY(oy, i)}
        x2={toSvgX(ox, range + 0.5)}  y2={toSvgY(oy, i)}
        stroke={isAxis ? COL.axis : COL.grid} strokeWidth={isAxis ? 1.5 : 0.8} />,
    );
  }
  return <>{lines}</>;
}

function TickLabels({ ox, oy, range = 3 }: { ox: number; oy: number; range?: number }) {
  const labels: React.ReactNode[] = [];
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue;
    labels.push(
      <text key={`tx${i}`} x={toSvgX(ox, i)} y={toSvgY(oy, 0) + 14}
        fontSize={8} textAnchor="middle" fill={COL.subtext} fontFamily="monospace">{i}</text>,
      <text key={`ty${i}`} x={toSvgX(ox, 0) - 10} y={toSvgY(oy, i) + 3}
        fontSize={8} textAnchor="end" fill={COL.subtext} fontFamily="monospace">{i}</text>,
    );
  }
  return <>{labels}</>;
}

// ── Draggable vector tip ──────────────────────────────────────────────────────

interface Vec2 { x: number; y: number; }

function useDraggableVec(
  init: Vec2,
  svgRef: React.RefObject<SVGSVGElement | null>,
  ox: number, oy: number,
): [Vec2, (v: Vec2) => void, {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}] {
  const [vec, setVec] = useState<Vec2>(init);
  const dragging = useRef(false);

  const clientToVec = useCallback((cx: number, cy: number): Vec2 => {
    if (!svgRef.current) return vec;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = VB_W / rect.width;
    const scaleY = VB_H / rect.height;
    const svgX = (cx - rect.left) * scaleX;
    const svgY = (cy - rect.top) * scaleY;
    const ux = (svgX - ox) / SCALE;
    const uy = -(svgY - oy) / SCALE;
    // clamp to [-3, 3]
    return {
      x: Math.max(-2.8, Math.min(2.8, Math.round(ux * 4) / 4)),
      y: Math.max(-2.8, Math.min(2.8, Math.round(uy * 4) / 4)),
    };
  }, [ox, oy, svgRef, vec]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setVec(clientToVec(e.clientX, e.clientY));
    };
    const onUp = () => { dragging.current = false; };
    const onTMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      setVec(clientToVec(t.clientX, t.clientY));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [clientToVec]);

  return [vec, setVec, { onMouseDown, onTouchStart }];
}

// ── VecArrow: arrow from origin to tip with draggable handle ─────────────────

function VecArrow({
  ox, oy, vec, color, label, markerId, handlers, dimLabel,
}: {
  ox: number; oy: number; vec: Vec2; color: string; label: string;
  markerId: string; handlers?: ReturnType<typeof useDraggableVec>[2];
  dimLabel?: string;
}) {
  const tipX = toSvgX(ox, vec.x);
  const tipY = toSvgY(oy, vec.y);
  const len = Math.sqrt(vec.x ** 2 + vec.y ** 2);
  if (len < 0.05) return null;
  // Shorten shaft to leave room for arrowhead
  const dx = (tipX - ox) / len / SCALE;
  const dy = (tipY - oy) / len / SCALE;
  const shaftEndX = tipX - dx * 10;
  const shaftEndY = tipY - dy * 10;

  return (
    <g>
      <Arrow x1={ox} y1={oy} x2={shaftEndX} y2={shaftEndY}
        color={color} width={2.5} markerId={markerId} />
      {/* Draggable tip handle */}
      <circle cx={tipX} cy={tipY} r={handlers ? 8 : 5}
        fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5}
        style={handlers ? { cursor: 'grab' } : undefined}
        {...handlers} />
      {/* Label badge */}
      <rect x={tipX + 6} y={tipY - 12} width={dimLabel ? 34 : 22} height={14}
        rx={4} fill="white" stroke={COL.badgeBorder} strokeWidth={1} fillOpacity={0.92} />
      <text x={tipX + 9} y={tipY - 2}
        fontSize={10} fontFamily="serif" fontStyle="italic" fill={color} fontWeight="bold">
        {label}{dimLabel ? <tspan fontStyle="normal" fontFamily="monospace" fontSize={8} fill={COL.subtext}> {dimLabel}</tspan> : null}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 1 — Tensor Product
// ─────────────────────────────────────────────────────────────────────────────

const OX_LEFT  = 175;
const OY_LEFT  = 260;
const OX_RIGHT = 530;
const OY_RIGHT = 260;

type BilinearSubMode = 'basic' | 'bilinear_v' | 'scalar';

function TensorProductMode() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [subMode, setSubMode] = useState<BilinearSubMode>('basic');
  const [alpha, setAlpha] = useState(1.5);

  // Vector v in V (left panel)
  const [v, , vHandlers] = useDraggableVec({ x: 1.5, y: 1.0 }, svgRef, OX_LEFT, OY_LEFT);
  // Vector w in W (right panel)
  const [w, , wHandlers] = useDraggableVec({ x: 1.0, y: 1.5 }, svgRef, OX_RIGHT, OY_RIGHT);
  // v₁ for bilinearity demo (v₁ + v₂) ⊗ w
  const [v1, , v1Handlers] = useDraggableVec({ x: 1.2, y: 0.5 }, svgRef, OX_LEFT, OY_LEFT);
  const [v2, , v2Handlers] = useDraggableVec({ x: 0.3, y: 1.3 }, svgRef, OX_LEFT, OY_LEFT);

  // Parallelogram vertices in SVG coords: origin, v, v+w, w
  // We map both v and w into a single "product space" displayed on the right panel
  // The parallelogram is rendered in a central area (350, 250)
  const CX = 350; const CY = 250; // center of product display

  const area = Math.abs(v.x * w.y - v.y * w.x);

  const effectiveV = subMode === 'scalar' ? { x: alpha * v.x, y: alpha * v.y } : v;
  const effectiveW = subMode === 'scalar' ? w : w;

  // Parallelogram points in SVG
  function pgon(vv: Vec2, ww: Vec2, ox: number, oy: number, sc: number = SCALE) {
    const P0 = { x: ox, y: oy };
    const P1 = { x: ox + vv.x * sc, y: oy - vv.y * sc };
    const P2 = { x: ox + vv.x * sc + ww.x * sc, y: oy - vv.y * sc - ww.y * sc };
    const P3 = { x: ox + ww.x * sc, y: oy - ww.y * sc };
    return `${P0.x},${P0.y} ${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`;
  }

  // For bilinearity: (v1+v2) ⊗ w  vs  v1⊗w + v2⊗w
  const vSum = { x: v1.x + v2.x, y: v1.y + v2.y };
  const areaSum = Math.abs(vSum.x * w.y - vSum.y * w.x);
  const area1   = Math.abs(v1.x  * w.y - v1.y  * w.x);
  const area2   = Math.abs(v2.x  * w.y - v2.y  * w.x);

  // Scale for central display (fit within ~200px box)
  const dispScale = SCALE * 0.85;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-full select-none touch-none"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Panel labels ─────────────────────────────────────────────── */}
      <rect x={12} y={12} width={316} height={22} rx={6}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={170} y={27} textAnchor="middle" fontSize={11}
        fontWeight="600" fill={COL.subtext} fontFamily="system-ui">
        V
      </text>

      <rect x={372} y={12} width={316} height={22} rx={6}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={530} y={27} textAnchor="middle" fontSize={11}
        fontWeight="600" fill={COL.subtext} fontFamily="system-ui">
        W
      </text>

      {/* ── Left panel: V ────────────────────────────────────────────── */}
      <Grid ox={OX_LEFT} oy={OY_LEFT} range={3} />
      <TickLabels ox={OX_LEFT} oy={OY_LEFT} range={2} />

      {subMode === 'bilinear_v' ? (
        <>
          {/* v₁ */}
          <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={v1} color={COL.v1}
            label="v₁" markerId="arr-v1" handlers={v1Handlers} />
          {/* v₂ */}
          <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={v2} color={COL.v2}
            label="v₂" markerId="arr-v2" handlers={v2Handlers} />
          {/* v₁ + v₂ dashed */}
          <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={vSum} color={COL.v}
            label="v₁+v₂" markerId="arr-vsum" />
          {/* parallelogram from v1 tip to vSum */}
          <line
            x1={toSvgX(OX_LEFT, v1.x)} y1={toSvgY(OY_LEFT, v1.y)}
            x2={toSvgX(OX_LEFT, vSum.x)} y2={toSvgY(OY_LEFT, vSum.y)}
            stroke={COL.v2} strokeWidth={1} strokeDasharray="4 3" />
          <line
            x1={toSvgX(OX_LEFT, v2.x)} y1={toSvgY(OY_LEFT, v2.y)}
            x2={toSvgX(OX_LEFT, vSum.x)} y2={toSvgY(OY_LEFT, vSum.y)}
            stroke={COL.v1} strokeWidth={1} strokeDasharray="4 3" />
        </>
      ) : (
        <>
          {/* Regular v */}
          <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={v} color={COL.v}
            label="v" markerId="arr-v" handlers={vHandlers} />
          {/* αv when scalar mode */}
          {subMode === 'scalar' && (
            <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={effectiveV} color={COL.alpha}
              label="αv" markerId="arr-av" />
          )}
        </>
      )}

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <line x1={350} y1={38} x2={350} y2={490} stroke={COL.grid} strokeWidth={1.5} strokeDasharray="6 4" />

      {/* ── Right panel: W ───────────────────────────────────────────── */}
      <Grid ox={OX_RIGHT} oy={OY_RIGHT} range={3} />
      <TickLabels ox={OX_RIGHT} oy={OY_RIGHT} range={2} />
      <VecArrow ox={OX_RIGHT} oy={OY_RIGHT} vec={w} color={COL.w}
        label="w" markerId="arr-w" handlers={wHandlers} />
      {subMode === 'scalar' && (
        <VecArrow ox={OX_RIGHT} oy={OY_RIGHT} vec={{ x: alpha * w.x, y: alpha * w.y }} color={COL.alpha}
          label="αw" markerId="arr-aw" />
      )}

      {/* ── Central tensor product display ───────────────────────────── */}
      {subMode === 'basic' && (
        <g>
          {/* v ⊗ w parallelogram centred */}
          <polygon points={pgon(v, w, CX, CY, dispScale)}
            fill={COL.tensor} fillOpacity={0.2}
            stroke={COL.tensorStroke} strokeWidth={1.5} />
          {/* Side arrows */}
          <Arrow x1={CX} y1={CY}
            x2={CX + v.x * dispScale - (v.x / Math.max(0.01, Math.sqrt(v.x**2+v.y**2))) * 10}
            y2={CY - v.y * dispScale + (v.y / Math.max(0.01, Math.sqrt(v.x**2+v.y**2))) * 10}
            color={COL.v} width={2} markerId="cp-v" />
          <Arrow x1={CX} y1={CY}
            x2={CX + w.x * dispScale - (w.x / Math.max(0.01, Math.sqrt(w.x**2+w.y**2))) * 10}
            y2={CY - w.y * dispScale + (w.y / Math.max(0.01, Math.sqrt(w.x**2+w.y**2))) * 10}
            color={COL.w} width={2} markerId="cp-w" />
          {/* Area label */}
          <text x={CX + (v.x + w.x) * dispScale * 0.4}
            y={CY - (v.y + w.y) * dispScale * 0.4}
            fontSize={10} fontFamily="monospace" fill={COL.tensorStroke}
            textAnchor="middle">
            |v⊗w| = {area.toFixed(2)}
          </text>
          {/* "⊗" symbol */}
          <text x={CX - 14} y={CY - 6} fontSize={9} fill={COL.subtext}
            fontFamily="serif">v⊗w</text>
        </g>
      )}

      {subMode === 'scalar' && (
        <g>
          {/* α(v⊗w) */}
          <polygon points={pgon(effectiveV, w, CX, CY, dispScale)}
            fill={COL.alpha} fillOpacity={0.15}
            stroke={COL.alpha} strokeWidth={1.5} />
          {/* v⊗w ghost */}
          <polygon points={pgon(v, w, CX, CY, dispScale)}
            fill="none" stroke={COL.tensorStroke} strokeWidth={1} strokeDasharray="4 3" />
          <text x={CX} y={CY - 12}
            fontSize={9} fontFamily="monospace" fill={COL.alpha} textAnchor="middle">
            α(v⊗w) area = {Math.abs(effectiveV.x * w.y - effectiveV.y * w.x).toFixed(2)}
          </text>
          <text x={CX} y={CY + 5}
            fontSize={9} fontFamily="monospace" fill={COL.tensorStroke} textAnchor="middle">
            v⊗w area = {area.toFixed(2)}
          </text>
        </g>
      )}

      {subMode === 'bilinear_v' && (
        <g>
          {/* (v1+v2)⊗w */}
          <polygon points={pgon(vSum, w, CX - 70, CY, dispScale * 0.75)}
            fill={COL.v} fillOpacity={0.15} stroke={COL.v} strokeWidth={1.5} />
          <text x={CX - 70} y={CY - Math.abs(vSum.y + w.y) * dispScale * 0.75 * 0.5 - 6}
            fontSize={8} fontFamily="monospace" fill={COL.v} textAnchor="middle">
            (v₁+v₂)⊗w
          </text>

          {/* = sign */}
          <text x={CX} y={CY - 10} fontSize={14} fontFamily="serif"
            fill={COL.text} textAnchor="middle">=</text>

          {/* v1⊗w */}
          <polygon points={pgon(v1, w, CX + 35, CY, dispScale * 0.75)}
            fill={COL.v1} fillOpacity={0.2} stroke={COL.v1} strokeWidth={1.5} />
          <text x={CX + 35 + (v1.x + w.x) * dispScale * 0.75 * 0.3}
            y={CY - (v1.y + w.y) * dispScale * 0.75 * 0.3}
            fontSize={8} fontFamily="monospace" fill={COL.v1} textAnchor="middle">
            v₁⊗w
          </text>

          {/* + sign */}
          <text x={CX + 95} y={CY - 10} fontSize={14} fontFamily="serif"
            fill={COL.text} textAnchor="middle">+</text>

          {/* v2⊗w */}
          <polygon points={pgon(v2, w, CX + 120, CY, dispScale * 0.75)}
            fill={COL.v2} fillOpacity={0.2} stroke={COL.v2} strokeWidth={1.5} />
          <text x={CX + 120 + (v2.x + w.x) * dispScale * 0.75 * 0.3}
            y={CY - (v2.y + w.y) * dispScale * 0.75 * 0.3}
            fontSize={8} fontFamily="monospace" fill={COL.v2} textAnchor="middle">
            v₂⊗w
          </text>

          {/* Area check */}
          <text x={CX} y={CY + 40} textAnchor="middle"
            fontSize={9} fontFamily="monospace" fill={COL.subtext}>
            {areaSum.toFixed(3)} ≈ {(area1 + area2).toFixed(3)}
            {Math.abs(areaSum - area1 - area2) < 0.01 ? '  ✓ bilinear' : ''}
          </text>
        </g>
      )}

      {/* ── Sub-mode selector tabs ────────────────────────────────────── */}
      {(['basic', 'scalar', 'bilinear_v'] as BilinearSubMode[]).map((m, i) => {
        const labels = ['v ⊗ w', '(αv)⊗w = α(v⊗w)', '(v₁+v₂)⊗w'];
        const active = subMode === m;
        const bx = 20 + i * 218;
        return (
          <g key={m} onClick={() => setSubMode(m)} style={{ cursor: 'pointer' }}>
            <rect x={bx} y={462} width={210} height={24} rx={6}
              fill={active ? '#1e293b' : COL.badge}
              stroke={active ? '#1e293b' : COL.badgeBorder} strokeWidth={1} />
            <text x={bx + 105} y={478} textAnchor="middle"
              fontSize={10} fontWeight={active ? '600' : '400'}
              fill={active ? 'white' : COL.subtext} fontFamily="system-ui">
              {labels[i]}
            </text>
          </g>
        );
      })}

      {/* ── Alpha slider label (scalar mode) ─────────────────────────── */}
      {subMode === 'scalar' && (
        <text x={350} y={450} textAnchor="middle" fontSize={10}
          fontFamily="monospace" fill={COL.alpha}>
          α = {alpha.toFixed(2)}  (use slider below)
        </text>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 2 — Multilinear Map
// ─────────────────────────────────────────────────────────────────────────────

type BilinearPreset = 'dot' | 'det' | 'cross';

function evalBilinear(preset: BilinearPreset, u: Vec2, v: Vec2): number {
  switch (preset) {
    case 'dot':  return u.x * v.x + u.y * v.y;
    case 'det':  return u.x * v.y - u.y * v.x;
    case 'cross': return Math.sqrt((u.x * v.y - u.y * v.x) ** 2); // |u×v| = |det|
  }
}

const PRESET_LABELS: Record<BilinearPreset, string> = {
  dot:   'B(u,v) = u·v',
  det:   'B(u,v) = det[u|v]',
  cross: 'B(u,v) = |u×v|',
};

function MultilinearMode() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [preset, setPreset] = useState<BilinearPreset>('dot');
  const [animating, setAnimating] = useState(false);
  const [fixedU, setFixedU] = useState(false); // true = fix u, vary v; false = fix v, vary u

  // The "free" input vector angle drives animation
  const [animAngle, setAnimAngle] = useState(0);
  const animRef = useRef<number | null>(null);
  const angleRef = useRef(0);

  // Static draggable vectors
  const [u, , uHandlers] = useDraggableVec({ x: 1.5, y: 0.5 }, svgRef, OX_LEFT, OY_LEFT);
  const [v, , vHandlers] = useDraggableVec({ x: 0.5, y: 1.5 }, svgRef, OX_RIGHT, OY_RIGHT);

  // During animation, one vector rotates
  const R = 1.8; // animation radius
  const animVec: Vec2 = { x: R * Math.cos(animAngle), y: R * Math.sin(animAngle) };
  const activeU = fixedU ? u : animVec;
  const activeV = fixedU ? animVec : v;

  // Output scalar
  const output = evalBilinear(preset, activeU, activeV);

  // Also compute linearity check: B(u, αv) = α B(u,v) for α ∈ {0.5, 2}
  const outputHalf  = evalBilinear(preset, u, { x: 0.5 * v.x, y: 0.5 * v.y });
  const outputDouble = evalBilinear(preset, u, { x: 2 * v.x, y: 2 * v.y });
  const outputBase   = evalBilinear(preset, u, v);

  const startAnim = () => {
    setAnimating(true);
    const tick = () => {
      angleRef.current += 0.025;
      setAnimAngle(angleRef.current);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };
  const stopAnim = () => {
    setAnimating(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // Output bar: map output to a bar height (max ±3 → ±120px bar)
  const BAR_MAX = 3.5;
  const barH = Math.max(-120, Math.min(120, (output / BAR_MAX) * 120));
  const barColor = output >= 0 ? '#10b981' : '#f59e0b';

  // Linearity trace: varying angle, record B values
  const tracePts = useMemo(() => {
    const pts: string[] = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const av: Vec2 = { x: R * Math.cos(a), y: R * Math.sin(a) };
      const freeU = fixedU ? u : av;
      const freeV = fixedU ? av : v;
      const val = evalBilinear(preset, freeU, freeV);
      // Map to x position (0..N → 0..330) and y (value → scaled)
      const px = 355 + (i / N) * 315;
      const py = 380 - (val / BAR_MAX) * 100;
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [preset, fixedU, u, v, R, BAR_MAX]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-full select-none touch-none"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Panel labels */}
      <rect x={12} y={12} width={316} height={22} rx={6}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={170} y={27} textAnchor="middle" fontSize={11}
        fontWeight="600" fill={COL.subtext}>V  (input u)</text>

      <rect x={372} y={12} width={316} height={22} rx={6}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={530} y={27} textAnchor="middle" fontSize={11}
        fontWeight="600" fill={COL.subtext}>W  (input v)</text>

      {/* Divider */}
      <line x1={350} y1={38} x2={350} y2={490} stroke={COL.grid} strokeWidth={1.5} strokeDasharray="6 4" />

      {/* Left panel */}
      <Grid ox={OX_LEFT} oy={OY_LEFT} range={3} />
      <TickLabels ox={OX_LEFT} oy={OY_LEFT} range={2} />
      {/* animated vector on left if !fixedU */}
      {animating && !fixedU ? (
        <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={animVec} color={COL.alpha}
          label="u" markerId="arr-mu-anim" />
      ) : (
        <VecArrow ox={OX_LEFT} oy={OY_LEFT} vec={u} color={COL.v}
          label="u" markerId="arr-mu" handlers={!animating ? uHandlers : undefined} />
      )}

      {/* Right panel */}
      <Grid ox={OX_RIGHT} oy={OY_RIGHT} range={3} />
      <TickLabels ox={OX_RIGHT} oy={OY_RIGHT} range={2} />
      {animating && fixedU ? (
        <VecArrow ox={OX_RIGHT} oy={OY_RIGHT} vec={animVec} color={COL.alpha}
          label="v" markerId="arr-mv-anim" />
      ) : (
        <VecArrow ox={OX_RIGHT} oy={OY_RIGHT} vec={v} color={COL.w}
          label="v" markerId="arr-mv" handlers={!animating ? vHandlers : undefined} />
      )}

      {/* ── Output display (right half, below fold) ──────────────────── */}
      {/* Output bar chart */}
      <text x={363} y={310} fontSize={11} fontWeight="600" fill={COL.text}
        fontFamily="system-ui">Output scalar B(u,v)</text>

      {/* Zero line */}
      <line x1={363} y1={380} x2={500} y2={380} stroke={COL.grid} strokeWidth={1} />
      {/* Bar */}
      <rect x={405} y={barH < 0 ? 380 : 380 - barH}
        width={40} height={Math.abs(barH) || 2}
        fill={barColor} fillOpacity={0.7} rx={3} />
      <text x={425} y={barH < 0 ? 380 + Math.abs(barH) + 12 : 380 - Math.abs(barH) - 5}
        textAnchor="middle" fontSize={11} fontFamily="monospace"
        fontWeight="bold" fill={barColor}>
        {output.toFixed(3)}
      </text>

      {/* Linearity check strip (static) */}
      {!animating && (
        <g>
          <text x={363} y={430} fontSize={9} fill={COL.subtext} fontFamily="monospace">
            Linearity in v:
          </text>
          <text x={363} y={443} fontSize={9} fill={COL.subtext} fontFamily="monospace">
            B(u,½v) = {outputHalf.toFixed(3)}  ½·B(u,v) = {(0.5 * outputBase).toFixed(3)}
          </text>
          <text x={363} y={456} fontSize={9} fill={COL.subtext} fontFamily="monospace">
            B(u,2v) = {outputDouble.toFixed(3)}   2·B(u,v) = {(2 * outputBase).toFixed(3)}
          </text>
        </g>
      )}

      {/* Animation trace */}
      {animating && (
        <g>
          <text x={363} y={315} fontSize={9} fill={COL.subtext} fontFamily="monospace">
            {fixedU ? 'Fixing u, varying v:' : 'Fixing v, varying u:'}
          </text>
          {/* trace graph axes */}
          <line x1={355} y1={285} x2={355} y2={470} stroke={COL.axis} strokeWidth={1} />
          <line x1={355} y1={380} x2={680} y2={380} stroke={COL.axis} strokeWidth={1} />
          <polyline points={tracePts} fill="none" stroke={COL.tensorStroke}
            strokeWidth={1.5} strokeLinejoin="round" />
          {/* Moving dot */}
          <circle
            cx={355 + (((angleRef.current % (Math.PI * 2)) / (Math.PI * 2)) * 315)}
            cy={380 - (output / BAR_MAX) * 100}
            r={4} fill={COL.alpha} />
          <text x={363} y={478} fontSize={9} fill={COL.subtext} fontFamily="monospace">
            → sinusoidal = linear in each input ✓
          </text>
        </g>
      )}

      {/* ── Controls ─────────────────────────────────────────────────── */}
      {/* Preset selector */}
      {(['dot', 'det', 'cross'] as BilinearPreset[]).map((p, i) => {
        const active = preset === p;
        const bx = 12 + i * 110;
        return (
          <g key={p} onClick={() => { setPreset(p); stopAnim(); }}
            style={{ cursor: 'pointer' }}>
            <rect x={bx} y={462} width={105} height={24} rx={6}
              fill={active ? '#1e293b' : COL.badge}
              stroke={active ? '#1e293b' : COL.badgeBorder} strokeWidth={1} />
            <text x={bx + 52} y={478} textAnchor="middle"
              fontSize={9} fontWeight={active ? '600' : '400'}
              fill={active ? 'white' : COL.subtext} fontFamily="monospace">
              {PRESET_LABELS[p]}
            </text>
          </g>
        );
      })}

      {/* Animate button */}
      <g onClick={() => animating ? stopAnim() : startAnim()} style={{ cursor: 'pointer' }}>
        <rect x={352} y={462} width={90} height={24} rx={6}
          fill={animating ? '#f59e0b' : COL.badge}
          stroke={animating ? '#d97706' : COL.badgeBorder} strokeWidth={1} />
        <text x={397} y={478} textAnchor="middle" fontSize={10}
          fontWeight="600" fill={animating ? 'white' : COL.subtext} fontFamily="system-ui">
          {animating ? '■ Stop' : '▶ Animate'}
        </text>
      </g>

      {/* Fix which input */}
      <g onClick={() => setFixedU(f => !f)} style={{ cursor: 'pointer' }}>
        <rect x={452} y={462} width={115} height={24} rx={6}
          fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
        <text x={509} y={478} textAnchor="middle" fontSize={9}
          fill={COL.subtext} fontFamily="system-ui">
          Fix: {fixedU ? 'u (vary v)' : 'v (vary u)'}
        </text>
      </g>

      {/* Preset label badge */}
      <rect x={575} y={462} width={115} height={24} rx={6}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={632} y={478} textAnchor="middle" fontSize={9}
        fontFamily="monospace" fill="#6366f1">{PRESET_LABELS[preset]}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 3 — Tensor Components
// ─────────────────────────────────────────────────────────────────────────────

// Display a 2×2 tensor T = Σ T^{ij} eᵢ ⊗ fⱼ
// Show each basis tensor as a unit rectangle, weighted and coloured.

const BASIS_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'] as const;
const BASIS_LABELS = ['e₁⊗f₁', 'e₁⊗f₂', 'e₂⊗f₁', 'e₂⊗f₂'] as const;

function TensorComponentsMode() {
  // T^{ij} components, stored as [T11, T12, T21, T22]
  const [T, setT] = useState([1.5, 0.5, -0.5, 1.0]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [showBasis, setShowBasis] = useState(true);

  // Change of basis: rotate by angle θ
  const [cobAngle, setCobAngle] = useState(0);

  // Transformed components under rotation R(θ):
  // T'^{ij} = Σ_{kl} R^i_k T^{kl} (R^{-T})^l_j = Σ_{kl} R^i_k R^j_l T^{kl}
  // For orthogonal R: T'^{ij} = R^i_k R^j_l T^{kl}
  const cosA = Math.cos(cobAngle);
  const sinA = Math.sin(cobAngle);
  // R = [[cosA, -sinA],[sinA, cosA]]
  const Tprime = useMemo(() => {
    const [T11, T12, T21, T22] = T;
    return [
      cosA * cosA * T11 + cosA * (-sinA) * T12 + (-sinA) * cosA * T21 + (-sinA) * (-sinA) * T22,
      cosA * sinA * T11 + cosA * cosA * T12 + (-sinA) * sinA * T21 + (-sinA) * cosA * T22,
      sinA * cosA * T11 + sinA * (-sinA) * T12 + cosA * cosA * T21 + cosA * (-sinA) * T22,
      sinA * sinA * T11 + sinA * cosA * T12 + cosA * sinA * T21 + cosA * cosA * T22,
    ];
  }, [T, cosA, sinA]);

  const displayT = cobAngle !== 0 ? Tprime : T;

  // Layout: 2×2 grid of basis tensor rectangles
  // Each eᵢ⊗fⱼ drawn as a rectangle in a 2D grid layout
  // Centre of each cell:
  const CELL = 70; // cell size in px
  const MGRID_X = 80;  // top-left of the 2×2 grid (SVG coords)
  const MGRID_Y = 90;

  // Full tensor visualization: superimpose all 4 weighted basis tensors
  // Displayed as a heatmap matrix on the right
  const HM_X = 400;
  const HM_Y = 80;
  const HM_SIZE = 220;

  function cellX(j: number) { return MGRID_X + j * (CELL + 16); }
  function cellY(i: number) { return MGRID_Y + i * (CELL + 16); }
  function basisIdx(i: number, j: number) { return i * 2 + j; }

  const maxAbs = Math.max(...T.map(Math.abs), 0.01);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-full select-none"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Title strip */}
      <rect x={12} y={12} width={674} height={26} rx={7}
        fill={COL.badge} stroke={COL.badgeBorder} strokeWidth={1} />
      <text x={350} y={30} textAnchor="middle" fontSize={12}
        fontWeight="600" fill={COL.text} fontFamily="serif">
        T = Σ Tⁱʲ eᵢ ⊗ fⱼ   (2×2 tensor components)
      </text>

      {/* ── Left: Basis tensor grid ───────────────────────────────────── */}
      <text x={MGRID_X + CELL + 8} y={56} textAnchor="middle"
        fontSize={10} fill={COL.subtext} fontFamily="system-ui">
        Basis tensors
      </text>
      {/* Column labels */}
      {[0, 1].map(j => (
        <text key={`cj${j}`} x={cellX(j) + CELL / 2} y={MGRID_Y - 10}
          textAnchor="middle" fontSize={10} fontFamily="serif" fill={COL.subtext}>
          f{j + 1}
        </text>
      ))}
      {/* Row labels */}
      {[0, 1].map(i => (
        <text key={`ri${i}`} x={MGRID_X - 12} y={cellY(i) + CELL / 2 + 4}
          textAnchor="middle" fontSize={10} fontFamily="serif" fill={COL.subtext}>
          e{i + 1}
        </text>
      ))}

      {[0, 1].map(i => [0, 1].map(j => {
        const idx = basisIdx(i, j);
        const coef = displayT[idx];
        const isHL = highlight === idx;
        const col = BASIS_COLORS[idx];
        const absCoef = Math.abs(coef);
        const opacity = showBasis ? 0.18 + 0.62 * (absCoef / maxAbs) : 0.1;
        const cx = cellX(j);
        const cy = cellY(i);

        return (
          <g key={idx}
            onMouseEnter={() => setHighlight(idx)}
            onMouseLeave={() => setHighlight(null)}
            style={{ cursor: 'default' }}>
            {/* Cell background */}
            <rect x={cx} y={cy} width={CELL} height={CELL} rx={8}
              fill={col} fillOpacity={opacity}
              stroke={isHL ? col : COL.badgeBorder}
              strokeWidth={isHL ? 2 : 1} />
            {/* Basis label */}
            <text x={cx + CELL / 2} y={cy + 22} textAnchor="middle"
              fontSize={9} fontFamily="serif" fill={col} fontWeight="bold">
              {BASIS_LABELS[idx]}
            </text>
            {/* Coefficient */}
            <text x={cx + CELL / 2} y={cy + 38} textAnchor="middle"
              fontSize={11} fontFamily="monospace" fill={COL.text} fontWeight="600">
              {coef.toFixed(2)}
            </text>
            {/* Mini parallelogram inside cell */}
            {(() => {
              const s = Math.min(18, Math.abs(coef) * 9 + 4);
              const bx = cx + CELL / 2 - s / 2;
              const by = cy + CELL / 2 + 8;
              const vxi = i === 0 ? s : 0;
              const vyi = i === 0 ? 0 : s;
              const wxj = j === 0 ? s : 0;
              const wyj = j === 0 ? 0 : s;
              return (
                <polygon
                  points={`${bx},${by + s} ${bx + vxi},${by + s - vyi} ${bx + vxi + wxj},${by + s - vyi - wyj} ${bx + wxj},${by + s - wyj}`}
                  fill={col} fillOpacity={0.45}
                  stroke={col} strokeWidth={1} />
              );
            })()}
          </g>
        );
      }))}

      {/* ── Editable T^{ij} inputs (HTML overlay via foreignObject) ──── */}
      <text x={MGRID_X} y={310} fontSize={10} fill={COL.subtext} fontFamily="system-ui">
        Edit components:
      </text>
      {[0, 1].map(i => [0, 1].map(j => {
        const idx = basisIdx(i, j);
        const bx = MGRID_X + j * 92;
        const by = 320 + i * 28;
        return (
          <g key={idx}>
            <text x={bx + 4} y={by + 13} fontSize={9} fontFamily="serif"
              fill={BASIS_COLORS[idx]}>
              T{i + 1}{j + 1}=
            </text>
            <foreignObject x={bx + 30} y={by} width={56} height={22}>
              <input
                style={{
                  width: '54px', height: '20px', fontSize: '11px',
                  fontFamily: 'monospace', border: '1px solid #cbd5e1',
                  borderRadius: '4px', textAlign: 'center', background: 'white',
                  color: '#1e293b', outline: 'none',
                }}
                type="number" step="0.1"
                value={T[idx]}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    const next = [...T];
                    next[idx] = val;
                    setT(next);
                  }
                }}
              />
            </foreignObject>
          </g>
        );
      }))}

      {/* ── Right: Full tensor heatmap ─────────────────────────────────── */}
      <text x={HM_X + HM_SIZE / 2} y={56} textAnchor="middle"
        fontSize={10} fill={COL.subtext} fontFamily="system-ui">
        Full tensor  T = [Tⁱʲ]
      </text>

      {/* 2×2 matrix heatmap */}
      {[0, 1].map(i => [0, 1].map(j => {
        const idx = basisIdx(i, j);
        const val = displayT[idx];
        const col = BASIS_COLORS[idx];
        const cellSz = HM_SIZE / 2 - 4;
        const cx = HM_X + j * (cellSz + 8);
        const cy = HM_Y + i * (cellSz + 8);
        const absV = Math.abs(val) / maxAbs;
        const hl = highlight === idx;
        return (
          <g key={idx}
            onMouseEnter={() => setHighlight(idx)}
            onMouseLeave={() => setHighlight(null)}>
            <rect x={cx} y={cy} width={cellSz} height={cellSz} rx={6}
              fill={col} fillOpacity={0.1 + 0.55 * absV}
              stroke={hl ? col : COL.badgeBorder} strokeWidth={hl ? 2 : 1} />
            <text x={cx + cellSz / 2} y={cy + 22}
              textAnchor="middle" fontSize={9} fill={COL.subtext} fontFamily="serif">
              T{i + 1}{j + 1}
            </text>
            <text x={cx + cellSz / 2} y={cy + cellSz / 2 + 6}
              textAnchor="middle" fontSize={15} fontWeight="bold"
              fontFamily="monospace" fill={col}>
              {val.toFixed(2)}
            </text>
          </g>
        );
      }))}

      {/* Bracket lines */}
      <path d={`M${HM_X - 8},${HM_Y - 6} L${HM_X - 14},${HM_Y - 6} L${HM_X - 14},${HM_Y + HM_SIZE / 2 - 4 + 8 + HM_SIZE / 2 - 4 + 6} L${HM_X - 8},${HM_Y + HM_SIZE / 2 - 4 + 8 + HM_SIZE / 2 - 4 + 6}`}
        fill="none" stroke={COL.axis} strokeWidth={1.5} />
      <path d={`M${HM_X + HM_SIZE + 8},${HM_Y - 6} L${HM_X + HM_SIZE + 14},${HM_Y - 6} L${HM_X + HM_SIZE + 14},${HM_Y + HM_SIZE / 2 - 4 + 8 + HM_SIZE / 2 - 4 + 6} L${HM_X + HM_SIZE + 8},${HM_Y + HM_SIZE / 2 - 4 + 8 + HM_SIZE / 2 - 4 + 6}`}
        fill="none" stroke={COL.axis} strokeWidth={1.5} />

      {/* ── Change of basis area ──────────────────────────────────────── */}
      <line x1={HM_X - 20} y1={320} x2={690} y2={320}
        stroke={COL.grid} strokeWidth={1} />
      <text x={HM_X} y={338} fontSize={10} fontWeight="600"
        fill={COL.text} fontFamily="system-ui">
        Change of basis (rotation θ)
      </text>

      {cobAngle !== 0 && (
        <>
          <text x={HM_X} y={356} fontSize={9} fontFamily="monospace" fill={COL.subtext}>
            θ = {(cobAngle * 180 / Math.PI).toFixed(1)}°
          </text>
          <text x={HM_X} y={370} fontSize={9} fontFamily="monospace" fill="#6366f1">
            T′ = R T Rᵀ  (contravariant)
          </text>
          {[0, 1].map(i => [0, 1].map(j => {
            const idx = basisIdx(i, j);
            const orig = T[idx];
            const newV = Tprime[idx];
            return (
              <text key={idx} x={HM_X + idx * 72} y={390}
                fontSize={9} fontFamily="monospace"
                fill={BASIS_COLORS[idx]}>
                T′{i + 1}{j + 1}={newV.toFixed(2)}
              </text>
            );
          }))}
        </>
      )}

      {/* Slider for θ via foreignObject */}
      <text x={HM_X} y={415} fontSize={9} fill={COL.subtext} fontFamily="system-ui">
        θ = {(cobAngle * 180 / Math.PI).toFixed(0)}°
      </text>
      <foreignObject x={HM_X + 38} y={400} width={250} height={22}>
        <input type="range" min="-3.14159" max="3.14159" step="0.05"
          value={cobAngle}
          style={{ width: '248px', accentColor: '#6366f1' }}
          onChange={e => setCobAngle(parseFloat(e.target.value))} />
      </foreignObject>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <g onClick={() => setShowBasis(s => !s)} style={{ cursor: 'pointer' }}>
        <rect x={12} y={462} width={160} height={24} rx={6}
          fill={showBasis ? '#1e293b' : COL.badge}
          stroke={showBasis ? '#1e293b' : COL.badgeBorder} strokeWidth={1} />
        <text x={92} y={478} textAnchor="middle"
          fontSize={10} fontWeight="600"
          fill={showBasis ? 'white' : COL.subtext} fontFamily="system-ui">
          {showBasis ? 'Hide basis weights' : 'Show basis weights'}
        </text>
      </g>

      {/* Decomposition formula */}
      <text x={190} y={474} fontSize={10} fontFamily="serif"
        fill={COL.subtext} fontStyle="italic">
        T = {T.map((v, i) => `${v.toFixed(1)} (${BASIS_LABELS[i]})`).join(' + ')}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

type TensorMode = 'product' | 'multilinear' | 'components';

export const TensorSim = () => {
  const [mode, setMode] = useState<TensorMode>('product');
  const [alpha, setAlpha] = useState(1.5);

  const tabs: { id: TensorMode; label: string }[] = [
    { id: 'product',     label: 'Tensor Product' },
    { id: 'multilinear', label: 'Multilinear Map' },
    { id: 'components',  label: 'Tensor Components' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto my-8 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden flex flex-col">

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-4 pt-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={[
              'px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors mr-1',
              mode === tab.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── SVG canvas ────────────────────────────────────────────────── */}
      <div className="relative bg-gray-50" style={{ aspectRatio: '700/500' }}>
        {mode === 'product'     && <TensorProductMode />}
        {mode === 'multilinear' && <MultilinearMode />}
        {mode === 'components'  && <TensorComponentsMode />}
      </div>

      {/* ── Bottom info bar ───────────────────────────────────────────── */}
      <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2 flex items-center gap-4 flex-wrap text-[11px]">
        {mode === 'product' && (
          <>
            <span className="text-gray-400 font-semibold uppercase tracking-wide text-[9px]">
              Tensor Product
            </span>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              Drag the vector tips in V and W. The parallelogram shows v ⊗ w.
            </span>
            {/* Alpha slider */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-amber-500 font-semibold font-mono text-[10px]">α</span>
              <input type="range" min="0.2" max="3" step="0.1"
                value={alpha}
                onChange={e => setAlpha(parseFloat(e.target.value))}
                className="w-20 h-1 accent-amber-500" />
              <span className="font-mono text-amber-700 text-[10px]">{alpha.toFixed(1)}</span>
            </div>
          </>
        )}
        {mode === 'multilinear' && (
          <>
            <span className="text-gray-400 font-semibold uppercase tracking-wide text-[9px]">
              Bilinear Map
            </span>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              Choose a preset bilinear map. Press Animate to see linearity in one input.
            </span>
          </>
        )}
        {mode === 'components' && (
          <>
            <span className="text-gray-400 font-semibold uppercase tracking-wide text-[9px]">
              Components
            </span>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              Edit T^ij entries. Use the θ slider to rotate the basis and see how components transform.
            </span>
          </>
        )}
      </div>
    </div>
  );
};

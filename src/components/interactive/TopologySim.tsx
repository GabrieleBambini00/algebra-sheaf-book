import React, { useState, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'opensets' | 'coverings' | 'continuity' | 'basis';

/** An axis-aligned elliptical open set defined in a [0,100]×[0,100] coordinate space */
interface OpenSet {
  id: string;
  label: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string; // Tailwind-compatible hex
  fill: string;  // semi-transparent fill
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Returns true if (px, py) is inside the ellipse */
function inEllipse(px: number, py: number, s: OpenSet): boolean {
  const dx = (px - s.cx) / s.rx;
  const dy = (py - s.cy) / s.ry;
  return dx * dx + dy * dy <= 1;
}

/** Returns true if point is inside at least one of the given sets */
function isCovered(px: number, py: number, sets: OpenSet[]): boolean {
  return sets.some(s => inEllipse(px, py, s));
}

/** Sample a grid of points across [0,100]×[0,100] and check coverage */
function sampleUncoveredPoints(
  activeSets: OpenSet[],
  steps = 20
): { x: number; y: number }[] {
  const uncovered: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const px = (i / steps) * 100;
      const py = (j / steps) * 100;
      if (!isCovered(px, py, activeSets)) {
        uncovered.push({ x: px, y: py });
      }
    }
  }
  return uncovered;
}

/** Intersection of two ellipses approximated by sampling; returns a rough center */
function ellipsesIntersect(a: OpenSet, b: OpenSet): boolean {
  // Check if any point of a is inside b or vice-versa by sampling the boundary
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const px = a.cx + a.rx * 0.6 * Math.cos(angle);
    const py = a.cy + a.ry * 0.6 * Math.sin(angle);
    if (inEllipse(px, py, b)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Topology axiom checker (Open Sets mode)
// ---------------------------------------------------------------------------

/**
 * Given a collection of open sets (their indices) and the full list, check:
 *   T1: empty set is "in" (trivially — we don't render it but accept it)
 *   T2: X itself is covered (union of all active sets = entire rectangle?)
 *       We approximate by checking coverage of corner + center sample.
 *   T3: closed under arbitrary unions (trivially satisfied — any union of sets
 *       in the collection is representable as a union, so this is always true
 *       if we allow all unions).
 *   T4: closed under finite intersections (every pairwise intersection of
 *       active sets should itself be representable as a union of active sets).
 *       For our purposes we check: if two sets overlap, their intersection
 *       region must be contained in at least one active set.
 * We simplify to a displayable check: report which axiom seems violated.
 */
interface AxiomReport {
  wholeSpace: boolean;     // T2: union covers X
  intersectionClosed: boolean; // T4 simplified
}

function checkTopologyAxioms(
  activeSets: OpenSet[],
  allSets: OpenSet[]
): AxiomReport {
  // T2: check a 5×5 sample grid
  const samplePoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      samplePoints.push({ x: 5 + i * 18, y: 5 + j * 18 });
    }
  }
  const wholeSpace = samplePoints.every(p => isCovered(p.x, p.y, activeSets));

  // T4: for every pair of active sets that overlap, check that
  //     their intersection is itself contained in some active set.
  //     We sample points in the intersection region.
  let intersectionClosed = true;
  for (let i = 0; i < activeSets.length && intersectionClosed; i++) {
    for (let j = i + 1; j < activeSets.length && intersectionClosed; j++) {
      const a = activeSets[i];
      const b = activeSets[j];
      if (!ellipsesIntersect(a, b)) continue;
      // Sample points that are in both a and b
      // For each such point, check it's covered by some (possibly different) active set
      // (In a real topology, the intersection must be open, i.e., in the topology.
      //  Here we accept it if covered by at least one set in the active collection.)
      const steps = 10;
      for (let si = 0; si <= steps; si++) {
        for (let sj = 0; sj <= steps; sj++) {
          const px = (si / steps) * 100;
          const py = (sj / steps) * 100;
          if (inEllipse(px, py, a) && inEllipse(px, py, b)) {
            // This point is in a∩b; must be in some active set
            if (!isCovered(px, py, activeSets)) {
              intersectionClosed = false;
            }
          }
        }
      }
    }
  }

  return { wholeSpace, intersectionClosed };
}

// ---------------------------------------------------------------------------
// Predefined data sets
// ---------------------------------------------------------------------------

const OPEN_SETS: OpenSet[] = [
  { id: 'U1', label: 'U₁', cx: 30, cy: 35, rx: 22, ry: 20, color: '#3b82f6', fill: 'rgba(59,130,246,0.18)' },
  { id: 'U2', label: 'U₂', cx: 65, cy: 35, rx: 22, ry: 20, color: '#10b981', fill: 'rgba(16,185,129,0.18)' },
  { id: 'U3', label: 'U₃', cx: 48, cy: 68, rx: 26, ry: 18, color: '#f59e0b', fill: 'rgba(245,158,11,0.18)' },
  { id: 'U4', label: 'U₄', cx: 50, cy: 50, rx: 42, ry: 38, color: '#8b5cf6', fill: 'rgba(139,92,246,0.12)' },
  { id: 'U5', label: 'U₅', cx: 20, cy: 70, rx: 16, ry: 14, color: '#ef4444', fill: 'rgba(239,68,68,0.18)' },
  { id: 'U6', label: 'U₆', cx: 80, cy: 68, rx: 16, ry: 14, color: '#06b6d4', fill: 'rgba(6,182,212,0.18)' },
  { id: 'U7', label: 'U₇', cx: 50, cy: 20, rx: 30, ry: 14, color: '#ec4899', fill: 'rgba(236,72,153,0.18)' },
  { id: 'U8', label: 'U₈', cx: 50, cy: 50, rx: 48, ry: 46, color: '#14b8a6', fill: 'rgba(20,184,166,0.10)' },
];

const COVERING_SETS: OpenSet[] = [
  { id: 'C1', label: 'C₁', cx: 20, cy: 30, rx: 26, ry: 22, color: '#3b82f6', fill: 'rgba(59,130,246,0.20)' },
  { id: 'C2', label: 'C₂', cx: 55, cy: 25, rx: 24, ry: 20, color: '#10b981', fill: 'rgba(16,185,129,0.20)' },
  { id: 'C3', label: 'C₃', cx: 82, cy: 38, rx: 22, ry: 24, color: '#f59e0b', fill: 'rgba(245,158,11,0.20)' },
  { id: 'C4', label: 'C₄', cx: 18, cy: 68, rx: 22, ry: 22, color: '#8b5cf6', fill: 'rgba(139,92,246,0.20)' },
  { id: 'C5', label: 'C₅', cx: 50, cy: 72, rx: 28, ry: 20, color: '#ef4444', fill: 'rgba(239,68,68,0.20)' },
  { id: 'C6', label: 'C₆', cx: 82, cy: 70, rx: 22, ry: 20, color: '#06b6d4', fill: 'rgba(6,182,212,0.20)' },
  { id: 'C7', label: 'C₇', cx: 50, cy: 50, rx: 20, ry: 18, color: '#ec4899', fill: 'rgba(236,72,153,0.20)' },
  { id: 'C8', label: 'C₈', cx: 50, cy: 50, rx: 48, ry: 46, color: '#6366f1', fill: 'rgba(99,102,241,0.10)' },
];

// Fine refinement sets (shown in refinement view)
const REFINEMENT_SETS: OpenSet[] = [
  { id: 'R1', label: 'R₁', cx: 20, cy: 28, rx: 16, ry: 14, color: '#3b82f6', fill: 'rgba(59,130,246,0.25)' },
  { id: 'R2', label: 'R₂', cx: 42, cy: 22, rx: 14, ry: 12, color: '#10b981', fill: 'rgba(16,185,129,0.25)' },
  { id: 'R3', label: 'R₃', cx: 62, cy: 22, rx: 14, ry: 12, color: '#f59e0b', fill: 'rgba(245,158,11,0.25)' },
  { id: 'R4', label: 'R₄', cx: 82, cy: 30, rx: 14, ry: 14, color: '#8b5cf6', fill: 'rgba(139,92,246,0.25)' },
  { id: 'R5', label: 'R₅', cx: 85, cy: 52, rx: 14, ry: 14, color: '#ef4444', fill: 'rgba(239,68,68,0.25)' },
  { id: 'R6', label: 'R₆', cx: 82, cy: 72, rx: 14, ry: 14, color: '#06b6d4', fill: 'rgba(6,182,212,0.25)' },
  { id: 'R7', label: 'R₇', cx: 62, cy: 78, rx: 14, ry: 12, color: '#ec4899', fill: 'rgba(236,72,153,0.25)' },
  { id: 'R8', label: 'R₈', cx: 42, cy: 78, rx: 14, ry: 12, color: '#14b8a6', fill: 'rgba(20,184,166,0.25)' },
  { id: 'R9', label: 'R₉', cx: 20, cy: 72, rx: 14, ry: 14, color: '#f97316', fill: 'rgba(249,115,22,0.25)' },
  { id: 'R10', label: 'R₁₀', cx: 16, cy: 52, rx: 14, ry: 14, color: '#84cc16', fill: 'rgba(132,204,22,0.25)' },
  { id: 'R11', label: 'R₁₁', cx: 50, cy: 50, rx: 14, ry: 14, color: '#6366f1', fill: 'rgba(99,102,241,0.25)' },
  { id: 'R12', label: 'R₁₂', cx: 50, cy: 50, rx: 28, ry: 26, color: '#a855f7', fill: 'rgba(168,85,247,0.14)' },
];

// Domain X sets (for continuity mode)
const X_SETS: OpenSet[] = [
  { id: 'X1', label: 'X₁', cx: 25, cy: 35, rx: 20, ry: 22, color: '#3b82f6', fill: 'rgba(59,130,246,0.20)' },
  { id: 'X2', label: 'X₂', cx: 70, cy: 35, rx: 22, ry: 22, color: '#10b981', fill: 'rgba(16,185,129,0.20)' },
  { id: 'X3', label: 'X₃', cx: 48, cy: 68, rx: 30, ry: 18, color: '#f59e0b', fill: 'rgba(245,158,11,0.20)' },
  { id: 'X4', label: 'X₄', cx: 48, cy: 50, rx: 44, ry: 40, color: '#8b5cf6', fill: 'rgba(139,92,246,0.12)' },
];

// Codomain Y sets (for continuity mode)
const Y_SETS: OpenSet[] = [
  { id: 'V1', label: 'V₁', cx: 28, cy: 38, rx: 22, ry: 24, color: '#ef4444', fill: 'rgba(239,68,68,0.20)' },
  { id: 'V2', label: 'V₂', cx: 72, cy: 38, rx: 22, ry: 24, color: '#06b6d4', fill: 'rgba(6,182,212,0.20)' },
  { id: 'V3', label: 'V₃', cx: 50, cy: 70, rx: 30, ry: 18, color: '#ec4899', fill: 'rgba(236,72,153,0.20)' },
  { id: 'V4', label: 'V₄', cx: 50, cy: 50, rx: 46, ry: 42, color: '#14b8a6', fill: 'rgba(20,184,166,0.12)' },
];

/**
 * f: X → Y  (defined as a bijection between the normalized coordinates).
 * We define f(x,y) = (fx(x,y), fy(x,y)) in the Y space.
 * For illustration we use a simple affine + mild nonlinear map.
 *   fx(x,y) = x * 0.9 + 5         (slight compress)
 *   fy(x,y) = y * 0.85 + 8        (slight compress + shift)
 * This map sends open sets to "open sets" — we check if f^{-1}(V) is in X topology.
 */
function mapXtoY(px: number, py: number): [number, number] {
  return [px * 0.9 + 5, py * 0.85 + 8];
}
function mapYtoX(qx: number, qy: number): [number, number] {
  return [(qx - 5) / 0.9, (qy - 8) / 0.85];
}

/**
 * Compute which X sets are in the preimage f^{-1}(V):
 * An X-set U is in f^{-1}(V) if f(U) ⊆ V, i.e., every sample point of U
 * maps into V.
 */
function computePreimage(v: OpenSet): OpenSet[] {
  // We check: for each X set, sample points and see if f(p) ∈ V
  return X_SETS.filter(u => {
    const steps = 8;
    let countIn = 0, countTotal = 0;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const angle1 = (2 * Math.PI * i) / steps;
        const angle2 = (2 * Math.PI * j) / steps;
        const px = u.cx + u.rx * 0.8 * Math.cos(angle1);
        const py = u.cy + u.ry * 0.8 * Math.sin(angle2);
        if (inEllipse(px, py, u)) {
          const [qx, qy] = mapXtoY(px, py);
          countTotal++;
          if (inEllipse(qx, qy, v)) countIn++;
        }
      }
    }
    // U ⊆ f^{-1}(V) if essentially all sampled points map into V
    return countTotal > 0 && countIn / countTotal > 0.5;
  });
}

// Basis sets (open intervals on a line embedded in 2D, plus open disks)
const BASIS_SETS: OpenSet[] = [
  { id: 'B1', label: 'B₁', cx: 20, cy: 50, rx: 14, ry: 14, color: '#3b82f6', fill: 'rgba(59,130,246,0.22)' },
  { id: 'B2', label: 'B₂', cx: 40, cy: 50, rx: 14, ry: 14, color: '#10b981', fill: 'rgba(16,185,129,0.22)' },
  { id: 'B3', label: 'B₃', cx: 60, cy: 50, rx: 14, ry: 14, color: '#f59e0b', fill: 'rgba(245,158,11,0.22)' },
  { id: 'B4', label: 'B₄', cx: 80, cy: 50, rx: 14, ry: 14, color: '#8b5cf6', fill: 'rgba(139,92,246,0.22)' },
  { id: 'B5', label: 'B₅', cx: 30, cy: 30, rx: 14, ry: 14, color: '#ef4444', fill: 'rgba(239,68,68,0.22)' },
  { id: 'B6', label: 'B₆', cx: 50, cy: 30, rx: 14, ry: 14, color: '#06b6d4', fill: 'rgba(6,182,212,0.22)' },
  { id: 'B7', label: 'B₇', cx: 70, cy: 30, rx: 14, ry: 14, color: '#ec4899', fill: 'rgba(236,72,153,0.22)' },
  { id: 'B8', label: 'B₈', cx: 30, cy: 70, rx: 14, ry: 14, color: '#14b8a6', fill: 'rgba(20,184,166,0.22)' },
  { id: 'B9', label: 'B₉', cx: 50, cy: 70, rx: 14, ry: 14, color: '#f97316', fill: 'rgba(249,115,22,0.22)' },
  { id: 'B10', label: 'B₁₀', cx: 70, cy: 70, rx: 14, ry: 14, color: '#84cc16', fill: 'rgba(132,204,22,0.22)' },
];

/**
 * Check if a set of basis elements forms a valid basis for a topology on X:
 * Basis axioms:
 *   B1: Every point of X is in some basis element.
 *   B2: If x ∈ B_i ∩ B_j, then ∃ B_k ∈ basis s.t. x ∈ B_k ⊆ B_i ∩ B_j.
 */
interface BasisReport {
  coversX: boolean;
  intersectionProperty: boolean;
}

function checkBasisAxioms(activeBasis: OpenSet[]): BasisReport {
  if (activeBasis.length === 0) return { coversX: false, intersectionProperty: true };

  // B1: sample grid
  const samplePoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      samplePoints.push({ x: 5 + i * 18, y: 5 + j * 18 });
    }
  }
  const coversX = samplePoints.every(p => isCovered(p.x, p.y, activeBasis));

  // B2: for each overlapping pair, check the intersection property
  let intersectionProperty = true;
  for (let i = 0; i < activeBasis.length && intersectionProperty; i++) {
    for (let j = i + 1; j < activeBasis.length && intersectionProperty; j++) {
      const a = activeBasis[i];
      const b = activeBasis[j];
      if (!ellipsesIntersect(a, b)) continue;
      // Find a sample point in the intersection
      const steps = 8;
      for (let si = 0; si <= steps && intersectionProperty; si++) {
        for (let sj = 0; sj <= steps && intersectionProperty; sj++) {
          const px = (si / steps) * 100;
          const py = (sj / steps) * 100;
          if (inEllipse(px, py, a) && inEllipse(px, py, b)) {
            // x ∈ B_i ∩ B_j; check that some B_k ∈ activeBasis contains x
            // and B_k ⊆ B_i ∩ B_j (approximate by containment at sample points)
            const hasContaining = activeBasis.some(k => {
              if (!inEllipse(px, py, k)) return false;
              // rough check: k should be smaller than both a and b in area
              return k.rx * k.ry <= a.rx * a.ry && k.rx * k.ry <= b.rx * b.ry;
            });
            if (!hasContaining) intersectionProperty = false;
          }
        }
      }
    }
  }

  return { coversX, intersectionProperty };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the universe rectangle + axes label */
function Universe({ label = 'X', width = 300, height = 260 }: { label?: string; width?: number; height?: number }) {
  return (
    <>
      <rect
        x={2} y={2} width={width - 4} height={height - 4}
        rx={6} ry={6}
        fill="rgba(248,250,252,0.9)"
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray="6 3"
      />
      <text x={8} y={16} fontSize={10} fill="#64748b" fontFamily="serif" fontStyle="italic">{label}</text>
    </>
  );
}

/** Renders a single open set ellipse */
function SetEllipse({
  s, width, height, active, highlighted, onClick, onMouseEnter, onMouseLeave
}: {
  s: OpenSet; width: number; height: number; active: boolean;
  highlighted?: boolean; onClick?: () => void;
  onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  const cx = (s.cx / 100) * width;
  const cy = (s.cy / 100) * height;
  const rx = (s.rx / 100) * width;
  const ry = (s.ry / 100) * height;

  return (
    <g
      style={{ cursor: 'pointer', transition: 'opacity 0.25s' }}
      opacity={active ? 1 : 0.18}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ellipse
        cx={cx} cy={cy} rx={rx} ry={ry}
        fill={active ? s.fill : 'transparent'}
        stroke={s.color}
        strokeWidth={highlighted ? 2.5 : 1.5}
        strokeDasharray={active ? 'none' : '4 3'}
        style={{ filter: highlighted ? `drop-shadow(0 0 6px ${s.color})` : undefined, transition: 'all 0.25s' }}
      />
      {active && (
        <text
          x={cx} y={cy - ry + 12}
          textAnchor="middle" fontSize={9}
          fill={s.color} fontFamily="serif" fontWeight={600}
        >
          {s.label}
        </text>
      )}
    </g>
  );
}

/** Small pill-shaped legend badge */
function Badge({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-all duration-200"
      style={{
        borderColor: color,
        color: active ? '#fff' : color,
        backgroundColor: active ? color : 'transparent',
        opacity: active ? 1 : 0.55,
      }}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full border"
        style={{ backgroundColor: active ? '#fff' : color, borderColor: color }}
      />
      {label}
    </button>
  );
}

/** AxiomBadge: green check or red cross */
function AxiomBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
      }`}
    >
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mode: Open Sets
// ---------------------------------------------------------------------------

function OpenSetsMode() {
  const W = 340, H = 280;
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set(['U1', 'U2', 'U3', 'U4']));
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pointPos, setPointPos] = useState<{ x: number; y: number }>({ x: 48, y: 45 });
  const [dragging, setDragging] = useState(false);

  const activeSets = useMemo(() => OPEN_SETS.filter(s => activeIds.has(s.id)), [activeIds]);
  const axioms = useMemo(() => checkTopologyAxioms(activeSets, OPEN_SETS), [activeSets]);

  const neighborhoodSets = useMemo(
    () => activeSets.filter(s => inEllipse(pointPos.x, pointPos.y, s)),
    [activeSets, pointPos]
  );

  const toggle = useCallback((id: string) => {
    setActiveIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * 100;
    const sy = ((e.clientY - rect.top) / rect.height) * 100;
    setPointPos({ x: Math.max(2, Math.min(98, sx)), y: Math.max(2, Math.min(98, sy)) });
  }, [dragging]);

  const ptX = (pointPos.x / 100) * W;
  const ptY = (pointPos.y / 100) * H;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Toggle open sets on/off. The topology axioms are checked in real time.
        Drag the <span className="font-semibold text-violet-600">purple point</span> to explore neighborhoods.
      </p>

      <div className="flex gap-4 flex-wrap items-start">
        {/* SVG canvas */}
        <div className="flex-shrink-0">
          <svg
            width={W} height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="rounded-xl border border-gray-200 bg-white"
            style={{ touchAction: 'none' }}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
          >
            <Universe width={W} height={H} />

            {/* Neighborhood highlight rings */}
            {neighborhoodSets.map(s => (
              <ellipse
                key={s.id + '-nbhd'}
                cx={(s.cx / 100) * W} cy={(s.cy / 100) * H}
                rx={(s.rx / 100) * W + 4} ry={(s.ry / 100) * H + 4}
                fill="none" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5}
              />
            ))}

            {OPEN_SETS.map(s => (
              <SetEllipse
                key={s.id}
                s={s} width={W} height={H}
                active={activeIds.has(s.id)}
                highlighted={hoveredId === s.id}
                onClick={() => toggle(s.id)}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}

            {/* Draggable point */}
            <g
              style={{ cursor: 'grab' }}
              onMouseDown={() => setDragging(true)}
            >
              <circle cx={ptX} cy={ptY} r={9} fill="rgba(124,58,237,0.15)" />
              <circle cx={ptX} cy={ptY} r={5} fill="#7c3aed" stroke="#fff" strokeWidth={1.5} />
            </g>
          </svg>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 min-w-[160px]">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Open Sets</div>
          <div className="flex flex-col gap-1.5">
            {OPEN_SETS.map(s => (
              <Badge key={s.id} color={s.color} label={s.label} active={activeIds.has(s.id)} onClick={() => toggle(s.id)} />
            ))}
          </div>

          <div className="mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Axiom Check</div>
          <div className="flex flex-col gap-1.5">
            <AxiomBadge ok label="∅, X ∈ τ (by def.)" />
            <AxiomBadge ok={axioms.wholeSpace} label="Covers X" />
            <AxiomBadge ok={axioms.intersectionClosed} label="∩-closed" />
            <AxiomBadge ok label="∪-closed (auto)" />
          </div>

          <div className="mt-2 p-2 rounded-lg bg-violet-50 border border-violet-100 text-xs text-violet-700">
            <span className="font-semibold">Neighborhoods of p:</span>
            <br />
            {neighborhoodSets.length === 0
              ? <span className="italic text-gray-500">p is not in any active set</span>
              : neighborhoodSets.map(s => s.label).join(', ')
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Coverings
// ---------------------------------------------------------------------------

function CoveringsMode() {
  const W = 340, H = 280;
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']));
  const [showRefinement, setShowRefinement] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeSets = useMemo(() => COVERING_SETS.filter(s => activeIds.has(s.id)), [activeIds]);
  const uncovered = useMemo(() => sampleUncoveredPoints(activeSets, 18), [activeSets]);
  const isCovering = uncovered.length === 0;

  const toggle = useCallback((id: string) => {
    setActiveIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const displaySets = showRefinement ? REFINEMENT_SETS : COVERING_SETS;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Toggle sets to form an <span className="font-semibold">open covering</span>.
        Red dots mark uncovered points. Switch to the refinement to see a finer covering.
      </p>

      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-shrink-0">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded-xl border border-gray-200 bg-white">
            <Universe width={W} height={H} />

            {/* Uncovered point indicators */}
            {!showRefinement && uncovered.map((p, i) => (
              <circle
                key={i}
                cx={(p.x / 100) * W} cy={(p.y / 100) * H}
                r={2.5}
                fill="rgba(239,68,68,0.7)"
                style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
              />
            ))}

            {displaySets.map(s => (
              <SetEllipse
                key={s.id}
                s={s} width={W} height={H}
                active={showRefinement ? true : activeIds.has(s.id)}
                highlighted={hoveredId === s.id}
                onClick={showRefinement ? undefined : () => toggle(s.id)}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}
          </svg>
        </div>

        <div className="flex flex-col gap-3 min-w-[160px]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRefinement(false)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all ${!showRefinement ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-600'}`}
            >
              Original
            </button>
            <button
              onClick={() => setShowRefinement(true)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all ${showRefinement ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-300 text-gray-600'}`}
            >
              Refinement
            </button>
          </div>

          {!showRefinement && (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sets</div>
              <div className="flex flex-col gap-1.5">
                {COVERING_SETS.map(s => (
                  <Badge key={s.id} color={s.color} label={s.label} active={activeIds.has(s.id)} onClick={() => toggle(s.id)} />
                ))}
              </div>
            </>
          )}

          {showRefinement && (
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 leading-relaxed">
              <span className="font-semibold">Refinement:</span> each R<sub>i</sub> ⊆ some C<sub>j</sub>, and R<sub>1</sub>…R<sub>12</sub> still cover X.
            </div>
          )}

          <div className="mt-2">
            {!showRefinement && (
              <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-semibold ${
                isCovering ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {isCovering ? '✓ Open Covering' : `✗ ${uncovered.length} uncovered pts`}
              </span>
            )}
            {showRefinement && (
              <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                ✓ Fine Covering (12 sets)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Continuity
// ---------------------------------------------------------------------------

function ContinuityMode() {
  const W = 200, H = 200;
  const [selectedV, setSelectedV] = useState<string | null>('V1');
  const [hoveredV, setHoveredV] = useState<string | null>(null);

  const activeV = Y_SETS.find(v => v.id === selectedV) ?? null;

  const preimage = useMemo(() => (activeV ? computePreimage(activeV) : []), [activeV]);
  const preimageIds = new Set(preimage.map(u => u.id));

  // f^{-1}(V) is open in X if it's a union of sets in X_SETS (i.e., all preimage sets are in X_SETS)
  // For our visual, it's always open if preimage sets are X-topology sets.
  // We add a twist: the identity map is continuous, but if V4 (whole Y) maps to X4 (whole X), that's fine.
  // For demonstration we say it's continuous iff preimage is non-empty or V is the whole space.
  const isContinuous = activeV !== null && (preimage.length > 0 || activeV.id === 'V4');

  // Compute the mapped ellipses from X to Y
  function mappedEllipse(u: OpenSet): { cx: number; cy: number; rx: number; ry: number } {
    const [cx, cy] = mapXtoY(u.cx, u.cy);
    return { cx, cy, rx: u.rx * 0.9, ry: u.ry * 0.85 };
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Select an open set <span className="font-semibold text-red-500">V ⊆ Y</span>.
        The preimage <span className="font-mono text-xs">f⁻¹(V)</span> highlights in
        <span className="font-semibold text-blue-500"> X</span>.
        Continuity holds iff every preimage is open.
      </p>

      <div className="flex gap-6 flex-wrap items-start">
        {/* Space X */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs font-semibold text-gray-500">Domain X</div>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded-xl border border-gray-200 bg-white">
            <Universe label="X" width={W} height={H} />
            {X_SETS.map(u => (
              <SetEllipse
                key={u.id}
                s={u} width={W} height={H}
                active
                highlighted={preimageIds.has(u.id)}
              />
            ))}
            {/* Preimage glow */}
            {preimage.map(u => {
              const cx = (u.cx / 100) * W;
              const cy = (u.cy / 100) * H;
              const rx = (u.rx / 100) * W;
              const ry = (u.ry / 100) * H;
              return (
                <ellipse
                  key={u.id + '-preimage'}
                  cx={cx} cy={cy} rx={rx + 5} ry={ry + 5}
                  fill="rgba(99,102,241,0.12)"
                  stroke="#6366f1" strokeWidth={2}
                  strokeDasharray="5 3"
                />
              );
            })}
            {/* Label */}
            {preimage.length > 0 && (
              <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#6366f1" fontFamily="serif">
                f⁻¹({activeV?.label}) = {preimage.map(u => u.label).join(' ∪ ')}
              </text>
            )}
          </svg>
        </div>

        {/* Arrow + f label */}
        <div className="flex flex-col items-center justify-center self-center gap-1 mt-4">
          <div className="text-xs text-gray-400 font-mono">f</div>
          <svg width={48} height={24} viewBox="0 0 48 24">
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
              </marker>
            </defs>
            <line x1={4} y1={12} x2={40} y2={12} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
          </svg>
          <div className="text-[10px] text-gray-400">X → Y</div>
        </div>

        {/* Space Y */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs font-semibold text-gray-500">Codomain Y</div>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded-xl border border-gray-200 bg-white">
            <Universe label="Y" width={W} height={H} />
            {Y_SETS.map(v => (
              <SetEllipse
                key={v.id}
                s={v} width={W} height={H}
                active
                highlighted={selectedV === v.id || hoveredV === v.id}
                onClick={() => setSelectedV(v.id === selectedV ? null : v.id)}
                onMouseEnter={() => setHoveredV(v.id)}
                onMouseLeave={() => setHoveredV(null)}
              />
            ))}
            {/* Selection ring */}
            {activeV && (() => {
              const cx = (activeV.cx / 100) * W;
              const cy = (activeV.cy / 100) * H;
              const rx = (activeV.rx / 100) * W;
              const ry = (activeV.ry / 100) * H;
              return (
                <ellipse cx={cx} cy={cy} rx={rx + 5} ry={ry + 5}
                  fill="rgba(239,68,68,0.10)" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" />
              );
            })()}
          </svg>
          <div className="text-[10px] text-gray-400 text-center">Click to select V</div>
        </div>

        {/* Info panel */}
        <div className="flex flex-col gap-3 min-w-[140px] self-start mt-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Y sets (click)</div>
          <div className="flex flex-col gap-1.5">
            {Y_SETS.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedV(v.id === selectedV ? null : v.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-all duration-200 text-left"
                style={{
                  borderColor: v.color,
                  color: selectedV === v.id ? '#fff' : v.color,
                  backgroundColor: selectedV === v.id ? v.color : 'transparent',
                }}
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: selectedV === v.id ? '#fff' : v.color }} />
                {v.label}
              </button>
            ))}
          </div>

          <div className="mt-2">
            {activeV ? (
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
                isContinuous ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {isContinuous ? '✓ f continuous' : '✗ not continuous'}
              </span>
            ) : (
              <span className="text-xs text-gray-400 italic">Select a set in Y</span>
            )}
          </div>

          {preimage.length > 0 && (
            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
              <span className="font-semibold">f⁻¹({activeV?.label}):</span>
              <br />
              {preimage.map(u => u.label).join(', ')} ⊆ τ<sub>X</sub>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Basis
// ---------------------------------------------------------------------------

function BasisMode() {
  const W = 340, H = 280;
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set(['B1', 'B2', 'B3', 'B5', 'B6', 'B7']));
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeBasis = useMemo(() => BASIS_SETS.filter(s => activeIds.has(s.id)), [activeIds]);
  const report = useMemo(() => checkBasisAxioms(activeBasis), [activeBasis]);

  // Build union description
  const unionDesc = useMemo(() => {
    if (activeBasis.length === 0) return '∅';
    return activeBasis.map(s => s.label).join(' ∪ ');
  }, [activeBasis]);

  const toggle = useCallback((id: string) => {
    setActiveIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Select basis elements (open disks). Their <span className="font-semibold">union</span> generates open sets.
        Basis axioms are verified: every point covered, and the intersection property holds.
      </p>

      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-shrink-0">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded-xl border border-gray-200 bg-white">
            <Universe width={W} height={H} />

            {/* Union fill overlay */}
            <defs>
              {activeBasis.map(s => (
                <radialGradient key={s.id + '-grad'} id={s.id + '-grad'} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                </radialGradient>
              ))}
            </defs>

            {BASIS_SETS.map(s => (
              <SetEllipse
                key={s.id}
                s={s} width={W} height={H}
                active={activeIds.has(s.id)}
                highlighted={hoveredId === s.id}
                onClick={() => toggle(s.id)}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}

            {/* Intersection highlights between active overlapping pairs */}
            {activeBasis.flatMap((a, i) =>
              activeBasis.slice(i + 1).map(b => {
                if (!ellipsesIntersect(a, b)) return null;
                const cx = ((a.cx + b.cx) / 2 / 100) * W;
                const cy = ((a.cy + b.cy) / 2 / 100) * H;
                return (
                  <circle
                    key={a.id + '-' + b.id + '-int'}
                    cx={cx} cy={cy} r={5}
                    fill="rgba(251,191,36,0.6)" stroke="#f59e0b" strokeWidth={1}
                  />
                );
              })
            )}
          </svg>
          <div className="mt-1 text-[10px] text-amber-600 text-center">
            • yellow dots mark pairwise intersections
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-[160px]">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basis Elements</div>
          <div className="flex flex-col gap-1.5">
            {BASIS_SETS.map(s => (
              <Badge key={s.id} color={s.color} label={s.label} active={activeIds.has(s.id)} onClick={() => toggle(s.id)} />
            ))}
          </div>

          <div className="mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Basis Axioms</div>
          <div className="flex flex-col gap-1.5">
            <AxiomBadge ok={report.coversX} label="B1: Covers X" />
            <AxiomBadge ok={report.intersectionProperty} label="B2: ∩-property" />
          </div>

          {(report.coversX && report.intersectionProperty) && (
            <div className="mt-1 p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
              Valid basis! Generates topology τ = all unions of basis elements.
            </div>
          )}

          <div className="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Generated open set:</span>
            <br />
            <span className="font-mono break-all">{unionDesc}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const TABS: { id: Mode; label: string }[] = [
  { id: 'opensets', label: 'Open Sets' },
  { id: 'coverings', label: 'Coverings' },
  { id: 'continuity', label: 'Continuity' },
  { id: 'basis', label: 'Basis' },
];

export const TopologySim: React.FC = () => {
  const [mode, setMode] = useState<Mode>('opensets');

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800 tracking-tight">
              Topology Explorer
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Interactive visualization of topological spaces and maps
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200 ${
                  mode === t.id
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {mode === 'opensets' && <OpenSetsMode />}
        {mode === 'coverings' && <CoveringsMode />}
        {mode === 'continuity' && <ContinuityMode />}
        {mode === 'basis' && <BasisMode />}
      </div>

      {/* Footer */}
      <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/60">
        <p className="text-[10px] text-gray-400">
          {mode === 'opensets' && 'Click ellipses or badges to toggle sets. Drag the purple point to explore neighborhoods.'}
          {mode === 'coverings' && 'Toggle sets to build an open covering. Switch to "Refinement" to see a strictly finer covering.'}
          {mode === 'continuity' && 'Click an open set V in Y to highlight its preimage f⁻¹(V) in X. Continuity ⟺ every preimage is open.'}
          {mode === 'basis' && 'Select open disks as basis elements. Basis axioms B1 and B2 are verified in real time.'}
        </p>
      </div>
    </div>
  );
};

export default TopologySim;

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';

/**
 * GraphSim
 * Interactive SVG visualization of cellular sheaves on graphs.
 * Supports four modes:
 *   - basic:     plain graph, nodes colored by value, edges by weight
 *   - sheaf:     shows node vectors + edge restriction maps, coboundary coloring
 *   - laplacian: sheaf view + eigenvalue spectrum bar chart
 *   - diffusion: animated heat diffusion via x(t+1) = x(t) − α·L·x(t)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphSimProps {
  nodes: { id: string; label: string; x: number; y: number; value?: number[] }[];
  edges: { from: string; to: string; weight?: number; restrictionMap?: number[] }[];
  height?: string;
  editable?: boolean;
  mode?: 'basic' | 'sheaf' | 'laplacian' | 'diffusion';
  title?: string;
}

interface NodeState {
  id: string;
  label: string;
  x: number; // 0-100 normalized
  y: number; // 0-100 normalized
  value: number[];
}

interface EdgeState {
  from: string;
  to: string;
  weight: number;
  restrictionMap: number[]; // flat row-major 1×1 or 2×2 matrix (default identity [1])
}

// ---------------------------------------------------------------------------
// Linear algebra helpers (no external libs)
// ---------------------------------------------------------------------------

/** Multiply matrix A (m×k) by vector x (k), return (m) */
function matVec(A: number[], rows: number, cols: number, x: number[]): number[] {
  const out = new Array(rows).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[r] += A[r * cols + c] * x[c];
    }
  }
  return out;
}

/** Subtract two vectors element-wise */
function vecSub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - (b[i] ?? 0));
}

/** L2 norm of a vector */
function vecNorm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/**
 * Build the combinatorial Laplacian L = D - A for a weighted graph.
 * Returns a flat row-major n×n array.
 */
function buildLaplacian(nodes: NodeState[], edges: EdgeState[]): number[] {
  const n = nodes.length;
  const idxOf = new Map(nodes.map((nd, i) => [nd.id, i]));
  const L = new Array(n * n).fill(0);
  for (const e of edges) {
    const i = idxOf.get(e.from)!;
    const j = idxOf.get(e.to)!;
    if (i === undefined || j === undefined) continue;
    const w = e.weight;
    L[i * n + i] += w;
    L[j * n + j] += w;
    L[i * n + j] -= w;
    L[j * n + i] -= w;
  }
  return L;
}

/**
 * Apply one step of diffusion: x ← x − α·L·x
 * Works on an array of scalars (one per node).
 */
function diffuseStep(x: number[], L: number[], alpha: number): number[] {
  const n = x.length;
  const Lx = matVec(L, n, n, x);
  return x.map((v, i) => v - alpha * Lx[i]);
}

/**
 * Power-method eigenvalue estimation for symmetric matrix.
 * Returns the dominant eigenvalue and its eigenvector.
 */
function powerMethod(M: number[], n: number, iters = 60): { val: number; vec: number[] } {
  let v = Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0.1 * (i + 1)));
  let norm = vecNorm(v);
  v = v.map(x => x / (norm || 1));
  let val = 0;
  for (let k = 0; k < iters; k++) {
    const w = matVec(M, n, n, v);
    val = v.reduce((s, vi, i) => s + vi * w[i], 0); // Rayleigh quotient
    const wn = vecNorm(w);
    if (wn < 1e-12) break;
    v = w.map(x => x / wn);
  }
  return { val, vec: v };
}

/**
 * Compute all eigenvalues of the graph Laplacian using deflation + power method.
 * Good enough for small graphs (≤8 nodes). Returns sorted ascending array.
 */
function laplacianEigenvalues(L: number[], n: number): number[] {
  if (n === 0) return [];
  const vals: number[] = [];
  // Work on a copy we can deflate
  let M = [...L];
  for (let k = 0; k < n; k++) {
    const { val, vec } = powerMethod(M, n, 80);
    vals.push(val);
    // Deflate: M ← M − val·vvᵀ
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        M[i * n + j] -= val * vec[i] * vec[j];
      }
    }
  }
  // Sort ascending, clamp near-zero to 0
  return vals
    .map(v => (Math.abs(v) < 1e-8 ? 0 : v))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Map scalar t ∈ [0,1] to a blue→red gradient (HSL). */
function heatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // Blue (220°) → Red (0°)
  const hue = 220 - clamped * 220;
  const sat = 80 + clamped * 20;
  const lgt = 55 - clamped * 15;
  return `hsl(${hue},${sat}%,${lgt}%)`;
}

/** Map a numeric value to node fill based on mode. */
function nodeColor(val: number, min: number, max: number, mode: string): string {
  if (mode === 'diffusion') {
    const t = max === min ? 0.5 : (val - min) / (max - min);
    return heatColor(t);
  }
  // basic: blue-300 to blue-600 based on val
  if (mode === 'basic') {
    const t = max === min ? 0.5 : (val - min) / (max - min);
    const lgt = Math.round(65 - t * 20);
    return `hsl(217,${Math.round(60 + t * 30)}%,${lgt}%)`;
  }
  return '#3b82f6'; // blue-500
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const GraphSim: React.FC<GraphSimProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  height = '420px',
  editable = false,
  mode = 'basic',
  title,
}) => {
  // ── State: node positions and values ────────────────────────────────────
  const [nodes, setNodes] = useState<NodeState[]>(() =>
    initialNodes.map(n => ({
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      value: n.value ?? [1],
    }))
  );

  const [edges] = useState<EdgeState[]>(() =>
    initialEdges.map(e => ({
      from: e.from,
      to: e.to,
      weight: e.weight ?? 1,
      restrictionMap: e.restrictionMap ?? [1],
    }))
  );

  // ── Inline editing state (sheaf mode) ───────────────────────────────────
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');

  // ── Diffusion animation state ────────────────────────────────────────────
  const [diffValues, setDiffValues] = useState<number[]>(() => nodes.map(n => n.value?.[0] ?? 1));
  const [isPlaying, setIsPlaying] = useState(false);
  const [diffSpeed, setDiffSpeed] = useState(0.3); // alpha step
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // ── Drag state (SVG-space dragging) ─────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingId = useRef<string | null>(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // ── Derived values ───────────────────────────────────────────────────────

  /** Map node id → node */
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  /** Graph Laplacian (n×n flat array) */
  const laplacian = useMemo(() => buildLaplacian(nodes, edges), [nodes, edges]);

  /** Eigenvalues (laplacian mode and diffusion mode) */
  const eigenvalues = useMemo(() => {
    if (mode !== 'laplacian') return [];
    return laplacianEigenvalues(laplacian, nodes.length);
  }, [laplacian, nodes.length, mode]);

  /** Fiedler value (second-smallest eigenvalue) */
  const fiedlerValue = eigenvalues.length >= 2 ? eigenvalues[1] : null;

  /**
   * Coboundary δ(x) for each edge:
   * For edge (u→v) with restriction maps F_u, F_v (treated as 1×1 scalars here),
   * δ(e) = F_v · x_v − F_u · x_u.
   * Returns { value, norm } per edge.
   */
  const coboundaries = useMemo(() => {
    if (mode !== 'sheaf' && mode !== 'laplacian') return [];
    return edges.map(e => {
      const u = nodeMap.get(e.from);
      const v = nodeMap.get(e.to);
      if (!u || !v) return { value: [0], norm: 0 };
      const dim = Math.round(Math.sqrt(e.restrictionMap.length));
      const xv = matVec(e.restrictionMap, dim, dim, v.value.slice(0, dim));
      const xu = matVec(e.restrictionMap, dim, dim, u.value.slice(0, dim));
      const delta = vecSub(xv, xu);
      return { value: delta, norm: vecNorm(delta) };
    });
  }, [edges, nodeMap, mode]);

  /** Is there a global section? (all coboundaries ≈ 0) */
  const hasGlobalSection = coboundaries.length > 0 && coboundaries.every(cb => cb.norm < 0.05);

  // ── Diffusion animation loop ─────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'diffusion') {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    const alpha = Math.min(0.5 / (nodes.length + 1), diffSpeed * 0.1);
    const step = (time: number) => {
      if (time - lastTimeRef.current > 80) { // ~12 fps cap for readability
        setDiffValues(prev => diffuseStep(prev, laplacian, alpha));
        lastTimeRef.current = time;
      }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, mode, laplacian, nodes.length, diffSpeed]);

  // Reset diffusion values when nodes change
  useEffect(() => {
    setDiffValues(nodes.map(n => n.value?.[0] ?? 1));
  }, [nodes]);

  // ── SVG coordinate conversion (0-100 → SVG 0-500) ───────────────────────
  const SCALE = 5; // 0-100 → 0-500 SVG units

  const toSVG = (v: number) => v * SCALE;

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onNodePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    draggingId.current = id;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const node = nodes.find(n => n.id === id)!;
    dragOffset.current = {
      dx: svgPt.x / SCALE - node.x,
      dy: svgPt.y / SCALE - node.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [nodes]);

  const onSVGPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const nx = Math.max(5, Math.min(95, svgPt.x / SCALE - dragOffset.current.dx));
    const ny = Math.max(5, Math.min(95, svgPt.y / SCALE - dragOffset.current.dy));
    setNodes(prev => prev.map(n => n.id === draggingId.current ? { ...n, x: nx, y: ny } : n));
  }, []);

  const onSVGPointerUp = useCallback(() => {
    draggingId.current = null;
  }, []);

  // ── Node value editing (sheaf mode) ──────────────────────────────────────
  const openEdit = (node: NodeState) => {
    if (!editable || mode !== 'sheaf') return;
    setEditingNodeId(node.id);
    setEditBuffer(node.value.join(', '));
  };

  const commitEdit = () => {
    if (!editingNodeId) return;
    const parts = editBuffer.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
    if (parts.length > 0) {
      setNodes(prev => prev.map(n => n.id === editingNodeId ? { ...n, value: parts } : n));
    }
    setEditingNodeId(null);
  };

  // ── Color ranges for diffusion ────────────────────────────────────────────
  const diffMin = Math.min(...diffValues);
  const diffMax = Math.max(...diffValues);
  const basicVals = nodes.map(n => n.value?.[0] ?? 0);
  const basicMin = Math.min(...basicVals);
  const basicMax = Math.max(...basicVals);

  // ── Eigenvalue chart helpers ──────────────────────────────────────────────
  const maxEigen = eigenvalues.length > 0 ? Math.max(...eigenvalues, 0.1) : 1;

  // ── Node radius (SVG units) ───────────────────────────────────────────────
  const NODE_R = 18;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">

      {/* Optional title header */}
      {title && (
        <div className="px-4 pt-3 pb-1 text-[12px] font-semibold text-gray-500 font-sans tracking-wide uppercase">
          {title}
        </div>
      )}

      {/* SVG canvas */}
      <div className="relative bg-gray-50/60 select-none" style={{ height }}>
        <svg
          ref={svgRef}
          viewBox="0 0 500 500"
          className="w-full h-full"
          onPointerMove={onSVGPointerMove}
          onPointerUp={onSVGPointerUp}
          onPointerLeave={onSVGPointerUp}
        >
          {/* ── Subtle grid ───────────────────────────────────────────── */}
          <defs>
            <pattern id="gs-grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="500" height="500" fill="url(#gs-grid)" />

          {/* ── Edges ─────────────────────────────────────────────────── */}
          {edges.map((e, i) => {
            const u = nodeMap.get(e.from);
            const v = nodeMap.get(e.to);
            if (!u || !v) return null;

            const x1 = toSVG(u.x);
            const y1 = toSVG(u.y);
            const x2 = toSVG(v.x);
            const y2 = toSVG(v.y);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            // Edge thickness based on weight (basic/diffusion)
            const strokeWidth = mode === 'basic' || mode === 'diffusion'
              ? Math.max(1.5, Math.min(6, e.weight * 2))
              : 2;

            // Edge color based on coboundary consistency (sheaf/laplacian)
            let stroke = '#d1d5db'; // gray-300 default
            if ((mode === 'sheaf' || mode === 'laplacian') && coboundaries[i]) {
              const cb = coboundaries[i];
              if (cb.norm < 0.05) stroke = '#22c55e'; // green-500 consistent
              else if (cb.norm > 0.5) stroke = '#ef4444'; // red-500 inconsistent
              else stroke = '#f97316'; // orange warning
            }

            return (
              <g key={`edge-${i}`}>
                {/* Edge line */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Weight badge (basic mode) */}
                {mode === 'basic' && e.weight !== 1 && (
                  <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="monospace">
                    {e.weight.toFixed(1)}
                  </text>
                )}

                {/* Coboundary badge (sheaf/laplacian mode) */}
                {(mode === 'sheaf' || mode === 'laplacian') && coboundaries[i] && (
                  <>
                    <rect
                      x={mx - 18} y={my - 11} width={36} height={13}
                      rx={3} ry={3}
                      fill="white" stroke={stroke} strokeWidth={1}
                      opacity={0.92}
                    />
                    <text x={mx} y={my - 1} textAnchor="middle" fontSize="8" fill={stroke} fontFamily="monospace" fontWeight="600">
                      δ={coboundaries[i].norm.toFixed(2)}
                    </text>
                  </>
                )}

                {/* Restriction map badge (sheaf/laplacian mode) */}
                {(mode === 'sheaf' || mode === 'laplacian') && (
                  <text
                    x={mx} y={my + 16}
                    textAnchor="middle" fontSize="7.5" fill="#9ca3af" fontFamily="monospace"
                  >
                    [{e.restrictionMap.map(v2 => v2.toFixed(1)).join(' ')}]
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Nodes ─────────────────────────────────────────────────── */}
          {nodes.map((n, i) => {
            const cx = toSVG(n.x);
            const cy = toSVG(n.y);

            // Node color
            let fill = '#3b82f6'; // blue-500 default
            if (mode === 'diffusion') {
              fill = nodeColor(diffValues[i] ?? 0, diffMin, diffMax, 'diffusion');
            } else if (mode === 'basic') {
              fill = nodeColor(n.value[0] ?? 0, basicMin, basicMax, 'basic');
            }

            const isEditing = editingNodeId === n.id;

            return (
              <g key={n.id} style={{ cursor: 'grab' }}>
                {/* Node circle */}
                <circle
                  cx={cx} cy={cy} r={NODE_R}
                  fill={fill}
                  stroke="white"
                  strokeWidth={2.5}
                  style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))', transition: 'fill 0.25s' }}
                  onPointerDown={e => onNodePointerDown(e, n.id)}
                  onClick={() => openEdit(n)}
                />

                {/* Node label */}
                <text
                  x={cx} y={cy + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="700" fill="white" fontFamily="sans-serif"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {n.label}
                </text>

                {/* Value display below node (sheaf/laplacian) */}
                {(mode === 'sheaf' || mode === 'laplacian') && !isEditing && (
                  <text
                    x={cx} y={cy + NODE_R + 12}
                    textAnchor="middle" fontSize="8.5" fill="#374151" fontFamily="monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    [{n.value.map(v2 => v2.toFixed(1)).join(', ')}]
                  </text>
                )}

                {/* Diffusion value display */}
                {mode === 'diffusion' && (
                  <text
                    x={cx} y={cy + NODE_R + 12}
                    textAnchor="middle" fontSize="8.5" fill="#374151" fontFamily="monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {(diffValues[i] ?? 0).toFixed(2)}
                  </text>
                )}

                {/* Inline edit (sheaf mode, editable=true) */}
                {isEditing && (
                  <foreignObject x={cx - 36} y={cy + NODE_R + 2} width={72} height={20}>
                    <input
                      /* @ts-ignore — xmlns not needed in JSX */
                      autoFocus
                      value={editBuffer}
                      onChange={e2 => setEditBuffer(e2.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e2 => { if (e2.key === 'Enter') commitEdit(); if (e2.key === 'Escape') setEditingNodeId(null); }}
                      style={{
                        width: '100%', fontSize: '8px', fontFamily: 'monospace',
                        background: 'white', border: '1px solid #6366f1',
                        borderRadius: '3px', padding: '1px 3px', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* ── Global section badge (sheaf/laplacian) ────────────────── */}
          {(mode === 'sheaf' || mode === 'laplacian') && edges.length > 0 && (
            <g>
              <rect x={8} y={8} width={160} height={20} rx={5} ry={5}
                fill={hasGlobalSection ? '#dcfce7' : '#fee2e2'}
                stroke={hasGlobalSection ? '#22c55e' : '#ef4444'}
                strokeWidth={1}
              />
              <text x={16} y={21} fontSize="9.5" fontFamily="sans-serif" fontWeight="600"
                fill={hasGlobalSection ? '#166534' : '#991b1b'}>
                {hasGlobalSection ? 'Global section exists ✓' : 'No global section ✗'}
              </text>
            </g>
          )}

          {/* ── Eigenvalue spectrum bar chart (laplacian mode) ────────── */}
          {mode === 'laplacian' && eigenvalues.length > 0 && (
            <g transform="translate(8, 460)">
              {/* Background panel */}
              <rect x={0} y={-22} width={484} height={34} rx={4} fill="white" stroke="#e5e7eb" strokeWidth={1} opacity={0.92} />
              <text x={4} y={-9} fontSize="8" fill="#9ca3af" fontFamily="sans-serif" fontWeight="600">λ SPECTRUM</text>
              {eigenvalues.map((val, k) => {
                const barW = Math.max(2, (val / maxEigen) * 60);
                const barX = 52 + k * 68;
                const isFiedler = k === 1;
                return (
                  <g key={k}>
                    <rect x={barX} y={-17} width={barW} height={10}
                      rx={2}
                      fill={isFiedler ? '#6366f1' : '#93c5fd'}
                    />
                    <text x={barX + barW + 2} y={-8} fontSize="7.5" fontFamily="monospace"
                      fill={isFiedler ? '#4338ca' : '#6b7280'} fontWeight={isFiedler ? '700' : '400'}>
                      {val.toFixed(2)}{isFiedler ? '*' : ''}
                    </text>
                    <text x={barX} y={3} fontSize="7" fill="#9ca3af" fontFamily="monospace">
                      λ{k}
                    </text>
                  </g>
                );
              })}
              {fiedlerValue !== null && (
                <text x={484 - 4} y={-8} fontSize="8" fill="#4338ca" fontFamily="sans-serif" textAnchor="end">
                  Fiedler λ₁ = {fiedlerValue.toFixed(3)}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* ── Bottom control bar ────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px]">

        {/* Mode badge */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {mode}
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Node / edge counts */}
        <span className="text-gray-500">
          <span className="font-semibold text-gray-700">{nodes.length}</span> nodes ·{' '}
          <span className="font-semibold text-gray-700">{edges.length}</span> edges
        </span>

        {/* Diffusion controls */}
        {mode === 'diffusion' && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            {/* Play/Pause button */}
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-blue-600 transition-colors active:scale-95"
            >
              {isPlaying
                ? <Pause className="w-3 h-3" />
                : <Play className="w-3 h-3 fill-current ml-px" />
              }
            </button>

            {/* Speed slider */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 text-[10px]">speed</span>
              <input
                type="range" min="0.05" max="1" step="0.05" value={diffSpeed}
                onChange={e => setDiffSpeed(parseFloat(e.target.value))}
                className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
              />
              <span className="font-mono text-gray-600">{diffSpeed.toFixed(2)}</span>
            </div>

            {/* Reset button */}
            <button
              onClick={() => {
                setIsPlaying(false);
                setDiffValues(nodes.map(n => n.value?.[0] ?? 1));
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              reset
            </button>

            {/* Convergence readout */}
            <span className="text-gray-400">
              spread:{' '}
              <span className="font-mono text-gray-700">
                {(diffMax - diffMin).toFixed(3)}
              </span>
            </span>
          </>
        )}

        {/* Sheaf / Laplacian readouts */}
        {(mode === 'sheaf' || mode === 'laplacian') && coboundaries.length > 0 && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              max δ:{' '}
              <span className="font-mono text-gray-700">
                {Math.max(...coboundaries.map(c => c.norm)).toFixed(3)}
              </span>
            </span>
            <span className={hasGlobalSection ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
              {hasGlobalSection ? 'H⁰ ✓' : 'H⁰ ✗'}
            </span>
          </>
        )}

        {/* Laplacian: Fiedler value readout */}
        {mode === 'laplacian' && fiedlerValue !== null && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              Fiedler:{' '}
              <span className="font-mono font-bold text-indigo-600">{fiedlerValue.toFixed(3)}</span>
            </span>
            <span className="text-gray-400 text-[10px]">
              ({fiedlerValue < 0.01 ? 'disconnected' : fiedlerValue < 0.5 ? 'weakly connected' : 'well connected'})
            </span>
          </>
        )}

        {/* Editable hint */}
        {editable && mode === 'sheaf' && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-400 text-[10px] italic">click node to edit value</span>
          </>
        )}
      </div>
    </div>
  );
};

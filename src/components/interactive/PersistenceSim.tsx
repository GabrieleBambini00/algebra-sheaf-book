import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { Play, Pause } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistenceSimProps {
  points?: [number, number][];
  height?: string;
  mode?: 'filtration' | 'barcode' | 'diagram' | 'combined';
  editable?: boolean;
  maxRadius?: number;
  title?: string;
}

interface Feature {
  dim: 0 | 1;
  birth: number;
  death: number; // Infinity = still alive
}

// ---------------------------------------------------------------------------
// Default point cloud: two clusters + a rough circle
// ---------------------------------------------------------------------------

const DEFAULT_POINTS: [number, number][] = [
  // Cluster A
  [20, 30], [25, 25], [30, 33], [22, 40], [28, 42],
  // Cluster B
  [65, 35], [70, 28], [75, 38], [68, 45], [72, 50],
  // Rough circle (H₁ feature)
  [47, 15], [57, 22], [60, 35], [53, 48], [42, 42], [38, 28],
];

// ---------------------------------------------------------------------------
// Union-Find for H₀ tracking
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: number[];
  private rank: number[];
  private birth: number[];  // birth time of each root

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
    this.birth = new Array(n).fill(0); // all born at r=0
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  // Returns { died, survivor } indices, or null if already connected.
  // The younger component (higher birth) merges into the older (lower birth).
  union(x: number, y: number, _r: number): { died: number; survivor: number } | null {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return null;

    // Older component survives (elder rule)
    const [survivor, died] =
      this.birth[rx] <= this.birth[ry] ? [rx, ry] : [ry, rx];

    if (this.rank[survivor] < this.rank[died]) {
      // rebalance: make died the child of survivor
    }
    this.parent[died] = survivor;
    if (this.rank[survivor] === this.rank[died]) this.rank[survivor]++;
    return { died, survivor };
  }

  component(x: number): number {
    return this.find(x);
  }

  countRoots(n: number): number {
    let c = 0;
    for (let i = 0; i < n; i++) if (this.find(i) === i) c++;
    return c;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pairwiseDist(pts: [number, number][]): number[][] {
  const n = pts.length;
  const d: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      d[i][j] = d[j][i] = dist(pts[i], pts[j]);
    }
  return d;
}

// ---------------------------------------------------------------------------
// Persistence computation
// ---------------------------------------------------------------------------

function computeFeatures(
  pts: [number, number][],
  distances: number[][],
  maxR: number,
): Feature[] {
  const n = pts.length;
  if (n === 0) return [];

  // Collect all edge lengths sorted
  const edges: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      edges.push({ i, j, d: distances[i][j] });
  edges.sort((a, b) => a.d - b.d);

  const features: Feature[] = [];
  const uf = new UnionFind(n);

  // H₀: every point born at 0
  // We emit one feature per point; one H₀ is the "essential" that lives forever.
  // Merging step:
  for (const e of edges) {
    const r = e.d / 2; // circles of radius r overlap when dist < 2r
    if (r > maxR) continue;
    const merged = uf.union(e.i, e.j, r);
    if (merged) {
      features.push({ dim: 0, birth: 0, death: r });
    }
  }

  // The last surviving component has death = Infinity (we'll cap at maxR for display)
  features.push({ dim: 0, birth: 0, death: Infinity });

  // H₁: simplified — detect triangles.
  // A hole is born when the third edge of a triangle closes a 1-cycle at radius r_close.
  // It dies when the triangle is "filled" (for VR complex: same time the 3rd edge appears,
  // since VR fills all cliques). So VR complex has no persistent H₁ from triangles — instead
  // we track when cycles form vs. filled by noting that in VR the simplex appears
  // with the longest edge. We use a lightweight approach:
  //   - For every triple (i,j,k), birth of H₁ = max(d_ij, d_jk, d_ik)/2 (3rd edge added)
  //   - Death of H₁: same time in VR (since VR fills the triangle immediately).
  // This produces only "zero-length" H₁ bars in pure VR. For a pedagogical visualization
  // we instead use Čech-like detection: mark the cycle as persisting until filled.
  //
  // Pedagogical H₁: for each triple, the cycle is born when the 2nd edge closes
  // (at the min of the max-pair edges) and dies when 3rd edge added (full triangle).
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const d = [
          distances[i][j] / 2,
          distances[j][k] / 2,
          distances[i][k] / 2,
        ].sort((a, b) => a - b); // d[0] <= d[1] <= d[2]
        const birth = d[1]; // 2-simplex (cycle) forms when 2nd-longest edge appears
        const death = d[2]; // filled when 3rd (longest) edge closes triangle
        if (birth < death && birth <= maxR) {
          features.push({
            dim: 1,
            birth,
            death: Math.min(death, maxR * 1.2),
          });
        }
      }
    }
  }

  return features;
}

// ---------------------------------------------------------------------------
// Component colors
// ---------------------------------------------------------------------------

const COMPONENT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4',
];

function componentColor(idx: number): string {
  return COMPONENT_COLORS[idx % COMPONENT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Coordinate mapping helpers (for SVG, normalized 0-100 → pixel)
// ---------------------------------------------------------------------------

function mapX(nx: number, w: number): number {
  return (nx / 100) * w;
}
function mapY(ny: number, h: number): number {
  return (ny / 100) * h;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PersistenceSim({
  points: pointsProp,
  height = '520px',
  mode = 'combined',
  editable = true,
  maxRadius: maxRadiusProp = 40,
  title,
}: PersistenceSimProps) {
  const [pts, setPts] = useState<[number, number][]>(
    pointsProp ?? DEFAULT_POINTS,
  );
  const [radius, setRadius] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rightView, setRightView] = useState<'barcode' | 'diagram'>('barcode');

  const maxR = maxRadiusProp;
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Pairwise distances (cached)
  const distances = useMemo(() => pairwiseDist(pts), [pts]);

  // Persistence features
  const features = useMemo(
    () => computeFeatures(pts, distances, maxR),
    [pts, distances, maxR],
  );

  // Current topology at this radius
  const { edges, triangles, componentMap } = useMemo(() => {
    const n = pts.length;
    const uf = new UnionFind(n);
    const edgeList: [number, number][] = [];
    const triList: [number, number, number][] = [];

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (distances[i][j] / 2 <= radius) {
          uf.union(i, j, distances[i][j] / 2);
          edgeList.push([i, j]);
        }

    // Triangles: all three edges present
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++)
          if (
            distances[i][j] / 2 <= radius &&
            distances[j][k] / 2 <= radius &&
            distances[i][k] / 2 <= radius
          )
            triList.push([i, j, k]);

    // Map root → color index
    const roots: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = uf.find(i);
      if (!roots.includes(r)) roots.push(r);
    }
    const rootIndex = new Map<number, number>();
    roots.forEach((r, idx) => rootIndex.set(r, idx));

    const cmap: number[] = Array.from({ length: n }, (_, i) =>
      rootIndex.get(uf.find(i)) ?? 0,
    );

    return {
      components: uf.countRoots(n),
      edges: edgeList,
      triangles: triList,
      componentMap: cmap,
    };
  }, [pts, distances, radius]);

  // H₀ and H₁ alive at current radius
  const h0alive = useMemo(
    () => features.filter(f => f.dim === 0 && f.birth <= radius && f.death > radius).length,
    [features, radius],
  );
  const h1alive = useMemo(
    () => features.filter(f => f.dim === 1 && f.birth <= radius && f.death > radius).length,
    [features, radius],
  );

  // Animation
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    const step = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      setRadius(r => {
        const next = r + (maxR / 4000) * dt; // full sweep in ~4s
        if (next >= maxR) {
          setPlaying(false);
          return maxR;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      lastTimeRef.current = 0;
    };
  }, [playing, maxR]);

  // SVG dimensions
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 300, h: 300 });
  useEffect(() => {
    if (!svgRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setSvgSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    obs.observe(svgRef.current);
    return () => obs.disconnect();
  }, []);

  // Canvas for barcode / diagram
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Editable: add/remove points
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!editable) return;
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nx = (px / rect.width) * 100;
      const ny = (py / rect.height) * 100;
      setPts(prev => [...prev, [nx, ny]]);
    },
    [editable],
  );

  const handleSvgRightClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      e.preventDefault();
      if (!editable || pts.length === 0) return;
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nx = (px / rect.width) * 100;
      const ny = (py / rect.height) * 100;
      let minD = Infinity;
      let minIdx = -1;
      pts.forEach(([x, y], i) => {
        const d = Math.hypot(x - nx, y - ny);
        if (d < minD) { minD = d; minIdx = i; }
      });
      if (minIdx >= 0) setPts(prev => prev.filter((_, i) => i !== minIdx));
    },
    [editable, pts],
  );

  // Draw barcode / persistence diagram on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 24, right: 20, bottom: 36, left: 44 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const toX = (r: number) => pad.left + (r / maxR) * plotW;
    const capDeath = (d: number) => Math.min(d, maxR);

    if (rightView === 'barcode') {
      // --- Barcode ---
      const h0feats = features.filter(f => f.dim === 0).slice(0, 20);
      const h1feats = features.filter(f => f.dim === 1).slice(0, 30);
      const total = h0feats.length + h1feats.length;
      if (total === 0) return;

      const barH = Math.min(12, Math.max(4, (plotH - 8) / (total + 2)));
      const gap = Math.max(1, barH * 0.3);

      // Axes
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.stroke();

      // x-axis ticks
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const ticks = 5;
      for (let t = 0; t <= ticks; t++) {
        const v = (t / ticks) * maxR;
        const x = toX(v);
        ctx.beginPath();
        ctx.moveTo(x, pad.top + plotH);
        ctx.lineTo(x, pad.top + plotH + 4);
        ctx.strokeStyle = '#d1d5db';
        ctx.stroke();
        ctx.fillText(v.toFixed(0), x, pad.top + plotH + 14);
      }

      // Label
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.font = '11px sans-serif';
      ctx.fillText('radius r', pad.left + plotW / 2, H - 4);

      // H₀ label
      ctx.fillStyle = '#3b82f6';
      ctx.textAlign = 'left';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('H₀', 4, pad.top + 10);

      let yPos = pad.top + 4;
      h0feats.forEach(f => {
        const x1 = toX(f.birth);
        const x2 = toX(capDeath(f.death));
        const alive = f.birth <= radius && capDeath(f.death) > radius;
        ctx.fillStyle = alive ? '#3b82f6' : '#93c5fd';
        ctx.fillRect(x1, yPos, Math.max(2, x2 - x1), barH);
        yPos += barH + gap;
      });

      yPos += 6;
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'left';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('H₁', 4, yPos + 8);

      h1feats.forEach(f => {
        const x1 = toX(f.birth);
        const x2 = toX(capDeath(f.death));
        const alive = f.birth <= radius && capDeath(f.death) > radius;
        ctx.fillStyle = alive ? '#ef4444' : '#fca5a5';
        ctx.fillRect(x1, yPos, Math.max(2, x2 - x1), barH);
        yPos += barH + gap;
      });

      // Current r line
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      const rx = toX(radius);
      ctx.beginPath();
      ctx.moveTo(rx, pad.top);
      ctx.lineTo(rx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // r label
      ctx.fillStyle = '#374151';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`r=${radius.toFixed(1)}`, Math.min(rx + 3, W - 40), pad.top + 10);
    } else {
      // --- Persistence diagram ---
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.stroke();

      const toXD = (b: number) => pad.left + (b / maxR) * plotW;
      const toYD = (d: number) => pad.top + plotH - (Math.min(d, maxR) / maxR) * plotH;

      // Diagonal
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + plotH);
      ctx.lineTo(pad.left + plotW, pad.top);
      ctx.stroke();
      ctx.setLineDash([]);

      // Axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('birth', pad.left + plotW / 2, H - 4);
      ctx.save();
      ctx.translate(12, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('death', 0, 0);
      ctx.restore();

      // Ticks
      for (let t = 0; t <= 4; t++) {
        const v = (t / 4) * maxR;
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(0), toXD(v), pad.top + plotH + 14);
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(0), pad.left - 4, toYD(v) + 4);
      }

      // Points
      features.forEach(f => {
        const b = f.birth;
        const d = capDeath(f.death);
        if (b > maxR) return;
        const px = toXD(b);
        const py = toYD(d);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = f.dim === 0 ? '#3b82f6' : '#ef4444';
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = f.dim === 0 ? '#1d4ed8' : '#b91c1c';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [features, radius, maxR, rightView]);

  // Decide layout
  const showLeft = mode !== 'barcode' && mode !== 'diagram';
  const showRight = mode !== 'filtration';
  const onlyRight = !showLeft && showRight;

  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden font-sans flex flex-col"
      style={{ height }}
    >
      {/* Header */}
      {title && (
        <div className="px-4 py-2 border-b border-gray-100 text-sm font-semibold text-gray-700 bg-gray-50/60">
          {title}
        </div>
      )}

      {/* Main panels */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT: Filtration SVG */}
        {showLeft && (
          <div
            className={`relative flex flex-col ${onlyRight ? '' : showRight ? 'w-1/2' : 'w-full'} border-r border-gray-100`}
          >
            {/* Controls */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
              <button
                className="rounded-full p-1 bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                onClick={() => {
                  if (radius >= maxR) setRadius(0);
                  setPlaying(p => !p);
                }}
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <span className="text-[11px] text-gray-500 w-6">r=</span>
              <input
                type="range"
                min={0}
                max={maxR}
                step={0.1}
                value={radius}
                onChange={e => {
                  setPlaying(false);
                  setRadius(parseFloat(e.target.value));
                }}
                className="flex-1 accent-blue-500 h-1"
              />
              <span className="text-[11px] text-gray-600 w-10 tabular-nums">
                {radius.toFixed(1)}
              </span>
              {editable && (
                <span className="text-[10px] text-gray-400 ml-1">
                  click=add · right-click=remove
                </span>
              )}
            </div>

            {/* SVG canvas */}
            <svg
              ref={svgRef}
              className="flex-1 w-full cursor-crosshair select-none"
              onClick={handleSvgClick}
              onContextMenu={handleSvgRightClick}
            >
              {/* Triangles */}
              {triangles.map(([i, j, k], idx) => {
                const xi = mapX(pts[i][0], svgSize.w);
                const yi = mapY(pts[i][1], svgSize.h);
                const xj = mapX(pts[j][0], svgSize.w);
                const yj = mapY(pts[j][1], svgSize.h);
                const xk = mapX(pts[k][0], svgSize.w);
                const yk = mapY(pts[k][1], svgSize.h);
                return (
                  <polygon
                    key={`tri-${idx}`}
                    points={`${xi},${yi} ${xj},${yj} ${xk},${yk}`}
                    fill="#dbeafe"
                    fillOpacity={0.7}
                    stroke="none"
                  />
                );
              })}

              {/* Circles */}
              {pts.map(([nx, ny], i) => {
                const cx = mapX(nx, svgSize.w);
                const cy = mapY(ny, svgSize.h);
                const r = (radius / 100) * svgSize.w;
                return (
                  <circle
                    key={`circle-${i}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={componentColor(componentMap[i])}
                    fillOpacity={0.08}
                    stroke={componentColor(componentMap[i])}
                    strokeOpacity={0.3}
                    strokeWidth={1}
                  />
                );
              })}

              {/* Edges */}
              {edges.map(([i, j], idx) => {
                const x1 = mapX(pts[i][0], svgSize.w);
                const y1 = mapY(pts[i][1], svgSize.h);
                const x2 = mapX(pts[j][0], svgSize.w);
                const y2 = mapY(pts[j][1], svgSize.h);
                return (
                  <line
                    key={`edge-${idx}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#60a5fa"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                  />
                );
              })}

              {/* Points */}
              {pts.map(([nx, ny], i) => {
                const cx = mapX(nx, svgSize.w);
                const cy = mapY(ny, svgSize.h);
                return (
                  <circle
                    key={`pt-${i}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={componentColor(componentMap[i])}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* RIGHT: Barcode / Diagram */}
        {showRight && (
          <div
            className={`relative flex flex-col ${showLeft ? 'w-1/2' : 'w-full'}`}
          >
            {/* Toggle in combined mode */}
            {mode === 'combined' && (
              <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
                <button
                  className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${rightView === 'barcode' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                  onClick={() => setRightView('barcode')}
                >
                  Barcode
                </button>
                <button
                  className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${rightView === 'diagram' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                  onClick={() => setRightView('diagram')}
                >
                  Diagram
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0 relative">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                width={600}
                height={400}
                style={{ display: 'block' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px] flex-shrink-0">
        <StatPill label="r" value={radius.toFixed(2)} />
        <StatPill label="points" value={String(pts.length)} />
        <StatPill label="H₀" value={String(h0alive)} color="#3b82f6" />
        <StatPill label="H₁" value={String(h1alive)} color="#ef4444" />
        <StatPill label="edges" value={String(edges.length)} />
        <StatPill label="triangles" value={String(triangles.length)} />
      </div>
    </div>
  );
}

// Small helper
function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <span className="flex items-center gap-1 text-gray-600">
      <span className="font-medium" style={color ? { color } : undefined}>
        {label}
      </span>
      <span className="tabular-nums text-gray-800">{value}</span>
    </span>
  );
}

export default PersistenceSim;

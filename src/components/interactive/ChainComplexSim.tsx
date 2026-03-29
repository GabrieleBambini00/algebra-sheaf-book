import { useState, useMemo, useCallback } from 'react';

/**
 * ChainComplexSim
 * Visualizes chain complexes and cohomology for an algebra/sheaf theory textbook.
 * Supports complex, exact, and cohomology display modes with live editing.
 */

// ── Linear algebra helpers ────────────────────────────────────────────────────

function cloneMatrix(m: number[][]): number[][] {
  return m.map(row => [...row]);
}

/** Gaussian elimination with partial pivoting. Returns row-echelon form rank. */
function rank(matrix: number[][]): number {
  if (matrix.length === 0 || matrix[0].length === 0) return 0;
  const m = cloneMatrix(matrix);
  const rows = m.length;
  const cols = m[0].length;
  let pivotRow = 0;
  const EPS = 1e-9;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    // Find pivot
    let maxRow = pivotRow;
    let maxVal = Math.abs(m[pivotRow][col]);
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > maxVal) {
        maxVal = Math.abs(m[r][col]);
        maxRow = r;
      }
    }
    if (maxVal < EPS) continue;

    // Swap
    [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];

    // Eliminate below
    const pivot = m[pivotRow][col];
    for (let r = pivotRow + 1; r < rows; r++) {
      const factor = m[r][col] / pivot;
      for (let c = col; c < cols; c++) {
        m[r][c] -= factor * m[pivotRow][c];
      }
    }
    pivotRow++;
  }
  return pivotRow;
}

/** Multiply two matrices A (r×k) × B (k×c) → r×c */
function matMul(A: number[][], B: number[][]): number[][] {
  const r = A.length;
  const k = A[0]?.length ?? 0;
  const c = B[0]?.length ?? 0;
  const C: number[][] = Array.from({ length: r }, () => Array(c).fill(0));
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j];
  return C;
}

/** Check if A * B ≈ 0 (chain complex condition) */
function isZeroMap(A: number[][], B: number[][]): boolean {
  if (A.length === 0 || B.length === 0) return true;
  if (A[0].length !== B.length) return false;
  const C = matMul(A, B);
  const EPS = 1e-8;
  return C.every(row => row.every(v => Math.abs(v) < EPS));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Space {
  label: string;
  dim: number;
  basis?: string[];
}

interface MapDef {
  matrix: number[][];
  label?: string;
}

export interface ChainComplexSimProps {
  spaces: Space[];
  maps: MapDef[];
  height?: string;
  editable?: boolean;
  showCohomology?: boolean;
  title?: string;
  mode?: 'complex' | 'exact' | 'cohomology';
}

// ── Derived quantities ────────────────────────────────────────────────────────

interface MapInfo {
  rankVal: number;
  kernelDim: number;
  imageDim: number;
  complexOk: boolean; // im(δᵢ) ⊂ ker(δᵢ₊₁)
}

interface SpaceInfo {
  cohomDim: number; // dim ker(δᵢ) - dim im(δᵢ₋₁)
  kerDim: number;
  imPrevDim: number;
}

function computeAll(spaces: Space[], maps: MapDef[]): { mapInfos: MapInfo[]; spaceInfos: SpaceInfo[] } {
  const mapInfos: MapInfo[] = maps.map((mp, i) => {
    const src = spaces[i];
    if (!src || mp.matrix.length === 0) return { rankVal: 0, kernelDim: 0, imageDim: 0, complexOk: true };
    const r = rank(mp.matrix);
    const kerDim = src.dim - r;
    // Check δᵢ₊₁ ∘ δᵢ = 0
    const nextMap = maps[i + 1];
    const complexOk = nextMap ? isZeroMap(nextMap.matrix, mp.matrix) : true;
    return { rankVal: r, kernelDim: Math.max(0, kerDim), imageDim: r, complexOk };
  });

  const spaceInfos: SpaceInfo[] = spaces.map((sp, i) => {
    const kerDim = i < mapInfos.length ? mapInfos[i].kernelDim : sp.dim;
    const imPrevDim = i > 0 ? mapInfos[i - 1].imageDim : 0;
    const cohomDim = Math.max(0, kerDim - imPrevDim);
    return { cohomDim, kerDim, imPrevDim };
  });

  return { mapInfos, spaceInfos };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const SPACE_W = 110;
const SPACE_H = 80;
const GAP = 90; // horizontal gap between space centres
const SVG_PAD = 20;
const TOP_PAD = 30;

function spaceX(i: number) {
  return SVG_PAD + i * (SPACE_W + GAP);
}

function totalSvgWidth(n: number) {
  return SVG_PAD * 2 + n * SPACE_W + (n - 1) * GAP;
}

/** Arrowhead marker definition */
const ArrowMarker = ({ id, color }: { id: string; color: string }) => (
  <defs>
    <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill={color} />
    </marker>
  </defs>
);

/** A single space box */
function SpaceBox({
  space, x, y, mode, spaceInfo, isLast: _isLast,
}: {
  space: Space; x: number; y: number; mode: string;
  spaceInfo: SpaceInfo; isLast: boolean;
}) {
  const cohomColor = spaceInfo.cohomDim === 0 ? '#16a34a' : '#d97706';
  const cohomBg = spaceInfo.cohomDim === 0 ? '#dcfce7' : '#fef3c7';
  const cohomBorder = spaceInfo.cohomDim === 0 ? '#86efac' : '#fcd34d';

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Main box */}
      <rect x={0} y={0} width={SPACE_W} height={SPACE_H}
        rx={12} ry={12}
        fill="white" stroke="#e5e7eb" strokeWidth={1.5}
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.07))' }} />

      {/* Label */}
      <text x={SPACE_W / 2} y={22} textAnchor="middle"
        fontFamily="serif" fontSize={15} fontWeight="bold" fill="#1e293b">
        {space.label}
      </text>

      {/* Dim */}
      <text x={SPACE_W / 2} y={38} textAnchor="middle"
        fontFamily="monospace" fontSize={10} fill="#64748b">
        dim = {space.dim}
      </text>

      {/* Basis (up to 3) */}
      {space.basis && space.basis.slice(0, 3).map((b, bi) => (
        <text key={bi} x={SPACE_W / 2} y={52 + bi * 12} textAnchor="middle"
          fontFamily="monospace" fontSize={9} fill="#94a3b8">
          {b}
        </text>
      ))}

      {/* Cohomology badge */}
      {(mode === 'cohomology' || mode === 'exact') && (
        <g transform={`translate(${SPACE_W - 18}, -14)`}>
          <circle cx={0} cy={0} r={13}
            fill={cohomBg} stroke={cohomBorder} strokeWidth={1.5} />
          <text x={0} y={4} textAnchor="middle"
            fontFamily="monospace" fontSize={9} fontWeight="bold" fill={cohomColor}>
            H{spaceInfo.cohomDim}
          </text>
        </g>
      )}
    </g>
  );
}

/** Arrow + map label between two spaces */
function MapArrow({
  fromX, toX, y, mapDef, mapInfo, showMatrix, mode, index,
}: {
  fromX: number; toX: number; y: number;
  mapDef: MapDef; mapInfo: MapInfo;
  showMatrix: boolean; mode: string; index: number;
}) {
  const [hover, setHover] = useState(false);
  const x1 = fromX + SPACE_W;
  const x2 = toX - 3; // leave room for arrowhead
  const mx = (x1 + x2) / 2;
  const arrowColor = mapInfo.complexOk ? '#6b7280' : '#ef4444';
  const markerId = `arrow-${index}-${mapInfo.complexOk ? 'ok' : 'bad'}`;
  const labelColor = mapInfo.complexOk ? '#374151' : '#dc2626';

  const showMat = hover || showMatrix;
  const mat = mapDef.matrix;
  const rows = mat.length;
  const cols = mat[0]?.length ?? 0;

  return (
    <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ArrowMarker id={markerId} color={arrowColor} />
      {/* Arrow line */}
      <line x1={x1} y1={y + SPACE_H / 2} x2={x2} y2={y + SPACE_H / 2}
        stroke={arrowColor} strokeWidth={1.8}
        markerEnd={`url(#${markerId})`} />

      {/* Map label */}
      <text x={mx} y={y + SPACE_H / 2 - 10} textAnchor="middle"
        fontFamily="serif" fontSize={12} fontStyle="italic" fill={labelColor}>
        {mapDef.label ?? `δ${index}`}
      </text>

      {/* Rank/nullity annotation */}
      {mode === 'complex' && (
        <text x={mx} y={y + SPACE_H / 2 + 16} textAnchor="middle"
          fontFamily="monospace" fontSize={8} fill="#94a3b8">
          rk={mapInfo.rankVal} ker={mapInfo.kernelDim}
        </text>
      )}

      {/* Matrix tooltip on hover */}
      {showMat && rows > 0 && cols > 0 && (
        <g transform={`translate(${mx - cols * 11},${y + SPACE_H / 2 + 20})`}>
          <rect x={-4} y={-2} width={cols * 22 + 8} height={rows * 14 + 8}
            rx={4} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1}
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.08))' }} />
          {mat.map((row, ri) =>
            row.map((val, ci) => (
              <text key={`${ri}-${ci}`} x={ci * 22 + 7} y={ri * 14 + 10}
                fontFamily="monospace" fontSize={9} fill="#334155" textAnchor="middle">
                {Number.isInteger(val) ? val : val.toFixed(1)}
              </text>
            ))
          )}
        </g>
      )}

      {/* Chain complex condition indicator */}
      {!mapInfo.complexOk && (
        <text x={mx} y={y - 4} textAnchor="middle"
          fontSize={11} fill="#ef4444">✗</text>
      )}
    </g>
  );
}

/** Editable matrix entries in the bottom bar */
function EditableMatrix({
  matrix, onChange, label,
}: {
  matrix: number[][];
  onChange: (r: number, c: number, val: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-start gap-1">
      <span className="font-mono text-[10px] font-semibold text-gray-400 mt-1">{label}</span>
      <span className="text-gray-300 text-sm leading-none mt-0.5">[</span>
      <div className="flex flex-col gap-0.5">
        {matrix.map((row, ri) => (
          <div key={ri} className="flex gap-0.5">
            {row.map((val, ci) => (
              <input
                key={ci}
                type="number"
                step="1"
                defaultValue={val}
                onChange={e => {
                  const n = parseFloat(e.target.value);
                  if (!isNaN(n)) onChange(ri, ci, n);
                }}
                className="w-8 bg-gray-100 border border-gray-200 rounded text-center text-[9px] font-mono text-gray-900 px-0 py-px focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            ))}
          </div>
        ))}
      </div>
      <span className="text-gray-300 text-sm leading-none mt-0.5">]</span>
    </div>
  );
}

/** Cohomology mode: quotient visualisation for one space */
function CohomologyBlock({
  space, spaceInfo, x, y,
}: {
  space: Space; spaceInfo: SpaceInfo; x: number; y: number;
}) {
  void SPACE_H; // totalH available for future use
  const blockW = SPACE_W;
  const kerFrac = space.dim > 0 ? spaceInfo.kerDim / space.dim : 0;
  const imFrac = space.dim > 0 ? spaceInfo.imPrevDim / space.dim : 0;
  const cohomColor = spaceInfo.cohomDim === 0 ? '#16a34a' : '#f59e0b';

  return (
    <g transform={`translate(${x},${y + SPACE_H + 10})`}>
      {/* Outer = kernel */}
      <rect x={0} y={0} width={blockW} height={32}
        rx={6} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1} />
      <text x={blockW / 2} y={10} textAnchor="middle"
        fontFamily="monospace" fontSize={8} fill="#1d4ed8">
        ker δ = {spaceInfo.kerDim}
      </text>

      {/* Inner = image of previous */}
      {spaceInfo.imPrevDim > 0 && (
        <>
          <rect x={4} y={14} width={Math.max(4, (blockW - 8) * (imFrac / Math.max(kerFrac, 0.001)))} height={14}
            rx={4} fill="#fde68a" stroke="#fbbf24" strokeWidth={1} />
          <text x={6 + (blockW - 8) * (imFrac / Math.max(kerFrac, 0.001)) / 2} y={24}
            textAnchor="middle" fontFamily="monospace" fontSize={7} fill="#92400e">
            im δ = {spaceInfo.imPrevDim}
          </text>
        </>
      )}

      {/* Cohomology label */}
      <text x={blockW / 2} y={48} textAnchor="middle"
        fontFamily="serif" fontSize={11} fontWeight="bold" fill={cohomColor}>
        H = {spaceInfo.cohomDim}
      </text>
    </g>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ChainComplexSim({
  spaces: initialSpaces,
  maps: initialMaps,
  height = '320px',
  editable = false,
  showCohomology = false,
  title,
  mode = 'complex',
}: ChainComplexSimProps) {
  const [spaces] = useState<Space[]>(initialSpaces);
  const [maps, setMaps] = useState<MapDef[]>(initialMaps);
  const [showAllMatrices, setShowAllMatrices] = useState(false);

  const effectiveMode: string = showCohomology ? 'cohomology' : mode;

  const { mapInfos, spaceInfos } = useMemo(
    () => computeAll(spaces, maps),
    [spaces, maps],
  );

  const n = spaces.length;
  const svgW = Math.max(300, totalSvgWidth(n));
  const svgH = effectiveMode === 'cohomology' ? SPACE_H + 90 : SPACE_H + 10;
  const totalDim = spaces.reduce((s, sp) => s + sp.dim, 0);
  const isExact = spaceInfos.every(si => si.cohomDim === 0);
  const allComplexOk = mapInfos.every(mi => mi.complexOk);
  const cohomSummary = spaceInfos.map(si => si.cohomDim).join(', ');

  const handleMatrixChange = useCallback((mapIdx: number, r: number, c: number, val: number) => {
    setMaps(prev => {
      const next = prev.map((m, i) => {
        if (i !== mapIdx) return m;
        const mat = m.matrix.map(row => [...row]);
        mat[r][c] = val;
        return { ...m, matrix: mat };
      });
      return next;
    });
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      {title && (
        <div className="px-5 pt-4 pb-2 border-b border-gray-100">
          <h3 className="font-serif text-base font-semibold text-gray-800">{title}</h3>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="flex-1 overflow-x-auto bg-gray-50/40 px-2 py-4" style={{ minHeight: height }}>
        <svg
          width={svgW}
          height={TOP_PAD + svgH + SVG_PAD}
          style={{ display: 'block', margin: '0 auto', transition: 'all 0.3s' }}
        >
          {/* Exact mode: glow rects behind each space */}
          {effectiveMode === 'exact' && spaces.map((_, i) => {
            const si = spaceInfos[i];
            const glowColor = si.cohomDim === 0 ? '#bbf7d0' : '#fecaca';
            return (
              <rect key={i}
                x={spaceX(i) - 4} y={TOP_PAD - 4}
                width={SPACE_W + 8} height={SPACE_H + 8}
                rx={16} fill={glowColor} opacity={0.6}
                style={{ transition: 'fill 0.4s' }} />
            );
          })}

          {/* Arrows */}
          {maps.map((mp, i) => (
            <MapArrow
              key={i}
              fromX={spaceX(i)}
              toX={spaceX(i + 1)}
              y={TOP_PAD}
              mapDef={mp}
              mapInfo={mapInfos[i]}
              showMatrix={showAllMatrices}
              mode={effectiveMode}
              index={i}
            />
          ))}

          {/* Space boxes */}
          {spaces.map((sp, i) => (
            <SpaceBox
              key={i}
              space={sp}
              x={spaceX(i)}
              y={TOP_PAD}
              mode={effectiveMode}
              spaceInfo={spaceInfos[i]}
              isLast={i === n - 1}
            />
          ))}

          {/* Cohomology quotient blocks */}
          {effectiveMode === 'cohomology' && spaces.map((sp, i) => (
            <CohomologyBlock
              key={i}
              space={sp}
              spaceInfo={spaceInfos[i]}
              x={spaceX(i)}
              y={TOP_PAD}
            />
          ))}
        </svg>
      </div>

      {/* Editable matrices */}
      {editable && (
        <div className="border-t border-gray-100 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Edit maps</p>
          <div className="flex flex-wrap gap-4 items-start">
            {maps.map((mp, i) => (
              <EditableMatrix
                key={i}
                matrix={mp.matrix}
                label={mp.label ?? `δ${i}`}
                onChange={(r, c, val) => handleMatrixChange(i, r, c, val)}
              />
            ))}
          </div>
          {/* Chain complex condition */}
          <div className="mt-2 flex flex-wrap gap-3">
            {maps.slice(0, -1).map((_, i) => {
              const ok = mapInfos[i + 1] ? isZeroMap(maps[i + 1].matrix, maps[i].matrix) : true;
              return (
                <span key={i} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                  δ{i + 1}∘δ{i} = 0 {ok ? '✓' : '✗'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px]">
        {/* Length */}
        <span className="text-gray-500">
          Length <span className="font-mono font-semibold text-gray-700">{n}</span>
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Total dim */}
        <span className="text-gray-500">
          Total dim <span className="font-mono font-semibold text-gray-700">{totalDim}</span>
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Complex condition */}
        <span className={allComplexOk ? 'text-green-700' : 'text-red-600'}>
          {allComplexOk ? '✓ Chain complex' : '✗ Not a complex'}
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Exactness */}
        <span className={isExact ? 'text-green-700' : 'text-amber-700'}>
          {isExact ? '✓ Exact' : '~ Non-exact'}
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Cohomology */}
        <span className="text-gray-500">
          H* = (<span className="font-mono text-gray-700">{cohomSummary}</span>)
        </span>

        {/* Toggle matrix display */}
        <button
          onClick={() => setShowAllMatrices(p => !p)}
          className="ml-auto text-[10px] px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
        >
          {showAllMatrices ? 'Hide' : 'Show'} matrices
        </button>
      </div>
    </div>
  );
}

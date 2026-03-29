import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'presheaf' | 'restrictions' | 'gluing' | 'stalks';

interface OpenSet {
  id: string;
  label: string;
  cx: number;   // centre x (0-100)
  cy: number;   // centre y (0-100)
  rx: number;   // half-width
  ry: number;   // half-height
  color: string;
}

interface SectionValue {
  openSetId: string;
  label: string;   // e.g. "f(U₁)" or a sample value
  elements: string[];
}

interface PresheafExample {
  name: string;
  openSets: OpenSet[];
  sections: SectionValue[];
  description: string;
}

// ---------------------------------------------------------------------------
// Preset examples
// ---------------------------------------------------------------------------

const EXAMPLES: PresheafExample[] = [
  {
    name: 'Continuous functions',
    description: 'F(U) = {continuous functions U → ℝ}',
    openSets: [
      { id: 'X',  label: 'X',  cx: 50, cy: 50, rx: 44, ry: 38, color: '#e0e7ff' },
      { id: 'U1', label: 'U₁', cx: 33, cy: 47, rx: 24, ry: 20, color: '#bfdbfe' },
      { id: 'U2', label: 'U₂', cx: 67, cy: 47, rx: 24, ry: 20, color: '#bbf7d0' },
      { id: 'U3', label: 'U₁∩U₂', cx: 50, cy: 47, rx: 9, ry: 10, color: '#fde68a' },
    ],
    sections: [
      { openSetId: 'X',  label: 'F(X)',     elements: ['sin x', 'x²', '1'] },
      { openSetId: 'U1', label: 'F(U₁)',    elements: ['sin x', 'x²', '1', 'ln|x|'] },
      { openSetId: 'U2', label: 'F(U₂)',    elements: ['cos x', 'x²', 'eˣ', '1'] },
      { openSetId: 'U3', label: 'F(U₁∩U₂)',elements: ['x²', '1', 'sin x', 'cos x'] },
    ],
  },
  {
    name: 'Constant presheaf',
    description: 'F(U) = ℤ for every non-empty U (NOT a sheaf!)',
    openSets: [
      { id: 'X',  label: 'X',  cx: 50, cy: 50, rx: 44, ry: 38, color: '#e0e7ff' },
      { id: 'U1', label: 'U₁', cx: 33, cy: 47, rx: 24, ry: 20, color: '#fce7f3' },
      { id: 'U2', label: 'U₂', cx: 67, cy: 47, rx: 24, ry: 20, color: '#dcfce7' },
      { id: 'U3', label: 'U₁∩U₂', cx: 50, cy: 47, rx: 9, ry: 10, color: '#fef9c3' },
    ],
    sections: [
      { openSetId: 'X',  label: 'F(X) = ℤ',     elements: ['…,−1','0','1','2','…'] },
      { openSetId: 'U1', label: 'F(U₁) = ℤ',    elements: ['…,−1','0','1','2','…'] },
      { openSetId: 'U2', label: 'F(U₂) = ℤ',    elements: ['…,−1','0','1','2','…'] },
      { openSetId: 'U3', label: 'F(U₁∩U₂) = ℤ', elements: ['…,−1','0','1','2','…'] },
    ],
  },
  {
    name: 'Locally constant',
    description: 'F(U) = locally constant functions U → {0,1}',
    openSets: [
      { id: 'X',  label: 'X',  cx: 50, cy: 50, rx: 44, ry: 38, color: '#e0e7ff' },
      { id: 'U1', label: 'U₁', cx: 33, cy: 47, rx: 24, ry: 20, color: '#ede9fe' },
      { id: 'U2', label: 'U₂', cx: 67, cy: 47, rx: 24, ry: 20, color: '#cffafe' },
      { id: 'U3', label: 'U₁∩U₂', cx: 50, cy: 47, rx: 9, ry: 10, color: '#fef3c7' },
    ],
    sections: [
      { openSetId: 'X',  label: 'F(X)',     elements: ['0', '1'] },
      { openSetId: 'U1', label: 'F(U₁)',    elements: ['0', '1'] },
      { openSetId: 'U2', label: 'F(U₂)',    elements: ['0', '1'] },
      { openSetId: 'U3', label: 'F(U₁∩U₂)',elements: ['0', '1'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const OPEN_SET_COLORS = ['#bfdbfe', '#bbf7d0', '#fde68a', '#ddd6fe', '#fed7aa', '#a5f3fc'];
const STROKE_COLORS   = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4'];

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function CurvedArrow({
  x1, y1, x2, y2, color = '#6b7280', label = '',
  bend = 30, opacity = 0.85,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color?: string; label?: string; bend?: number; opacity?: number;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;

  const id = `ah-${Math.round(x1)}-${Math.round(y1)}-${Math.round(x2)}-${Math.round(y2)}`;

  // Arrow tip: back-track slightly along last segment
  const t = 0.85;
  const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
  const angle = Math.atan2(y2 - ay, x2 - ax) * (180 / Math.PI);

  return (
    <g opacity={opacity}>
      <defs>
        <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={color} />
        </marker>
      </defs>
      <path
        d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        markerEnd={`url(#${id})`}
      />
      {label && (
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          fontSize={11}
          fill={color}
          fontStyle="italic"
          fontFamily="serif"
        >
          {label}
        </text>
      )}
      {/* invisible hit area */}
      <path
        d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function Tab({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-all duration-150 border-b-2 focus:outline-none ${
        active
          ? 'border-indigo-500 text-indigo-700 bg-indigo-50/60'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PresheafMode
// ---------------------------------------------------------------------------

function PresheafMode() {
  const [exIdx, setExIdx] = useState(0);
  const [visible, setVisible] = useState<Set<string>>(new Set(['X', 'U1', 'U2', 'U3']));
  const [hoveredSet, setHoveredSet] = useState<string | null>(null);

  const ex = EXAMPLES[exIdx];

  const toggleVisible = (id: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inclusion arrows: which sets are contained in which
  const inclusions: { from: string; to: string; label: string }[] = [
    { from: 'U3', to: 'U1', label: '⊆' },
    { from: 'U3', to: 'U2', label: '⊆' },
    { from: 'U1', to: 'X',  label: '⊆' },
    { from: 'U2', to: 'X',  label: '⊆' },
  ];

  // Restriction arrows between section boxes (in the data layer)
  const restrictions: { from: string; to: string; label: string }[] = [
    { from: 'X',  to: 'U1', label: 'ρ_{X,U₁}' },
    { from: 'X',  to: 'U2', label: 'ρ_{X,U₂}' },
    { from: 'U1', to: 'U3', label: 'ρ_{U₁,∩}' },
    { from: 'U2', to: 'U3', label: 'ρ_{U₂,∩}' },
  ];

  // Box positions for the data layer (above the space)
  const boxPos: Record<string, { bx: number; by: number }> = {
    'X':  { bx: 50,  by: 12 },
    'U1': { bx: 25,  by: 88 },
    'U2': { bx: 75,  by: 88 },
    'U3': { bx: 50,  by: 88 },
  };

  const W = 700, H = 400;

  const toSVG = (pct: number, dim: number) => (pct / 100) * dim;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Example:</span>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
            value={exIdx}
            onChange={e => { setExIdx(Number(e.target.value)); setVisible(new Set(['X','U1','U2','U3'])); }}
          >
            {EXAMPLES.map((ex, i) => (
              <option key={i} value={i}>{ex.name}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400 italic">{ex.description}</span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500">Show:</span>
          {ex.openSets.map((os, i) => (
            <button
              key={os.id}
              onClick={() => toggleVisible(os.id)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                visible.has(os.id)
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                  : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
              }`}
            >
              {os.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded-xl border border-gray-100 bg-white"
        style={{ aspectRatio: `${W}/${H}` }}
      >
        {/* Background for topological space X */}
        <rect x={20} y={60} width={660} height={290} rx={18}
          fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1.5} />
        <text x={30} y={78} fontSize={12} fill="#94a3b8" fontFamily="serif" fontStyle="italic">X</text>

        {/* Open sets (painted back-to-front) */}
        {ex.openSets.slice().reverse().map((os, i) => {
          if (!visible.has(os.id)) return null;
          const colorIdx = ex.openSets.findIndex(o => o.id === os.id);
          const strokeColor = STROKE_COLORS[colorIdx % STROKE_COLORS.length];
          const svgCx = toSVG(os.cx, W);
          const svgCy = 60 + toSVG(os.cy, 290);
          const svgRx = toSVG(os.rx, W);
          const svgRy = toSVG(os.ry, 290);
          const hovered = hoveredSet === os.id;
          return (
            <g key={os.id}
              onMouseEnter={() => setHoveredSet(os.id)}
              onMouseLeave={() => setHoveredSet(null)}
              style={{ cursor: 'pointer' }}
            >
              <ellipse
                cx={svgCx} cy={svgCy} rx={svgRx} ry={svgRy}
                fill={os.color}
                fillOpacity={hovered ? 0.75 : 0.55}
                stroke={strokeColor}
                strokeWidth={hovered ? 2 : 1.2}
                strokeDasharray={os.id === 'X' ? '6 3' : undefined}
              />
              <text
                x={svgCx - svgRx + 8} y={svgCy - svgRy + 16}
                fontSize={13} fill={strokeColor}
                fontFamily="serif" fontStyle="italic" fontWeight="600"
              >
                {os.label}
              </text>
            </g>
          );
        })}

        {/* Inclusion arrows inside X */}
        {inclusions.map((inc, i) => {
          if (!visible.has(inc.from) || !visible.has(inc.to)) return null;
          const from = ex.openSets.find(o => o.id === inc.from)!;
          const to   = ex.openSets.find(o => o.id === inc.to)!;
          const x1 = toSVG(from.cx, W);
          const y1 = 60 + toSVG(from.cy, 290);
          const x2 = toSVG(to.cx, W);
          const y2 = 60 + toSVG(to.cy, 290);
          return (
            <CurvedArrow key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              color="#94a3b8" label={inc.label} bend={20} opacity={0.5}
            />
          );
        })}

        {/* Data section boxes (top and bottom) */}
        {ex.sections.map((sec) => {
          if (!visible.has(sec.openSetId)) return null;
          const pos = boxPos[sec.openSetId];
          if (!pos) return null;
          const bx = toSVG(pos.bx, W);
          const by = pos.by <= 50 ? toSVG(pos.by, H) : H - 56;
          const colorIdx = ex.openSets.findIndex(o => o.id === sec.openSetId);
          const bgColor  = ex.openSets[colorIdx]?.color ?? '#f1f5f9';
          const strColor = STROKE_COLORS[colorIdx % STROKE_COLORS.length];
          const hovered = hoveredSet === sec.openSetId;
          const boxW = 110, boxH = 36;
          return (
            <g key={sec.openSetId}
              onMouseEnter={() => setHoveredSet(sec.openSetId)}
              onMouseLeave={() => setHoveredSet(null)}
            >
              <rect x={bx - boxW / 2} y={by - boxH / 2} width={boxW} height={boxH}
                rx={8} fill={bgColor} fillOpacity={hovered ? 0.9 : 0.7}
                stroke={strColor} strokeWidth={hovered ? 2 : 1}
              />
              <text x={bx} y={by - 5} textAnchor="middle"
                fontSize={11} fill={strColor} fontFamily="serif" fontWeight="600">
                {sec.label}
              </text>
              <text x={bx} y={by + 9} textAnchor="middle"
                fontSize={9.5} fill="#475569" fontFamily="serif">
                {sec.elements.slice(0, 3).join(', ')}{sec.elements.length > 3 ? ', …' : ''}
              </text>
            </g>
          );
        })}

        {/* Restriction arrows between boxes */}
        {restrictions.map((r, i) => {
          if (!visible.has(r.from) || !visible.has(r.to)) return null;
          const pFrom = boxPos[r.from];
          const pTo   = boxPos[r.to];
          if (!pFrom || !pTo) return null;
          const x1 = toSVG(pFrom.bx, W);
          const y1 = pFrom.by <= 50 ? toSVG(pFrom.by, H) + 18 : H - 56 + 18;
          const x2 = toSVG(pTo.bx, W);
          const y2 = pTo.by <= 50 ? toSVG(pTo.by, H) - 18 : H - 56 - 18;
          return (
            <CurvedArrow key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              color="#6366f1" label={r.label} bend={40} opacity={0.7}
            />
          );
        })}

        {/* Legend */}
        <g transform={`translate(${W - 160}, 72)`}>
          <rect x={0} y={0} width={150} height={48} rx={8}
            fill="white" stroke="#e2e8f0" strokeWidth={1} fillOpacity={0.9} />
          <circle cx={14} cy={14} r={6} fill="#bfdbfe" stroke="#3b82f6" strokeWidth={1} />
          <text x={24} y={18} fontSize={10} fill="#374151">open set</text>
          <line x1={6} y1={34} x2={22} y2={34} stroke="#6366f1" strokeWidth={1.5} markerEnd="url(#ah-lg)" />
          <text x={24} y={38} fontSize={10} fill="#374151">restriction map</text>
        </g>
      </svg>

      <p className="text-xs text-gray-400 px-2">
        Hover over open sets or section boxes to highlight. Toggle visibility with the buttons above.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RestrictionsMode
// ---------------------------------------------------------------------------

const RESTRICTION_EXAMPLES = [
  {
    name: 'Continuous functions',
    W_label: 'W', V_label: 'V', U_label: 'U',
    wInV: true, vInU: false, // W ⊆ V ⊆ U is the chain
    FU: ['sin x', 'x²', 'eˣ', 'cos x', '1'],
    FV: ['sin x', 'x²', '1', 'x³'],
    FW: ['x²', '1', 'x⁴'],
    rhoUV: { 'sin x': 'sin x', 'x²': 'x²', 'eˣ': '(not in F(V))', 'cos x': '(not in F(V))', '1': '1' },
    rhoVW: { 'sin x': '(not in F(W))', 'x²': 'x²', '1': '1', 'x³': '(not in F(W))' },
    rhoUW: { 'sin x': '(not in F(W))', 'x²': 'x²', 'eˣ': '(not in F(W))', 'cos x': '(not in F(W))', '1': '1' },
  },
  {
    name: 'Integer sections',
    W_label: 'W', V_label: 'V', U_label: 'U',
    wInV: true, vInU: false,
    FU: ['0', '1', '2', '3', '−1'],
    FV: ['0', '1', '2', '3', '−1'],
    FW: ['0', '1', '2', '3', '−1'],
    rhoUV: { '0': '0', '1': '1', '2': '2', '3': '3', '−1': '−1' },
    rhoVW: { '0': '0', '1': '1', '2': '2', '3': '3', '−1': '−1' },
    rhoUW: { '0': '0', '1': '1', '2': '2', '3': '3', '−1': '−1' },
  },
];

function RestrictionsMode() {
  const [exIdx, setExIdx] = useState(0);
  const [selectedFU, setSelectedFU] = useState<string | null>(null);
  const [selectedFV, setSelectedFV] = useState<string | null>(null);
  const [showComposition, setShowComposition] = useState(false);
  const [animStep, setAnimStep] = useState(0);

  const ex = RESTRICTION_EXAMPLES[exIdx];

  // Animate composition
  useEffect(() => {
    if (!showComposition) { setAnimStep(0); return; }
    const t = setInterval(() => {
      setAnimStep(s => (s >= 3 ? 0 : s + 1));
    }, 900);
    return () => clearInterval(t);
  }, [showComposition]);

  const W = 700, H = 340;
  const col = { U: 100, V: 350, Wc: 600 };
  const boxH = 38, boxW = 120;
  const topY = 40;
  const labelY = topY + 18;

  // Y positions for elements
  const elemY = (idx: number, total: number) =>
    topY + 70 + idx * (Math.min(40, (H - topY - 90) / total));

  const restrictedElem = selectedFU ? ex.rhoUV[selectedFU as keyof typeof ex.rhoUV] : null;
  const restrictedElemW = selectedFV ? ex.rhoVW[selectedFV as keyof typeof ex.rhoVW] : null;

  const isValid = (s: string) => !s?.startsWith('(');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Example:</span>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
            value={exIdx}
            onChange={e => { setExIdx(Number(e.target.value)); setSelectedFU(null); setSelectedFV(null); setShowComposition(false); }}
          >
            {RESTRICTION_EXAMPLES.map((ex, i) => (
              <option key={i} value={i}>{ex.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowComposition(p => !p)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            showComposition
              ? 'bg-violet-100 border-violet-300 text-violet-700'
              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
        >
          {showComposition ? 'Hide composition' : 'Show ρ∘ρ = ρ'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          Chain: {ex.U_label} ⊇ {ex.V_label} ⊇ {ex.W_label}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded-xl border border-gray-100 bg-white"
        style={{ aspectRatio: `${W}/${H}` }}
      >
        {/* Column headers */}
        {[
          { x: col.U, label: `F(${ex.U_label})`, color: '#3b82f6', bg: '#dbeafe' },
          { x: col.V, label: `F(${ex.V_label})`, color: '#22c55e', bg: '#dcfce7' },
          { x: col.Wc, label: `F(${ex.W_label})`, color: '#f59e0b', bg: '#fef3c7' },
        ].map(col_ => (
          <g key={col_.label}>
            <rect x={col_.x - boxW / 2} y={topY - 8} width={boxW} height={boxH}
              rx={10} fill={col_.bg} stroke={col_.color} strokeWidth={1.5} />
            <text x={col_.x} y={topY + 16} textAnchor="middle"
              fontSize={14} fill={col_.color} fontWeight="700" fontFamily="serif">
              {col_.label}
            </text>
          </g>
        ))}

        {/* Restriction arrow headers */}
        <CurvedArrow
          x1={col.U + boxW / 2} y1={topY + 10}
          x2={col.V - boxW / 2} y2={topY + 10}
          color="#6366f1" label={`ρ_{${ex.U_label},${ex.V_label}}`} bend={-22}
        />
        <CurvedArrow
          x1={col.V + boxW / 2} y1={topY + 10}
          x2={col.Wc - boxW / 2} y2={topY + 10}
          color="#6366f1" label={`ρ_{${ex.V_label},${ex.W_label}}`} bend={-22}
        />
        {showComposition && (
          <CurvedArrow
            x1={col.U + boxW / 2} y1={topY + 30}
            x2={col.Wc - boxW / 2} y2={topY + 30}
            color="#8b5cf6" label={`ρ_{${ex.U_label},${ex.W_label}}`} bend={60}
            opacity={animStep >= 1 ? 0.9 : 0.25}
          />
        )}

        {/* F(U) elements */}
        {ex.FU.map((el, i) => {
          const y = elemY(i, ex.FU.length);
          const selected = selectedFU === el;
          return (
            <g key={el} style={{ cursor: 'pointer' }}
              onClick={() => { setSelectedFU(selected ? null : el); setSelectedFV(null); }}>
              <ellipse cx={col.U} cy={y} rx={38} ry={13}
                fill={selected ? '#bfdbfe' : '#f1f5f9'}
                stroke={selected ? '#3b82f6' : '#cbd5e1'}
                strokeWidth={selected ? 2 : 1} />
              <text x={col.U} y={y + 4} textAnchor="middle"
                fontSize={12} fill={selected ? '#1d4ed8' : '#374151'} fontFamily="serif">
                {el}
              </text>
            </g>
          );
        })}

        {/* F(V) elements */}
        {ex.FV.map((el, i) => {
          const y = elemY(i, ex.FV.length);
          const isTarget = restrictedElem === el && isValid(restrictedElem ?? '');
          const selected = selectedFV === el;
          return (
            <g key={el} style={{ cursor: 'pointer' }}
              onClick={() => setSelectedFV(selected ? null : el)}>
              <ellipse cx={col.V} cy={y} rx={38} ry={13}
                fill={isTarget ? '#bbf7d0' : selected ? '#d1fae5' : '#f1f5f9'}
                stroke={isTarget ? '#22c55e' : selected ? '#22c55e' : '#cbd5e1'}
                strokeWidth={isTarget || selected ? 2 : 1} />
              <text x={col.V} y={y + 4} textAnchor="middle"
                fontSize={12} fill={isTarget ? '#166534' : '#374151'} fontFamily="serif">
                {el}
              </text>
            </g>
          );
        })}

        {/* F(W) elements */}
        {ex.FW.map((el, i) => {
          const y = elemY(i, ex.FW.length);
          const isTargetV = restrictedElemW === el && isValid(restrictedElemW ?? '');
          const isTargetU = showComposition && selectedFU
            && ex.rhoUW[selectedFU as keyof typeof ex.rhoUW] === el
            && isValid(ex.rhoUW[selectedFU as keyof typeof ex.rhoUW]);
          return (
            <g key={el}>
              <ellipse cx={col.Wc} cy={y} rx={38} ry={13}
                fill={isTargetU ? '#fde68a' : isTargetV ? '#fef3c7' : '#f1f5f9'}
                stroke={isTargetU ? '#f59e0b' : isTargetV ? '#f59e0b' : '#cbd5e1'}
                strokeWidth={isTargetU || isTargetV ? 2 : 1} />
              <text x={col.Wc} y={y + 4} textAnchor="middle"
                fontSize={12} fill="#374151" fontFamily="serif">
                {el}
              </text>
            </g>
          );
        })}

        {/* Arrow for selected F(U) → F(V) */}
        {selectedFU && restrictedElem && isValid(restrictedElem) && (() => {
          const iFU = ex.FU.indexOf(selectedFU);
          const iFV = ex.FV.indexOf(restrictedElem);
          if (iFV < 0) return null;
          return (
            <CurvedArrow
              x1={col.U + 40} y1={elemY(iFU, ex.FU.length)}
              x2={col.V - 40} y2={elemY(iFV, ex.FV.length)}
              color="#6366f1" bend={-15} opacity={1}
            />
          );
        })()}

        {/* Arrow for selected F(V) → F(W) */}
        {selectedFV && restrictedElemW && isValid(restrictedElemW) && (() => {
          const iFV = ex.FV.indexOf(selectedFV);
          const iFW = ex.FW.indexOf(restrictedElemW);
          if (iFW < 0) return null;
          return (
            <CurvedArrow
              x1={col.V + 40} y1={elemY(iFV, ex.FV.length)}
              x2={col.Wc - 40} y2={elemY(iFW, ex.FW.length)}
              color="#22c55e" bend={-15} opacity={1}
            />
          );
        })()}

        {/* Composition arrow: F(U) → F(W) */}
        {showComposition && selectedFU && (() => {
          const result = ex.rhoUW[selectedFU as keyof typeof ex.rhoUW];
          if (!result || !isValid(result)) return null;
          const iFU = ex.FU.indexOf(selectedFU);
          const iFW = ex.FW.indexOf(result);
          if (iFW < 0) return null;
          return (
            <CurvedArrow
              x1={col.U + 40} y1={elemY(iFU, ex.FU.length)}
              x2={col.Wc - 40} y2={elemY(iFW, ex.FW.length)}
              color="#8b5cf6" bend={50} opacity={animStep >= 2 ? 1 : 0.3}
              label="= ρ∘ρ"
            />
          );
        })()}

        {/* Identity annotation */}
        <text x={col.U} y={H - 12} textAnchor="middle"
          fontSize={10} fill="#94a3b8" fontFamily="serif" fontStyle="italic">
          ρ_{'{U,U}'} = id
        </text>
        <text x={col.V} y={H - 12} textAnchor="middle"
          fontSize={10} fill="#94a3b8" fontFamily="serif" fontStyle="italic">
          ρ_{'{V,V}'} = id
        </text>
      </svg>

      <div className="text-xs text-gray-400 px-2 flex gap-4 flex-wrap">
        <span>Click an element in <span className="text-blue-600 font-medium">F(U)</span> to trace its restriction to F(V).</span>
        <span>Click an element in <span className="text-green-600 font-medium">F(V)</span> to trace its restriction to F(W).</span>
        <span>Toggle <em>Show ρ∘ρ = ρ</em> to verify transitivity.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GluingMode — the KEY visualization
// ---------------------------------------------------------------------------

type GluingSection = { id: string; label: string; value: number; editable: boolean };

const GLUING_PRESETS = [
  {
    name: 'Compatible (sheaf works)',
    description: 'Local sections agree on overlaps → unique global section exists',
    U_label: 'U', covering: ['U₁', 'U₂', 'U₃'],
    // sections on each U_i: value is a "constant function" value
    localSections: [
      { id: 's1', label: 's₁ ∈ F(U₁)', value: 3, editable: true },
      { id: 's2', label: 's₂ ∈ F(U₂)', value: 3, editable: true },
      { id: 's3', label: 's₃ ∈ F(U₃)', value: 3, editable: true },
    ],
    // Which pairs have overlaps
    overlaps: [
      { i: 0, j: 1, label: 'U₁∩U₂' },
      { i: 1, j: 2, label: 'U₂∩U₃' },
    ],
  },
  {
    name: 'Incompatible (gluing fails)',
    description: 'Sections disagree on an overlap → no global section exists',
    U_label: 'U', covering: ['U₁', 'U₂', 'U₃'],
    localSections: [
      { id: 's1', label: 's₁ ∈ F(U₁)', value: 2, editable: true },
      { id: 's2', label: 's₂ ∈ F(U₂)', value: 5, editable: true },
      { id: 's3', label: 's₃ ∈ F(U₃)', value: 2, editable: true },
    ],
    overlaps: [
      { i: 0, j: 1, label: 'U₁∩U₂' },
      { i: 1, j: 2, label: 'U₂∩U₃' },
    ],
  },
];

function GluingMode() {
  const [presetIdx, setPresetIdx] = useState(0);
  const preset = GLUING_PRESETS[presetIdx];
  const [values, setValues] = useState<number[]>(preset.localSections.map(s => s.value));
  const [animating, setAnimating] = useState(false);
  const [animPhase, setAnimPhase] = useState(0); // 0=idle, 1=check overlaps, 2=result

  useEffect(() => {
    setValues(GLUING_PRESETS[presetIdx].localSections.map(s => s.value));
    setAnimPhase(0);
    setAnimating(false);
  }, [presetIdx]);

  const compatible = preset.overlaps.every(({ i, j }) => values[i] === values[j]);

  const runAnimation = () => {
    setAnimating(true);
    setAnimPhase(1);
    setTimeout(() => setAnimPhase(2), 1200);
    setTimeout(() => setAnimating(false), 2200);
  };

  const W = 700, H = 380;

  // Layout: U₁, U₂, U₃ as horizontal bands, global U at top
  const bandH = 72;
  const bandY = [100, 185, 270];
  const bandColors = ['#bfdbfe', '#bbf7d0', '#ddd6fe'];
  const strokeColors = ['#3b82f6', '#22c55e', '#8b5cf6'];

  // Overlap positions
  const overlapY = (idx: number) => (bandY[idx] + bandY[idx + 1]) / 2 + bandH / 2 - 5;

  const globalY = 20;
  const globalH = 55;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 px-2">
        <span className="text-xs text-gray-500 font-medium">Scenario:</span>
        {GLUING_PRESETS.map((p, i) => (
          <button key={i}
            onClick={() => setPresetIdx(i)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              presetIdx === i
                ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-medium'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={runAnimation}
          disabled={animating}
          className="ml-auto text-xs px-3 py-1 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          Check gluing
        </button>
      </div>

      {/* Section sliders */}
      <div className="flex flex-wrap gap-4 px-2">
        {preset.localSections.map((sec, i) => (
          <div key={sec.id} className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: strokeColors[i] }}>{sec.label}:</span>
            <input
              type="range" min={1} max={7} step={1}
              value={values[i]}
              onChange={e => setValues(v => v.map((x, j) => j === i ? Number(e.target.value) : x))}
              className="w-24 accent-indigo-500 h-1"
            />
            <span className="text-xs tabular-nums text-gray-700 w-4">{values[i]}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded-xl border border-gray-100 bg-white"
        style={{ aspectRatio: `${W}/${H}` }}
      >
        {/* Open covering bands */}
        {preset.localSections.map((sec, i) => (
          <g key={sec.id}>
            <rect x={30} y={bandY[i]} width={560} height={bandH}
              rx={12} fill={bandColors[i]} fillOpacity={0.5}
              stroke={strokeColors[i]} strokeWidth={1.2} />
            <text x={50} y={bandY[i] + 22} fontSize={13}
              fill={strokeColors[i]} fontFamily="serif" fontStyle="italic" fontWeight="600">
              {preset.covering[i]}
            </text>
            {/* Section value box */}
            <rect x={210} y={bandY[i] + 15} width={160} height={38}
              rx={8} fill="white" stroke={strokeColors[i]} strokeWidth={1.5} fillOpacity={0.9} />
            <text x={290} y={bandY[i] + 30} textAnchor="middle"
              fontSize={11} fill={strokeColors[i]} fontFamily="serif" fontWeight="600">
              {sec.label}
            </text>
            <text x={290} y={bandY[i] + 46} textAnchor="middle"
              fontSize={13} fill="#1e293b" fontFamily="serif">
              value = {values[i]}
            </text>
          </g>
        ))}

        {/* Overlap zones */}
        {preset.overlaps.map(({ i, j, label }, oi) => {
          const y = overlapY(i);
          const agree = values[i] === values[j];
          const show = animPhase >= 1 || !animating;
          const pulseColor = agree ? '#22c55e' : '#ef4444';
          return (
            <g key={oi}>
              <rect x={30} y={y - 18} width={560} height={32}
                rx={8}
                fill={show && animPhase >= 1 ? (agree ? '#dcfce7' : '#fee2e2') : '#f8fafc'}
                fillOpacity={show && animPhase >= 1 ? 0.85 : 0.4}
                stroke={show && animPhase >= 1 ? pulseColor : '#e2e8f0'}
                strokeWidth={show && animPhase >= 1 ? 2 : 1}
              />
              <text x={60} y={y} fontSize={11} fill="#64748b" fontFamily="serif" fontStyle="italic">
                {label}
              </text>
              {animPhase >= 1 && (
                <>
                  <text x={290} y={y} textAnchor="middle"
                    fontSize={12} fontWeight="700"
                    fill={pulseColor} fontFamily="serif">
                    s_{i + 1}|_{label} = {values[i]}  vs  s_{j + 1}|_{label} = {values[j]}
                  </text>
                  <text x={590} y={y} textAnchor="middle"
                    fontSize={16} fill={pulseColor}>
                    {agree ? '✓' : '✗'}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Global section result */}
        {animPhase >= 2 && (
          <g>
            <rect x={30} y={globalY} width={560} height={globalH}
              rx={14}
              fill={compatible ? '#dcfce7' : '#fee2e2'}
              stroke={compatible ? '#16a34a' : '#dc2626'}
              strokeWidth={2.5}
            />
            <text x={310} y={globalY + 22} textAnchor="middle"
              fontSize={14} fontWeight="700"
              fill={compatible ? '#166534' : '#991b1b'} fontFamily="serif">
              {compatible
                ? `Global section s ∈ F(U) exists!  s = ${values[0]}`
                : 'No global section — sections incompatible on overlaps'}
            </text>
            <text x={310} y={globalY + 42} textAnchor="middle"
              fontSize={11} fill={compatible ? '#166534' : '#991b1b'} fontFamily="sans-serif">
              {compatible
                ? 'Sheaf condition satisfied: unique gluing exists'
                : 'Sheaf condition violated: gluing would be ambiguous or absent'}
            </text>
          </g>
        )}

        {/* Gluing arrows from bands to global */}
        {animPhase >= 2 && compatible && preset.localSections.map((_, i) => (
          <CurvedArrow key={i}
            x1={210} y1={bandY[i] + bandH / 2}
            x2={120} y2={globalY + globalH}
            color="#16a34a" bend={-30} opacity={0.6}
          />
        ))}

        {/* Right-side legend */}
        <g transform={`translate(620, 95)`}>
          <rect x={0} y={0} width={72} height={90} rx={10}
            fill="white" stroke="#e2e8f0" strokeWidth={1} fillOpacity={0.95} />
          <text x={36} y={16} textAnchor="middle" fontSize={10} fill="#6b7280" fontWeight="600">
            Sheaf axiom
          </text>
          <text x={36} y={34} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="serif">
            s_i|_{'{U∩V}'}
          </text>
          <text x={36} y={50} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="serif">
            = s_j|_{'{U∩V}'}
          </text>
          <text x={36} y={66} textAnchor="middle" fontSize={9} fill="#374151">
            for all i,j
          </text>
          <text x={36} y={82} textAnchor="middle" fontSize={9} fill="#374151">
            ⟹ ∃! global s
          </text>
        </g>

        {/* Bottom caption */}
        <text x={310} y={H - 8} textAnchor="middle"
          fontSize={10} fill="#94a3b8" fontFamily="serif" fontStyle="italic">
          Adjust sliders to make sections agree or disagree, then click "Check gluing"
        </text>
      </svg>

      {/* Explanation card */}
      <div className={`mx-2 px-4 py-3 rounded-xl border text-xs transition-colors duration-500 ${
        compatible
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}>
        <strong>{compatible ? 'Sheaf condition satisfied' : 'Sheaf condition violated'}</strong>
        {compatible
          ? ' — The local sections are compatible on every overlap U_i ∩ U_j, so a unique global section s ∈ F(U) exists that restricts to each s_i. This is exactly what makes F a sheaf.'
          : ' — Some local sections disagree on an overlap. There is no global section that simultaneously restricts to all s_i. This is why the presheaf fails to be a sheaf.'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StalksMode
// ---------------------------------------------------------------------------

function StalksMode() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pointX, setPointX] = useState(50); // 0-100 in space coords
  const [dragging, setDragging] = useState(false);
  const [selectedU, setSelectedU] = useState<string | null>(null);

  // Open sets: intervals [a, b] on a line (1D space for simplicity)
  const openSets = useMemo(() => [
    { id: 'U1', label: 'U₁', a: 5,  b: 45, color: '#bfdbfe', stroke: '#3b82f6' },
    { id: 'U2', label: 'U₂', a: 30, b: 70, color: '#bbf7d0', stroke: '#22c55e' },
    { id: 'U3', label: 'U₃', a: 55, b: 95, color: '#ddd6fe', stroke: '#8b5cf6' },
    { id: 'U4', label: 'U₄', a: 15, b: 85, color: '#fde68a', stroke: '#f59e0b' },
  ], []);

  // Which open sets contain x?
  const containingX = useMemo(
    () => openSets.filter(u => pointX > u.a && pointX < u.b),
    [openSets, pointX],
  );

  // Section values: for each open set, a "germ" function value at x
  // Simulate: F(U) = continuous functions, germ at x = evaluation
  const sectionValue = useCallback((u: typeof openSets[0], x: number) => {
    // Different "functions" per open set for illustration
    const funcs: Record<string, (x: number) => string> = {
      'U1': x => `sin(${(x / 30).toFixed(2)})`,
      'U2': x => `${((x - 50) / 20).toFixed(2)}x`,
      'U3': x => `cos(${(x / 40).toFixed(2)})`,
      'U4': x => `${(x / 50).toFixed(2)}`,
    };
    return funcs[u.id]?.(x) ?? '?';
  }, []);

  const W = 700, H = 380;
  const spaceY = 200;   // y of the "line" X
  const spaceLeft = 30, spaceRight = 670;

  const toSvgX = (pct: number) => spaceLeft + (pct / 100) * (spaceRight - spaceLeft);
  const toPct  = (svgX: number) => Math.max(0, Math.min(100, ((svgX - spaceLeft) / (spaceRight - spaceLeft)) * 100));

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const svgY = ((e.clientY - rect.top) / rect.height) * H;
    if (Math.abs(svgY - spaceY) < 30 && Math.abs(svgX - toSvgX(pointX)) < 20) {
      setDragging(true);
    }
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setPointX(Math.round(toPct(svgX)));
  };
  const onMouseUp = () => setDragging(false);

  const px = toSvgX(pointX);

  // Stalk fan positions
  const stalkBaseY = spaceY - 60;
  const stalkFanY  = 50;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 px-2 flex-wrap">
        <span className="text-xs text-gray-500">
          Drag the point <span className="font-semibold text-indigo-600">x</span> to see which open sets contain it and how the stalk F_x changes.
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          x = {pointX}%  |  F_x = direct limit over {containingX.length} open sets
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded-xl border border-gray-100 bg-white"
        style={{ aspectRatio: `${W}/${H}`, cursor: dragging ? 'grabbing' : 'default' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Space X as a thick line */}
        <line x1={spaceLeft} y1={spaceY} x2={spaceRight} y2={spaceY}
          stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" />
        <text x={spaceLeft - 8} y={spaceY + 4} textAnchor="end"
          fontSize={12} fill="#94a3b8" fontFamily="serif" fontStyle="italic">X</text>

        {/* Open sets as arcs above the line */}
        {openSets.map((u, i) => {
          const x1 = toSvgX(u.a);
          const x2 = toSvgX(u.b);
          const arcY = spaceY + 30 + i * 28;
          const contains = pointX > u.a && pointX < u.b;
          return (
            <g key={u.id} style={{ cursor: 'pointer' }}
              onClick={() => setSelectedU(selectedU === u.id ? null : u.id)}>
              {/* Arc below */}
              <path
                d={`M ${x1} ${spaceY + 8} Q ${(x1 + x2) / 2} ${arcY + 20} ${x2} ${spaceY + 8}`}
                fill="none"
                stroke={u.stroke}
                strokeWidth={contains ? 3 : 1.5}
                strokeOpacity={contains ? 1 : 0.4}
                strokeDasharray={contains ? undefined : '4 3'}
              />
              {/* Fill region on line */}
              <line x1={x1} y1={spaceY} x2={x2} y2={spaceY}
                stroke={u.color} strokeWidth={8} strokeOpacity={contains ? 0.7 : 0.3}
                strokeLinecap="round" />
              <text x={(x1 + x2) / 2} y={arcY + 38} textAnchor="middle"
                fontSize={11} fill={u.stroke} fontOpacity={contains ? 1 : 0.5}
                fontFamily="serif" fontStyle="italic" fontWeight={contains ? '700' : '400'}>
                {u.label}
              </text>
            </g>
          );
        })}

        {/* Point x (draggable) */}
        <circle cx={px} cy={spaceY} r={9}
          fill="#6366f1" stroke="white" strokeWidth={2.5}
          style={{ cursor: 'grab', filter: 'drop-shadow(0 1px 3px rgba(99,102,241,0.4))' }}
        />
        <text x={px} y={spaceY - 15} textAnchor="middle"
          fontSize={13} fill="#4f46e5" fontFamily="serif" fontStyle="italic" fontWeight="700">
          x
        </text>

        {/* Stalk F_x box */}
        <rect x={W / 2 - 150} y={stalkFanY} width={300} height={80}
          rx={14} fill="#f5f3ff" stroke="#8b5cf6" strokeWidth={2}
          fillOpacity={0.95} />
        <text x={W / 2} y={stalkFanY + 20} textAnchor="middle"
          fontSize={14} fontWeight="700" fill="#6d28d9" fontFamily="serif">
          F_x (stalk at x)
        </text>
        <text x={W / 2} y={stalkFanY + 38} textAnchor="middle"
          fontSize={11} fill="#5b21b6" fontFamily="serif">
          = colim F(U)  over  U ∋ x
        </text>
        <text x={W / 2} y={stalkFanY + 58} textAnchor="middle"
          fontSize={11} fill="#374151" fontFamily="serif">
          {containingX.length === 0
            ? 'x not in any open set'
            : `Germs from: ${containingX.map(u => u.label).join(', ')}`}
        </text>
        {containingX.length === 0 && (
          <text x={W / 2} y={stalkFanY + 72} textAnchor="middle"
            fontSize={10} fill="#94a3b8">F_x = ∅</text>
        )}

        {/* Canonical maps F(U) → F_x */}
        {containingX.map((u, i) => {
          const srcX = toSvgX((u.a + u.b) / 2);
          const srcY = spaceY - 12;
          const dstX = W / 2 + (i - (containingX.length - 1) / 2) * 60;
          const dstY = stalkFanY + 80;
          return (
            <g key={u.id}>
              <CurvedArrow
                x1={srcX} y1={srcY}
                x2={dstX} y2={dstY}
                color={u.stroke} bend={-20} opacity={0.75}
                label={`φ_${u.label}`}
              />
            </g>
          );
        })}

        {/* Section values panel */}
        {containingX.length > 0 && (
          <g transform={`translate(${W - 200}, ${stalkFanY + 5})`}>
            <rect x={0} y={0} width={190} height={30 + containingX.length * 26}
              rx={10} fill="white" stroke="#e2e8f0" strokeWidth={1} fillOpacity={0.97} />
            <text x={95} y={18} textAnchor="middle"
              fontSize={11} fontWeight="600" fill="#374151">
              Germs at x={pointX}
            </text>
            {containingX.map((u, i) => (
              <g key={u.id}>
                <circle cx={16} cy={34 + i * 26} r={6}
                  fill={u.color} stroke={u.stroke} strokeWidth={1} />
                <text x={28} y={38 + i * 26} fontSize={10} fill="#374151" fontFamily="serif">
                  {u.label}: {sectionValue(u, pointX)}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* Equivalence note */}
        <text x={30} y={H - 10} fontSize={10} fill="#94a3b8" fontFamily="serif" fontStyle="italic">
          Two sections define the same germ at x if they agree on some open set containing x.
        </text>
      </svg>

      <div className="mx-2 px-4 py-3 rounded-xl border border-violet-200 bg-violet-50 text-xs text-violet-800">
        <strong>Stalk F_x</strong> is the direct limit (colimit) of F(U) over all open U containing x.
        An element of F_x is a <em>germ</em>: an equivalence class [s, U] where s ∈ F(U) and (s, U) ~ (t, V)
        iff there exists W ⊆ U ∩ V with x ∈ W and s|_W = t|_W.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PresheafSim component
// ---------------------------------------------------------------------------

export interface PresheafSimProps {
  defaultTab?: TabKey;
  title?: string;
}

export const PresheafSim: React.FC<PresheafSimProps> = ({
  defaultTab = 'presheaf',
  title = 'Presheaves & Sheaves',
}) => {
  const [tab, setTab] = useState<TabKey>(defaultTab);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'presheaf',     label: 'Presheaf' },
    { key: 'restrictions', label: 'Restrictions' },
    { key: 'gluing',       label: 'Gluing' },
    { key: 'stalks',       label: 'Stalks' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-gray-100">
        {title && (
          <h3 className="text-base font-semibold text-gray-800 mb-3">{title}</h3>
        )}
        {/* Tabs */}
        <div className="flex gap-0">
          {tabs.map(t => (
            <Tab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Tab>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === 'presheaf'     && <PresheafMode />}
        {tab === 'restrictions' && <RestrictionsMode />}
        {tab === 'gluing'       && <GluingMode />}
        {tab === 'stalks'       && <StalksMode />}
      </div>
    </div>
  );
};

export default PresheafSim;

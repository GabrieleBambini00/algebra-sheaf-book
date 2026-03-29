import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'Category' | 'Functors' | 'Natural Transformations' | 'Commutative Diagrams';

interface CatObject {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface Morphism {
  id: string;
  from: string;
  to: string;
  label: string;
  isIdentity?: boolean;
  curve?: number; // control point offset; positive = curves up, negative = curves down
}

interface Category {
  objects: CatObject[];
  morphisms: Morphism[];
}

// Functor: maps object ids to object ids and morphism ids to morphism ids
interface FunctorMap {
  objMap: Record<string, string>; // srcId -> tgtId
  morMap: Record<string, string>; // srcMorId -> tgtMorId
}

type PresetCategory = 'Set' | 'Grp' | 'Top';

type CommutativeDiagram = 'Triangle' | 'Square' | 'Pentagon';

// ---------------------------------------------------------------------------
// SVG geometry helpers
// ---------------------------------------------------------------------------

const R = 22; // node radius

function getNodeById(nodes: CatObject[], id: string): CatObject | undefined {
  return nodes.find((n) => n.id === id);
}

/** Quadratic bezier control point for a morphism */
function controlPoint(
  x1: number, y1: number,
  x2: number, y2: number,
  curve: number,
): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // perpendicular direction
  const px = -dy / len;
  const py = dx / len;
  return { cx: mx + px * curve, cy: my + py * curve };
}

/** Point on quadratic bezier at parameter t */
function bezierPoint(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

/** Angle of tangent on bezier at t (for arrowhead rotation) */
function bezierAngle(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  t: number,
): number {
  const mt = 1 - t;
  const dx = 2 * (mt * (cx - x1) + t * (x2 - cx));
  const dy = 2 * (mt * (cy - y1) + t * (y2 - cy));
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/** Trim a bezier so it starts/ends at node circumference */
function trimmedBezierPath(
  x1: number, y1: number,
  x2: number, y2: number,
  curve: number,
  r: number = R,
): string {
  const { cx, cy } = controlPoint(x1, y1, x2, y2, curve);
  // Binary search for t_start where bezier exits first node
  let tStart = 0;
  let tEnd = 1;
  for (let i = 0; i < 20; i++) {
    const tm = (tStart + tEnd) / 2;
    const p = bezierPoint(x1, y1, cx, cy, x2, y2, tm);
    const d = Math.sqrt((p.x - x1) ** 2 + (p.y - y1) ** 2);
    if (d < r) tStart = tm; else tEnd = tm;
  }
  const t0 = (tStart + tEnd) / 2;
  // Binary search for t_end where bezier enters second node
  tStart = 0; tEnd = 1;
  for (let i = 0; i < 20; i++) {
    const tm = (tStart + tEnd) / 2;
    const p = bezierPoint(x1, y1, cx, cy, x2, y2, tm);
    const d = Math.sqrt((p.x - x2) ** 2 + (p.y - y2) ** 2);
    if (d < r) tEnd = tm; else tStart = tm;
  }
  const t1 = (tStart + tEnd) / 2;
  const ps = bezierPoint(x1, y1, cx, cy, x2, y2, t0);
  const pe = bezierPoint(x1, y1, cx, cy, x2, y2, t1);
  // Reparameterize: new quadratic through ps, midpoint, pe
  // We approximate by just using a new quadratic with the same control point
  return `M ${ps.x} ${ps.y} Q ${cx} ${cy} ${pe.x} ${pe.y}`;
}

/** Midpoint of the bezier at t=0.5 for label placement */
function bezierMid(
  x1: number, y1: number,
  x2: number, y2: number,
  curve: number,
): { x: number; y: number } {
  const { cx, cy } = controlPoint(x1, y1, x2, y2, curve);
  return bezierPoint(x1, y1, cx, cy, x2, y2, 0.5);
}

// Identity loop (small arc off the node)
function identityLoopPath(x: number, y: number, offset = 1): string {
  const r = 16;
  const startX = x - r / 2;
  const endX = x + r / 2;
  const topY = y - R - r * 1.3 * offset;
  return `M ${startX} ${y - R + 2} C ${startX} ${topY} ${endX} ${topY} ${endX} ${y - R + 2}`;
}

// ---------------------------------------------------------------------------
// Preset categories
// ---------------------------------------------------------------------------

const PRESET_CATEGORIES: Record<PresetCategory, Category> = {
  Set: {
    objects: [
      { id: 'A', label: 'A', x: 120, y: 200 },
      { id: 'B', label: 'B', x: 320, y: 100 },
      { id: 'C', label: 'C', x: 320, y: 300 },
    ],
    morphisms: [
      { id: 'f', from: 'A', to: 'B', label: 'f', curve: -30 },
      { id: 'g', from: 'B', to: 'C', label: 'g', curve: -30 },
      { id: 'gf', from: 'A', to: 'C', label: 'g∘f', curve: 30 },
      { id: 'idA', from: 'A', to: 'A', label: 'idₐ', isIdentity: true },
      { id: 'idB', from: 'B', to: 'B', label: 'id_B', isIdentity: true },
      { id: 'idC', from: 'C', to: 'C', label: 'id_C', isIdentity: true },
    ],
  },
  Grp: {
    objects: [
      { id: 'G', label: 'G', x: 120, y: 200 },
      { id: 'H', label: 'H', x: 320, y: 100 },
      { id: 'K', label: 'K', x: 320, y: 300 },
    ],
    morphisms: [
      { id: 'phi', from: 'G', to: 'H', label: 'φ', curve: -30 },
      { id: 'psi', from: 'H', to: 'K', label: 'ψ', curve: -30 },
      { id: 'psiphi', from: 'G', to: 'K', label: 'ψ∘φ', curve: 30 },
      { id: 'idG', from: 'G', to: 'G', label: 'e_G', isIdentity: true },
      { id: 'idH', from: 'H', to: 'H', label: 'e_H', isIdentity: true },
      { id: 'idK', from: 'K', to: 'K', label: 'e_K', isIdentity: true },
    ],
  },
  Top: {
    objects: [
      { id: 'X', label: 'X', x: 120, y: 200 },
      { id: 'Y', label: 'Y', x: 320, y: 100 },
      { id: 'Z', label: 'Z', x: 320, y: 300 },
    ],
    morphisms: [
      { id: 'p', from: 'X', to: 'Y', label: 'p', curve: -30 },
      { id: 'q', from: 'Y', to: 'Z', label: 'q', curve: -30 },
      { id: 'qp', from: 'X', to: 'Z', label: 'q∘p', curve: 30 },
      { id: 'idX', from: 'X', to: 'X', label: 'id_X', isIdentity: true },
      { id: 'idY', from: 'Y', to: 'Y', label: 'id_Y', isIdentity: true },
      { id: 'idZ', from: 'Z', to: 'Z', label: 'id_Z', isIdentity: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Commutative diagrams presets
// ---------------------------------------------------------------------------

interface CommDiagram {
  objects: CatObject[];
  morphisms: Morphism[];
  paths: { ids: string[]; label: string; color: string }[];
  description: string;
}

const COMM_DIAGRAMS: Record<CommutativeDiagram, CommDiagram> = {
  Triangle: {
    description: 'Triangle: h = g ∘ f',
    objects: [
      { id: 'A', label: 'A', x: 100, y: 280 },
      { id: 'B', label: 'B', x: 300, y: 100 },
      { id: 'C', label: 'C', x: 300, y: 280 },
    ],
    morphisms: [
      { id: 'f', from: 'A', to: 'B', label: 'f', curve: -20 },
      { id: 'g', from: 'B', to: 'C', label: 'g', curve: -20 },
      { id: 'h', from: 'A', to: 'C', label: 'h', curve: 0 },
    ],
    paths: [
      { ids: ['f', 'g'], label: 'g ∘ f', color: '#6366f1' },
      { ids: ['h'], label: 'h', color: '#10b981' },
    ],
  },
  Square: {
    description: 'Square: k ∘ f = g ∘ h',
    objects: [
      { id: 'A', label: 'A', x: 100, y: 100 },
      { id: 'B', label: 'B', x: 300, y: 100 },
      { id: 'C', label: 'C', x: 100, y: 300 },
      { id: 'D', label: 'D', x: 300, y: 300 },
    ],
    morphisms: [
      { id: 'f', from: 'A', to: 'B', label: 'f', curve: 0 },
      { id: 'g', from: 'A', to: 'C', label: 'g', curve: 0 },
      { id: 'h', from: 'B', to: 'D', label: 'h', curve: 0 },
      { id: 'k', from: 'C', to: 'D', label: 'k', curve: 0 },
    ],
    paths: [
      { ids: ['f', 'h'], label: 'h ∘ f', color: '#6366f1' },
      { ids: ['g', 'k'], label: 'k ∘ g', color: '#10b981' },
    ],
  },
  Pentagon: {
    description: 'Pentagon (Mac Lane): associativity of tensor',
    objects: [
      { id: 'ABCD', label: '((A⊗B)⊗C)⊗D', x: 200, y: 60 },
      { id: 'A_BCD', label: 'A⊗((B⊗C)⊗D)', x: 390, y: 180 },
      { id: 'A__BCD', label: 'A⊗(B⊗(C⊗D))', x: 330, y: 340 },
      { id: 'AB_CD', label: '(A⊗B)⊗(C⊗D)', x: 70, y: 340 },
      { id: 'ABC_D', label: '(A⊗(B⊗C))⊗D', x: 10, y: 180 },
    ],
    morphisms: [
      { id: 'a1', from: 'ABCD', to: 'A_BCD', label: 'α', curve: -20 },
      { id: 'a2', from: 'A_BCD', to: 'A__BCD', label: '1⊗α', curve: -20 },
      { id: 'a3', from: 'ABCD', to: 'ABC_D', label: 'α⊗1', curve: 20 },
      { id: 'a4', from: 'ABC_D', to: 'AB_CD', label: 'α', curve: 20 },
      { id: 'a5', from: 'AB_CD', to: 'A__BCD', label: 'α', curve: 0 },
    ],
    paths: [
      { ids: ['a1', 'a2'], label: '(1⊗α) ∘ α', color: '#6366f1' },
      { ids: ['a3', 'a4', 'a5'], label: 'α ∘ (α⊗1) then α', color: '#10b981' },
    ],
  },
};

// ---------------------------------------------------------------------------
// SVG Marker defs
// ---------------------------------------------------------------------------

function Markers() {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
      </marker>
      <marker
        id="arrowhead-indigo"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
      </marker>
      <marker
        id="arrowhead-green"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
      </marker>
      <marker
        id="arrowhead-red"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
      </marker>
      <marker
        id="arrowhead-amber"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
      </marker>
      <marker
        id="arrowhead-dashed"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#818cf8" />
      </marker>
      <marker
        id="arrowhead-eta"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
      </marker>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Reusable: draw a single category (objects + morphisms)
// ---------------------------------------------------------------------------

interface DrawCategoryProps {
  category: Category;
  onDragNode?: (id: string, x: number, y: number) => void;
  highlightMorphisms?: Set<string>;
  highlightObjects?: Set<string>;
  morphismColor?: (id: string) => string;
  labelOffset?: number;
  showIdentities?: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  selectedMorphisms?: string[];
  onClickMorphism?: (id: string) => void;
  onClickObject?: (id: string) => void;
  selectedObjects?: string[];
}

function DrawCategory({
  category,
  onDragNode,
  highlightMorphisms = new Set(),
  highlightObjects = new Set(),
  morphismColor,
  labelOffset = 0,
  showIdentities = true,
  svgRef,
  selectedMorphisms = [],
  onClickMorphism,
  onClickObject,
  selectedObjects = [],
}: DrawCategoryProps) {
  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!onDragNode) return;
      e.stopPropagation();
      const svg = svgRef?.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const node = category.objects.find((n) => n.id === id);
      if (!node) return;
      dragging.current = { id, ox: mx - node.x, oy: my - node.y };
    },
    [onDragNode, svgRef, category.objects],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current || !onDragNode) return;
      const svg = svgRef?.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      onDragNode(dragging.current.id, mx - dragging.current.ox, my - dragging.current.oy);
    },
    [onDragNode, svgRef],
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <>
      {/* Morphisms */}
      {category.morphisms
        .filter((m) => showIdentities || !m.isIdentity)
        .map((m) => {
          const src = getNodeById(category.objects, m.from);
          const tgt = getNodeById(category.objects, m.to);
          if (!src || !tgt) return null;
          const curve = m.curve ?? 0;
          const isSelected =
            selectedMorphisms.includes(m.id) || highlightMorphisms.has(m.id);
          const baseColor = morphismColor
            ? morphismColor(m.id)
            : isSelected
            ? '#6366f1'
            : '#9ca3af';

          if (m.isIdentity) {
            return (
              <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => onClickMorphism?.(m.id)}>
                <path
                  d={identityLoopPath(src.x, src.y)}
                  fill="none"
                  stroke={isSelected ? '#6366f1' : '#d1d5db'}
                  strokeWidth={isSelected ? 2 : 1.5}
                  markerEnd={`url(#arrowhead${isSelected ? '-indigo' : ''})`}
                />
                <text
                  x={src.x}
                  y={src.y - R - 28}
                  textAnchor="middle"
                  fontSize={10}
                  fill={isSelected ? '#6366f1' : '#9ca3af'}
                  fontStyle="italic"
                >
                  {m.label}
                </text>
              </g>
            );
          }

          const path = trimmedBezierPath(src.x, src.y, tgt.x, tgt.y, curve);
          const mid = bezierMid(src.x, src.y, tgt.x, tgt.y, curve);
          const markerSuffix =
            baseColor === '#6366f1'
              ? '-indigo'
              : baseColor === '#10b981'
              ? '-green'
              : baseColor === '#ef4444'
              ? '-red'
              : baseColor === '#f59e0b'
              ? '-amber'
              : '';

          return (
            <g
              key={m.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onClickMorphism?.(m.id)}
            >
              <path
                d={path}
                fill="none"
                stroke={baseColor}
                strokeWidth={isSelected ? 2.5 : 1.8}
                markerEnd={`url(#arrowhead${markerSuffix})`}
                style={{ transition: 'stroke 0.3s, stroke-width 0.2s' }}
              />
              <text
                x={mid.x + (labelOffset || (curve > 0 ? -14 : 14))}
                y={mid.y + (curve !== 0 ? 0 : -8)}
                textAnchor="middle"
                fontSize={12}
                fontStyle="italic"
                fill={isSelected ? '#4338ca' : '#6b7280'}
                style={{ userSelect: 'none' }}
              >
                {m.label}
              </text>
            </g>
          );
        })}

      {/* Objects */}
      {category.objects.map((obj) => {
        const isSelected = selectedObjects.includes(obj.id) || highlightObjects.has(obj.id);
        return (
          <g
            key={obj.id}
            style={{ cursor: onDragNode ? 'grab' : 'pointer' }}
            onMouseDown={(e) => {
              handleMouseDown(e, obj.id);
              onClickObject?.(obj.id);
            }}
          >
            <circle
              cx={obj.x}
              cy={obj.y}
              r={R}
              fill={isSelected ? '#eef2ff' : 'white'}
              stroke={isSelected ? '#6366f1' : '#d1d5db'}
              strokeWidth={isSelected ? 2.5 : 1.5}
              style={{ transition: 'fill 0.2s, stroke 0.2s' }}
            />
            <text
              x={obj.x}
              y={obj.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={14}
              fontWeight="500"
              fill={isSelected ? '#4338ca' : '#374151'}
              fontFamily="serif"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {obj.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mode: Category
// ---------------------------------------------------------------------------

function CategoryMode() {
  const [preset, setPreset] = useState<PresetCategory>('Set');
  const [category, setCategory] = useState<Category>(() =>
    JSON.parse(JSON.stringify(PRESET_CATEGORIES['Set'])),
  );
  const [showIdentities, setShowIdentities] = useState(true);
  const [selectedMorphisms, setSelectedMorphisms] = useState<string[]>([]);
  const [addingMorphism, setAddingMorphism] = useState<string | null>(null); // first object selected
  const [compositionResult, setCompositionResult] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setCategory(JSON.parse(JSON.stringify(PRESET_CATEGORIES[preset])));
    setSelectedMorphisms([]);
    setCompositionResult(null);
    setAddingMorphism(null);
  }, [preset]);

  const handleDragNode = useCallback((id: string, x: number, y: number) => {
    setCategory((prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === id ? { ...o, x: Math.max(R + 5, Math.min(460 - R - 5, x)), y: Math.max(R + 5, Math.min(380 - R - 5, y)) } : o,
      ),
    }));
  }, []);

  const handleClickObject = useCallback(
    (id: string) => {
      if (addingMorphism === null) {
        setAddingMorphism(id);
      } else if (addingMorphism === id) {
        // Self-loop / identity
        const newId = `id_${id}_${Date.now()}`;
        setCategory((prev) => ({
          ...prev,
          morphisms: [
            ...prev.morphisms,
            { id: newId, from: id, to: id, label: `id_${id}`, isIdentity: true },
          ],
        }));
        setAddingMorphism(null);
      } else {
        const newId = `m${Date.now()}`;
        const label = String.fromCharCode(96 + ((category.morphisms.length % 26) + 1));
        setCategory((prev) => ({
          ...prev,
          morphisms: [
            ...prev.morphisms,
            { id: newId, from: addingMorphism, to: id, label, curve: -30 },
          ],
        }));
        setAddingMorphism(null);
      }
    },
    [addingMorphism, category.morphisms.length],
  );

  const handleClickMorphism = useCallback(
    (id: string) => {
      setSelectedMorphisms((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        const next = [...prev, id].slice(-2);
        // check composition
        if (next.length === 2) {
          const m1 = category.morphisms.find((m) => m.id === next[0]);
          const m2 = category.morphisms.find((m) => m.id === next[1]);
          if (m1 && m2 && m1.to === m2.from) {
            setCompositionResult(`${m2.label} ∘ ${m1.label} : ${m1.from} → ${m2.to}`);
          } else if (m1 && m2 && m2.to === m1.from) {
            setCompositionResult(`${m1.label} ∘ ${m2.label} : ${m2.from} → ${m1.to}`);
          } else {
            setCompositionResult(null);
          }
        } else {
          setCompositionResult(null);
        }
        return next;
      });
    },
    [category.morphisms],
  );

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if ((e.target as SVGElement).tagName !== 'svg') return;
      if (addingMorphism !== null) {
        setAddingMorphism(null);
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const label = String.fromCharCode(65 + category.objects.length);
      setCategory((prev) => ({
        ...prev,
        objects: [...prev.objects, { id: label, label, x, y }],
      }));
    },
    [addingMorphism, category.objects.length],
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-600">Preset:</span>
        {(['Set', 'Grp', 'Top'] as PresetCategory[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              preset === p
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => setShowIdentities((v) => !v)}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            showIdentities
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
          }`}
        >
          Identities {showIdentities ? 'on' : 'off'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          {addingMorphism
            ? `Click target for morphism from ${addingMorphism}`
            : 'Click node to add morphism · Click empty to add object'}
        </span>
      </div>

      {compositionResult && (
        <div className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 font-medium">
          Composition: <span className="font-mono">{compositionResult}</span>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox="0 0 470 390"
        className="w-full border border-gray-100 rounded-xl bg-white/60"
        style={{ minHeight: 320 }}
        onClick={handleSvgClick}
      >
        <Markers />
        <DrawCategory
          category={category}
          onDragNode={handleDragNode}
          showIdentities={showIdentities}
          svgRef={svgRef}
          selectedMorphisms={selectedMorphisms}
          onClickMorphism={handleClickMorphism}
          onClickObject={handleClickObject}
          selectedObjects={addingMorphism ? [addingMorphism] : []}
        />
        {/* Hint text */}
        <text x={235} y={375} textAnchor="middle" fontSize={10} fill="#d1d5db">
          Drag nodes to rearrange · Click two morphisms to compose
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Functors
// ---------------------------------------------------------------------------

// Source category (small: A→B→C) and target D→E→F
const FUNCTOR_SRC: Category = {
  objects: [
    { id: 'sA', label: 'A', x: 60, y: 190 },
    { id: 'sB', label: 'B', x: 175, y: 90 },
    { id: 'sC', label: 'C', x: 175, y: 290 },
  ],
  morphisms: [
    { id: 'sf', from: 'sA', to: 'sB', label: 'f', curve: -20 },
    { id: 'sg', from: 'sB', to: 'sC', label: 'g', curve: -20 },
    { id: 'sgf', from: 'sA', to: 'sC', label: 'g∘f', curve: 20 },
    { id: 'sidA', from: 'sA', to: 'sA', label: 'idₐ', isIdentity: true },
    { id: 'sidB', from: 'sB', to: 'sB', label: 'id_B', isIdentity: true },
    { id: 'sidC', from: 'sC', to: 'sC', label: 'id_C', isIdentity: true },
  ],
};

const FUNCTOR_TGT: Category = {
  objects: [
    { id: 'tD', label: 'FA', x: 280, y: 190 },
    { id: 'tE', label: 'FB', x: 395, y: 90 },
    { id: 'tF', label: 'FC', x: 395, y: 290 },
  ],
  morphisms: [
    { id: 'tf', from: 'tD', to: 'tE', label: 'Ff', curve: -20 },
    { id: 'tg', from: 'tE', to: 'tF', label: 'Fg', curve: -20 },
    { id: 'tgf', from: 'tD', to: 'tF', label: 'F(g∘f)', curve: 20 },
    { id: 'tidA', from: 'tD', to: 'tD', label: 'F(idₐ)', isIdentity: true },
    { id: 'tidB', from: 'tE', to: 'tE', label: 'F(id_B)', isIdentity: true },
    { id: 'tidC', from: 'tF', to: 'tF', label: 'F(id_C)', isIdentity: true },
  ],
};

// Valid functor map: sA->tD, sB->tE, sC->tF, sf->tf, sg->tg, sgf->tgf
const VALID_FUNCTOR: FunctorMap = {
  objMap: { sA: 'tD', sB: 'tE', sC: 'tF' },
  morMap: { sf: 'tf', sg: 'tg', sgf: 'tgf', sidA: 'tidA', sidB: 'tidB', sidC: 'tidC' },
};

// Dashed functor arrows connecting src objects to tgt objects
function FunctorArrows({
  srcCat,
  tgtCat,
  functor,
  flash,
}: {
  srcCat: Category;
  tgtCat: Category;
  functor: FunctorMap;
  flash: boolean;
}) {
  return (
    <>
      {srcCat.objects.map((obj) => {
        const tgtId = functor.objMap[obj.id];
        const tgt = getNodeById(tgtCat.objects, tgtId);
        if (!tgt) return null;
        const dx = tgt.x - obj.x;
        const dy = tgt.y - obj.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const x1 = obj.x + (dx / len) * (R + 2);
        const y1 = obj.y + (dy / len) * (R + 2);
        const x2 = tgt.x - (dx / len) * (R + 2);
        const y2 = tgt.y - (dy / len) * (R + 2);
        return (
          <line
            key={obj.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={flash ? '#ef4444' : '#818cf8'}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            markerEnd={`url(#arrowhead-${flash ? 'red' : 'dashed'})`}
            style={{ transition: 'stroke 0.3s' }}
          />
        );
      })}
    </>
  );
}

function FunctorsMode() {
  const [highlightPreservation, setHighlightPreservation] = useState<
    'composition' | 'identity' | null
  >(null);
  const [invalidFunctor, setInvalidFunctor] = useState(false);
  const [flash, setFlash] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const triggerInvalid = useCallback(() => {
    setInvalidFunctor(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
    setTimeout(() => setInvalidFunctor(false), 2500);
  }, []);

  const getHighlightMorphisms = (): Set<string> => {
    if (highlightPreservation === 'composition') {
      return new Set(['sf', 'sg', 'sgf', 'tf', 'tg', 'tgf']);
    }
    if (highlightPreservation === 'identity') {
      return new Set(['sidA', 'sidB', 'sidC', 'tidA', 'tidB', 'tidC']);
    }
    return new Set();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm font-medium text-gray-600">Highlight:</span>
        <button
          onClick={() =>
            setHighlightPreservation((v) => (v === 'composition' ? null : 'composition'))
          }
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors border ${
            highlightPreservation === 'composition'
              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
          }`}
        >
          F(g∘f) = F(g)∘F(f)
        </button>
        <button
          onClick={() =>
            setHighlightPreservation((v) => (v === 'identity' ? null : 'identity'))
          }
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors border ${
            highlightPreservation === 'identity'
              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
          }`}
        >
          F(id) = id
        </button>
        <button
          onClick={triggerInvalid}
          className="px-3 py-1 rounded-lg text-sm font-medium transition-colors border bg-red-50 text-red-600 hover:bg-red-100 border-red-200 ml-auto"
        >
          Show invalid mapping
        </button>
      </div>

      {invalidFunctor && (
        <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium animate-pulse">
          Invalid functor: composition not preserved — F(g∘f) ≠ F(g)∘F(f)
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox="0 0 470 390"
        className="w-full border border-gray-100 rounded-xl bg-white/60"
        style={{ minHeight: 320 }}
      >
        <Markers />

        {/* Category labels */}
        <text x={118} y={24} textAnchor="middle" fontSize={13} fontWeight="600" fill="#6366f1" fontFamily="serif">
          𝒞
        </text>
        <text x={338} y={24} textAnchor="middle" fontSize={13} fontWeight="600" fill="#10b981" fontFamily="serif">
          𝒟
        </text>

        {/* Functor label */}
        <text x={235} y={24} textAnchor="middle" fontSize={12} fontStyle="italic" fill="#6b7280">
          F
        </text>
        <line x1={215} y1={20} x2={255} y2={20} stroke="#9ca3af" strokeWidth={1} markerEnd="url(#arrowhead)" />

        {/* Divider */}
        <line x1={235} y1={30} x2={235} y2={370} stroke="#f3f4f6" strokeWidth={1.5} strokeDasharray="4 4" />

        {/* Functor dashed arrows */}
        <FunctorArrows
          srcCat={FUNCTOR_SRC}
          tgtCat={FUNCTOR_TGT}
          functor={VALID_FUNCTOR}
          flash={flash}
        />

        {/* Source category */}
        <DrawCategory
          category={FUNCTOR_SRC}
          highlightMorphisms={getHighlightMorphisms()}
          showIdentities={highlightPreservation === 'identity'}
          svgRef={svgRef}
          morphismColor={(id) => {
            if (highlightPreservation === 'composition' && ['sf', 'sg', 'sgf'].includes(id))
              return '#6366f1';
            if (highlightPreservation === 'identity' && id.startsWith('sid')) return '#6366f1';
            return '#9ca3af';
          }}
        />

        {/* Target category */}
        <DrawCategory
          category={FUNCTOR_TGT}
          highlightMorphisms={getHighlightMorphisms()}
          showIdentities={highlightPreservation === 'identity'}
          svgRef={svgRef}
          morphismColor={(id) => {
            if (invalidFunctor) return '#ef4444';
            if (highlightPreservation === 'composition' && ['tf', 'tg', 'tgf'].includes(id))
              return '#10b981';
            if (highlightPreservation === 'identity' && id.startsWith('tid')) return '#10b981';
            return '#9ca3af';
          }}
        />

        {/* Preservation equations */}
        {highlightPreservation === 'composition' && (
          <text x={235} y={360} textAnchor="middle" fontSize={11} fill="#6366f1" fontStyle="italic">
            F(g∘f) = F(g)∘F(f) — composition preserved ✓
          </text>
        )}
        {highlightPreservation === 'identity' && (
          <text x={235} y={360} textAnchor="middle" fontSize={11} fill="#6366f1" fontStyle="italic">
            F(id_X) = id_{'{'}F(X){'}'} — identities preserved ✓
          </text>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Natural Transformations
// ---------------------------------------------------------------------------

// Two functors F, G: C → D
// C: X, Y with f: X→Y
// F(X), F(Y), G(X), G(Y)

const NT_C_OBJECTS: CatObject[] = [
  { id: 'X', label: 'X', x: 70, y: 190 },
  { id: 'Y', label: 'Y', x: 180, y: 190 },
];
const NT_C_MORPH: Morphism[] = [
  { id: 'f', from: 'X', to: 'Y', label: 'f', curve: 0 },
];

// Functor F maps: X→FX (x=300,y=110), Y→FY (x=420,y=110)
// Functor G maps: X→GX (x=300,y=270), Y→GY (x=420,y=270)

const NT_FX: CatObject = { id: 'FX', label: 'F(X)', x: 290, y: 110 };
const NT_FY: CatObject = { id: 'FY', label: 'F(Y)', x: 420, y: 110 };
const NT_GX: CatObject = { id: 'GX', label: 'G(X)', x: 290, y: 270 };
const NT_GY: CatObject = { id: 'GY', label: 'G(Y)', x: 420, y: 270 };

function NaturalTransformationsMode() {
  const [highlightMorphism, setHighlightMorphism] = useState<'f' | null>(null);
  const [animPath, setAnimPath] = useState<'top' | 'bottom' | null>(null);
  const [animT, setAnimT] = useState(0);
  const animRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const animate = useCallback((path: 'top' | 'bottom') => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setAnimPath(path);
    setAnimT(0);
    const start = performance.now();
    const duration = 1400;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setAnimT(t);
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Naturality square paths
  // Top path: η_X then F(f)  →  GX → GY  (η_Y after F(f))
  // Bottom path: F(f) then η_Y
  // Square: FX --Ff--> FY
  //          |          |
  //         η_X        η_Y
  //          |          |
  //         GX --Gf--> GY

  // Compute animation dot positions
  const topPath = [
    { from: NT_FX, to: NT_FY, curve: 0 },  // F(f): FX->FY
    { from: NT_FY, to: NT_GY, curve: 0 },  // η_Y: FY->GY
  ];
  const bottomPath = [
    { from: NT_FX, to: NT_GX, curve: 0 },  // η_X: FX->GX
    { from: NT_GX, to: NT_GY, curve: 0 },  // G(f): GX->GY
  ];

  function dotPosition(path: typeof topPath, t: number): { x: number; y: number } {
    const totalSegs = path.length;
    const seg = Math.min(Math.floor(t * totalSegs), totalSegs - 1);
    const localT = t * totalSegs - seg;
    const s = path[seg];
    const { cx, cy } = controlPoint(s.from.x, s.from.y, s.to.x, s.to.y, s.curve);
    return bezierPoint(s.from.x, s.from.y, cx, cy, s.to.x, s.to.y, localT);
  }

  const animDot =
    animPath === 'top'
      ? dotPosition(topPath, animT)
      : animPath === 'bottom'
      ? dotPosition(bottomPath, animT)
      : null;

  const naturalityActive = highlightMorphism === 'f';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setHighlightMorphism((v) => (v === 'f' ? null : 'f'))}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors border ${
            naturalityActive
              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
          }`}
        >
          Show naturality square for f
        </button>
        <button
          onClick={() => animate('top')}
          className="px-3 py-1 rounded-lg text-sm font-medium border bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200"
        >
          Chase: F(f) then η_Y
        </button>
        <button
          onClick={() => animate('bottom')}
          className="px-3 py-1 rounded-lg text-sm font-medium border bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200"
        >
          Chase: η_X then G(f)
        </button>
      </div>

      <div className="text-xs text-gray-500 italic px-1">
        η : F ⟹ G is natural iff for all f: X→Y, η_Y ∘ F(f) = G(f) ∘ η_X
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 500 390"
        className="w-full border border-gray-100 rounded-xl bg-white/60"
        style={{ minHeight: 320 }}
      >
        <Markers />

        {/* Source category label */}
        <text x={125} y={22} textAnchor="middle" fontSize={13} fontWeight="600" fill="#6b7280" fontFamily="serif">
          𝒞
        </text>
        {/* Target category label */}
        <text x={355} y={22} textAnchor="middle" fontSize={13} fontWeight="600" fill="#6b7280" fontFamily="serif">
          𝒟
        </text>

        {/* Divider */}
        <line x1={225} y1={30} x2={225} y2={370} stroke="#f3f4f6" strokeWidth={1.5} strokeDasharray="4 4" />

        {/* Functor labels on left */}
        <text x={247} y={80} fontSize={11} fill="#6366f1" fontStyle="italic">F</text>
        <text x={247} y={250} fontSize={11} fill="#10b981" fontStyle="italic">G</text>

        {/* Source category */}
        <DrawCategory
          category={{ objects: NT_C_OBJECTS, morphisms: NT_C_MORPH }}
          highlightMorphisms={highlightMorphism ? new Set([highlightMorphism]) : new Set()}
          showIdentities={false}
          svgRef={svgRef}
        />

        {/* F row: FX --Ff--> FY */}
        {[
          { from: NT_FX, to: NT_FY, label: 'F(f)', color: naturalityActive ? '#6366f1' : '#9ca3af', marker: naturalityActive ? 'arrowhead-indigo' : 'arrowhead' },
        ].map(({ from, to, label, color, marker }, i) => {
          const path = trimmedBezierPath(from.x, from.y, to.x, to.y, 0);
          const mid = bezierMid(from.x, from.y, to.x, to.y, 0);
          return (
            <g key={i}>
              <path d={path} fill="none" stroke={color} strokeWidth={naturalityActive ? 2 : 1.5} markerEnd={`url(#${marker})`} style={{ transition: 'stroke 0.3s' }} />
              <text x={mid.x} y={mid.y - 10} textAnchor="middle" fontSize={11} fontStyle="italic" fill={color}>{label}</text>
            </g>
          );
        })}

        {/* G row: GX --Gf--> GY */}
        {[
          { from: NT_GX, to: NT_GY, label: 'G(f)', color: naturalityActive ? '#10b981' : '#9ca3af', marker: naturalityActive ? 'arrowhead-green' : 'arrowhead' },
        ].map(({ from, to, label, color, marker }, i) => {
          const path = trimmedBezierPath(from.x, from.y, to.x, to.y, 0);
          const mid = bezierMid(from.x, from.y, to.x, to.y, 0);
          return (
            <g key={i}>
              <path d={path} fill="none" stroke={color} strokeWidth={naturalityActive ? 2 : 1.5} markerEnd={`url(#${marker})`} style={{ transition: 'stroke 0.3s' }} />
              <text x={mid.x} y={mid.y + 16} textAnchor="middle" fontSize={11} fontStyle="italic" fill={color}>{label}</text>
            </g>
          );
        })}

        {/* η arrows: FX->GX (η_X), FY->GY (η_Y) */}
        {[
          { from: NT_FX, to: NT_GX, label: 'η_X', isLeft: true },
          { from: NT_FY, to: NT_GY, label: 'η_Y', isLeft: false },
        ].map(({ from, to, label, isLeft }) => {
          const path = trimmedBezierPath(from.x, from.y, to.x, to.y, 0);
          const mid = bezierMid(from.x, from.y, to.x, to.y, 0);
          const color = naturalityActive ? '#f59e0b' : '#d1d5db';
          return (
            <g key={label}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={naturalityActive ? 2.5 : 1.5}
                markerEnd={`url(#arrowhead-${naturalityActive ? 'eta' : ''})`}
                style={{ transition: 'stroke 0.3s' }}
              />
              <text
                x={mid.x + (isLeft ? -18 : 18)}
                y={mid.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontStyle="italic"
                fill={color}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Object nodes */}
        {[NT_FX, NT_FY, NT_GX, NT_GY].map((obj) => {
          const isFRow = obj.id.startsWith('F');
          const isHighlighted = naturalityActive;
          return (
            <g key={obj.id}>
              <circle
                cx={obj.x}
                cy={obj.y}
                r={R + 2}
                fill={isHighlighted ? (isFRow ? '#eef2ff' : '#ecfdf5') : 'white'}
                stroke={isHighlighted ? (isFRow ? '#6366f1' : '#10b981') : '#d1d5db'}
                strokeWidth={isHighlighted ? 2 : 1.5}
                style={{ transition: 'fill 0.2s, stroke 0.2s' }}
              />
              <text
                x={obj.x}
                y={obj.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight="500"
                fill={isHighlighted ? (isFRow ? '#4338ca' : '#065f46') : '#374151'}
                fontFamily="serif"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {obj.label}
              </text>
            </g>
          );
        })}

        {/* Animated dot */}
        {animDot && (
          <circle
            cx={animDot.x}
            cy={animDot.y}
            r={6}
            fill={animPath === 'top' ? '#6366f1' : '#10b981'}
            opacity={animT < 1 ? 1 : 0}
            style={{ transition: 'opacity 0.3s' }}
          />
        )}

        {/* Commutativity label */}
        {naturalityActive && (
          <text x={355} y={200} textAnchor="middle" fontSize={10} fill="#6b7280" fontStyle="italic">
            naturality square
          </text>
        )}
        {animPath && animT === 1 && (
          <text x={355} y={360} textAnchor="middle" fontSize={11} fill="#10b981" fontWeight="600">
            Both paths agree ✓
          </text>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode: Commutative Diagrams
// ---------------------------------------------------------------------------

function CommutativeDiagramsMode() {
  const [diagram, setDiagram] = useState<CommutativeDiagram>('Square');
  const [highlightPath, setHighlightPath] = useState<number | null>(null);
  const [animating, setAnimating] = useState<number | null>(null);
  const [animT, setAnimT] = useState(0);
  const animRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [showResult, setShowResult] = useState(false);

  const diag = COMM_DIAGRAMS[diagram];

  useEffect(() => {
    setHighlightPath(null);
    setAnimating(null);
    setAnimT(0);
    setShowResult(false);
  }, [diagram]);

  const startAnimation = useCallback(
    (pathIdx: number) => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      setAnimating(pathIdx);
      setAnimT(0);
      setShowResult(false);
      const start = performance.now();
      const pathMorphisms = diag.paths[pathIdx].ids;
      const duration = pathMorphisms.length * 700;
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setAnimT(t);
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = null;
          setShowResult(true);
        }
      };
      animRef.current = requestAnimationFrame(step);
    },
    [diag.paths],
  );

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Compute animated dot position along a sequence of morphisms
  function dotAlongPath(pathIdx: number, t: number): { x: number; y: number } | null {
    const ids = diag.paths[pathIdx].ids;
    const seg = Math.min(Math.floor(t * ids.length), ids.length - 1);
    const localT = t * ids.length - seg;
    const morphId = ids[seg];
    const m = diag.morphisms.find((x) => x.id === morphId);
    if (!m) return null;
    const src = getNodeById(diag.objects, m.from);
    const tgt = getNodeById(diag.objects, m.to);
    if (!src || !tgt) return null;
    const curve = m.curve ?? 0;
    const { cx, cy } = controlPoint(src.x, src.y, tgt.x, tgt.y, curve);
    return bezierPoint(src.x, src.y, cx, cy, tgt.x, tgt.y, localT);
  }

  const animDot =
    animating !== null ? dotAlongPath(animating, animT) : null;

  const highlightedMorphisms = useMemo(() => {
    if (highlightPath === null) return new Set<string>();
    return new Set(diag.paths[highlightPath].ids);
  }, [highlightPath, diag.paths]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm font-medium text-gray-600">Diagram:</span>
        {(['Triangle', 'Square', 'Pentagon'] as CommutativeDiagram[]).map((d) => (
          <button
            key={d}
            onClick={() => setDiagram(d)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors border ${
              diagram === d
                ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-500 italic px-1">{diag.description}</div>

      {/* Path buttons */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm font-medium text-gray-600">Paths:</span>
        {diag.paths.map((p, i) => (
          <div key={i} className="flex gap-1">
            <button
              onMouseEnter={() => setHighlightPath(i)}
              onMouseLeave={() => setHighlightPath(null)}
              onClick={() => startAnimation(i)}
              className="px-3 py-1 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
              style={{
                backgroundColor: p.color + '15',
                color: p.color,
                borderColor: p.color + '60',
              }}
            >
              {p.label}
            </button>
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-1">Hover to highlight · Click to animate</span>
      </div>

      {showResult && (
        <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          Diagram commutes: both paths from {diag.paths[0]?.ids[0] ? diag.morphisms.find(m => m.id === diag.paths[0].ids[0])?.from : ''} give the same result ✓
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox="0 0 470 390"
        className="w-full border border-gray-100 rounded-xl bg-white/60"
        style={{ minHeight: 320 }}
      >
        <Markers />

        <DrawCategory
          category={{ objects: diag.objects, morphisms: diag.morphisms }}
          showIdentities={false}
          svgRef={svgRef}
          highlightMorphisms={highlightedMorphisms}
          morphismColor={(id) => {
            for (let i = 0; i < diag.paths.length; i++) {
              if (diag.paths[i].ids.includes(id)) {
                if (highlightPath === i) return diag.paths[i].color;
                if (animating === i) return diag.paths[i].color;
              }
            }
            return '#d1d5db';
          }}
        />

        {/* Animated dot */}
        {animDot && animating !== null && (
          <circle
            cx={animDot.x}
            cy={animDot.y}
            r={7}
            fill={diag.paths[animating]?.color ?? '#6366f1'}
            opacity={0.85}
          />
        )}

        {/* Commutativity indicator */}
        {showResult && (
          <>
            <circle cx={235} cy={195} r={18} fill="#ecfdf5" stroke="#10b981" strokeWidth={2} />
            <text x={235} y={199} textAnchor="middle" dominantBaseline="middle" fontSize={16} fill="#10b981">
              ✓
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

const TABS: Mode[] = ['Category', 'Functors', 'Natural Transformations', 'Commutative Diagrams'];

export const CategorySim: React.FC = () => {
  const [mode, setMode] = useState<Mode>('Category');

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Category Theory</h2>
        <p className="text-sm text-gray-500">
          Interactive visualizations of categories, functors, natural transformations, and commutative diagrams.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50/60">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setMode(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              mode === tab
                ? 'border-indigo-500 text-indigo-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {mode === 'Category' && <CategoryMode />}
        {mode === 'Functors' && <FunctorsMode />}
        {mode === 'Natural Transformations' && <NaturalTransformationsMode />}
        {mode === 'Commutative Diagrams' && <CommutativeDiagramsMode />}
      </div>
    </div>
  );
};

export default CategorySim;

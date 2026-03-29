import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * FunctionPlotSim
 * Interactive Canvas-based plotter for an algebra textbook.
 * Supports three modes: plot (2D function graph), spectrum (eigenvalue bars),
 * and heatmap (2D colour grid).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FunctionEntry {
  fn: string;
  color?: string;
  label?: string;
  dashed?: boolean;
}

interface FunctionPlotSimProps {
  functions?: FunctionEntry[];
  xRange?: [number, number];
  yRange?: [number, number];
  height?: string;
  mode?: 'plot' | 'spectrum' | 'heatmap';
  title?: string;
  editable?: boolean;
  spectrumData?: number[];
  heatmapData?: number[][];
  showGrid?: boolean;
  showAxes?: boolean;
  interactive?: boolean;
}

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const GRID_COLOR = '#f3f4f6';
const AXIS_COLOR = '#6b7280';
const TEXT_COLOR = '#374151';
const BG_COLOR = '#ffffff';

// ---------------------------------------------------------------------------
// Safe expression parser (recursive-descent, no eval)
// ---------------------------------------------------------------------------

type MathFn = (x: number) => number;

function compileFn(expr: string): MathFn | null {
  // Whitelist: only allow safe characters
  if (!/^[\d\sx+\-*/^().,%PIEa-z]+$/i.test(expr)) return null;
  try {
    // Replace ^ with ** and common constants
    const sanitized = expr
      .replace(/\bPI\b/g, String(Math.PI))
      .replace(/\bE\b/g, String(Math.E))
      .replace(/\^/g, '**');
    // Inject Math namespace for known functions
    const mathFns = [
      'sin','cos','tan','exp','log','sqrt','abs','pow','ceil','floor','round','sign','min','max','log2','log10','sinh','cosh','tanh'
    ];
    let body = sanitized;
    for (const fn of mathFns) {
      body = body.replace(new RegExp(`\\b${fn}\\b`, 'g'), `Math.${fn}`);
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `"use strict"; return (${body});`) as MathFn;
    // Quick smoke-test
    const test = fn(1);
    if (typeof test !== 'number') return null;
    return fn;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bv})`;
}

function heatColor(t: number): string {
  // blue → white → red
  if (t < 0.5) return lerpColor('#3b82f6', '#ffffff', t * 2);
  return lerpColor('#ffffff', '#ef4444', (t - 0.5) * 2);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const FunctionPlotSim = ({
  functions: initialFunctions = [{ fn: 'sin(x)', color: DEFAULT_COLORS[0], label: 'sin(x)' }],
  xRange: initialXRange = [-6, 6],
  yRange: initialYRange = [-3, 3],
  height = '380px',
  mode = 'plot',
  title,
  editable = false,
  spectrumData: initialSpectrum = [0.5, 1.2, 2.8, 4.1, 5.5],
  heatmapData,
  showGrid = true,
  showAxes = true,
  interactive = true,
}: FunctionPlotSimProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // view state (plot mode)
  const [xRange, setXRange] = useState<[number, number]>(initialXRange);
  const [yRange, setYRange] = useState<[number, number]>(initialYRange);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number } | null>(null);

  // editable state
  const [fns, setFns] = useState<FunctionEntry[]>(initialFunctions);
  const [spectrum, setSpectrum] = useState<number[]>(initialSpectrum);
  const [newFnInput, setNewFnInput] = useState('');
  const [newEigInput, setNewEigInput] = useState('');
  const [fnError, setFnError] = useState(false);

  // canvas size
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 340 });

  // pan/zoom drag state
  const dragRef = useRef<{ startX: number; startY: number; startXRange: [number,number]; startYRange: [number,number] } | null>(null);

  // ---------------------------------------------------------------------------
  // Resize observer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height: h } = e.contentRect;
        setCanvasSize({ w: Math.floor(width), h: Math.floor(h) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  const worldToCanvas = useCallback(
    (wx: number, wy: number, cw: number, ch: number): [number, number] => {
      const pad = { l: 48, r: 16, t: 16, b: 32 };
      const plotW = cw - pad.l - pad.r;
      const plotH = ch - pad.t - pad.b;
      const cx = pad.l + ((wx - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
      const cy = pad.t + ((yRange[1] - wy) / (yRange[1] - yRange[0])) * plotH;
      return [cx, cy];
    },
    [xRange, yRange]
  );

  const canvasToWorld = useCallback(
    (cx: number, cy: number, cw: number, ch: number): [number, number] => {
      const pad = { l: 48, r: 16, t: 16, b: 32 };
      const plotW = cw - pad.l - pad.r;
      const plotH = ch - pad.t - pad.b;
      const wx = xRange[0] + ((cx - pad.l) / plotW) * (xRange[1] - xRange[0]);
      const wy = yRange[1] - ((cy - pad.t) / plotH) * (yRange[1] - yRange[0]);
      return [wx, wy];
    },
    [xRange, yRange]
  );

  // ---------------------------------------------------------------------------
  // Draw: plot mode
  // ---------------------------------------------------------------------------

  const drawPlot = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const pad = { l: 48, r: 16, t: 16, b: 32 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (showGrid) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      const xStep = niceTick(xRange[1] - xRange[0]);
      const yStep = niceTick(yRange[1] - yRange[0]);
      const x0 = Math.ceil(xRange[0] / xStep) * xStep;
      const y0 = Math.ceil(yRange[0] / yStep) * yStep;
      for (let x = x0; x <= xRange[1] + 1e-9; x += xStep) {
        const [cx] = worldToCanvas(x, 0, w, h);
        ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, h - pad.b); ctx.stroke();
      }
      for (let y = y0; y <= yRange[1] + 1e-9; y += yStep) {
        const [, cy] = worldToCanvas(0, y, w, h);
        ctx.beginPath(); ctx.moveTo(pad.l, cy); ctx.lineTo(w - pad.r, cy); ctx.stroke();
      }
    }

    // Axes
    if (showAxes) {
      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 1.5;
      // x-axis
      const [, axisY] = worldToCanvas(0, 0, w, h);
      const clampedAxisY = Math.max(pad.t, Math.min(h - pad.b, axisY));
      ctx.beginPath(); ctx.moveTo(pad.l, clampedAxisY); ctx.lineTo(w - pad.r, clampedAxisY); ctx.stroke();
      // y-axis
      const [axisX] = worldToCanvas(0, 0, w, h);
      const clampedAxisX = Math.max(pad.l, Math.min(w - pad.r, axisX));
      ctx.beginPath(); ctx.moveTo(clampedAxisX, pad.t); ctx.lineTo(clampedAxisX, h - pad.b); ctx.stroke();

      // Tick labels
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const xStep = niceTick(xRange[1] - xRange[0]);
      const x0 = Math.ceil(xRange[0] / xStep) * xStep;
      for (let x = x0; x <= xRange[1] + 1e-9; x += xStep) {
        if (Math.abs(x) < xStep * 0.01) continue;
        const [cx] = worldToCanvas(x, 0, w, h);
        ctx.fillText(formatTick(x), cx, clampedAxisY + 14);
      }
      ctx.textAlign = 'right';
      const yStep = niceTick(yRange[1] - yRange[0]);
      const y0 = Math.ceil(yRange[0] / yStep) * yStep;
      for (let y = y0; y <= yRange[1] + 1e-9; y += yStep) {
        if (Math.abs(y) < yStep * 0.01) continue;
        const [, cy] = worldToCanvas(0, y, w, h);
        ctx.fillText(formatTick(y), clampedAxisX - 4, cy + 3.5);
      }
    }

    // Functions
    ctx.save();
    ctx.rect(pad.l, pad.t, plotW, plotH);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const steps = Math.min(plotW * 2, 1200);
    for (let fi = 0; fi < fns.length; fi++) {
      const entry = fns[fi];
      const color = entry.color ?? DEFAULT_COLORS[fi % DEFAULT_COLORS.length];
      const compiled = compileFn(entry.fn);
      if (!compiled) continue;

      ctx.beginPath();
      ctx.strokeStyle = color;
      if (entry.dashed) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);

      let pen = false;
      for (let i = 0; i <= steps; i++) {
        const wx = xRange[0] + (i / steps) * (xRange[1] - xRange[0]);
        let wy: number;
        try { wy = compiled(wx); } catch { pen = false; continue; }
        if (!isFinite(wy) || Math.abs(wy) > 1e6) { pen = false; continue; }
        const [cx, cy] = worldToCanvas(wx, wy, w, h);
        if (!pen) { ctx.moveTo(cx, cy); pen = true; }
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Crosshair
    if (cursor) {
      const [cx, cy] = worldToCanvas(cursor.x, cursor.y, w, h);
      ctx.save();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, cy); ctx.lineTo(w - pad.r, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, h - pad.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Legend
    if (fns.length > 0) {
      const lx = pad.l + 8;
      let ly = pad.t + 8;
      for (let fi = 0; fi < fns.length; fi++) {
        const entry = fns[fi];
        const color = entry.color ?? DEFAULT_COLORS[fi % DEFAULT_COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly, 16, 2.5);
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(entry.label ?? entry.fn, lx + 20, ly + 4);
        ly += 16;
      }
    }
  }, [fns, xRange, yRange, showGrid, showAxes, cursor, worldToCanvas]);

  // ---------------------------------------------------------------------------
  // Draw: spectrum mode
  // ---------------------------------------------------------------------------

  const drawSpectrum = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const pad = { l: 48, r: 20, t: 28, b: 36 };
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    if (spectrum.length === 0) return;

    const sorted = [...spectrum].sort((a, b) => a - b);
    const maxVal = sorted[sorted.length - 1];
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const barW = Math.max(4, Math.min(40, (plotW / sorted.length) * 0.6));
    const gap = plotW / sorted.length;

    // Grid line at top
    if (showGrid) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      }
    }

    // Spectral gap highlight (between λ₁ and λ₂)
    if (sorted.length >= 2) {
      const gap0x = pad.l + gap * 0.5 + barW / 2;
      const gap1x = pad.l + gap * 1.5 - barW / 2;
      ctx.fillStyle = 'rgba(251,191,36,0.12)';
      ctx.fillRect(gap0x, pad.t, gap1x - gap0x, plotH);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(gap0x, pad.t); ctx.lineTo(gap0x, h - pad.b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gap1x, pad.t); ctx.lineTo(gap1x, h - pad.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#92400e';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const gapLabel = `Δ=${(sorted[1] - sorted[0]).toFixed(2)}`;
      ctx.fillText(gapLabel, (gap0x + gap1x) / 2, pad.t - 6);
    }

    // Bars
    for (let i = 0; i < sorted.length; i++) {
      const val = sorted[i];
      const t = maxVal > 0 ? val / maxVal : 0;
      const color = lerpColor('#3b82f6', '#ef4444', t);
      const bh = maxVal > 0 ? (val / maxVal) * plotH : 0;
      const bx = pad.l + i * gap + (gap - barW) / 2;
      const by = pad.t + plotH - bh;

      ctx.fillStyle = hoveredBar === i ? '#f59e0b' : color;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, barW, bh, [3, 3, 0, 0]) ?? ctx.rect(bx, by, barW, bh);
      ctx.fill();

      // Label λᵢ
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const subscripts = ['₁','₂','₃','₄','₅','₆','₇','₈','₉'];
      ctx.fillText(`λ${subscripts[i] ?? i+1}`, bx + barW / 2, h - pad.b + 12);

      // Value on hover
      if (hoveredBar === i) {
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText(val.toFixed(3), bx + barW / 2, by - 6);
      }
    }

    // Y-axis ticks
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = (maxVal * (4 - i)) / 4;
      const y = pad.t + (i / 4) * plotH;
      ctx.fillText(formatTick(v), pad.l - 4, y + 3.5);
    }
  }, [spectrum, showGrid, hoveredBar]);

  // ---------------------------------------------------------------------------
  // Draw: heatmap mode
  // ---------------------------------------------------------------------------

  const drawHeatmap = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const data = heatmapData ?? [[1, 0.5, 0], [0.5, 1, 0.5], [0, 0.5, 1]];
    const rows = data.length;
    const cols = data[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return;

    const pad = { l: 28, r: 28, t: 16, b: 28 };
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const cellW = (w - pad.l - pad.r) / cols;
    const cellH = (h - pad.t - pad.b) / rows;

    let minV = Infinity, maxV = -Infinity;
    for (const row of data) for (const v of row) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const range = maxV - minV || 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = (data[r][c] - minV) / range;
        ctx.fillStyle = heatColor(t);
        const cx = pad.l + c * cellW;
        const cy = pad.t + r * cellH;
        ctx.fillRect(cx, cy, cellW, cellH);
        // Grid lines
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cellW, cellH);

        // Value label if cells are big enough
        if (cellW > 24 && cellH > 16) {
          ctx.fillStyle = t > 0.3 && t < 0.7 ? TEXT_COLOR : (t < 0.3 ? '#1e40af' : '#7f1d1d');
          ctx.font = `${Math.min(10, cellW * 0.3)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(data[r][c].toFixed(2), cx + cellW / 2, cy + cellH / 2 + 3.5);
        }

        // Hover highlight
        if (hoveredCell?.r === r && hoveredCell?.c === c) {
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
          ctx.fillStyle = TEXT_COLOR;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(data[r][c].toFixed(4), cx + cellW / 2, cy - 4);
        }
      }
    }

    // Row/col labels
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let c = 0; c < cols; c++) {
      ctx.fillText(`c${c + 1}`, pad.l + c * cellW + cellW / 2, h - 4);
    }
    ctx.textAlign = 'right';
    for (let r = 0; r < rows; r++) {
      ctx.fillText(`r${r + 1}`, pad.l - 4, pad.t + r * cellH + cellH / 2 + 3.5);
    }
  }, [heatmapData, hoveredCell]);

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      if (mode === 'plot') drawPlot(ctx, canvasSize.w, canvasSize.h);
      else if (mode === 'spectrum') drawSpectrum(ctx, canvasSize.w, canvasSize.h);
      else if (mode === 'heatmap') drawHeatmap(ctx, canvasSize.w, canvasSize.h);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, canvasSize, drawPlot, drawSpectrum, drawHeatmap]);

  // ---------------------------------------------------------------------------
  // Interaction handlers (plot mode)
  // ---------------------------------------------------------------------------

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (mode === 'plot') {
      const [wx, wy] = canvasToWorld(px, py, canvasSize.w, canvasSize.h);
      setCursor({ x: wx, y: wy });

      if (dragRef.current && interactive) {
        const dx = px - dragRef.current.startX;
        const dy = py - dragRef.current.startY;
        const xSpan = dragRef.current.startXRange[1] - dragRef.current.startXRange[0];
        const ySpan = dragRef.current.startYRange[1] - dragRef.current.startYRange[0];
        const dxW = -(dx / canvasSize.w) * xSpan;
        const dyW = (dy / canvasSize.h) * ySpan;
        setXRange([dragRef.current.startXRange[0] + dxW, dragRef.current.startXRange[1] + dxW]);
        setYRange([dragRef.current.startYRange[0] + dyW, dragRef.current.startYRange[1] + dyW]);
      }
    } else if (mode === 'spectrum') {
      // Find hovered bar
      const sorted = [...spectrum].sort((a, b) => a - b);
      const pad = { l: 48, r: 20, b: 36, t: 28 };
      const plotW = canvasSize.w - pad.l - pad.r;
      const gap = plotW / (sorted.length || 1);
      const i = Math.floor((px - pad.l) / gap);
      setHoveredBar(i >= 0 && i < sorted.length ? i : null);
    } else if (mode === 'heatmap') {
      const data = heatmapData ?? [[1, 0.5, 0], [0.5, 1, 0.5], [0, 0.5, 1]];
      const pad = { l: 28, r: 28, t: 16, b: 28 };
      const rows = data.length;
      const cols = data[0]?.length ?? 0;
      const cellW = (canvasSize.w - pad.l - pad.r) / cols;
      const cellH = (canvasSize.h - pad.t - pad.b) / rows;
      const c = Math.floor((px - pad.l) / cellW);
      const r = Math.floor((py - pad.t) / cellH);
      setHoveredCell(r >= 0 && r < rows && c >= 0 && c < cols ? { r, c } : null);
    }
  };

  const handleMouseLeave = () => {
    setCursor(null);
    setHoveredBar(null);
    setHoveredCell(null);
    dragRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || mode !== 'plot') return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      startXRange: [...xRange] as [number, number],
      startYRange: [...yRange] as [number, number],
    };
  };

  const handleMouseUp = () => { dragRef.current = null; };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!interactive || mode !== 'plot') return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const cx = (xRange[0] + xRange[1]) / 2;
    const cy = (yRange[0] + yRange[1]) / 2;
    const xSpan = (xRange[1] - xRange[0]) * factor;
    const ySpan = (yRange[1] - yRange[0]) * factor;
    setXRange([cx - xSpan / 2, cx + xSpan / 2]);
    setYRange([cy - ySpan / 2, cy + ySpan / 2]);
  };

  // ---------------------------------------------------------------------------
  // Editable controls
  // ---------------------------------------------------------------------------

  const addFunction = () => {
    const compiled = compileFn(newFnInput);
    if (!compiled) { setFnError(true); return; }
    setFnError(false);
    const color = DEFAULT_COLORS[fns.length % DEFAULT_COLORS.length];
    setFns(prev => [...prev, { fn: newFnInput, color, label: newFnInput }]);
    setNewFnInput('');
  };

  const removeFunction = (i: number) => setFns(prev => prev.filter((_, j) => j !== i));

  const addEigenvalue = () => {
    const v = parseFloat(newEigInput);
    if (isNaN(v)) return;
    setSpectrum(prev => [...prev, v].sort((a, b) => a - b));
    setNewEigInput('');
  };

  const removeEigenvalue = (i: number) => {
    const sorted = [...spectrum].sort((a, b) => a - b);
    setSpectrum(sorted.filter((_, j) => j !== i));
  };

  // ---------------------------------------------------------------------------
  // Status bar info
  // ---------------------------------------------------------------------------

  const statusParts: string[] = [];
  statusParts.push(`mode: ${mode}`);
  if (mode === 'plot') {
    statusParts.push(`x ∈ [${xRange[0].toFixed(1)}, ${xRange[1].toFixed(1)}]`);
    statusParts.push(`y ∈ [${yRange[0].toFixed(1)}, ${yRange[1].toFixed(1)}]`);
    if (cursor) statusParts.push(`(${cursor.x.toFixed(3)}, ${cursor.y.toFixed(3)})`);
  } else if (mode === 'spectrum') {
    const s = [...spectrum].sort((a, b) => a - b);
    if (s.length) statusParts.push(`λ_min=${s[0].toFixed(3)}  λ_max=${s[s.length-1].toFixed(3)}`);
    if (s.length >= 2) statusParts.push(`gap=${(s[1]-s[0]).toFixed(3)}`);
  } else if (mode === 'heatmap') {
    const data = heatmapData ?? [[1,0.5,0],[0.5,1,0.5],[0,0.5,1]];
    let min = Infinity, max = -Infinity;
    for (const row of data) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
    statusParts.push(`min=${min.toFixed(3)}  max=${max.toFixed(3)}`);
    if (hoveredCell) statusParts.push(`cell [${hoveredCell.r},${hoveredCell.c}] = ${data[hoveredCell.r][hoveredCell.c].toFixed(4)}`);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
      {title && (
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-[13px] font-semibold text-gray-700">{title}</h3>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1" style={{ height }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: interactive && mode === 'plot' ? 'crosshair' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Editable controls */}
      {editable && (
        <div className="border-t border-gray-100 bg-white px-4 py-2 flex flex-wrap gap-3 items-center text-[11px]">
          {mode === 'plot' && (
            <div className="flex items-center gap-2 flex-wrap">
              {fns.map((f, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                  <span style={{ color: f.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }} className="font-mono font-bold">■</span>
                  <span className="font-mono text-gray-700">{f.label ?? f.fn}</span>
                  <button onClick={() => removeFunction(i)} className="text-gray-400 hover:text-red-500 ml-1 leading-none">×</button>
                </span>
              ))}
              <input
                value={newFnInput}
                onChange={e => { setNewFnInput(e.target.value); setFnError(false); }}
                onKeyDown={e => e.key === 'Enter' && addFunction()}
                placeholder="e.g. sin(x)*x"
                className={`font-mono text-[11px] border rounded px-2 py-0.5 w-32 focus:outline-none focus:ring-1 ${fnError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'}`}
              />
              <button onClick={addFunction} className="bg-gray-800 text-white rounded px-2 py-0.5 hover:bg-indigo-600 transition-colors">+ Add</button>
            </div>
          )}
          {mode === 'spectrum' && (
            <div className="flex items-center gap-2 flex-wrap">
              {[...spectrum].sort((a,b)=>a-b).map((v, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                  <span className="font-mono text-gray-700">λ={v.toFixed(2)}</span>
                  <button onClick={() => removeEigenvalue(i)} className="text-gray-400 hover:text-red-500 ml-1 leading-none">×</button>
                </span>
              ))}
              <input
                type="number"
                value={newEigInput}
                onChange={e => setNewEigInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEigenvalue()}
                placeholder="λ value"
                className="font-mono text-[11px] border border-gray-200 rounded px-2 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <button onClick={addEigenvalue} className="bg-gray-800 text-white rounded px-2 py-0.5 hover:bg-indigo-600 transition-colors">+ Add λ</button>
            </div>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
        {statusParts.map((s, i) => (
          <span key={i} className="font-mono">{s}</span>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function niceTick(span: number): number {
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return v.toExponential(0);
  if (Number.isInteger(v)) return String(v);
  return parseFloat(v.toPrecision(3)).toString();
}

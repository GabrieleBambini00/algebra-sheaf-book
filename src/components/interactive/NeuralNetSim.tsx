import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';

/**
 * NeuralNetSim
 * Interactive SVG visualization of neural networks as sheaf-like structures.
 * Supports four modes:
 *   - forward:  animated forward propagation, user sets inputs
 *   - weights:  color-coded weight inspection, editable weights
 *   - gradient: backpropagation gradient flow visualization
 *   - sheaf:    reinterprets the network as a cellular sheaf on a graph
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NeuralNetSimProps {
  layers?: number[];
  height?: string;
  mode?: 'forward' | 'weights' | 'gradient' | 'sheaf';
  editable?: boolean;
  title?: string;
  activationFn?: 'relu' | 'sigmoid' | 'tanh';
}

interface NetworkWeights {
  /** weights[l] is a flat row-major matrix: shape [layers[l+1]] x [layers[l]] */
  weights: number[][];
  /** biases[l] has length layers[l+1] */
  biases: number[][];
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function relu(x: number): number { return Math.max(0, x); }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }
function tanhFn(x: number): number { return Math.tanh(x); }

function applyActivation(x: number, fn: 'relu' | 'sigmoid' | 'tanh'): number {
  if (fn === 'relu') return relu(x);
  if (fn === 'sigmoid') return sigmoid(x);
  return tanhFn(x);
}

function activationDerivative(x: number, fn: 'relu' | 'sigmoid' | 'tanh'): number {
  if (fn === 'relu') return x > 0 ? 1 : 0;
  if (fn === 'sigmoid') { const s = sigmoid(x); return s * (1 - s); }
  return 1 - Math.tanh(x) ** 2;
}

/** Box-Muller transform for Normal(0,1) samples */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Xavier/Glorot initialization: w ~ N(0, sqrt(2/fan_in)) */
function xavierInit(layers: number[]): NetworkWeights {
  const weights: number[][] = [];
  const biases: number[][] = [];
  for (let l = 0; l < layers.length - 1; l++) {
    const fanIn = layers[l];
    const fanOut = layers[l + 1];
    const std = Math.sqrt(2 / fanIn);
    weights.push(Array.from({ length: fanIn * fanOut }, () => randn() * std));
    biases.push(Array.from({ length: fanOut }, () => 0));
  }
  return { weights, biases };
}

/** Forward pass — returns activations per layer (including inputs) */
function forwardPass(
  inputs: number[],
  layers: number[],
  net: NetworkWeights,
  fn: 'relu' | 'sigmoid' | 'tanh',
): { preActivations: number[][]; activations: number[][] } {
  const preActivations: number[][] = [inputs.map(() => 0)]; // dummy for layer 0
  const activations: number[][] = [inputs.slice()];
  for (let l = 0; l < layers.length - 1; l++) {
    const inSize = layers[l];
    const outSize = layers[l + 1];
    const W = net.weights[l];
    const b = net.biases[l];
    const pre: number[] = [];
    const act: number[] = [];
    for (let j = 0; j < outSize; j++) {
      let z = b[j];
      for (let i = 0; i < inSize; i++) {
        z += W[j * inSize + i] * activations[l][i];
      }
      pre.push(z);
      // Last layer: no activation (linear output)
      act.push(l === layers.length - 2 ? z : applyActivation(z, fn));
    }
    preActivations.push(pre);
    activations.push(act);
  }
  return { preActivations, activations };
}

/** Numerical gradient of MSE loss w.r.t. each neuron's activation.
 *  Returns gradient per layer in the same shape as activations. */
function computeGradients(
  inputs: number[],
  layers: number[],
  net: NetworkWeights,
  fn: 'relu' | 'sigmoid' | 'tanh',
  target: number[],
): number[][] {
  const { preActivations, activations } = forwardPass(inputs, layers, net, fn);
  // delta[l] = dL/d(preActivation[l])
  const delta: number[][] = layers.map(() => []);
  const L = layers.length - 1;

  // Output layer delta: dL/dz = 2*(a - t) * act'(z)  (MSE)
  delta[L] = activations[L].map((a, j) => {
    const t = target[j] ?? 0;
    return 2 * (a - t); // linear output, derivative = 1
  });

  // Backprop
  for (let l = L - 1; l >= 1; l--) {
    const outSize = layers[l + 1];
    const inSize = layers[l];
    const W = net.weights[l];
    delta[l] = [];
    for (let i = 0; i < inSize; i++) {
      let grad = 0;
      for (let j = 0; j < outSize; j++) {
        grad += W[j * inSize + i] * delta[l + 1][j];
      }
      delta[l].push(grad * activationDerivative(preActivations[l][i], fn));
    }
  }
  delta[0] = inputs.map(() => 0);

  // Return |gradient| per neuron
  return delta.map(d => d.map(v => Math.abs(v)));
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Weight → color: blue (positive) · gray (zero) · red (negative) */
function weightColor(w: number): string {
  if (Math.abs(w) < 0.05) return '#d1d5db'; // gray-300
  return w > 0 ? '#3b82f6' : '#ef4444'; // blue-500 / red-500
}

/** Stronger weight → deeper color, interpolated */
function weightColorInterp(w: number, maxW: number): string {
  const t = maxW > 0 ? Math.min(1, Math.abs(w) / maxW) : 0;
  if (Math.abs(w) < 0.05) return '#d1d5db';
  if (w > 0) {
    // white → blue-500
    const r = Math.round(255 - t * (255 - 59));
    const g = Math.round(255 - t * (255 - 130));
    const b = Math.round(255 - t * (255 - 246));
    return `rgb(${r},${g},${b})`;
  } else {
    // white → red-500
    const r = Math.round(255 - t * (255 - 239));
    const g = Math.round(255 - t * (255 - 68));
    const b = Math.round(255 - t * (255 - 68));
    return `rgb(${r},${g},${b})`;
  }
}

/** Activation value → blue fill (0=white, 1=blue-600) */
function activationColor(a: number, fn: 'relu' | 'sigmoid' | 'tanh'): string {
  let t: number;
  if (fn === 'relu') t = Math.min(1, Math.max(0, a));
  else if (fn === 'sigmoid') t = Math.max(0, Math.min(1, a));
  else t = Math.max(0, Math.min(1, (a + 1) / 2)); // tanh: -1..1 → 0..1
  const lightness = Math.round(98 - t * 50);
  return `hsl(217,${Math.round(60 + t * 30)}%,${lightness}%)`;
}

/** Gradient magnitude → amber (large) · gray (vanishing) */
function gradientColor(g: number, maxG: number): string {
  const t = maxG > 0 ? Math.min(1, g / maxG) : 0;
  if (t < 0.05) return '#e5e7eb'; // gray-200 vanishing
  // amber-500: #f59e0b
  const r = Math.round(229 + t * (245 - 229));
  const gC = Math.round(231 - t * (231 - 158));
  const b = Math.round(235 - t * (235 - 11));
  return `rgb(${r},${gC},${b})`;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const SVG_W = 540;
const SVG_H = 420;
const NEURON_R = 18;
const MARGIN_X = 60;
const MARGIN_Y = 40;

function neuronPositions(layers: number[]): { cx: number; cy: number }[][] {
  const positions: { cx: number; cy: number }[][] = [];
  const numLayers = layers.length;
  const xStep = numLayers > 1 ? (SVG_W - 2 * MARGIN_X) / (numLayers - 1) : 0;
  for (let l = 0; l < numLayers; l++) {
    const n = layers[l];
    const cx = MARGIN_X + l * xStep;
    const yStep = n > 1 ? (SVG_H - 2 * MARGIN_Y) / (n - 1) : 0;
    const yStart = n === 1 ? SVG_H / 2 : MARGIN_Y;
    positions.push(
      Array.from({ length: n }, (_, j) => ({
        cx,
        cy: yStart + j * yStep,
      }))
    );
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const NeuralNetSim: React.FC<NeuralNetSimProps> = ({
  layers: layersProp = [2, 4, 3, 1],
  height = '500px',
  mode = 'forward',
  editable = false,
  title,
  activationFn = 'relu',
}) => {
  const layers = useMemo(() => layersProp, [layersProp.join(',')]); // eslint-disable-line

  // ── Network weights state ────────────────────────────────────────────────
  const [net, setNet] = useState<NetworkWeights>(() => xavierInit(layers));

  // Reinitialize weights if layers change
  useEffect(() => {
    setNet(xavierInit(layers));
  }, [layers.join(',')]); // eslint-disable-line

  // ── Input values state ───────────────────────────────────────────────────
  const [inputs, setInputs] = useState<number[]>(() =>
    Array.from({ length: layers[0] }, (_, i) => parseFloat((0.5 + i * 0.3).toFixed(2)))
  );

  // ── Target values (for sheaf mode loss) ─────────────────────────────────
  const [targets, _setTargets] = useState<number[]>(() =>
    Array.from({ length: layers[layers.length - 1] }, () => 0.5)
  );

  // ── Forward pass results ─────────────────────────────────────────────────
  const { activations } = useMemo(
    () => forwardPass(inputs, layers, net, activationFn),
    [inputs, layers, net, activationFn]
  );

  // ── Gradient magnitudes ──────────────────────────────────────────────────
  const gradients = useMemo(() => {
    if (mode !== 'gradient' && mode !== 'sheaf') return layers.map(n => new Array(n).fill(0));
    return computeGradients(inputs, layers, net, activationFn, targets);
  }, [mode, inputs, layers, net, activationFn, targets]);

  const maxGrad = useMemo(
    () => Math.max(...gradients.flat(), 1e-6),
    [gradients]
  );

  // ── Forward animation wave state ─────────────────────────────────────────
  const [waveLayer, setWaveLayer] = useState<number>(-1); // -1 = idle
  const [isAnimating, setIsAnimating] = useState(false);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runForwardAnim = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setWaveLayer(0);
    let l = 0;
    const step = () => {
      l++;
      if (l >= layers.length) {
        setWaveLayer(-1);
        setIsAnimating(false);
        return;
      }
      setWaveLayer(l);
      animRef.current = setTimeout(step, 500);
    };
    animRef.current = setTimeout(step, 400);
  }, [isAnimating, layers.length]);

  useEffect(() => {
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, []);

  // ── Gradient backward animation state ────────────────────────────────────
  const [gradWaveLayer, setGradWaveLayer] = useState<number>(-1);
  const [isGradAnimating, setIsGradAnimating] = useState(false);
  const gradAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runGradAnim = useCallback(() => {
    if (isGradAnimating) return;
    setIsGradAnimating(true);
    let l = layers.length - 1;
    setGradWaveLayer(l);
    const step = () => {
      l--;
      if (l < 0) {
        setGradWaveLayer(-1);
        setIsGradAnimating(false);
        return;
      }
      setGradWaveLayer(l);
      gradAnimRef.current = setTimeout(step, 500);
    };
    gradAnimRef.current = setTimeout(step, 400);
  }, [isGradAnimating, layers.length]);

  useEffect(() => {
    return () => { if (gradAnimRef.current) clearTimeout(gradAnimRef.current); };
  }, []);

  // ── Weight editing state ─────────────────────────────────────────────────
  const [hoveredEdge, setHoveredEdge] = useState<{ l: number; j: number; i: number } | null>(null);
  const [editingEdge, setEditingEdge] = useState<{ l: number; j: number; i: number } | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');

  const commitWeightEdit = () => {
    if (!editingEdge) return;
    const val = parseFloat(editBuffer);
    if (!isNaN(val)) {
      const { l, j, i } = editingEdge;
      setNet(prev => {
        const newWeights = prev.weights.map((w, li) => li === l ? [...w] : w);
        newWeights[l][j * layers[l] + i] = val;
        return { ...prev, weights: newWeights };
      });
    }
    setEditingEdge(null);
  };

  // ── Input editing state ──────────────────────────────────────────────────
  const [editingInput, setEditingInput] = useState<number | null>(null);
  const [inputEditBuffer, setInputEditBuffer] = useState<string>('');

  const commitInputEdit = () => {
    if (editingInput === null) return;
    const val = parseFloat(inputEditBuffer);
    if (!isNaN(val)) {
      setInputs(prev => prev.map((v, i) => i === editingInput ? val : v));
    }
    setEditingInput(null);
  };

  // ── Layout ───────────────────────────────────────────────────────────────
  const positions = useMemo(() => neuronPositions(layers), [layers]);

  // Max absolute weight (for color scaling)
  const maxAbsWeight = useMemo(
    () => Math.max(...net.weights.flat().map(Math.abs), 0.01),
    [net]
  );

  // ── Loss (MSE) ───────────────────────────────────────────────────────────
  const outputLayer = activations[layers.length - 1];
  const loss = useMemo(() => {
    if (!outputLayer) return null;
    return outputLayer.reduce((s, a, j) => s + (a - (targets[j] ?? 0)) ** 2, 0) / outputLayer.length;
  }, [outputLayer, targets]);

  // ── Architecture string ──────────────────────────────────────────────────
  const archStr = layers.join('→');

  // ── Total params ────────────────────────────────────────────────────────
  const totalParams = useMemo(() => {
    return net.weights.reduce((s, w) => s + w.length, 0) +
      net.biases.reduce((s, b) => s + b.length, 0);
  }, [net]);

  // ── Sheaf: edge consistency ───────────────────────────────────────────────
  // An edge (l, j->i) is "consistent" if the forward pass matches the target.
  // We color edges green if overall loss < 0.1, red otherwise, proportionally.
  const sheafEdgeColor = useCallback((w: number): string => {
    if (mode !== 'sheaf') return weightColor(w);
    if (loss === null) return '#22c55e';
    const t = Math.min(1, loss * 5); // 0.2 loss → full red
    const r = Math.round(34 + t * (239 - 34));
    const gC = Math.round(197 - t * (197 - 68));
    const b2 = Math.round(94 - t * (94 - 68));
    return `rgb(${r},${gC},${b2})`;
  }, [mode, loss]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">

      {/* Optional title */}
      {title && (
        <div className="px-4 pt-3 pb-1 text-[12px] font-semibold text-gray-500 font-sans tracking-wide uppercase">
          {title}
        </div>
      )}

      {/* SVG canvas */}
      <div className="relative bg-gray-50/60 select-none" style={{ height }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
        >
          {/* Subtle grid */}
          <defs>
            <pattern id="nn-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
            </pattern>
            {/* Glow filter for wave highlight */}
            <filter id="nn-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width={SVG_W} height={SVG_H} fill="url(#nn-grid)" />

          {/* ── Layer labels ───────────────────────────────────────────── */}
          {layers.map((_, l) => {
            const cx = positions[l][0]?.cx ?? 0;
            const label = l === 0 ? 'Input' : l === layers.length - 1 ? 'Output' : `Hidden ${l}`;
            return (
              <text
                key={`layer-label-${l}`}
                x={cx} y={18}
                textAnchor="middle"
                fontSize="9"
                fill="#9ca3af"
                fontFamily="sans-serif"
                fontWeight="600"
              >
                {label}
              </text>
            );
          })}

          {/* ── Edges (connections) ─────────────────────────────────────── */}
          {layers.slice(0, -1).map((inSize, l) => {
            const outSize = layers[l + 1];
            const W = net.weights[l];
            return Array.from({ length: outSize }, (_, j) =>
              Array.from({ length: inSize }, (_, i) => {
                const w = W[j * inSize + i];
                const { cx: x1, cy: y1 } = positions[l][i];
                const { cx: x2, cy: y2 } = positions[l + 1][j];

                const isHovered = hoveredEdge?.l === l && hoveredEdge?.j === j && hoveredEdge?.i === i;
                const isEditing2 = editingEdge?.l === l && editingEdge?.j === j && editingEdge?.i === i;

                const strokeW = Math.max(0.5, Math.min(4, Math.abs(w) * 2.5));

                let stroke: string;
                if (mode === 'sheaf') {
                  stroke = sheafEdgeColor(w);
                } else if (mode === 'weights') {
                  stroke = weightColorInterp(w, maxAbsWeight);
                } else if (mode === 'gradient') {
                  // Dim in gradient mode, we highlight neurons instead
                  stroke = '#e5e7eb';
                } else {
                  stroke = weightColor(w);
                }

                // Wave highlight: forward mode — highlight incoming edges of waveLayer
                const isWaveActive = mode === 'forward' && waveLayer === l + 1;
                const isGradWaveActive = mode === 'gradient' && gradWaveLayer === l;

                return (
                  <g key={`edge-${l}-${j}-${i}`}>
                    {/* Hit area for hover/click */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: editable && mode === 'weights' ? 'pointer' : 'default' }}
                      onMouseEnter={() => setHoveredEdge({ l, j, i })}
                      onMouseLeave={() => setHoveredEdge(null)}
                      onClick={() => {
                        if (!editable || mode !== 'weights') return;
                        setEditingEdge({ l, j, i });
                        setEditBuffer(w.toFixed(3));
                      }}
                    />
                    {/* Visible edge */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isWaveActive || isGradWaveActive ? (isWaveActive ? '#3b82f6' : '#f59e0b') : stroke}
                      strokeWidth={isWaveActive || isGradWaveActive ? Math.max(1.5, strokeW) : strokeW}
                      strokeOpacity={isHovered || isWaveActive || isGradWaveActive ? 1 : 0.7}
                      strokeLinecap="round"
                      style={{
                        transition: 'stroke 0.3s, stroke-width 0.2s',
                        filter: (isWaveActive || isGradWaveActive || isHovered) ? 'url(#nn-glow)' : undefined,
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Weight label on hover (weights mode) */}
                    {mode === 'weights' && isHovered && !isEditing2 && (
                      <>
                        <rect
                          x={(x1 + x2) / 2 - 18}
                          y={(y1 + y2) / 2 - 10}
                          width={36} height={13}
                          rx={3} fill="white" stroke="#d1d5db" strokeWidth={1}
                          opacity={0.95}
                        />
                        <text
                          x={(x1 + x2) / 2}
                          y={(y1 + y2) / 2 - 0.5}
                          textAnchor="middle"
                          fontSize="8"
                          fill={w >= 0 ? '#2563eb' : '#dc2626'}
                          fontFamily="monospace"
                          fontWeight="700"
                          style={{ pointerEvents: 'none' }}
                        >
                          {w.toFixed(3)}
                        </text>
                      </>
                    )}

                    {/* Inline weight edit input (weights mode, editable) */}
                    {isEditing2 && (
                      <foreignObject
                        x={(x1 + x2) / 2 - 28}
                        y={(y1 + y2) / 2 - 11}
                        width={56} height={20}
                      >
                        <input
                          autoFocus
                          value={editBuffer}
                          onChange={e => setEditBuffer(e.target.value)}
                          onBlur={commitWeightEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitWeightEdit();
                            if (e.key === 'Escape') setEditingEdge(null);
                          }}
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
              })
            );
          })}

          {/* ── Neurons ─────────────────────────────────────────────────── */}
          {layers.map((n, l) =>
            Array.from({ length: n }, (_, j) => {
              const { cx, cy } = positions[l][j];
              const act = activations[l]?.[j] ?? 0;
              const grad = gradients[l]?.[j] ?? 0;
              const isWaveActive = mode === 'forward' && waveLayer === l;
              const isGradWave = mode === 'gradient' && gradWaveLayer === l;

              let fill: string;
              if (mode === 'gradient') {
                fill = gradientColor(grad, maxGrad);
              } else if (mode === 'sheaf') {
                // Fill by activation but outline by consistency
                fill = activationColor(act, activationFn);
              } else {
                fill = l === 0 ? '#f9fafb' : activationColor(act, activationFn); // input neurons: light
              }

              const stroke = isWaveActive ? '#3b82f6'
                : isGradWave ? '#f59e0b'
                : '#d1d5db';
              const strokeWidth = isWaveActive || isGradWave ? 2.5 : 1.5;

              const isInputEditable = editable && mode === 'forward' && l === 0;
              const isEditingThisInput = editingInput === j && l === 0;

              // Sheaf: local section label
              const isSheafOutput = mode === 'sheaf' && l === layers.length - 1;

              return (
                <g key={`neuron-${l}-${j}`}>
                  <circle
                    cx={cx} cy={cy} r={NEURON_R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    style={{
                      filter: isWaveActive || isGradWave ? 'url(#nn-glow)' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))',
                      transition: 'fill 0.3s, stroke 0.3s',
                      cursor: isInputEditable ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (!isInputEditable) return;
                      setEditingInput(j);
                      setInputEditBuffer((inputs[j] ?? 0).toFixed(2));
                    }}
                  />

                  {/* Activation value inside neuron */}
                  {!isEditingThisInput && (
                    <text
                      x={cx} y={cy + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={l === 0 ? '#374151' : '#1e3a8a'}
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {l === 0
                        ? (inputs[j] ?? 0).toFixed(2)
                        : act.toFixed(2)}
                    </text>
                  )}

                  {/* Gradient magnitude label (gradient mode) */}
                  {mode === 'gradient' && (
                    <text
                      x={cx} y={cy + NEURON_R + 12}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#92400e"
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      ∇{grad.toFixed(3)}
                    </text>
                  )}

                  {/* Sheaf: vertex vector space label */}
                  {mode === 'sheaf' && (
                    <text
                      x={cx} y={cy - NEURON_R - 6}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#6b7280"
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      F({l},{j})
                    </text>
                  )}

                  {/* Sheaf: target annotation on output */}
                  {isSheafOutput && (
                    <text
                      x={cx + NEURON_R + 6}
                      y={cy}
                      textAnchor="start"
                      fontSize="8"
                      fill="#6b7280"
                      fontFamily="monospace"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      →{(targets[j] ?? 0).toFixed(2)}
                    </text>
                  )}

                  {/* Inline input editing */}
                  {isEditingThisInput && (
                    <foreignObject
                      x={cx - NEURON_R + 2}
                      y={cy - 8}
                      width={(NEURON_R - 2) * 2}
                      height={16}
                    >
                      <input
                        autoFocus
                        value={inputEditBuffer}
                        onChange={e => setInputEditBuffer(e.target.value)}
                        onBlur={commitInputEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitInputEdit();
                          if (e.key === 'Escape') setEditingInput(null);
                        }}
                        style={{
                          width: '100%', fontSize: '8px', fontFamily: 'monospace',
                          background: 'white', border: '1px solid #6366f1',
                          borderRadius: '3px', padding: '1px 3px', outline: 'none',
                          boxSizing: 'border-box', textAlign: 'center',
                        }}
                      />
                    </foreignObject>
                  )}
                </g>
              );
            })
          )}

          {/* ── Weight heatmap badges (weights mode) ────────────────────── */}
          {mode === 'weights' && layers.slice(0, -1).map((inSize, l) => {
            const outSize = layers[l + 1];
            if (inSize > 6 || outSize > 6) return null; // skip large layers

            const cx1 = positions[l][0]?.cx ?? 0;
            const cx2 = positions[l + 1][0]?.cx ?? 0;
            const badgeX = (cx1 + cx2) / 2 - (inSize * 8) / 2;
            const badgeY = SVG_H - 38;
            const cellW = 8;
            const cellH = 8;

            return (
              <g key={`heatmap-${l}`}>
                <rect
                  x={badgeX - 2} y={badgeY - 14}
                  width={inSize * cellW + 4} height={outSize * cellH + 16}
                  rx={3} fill="white" stroke="#e5e7eb" strokeWidth={1} opacity={0.92}
                />
                <text
                  x={badgeX + (inSize * cellW) / 2}
                  y={badgeY - 4}
                  textAnchor="middle" fontSize="6.5" fill="#9ca3af" fontFamily="sans-serif"
                >
                  W{l}→{l + 1}
                </text>
                {Array.from({ length: outSize }, (_, j) =>
                  Array.from({ length: inSize }, (_, i) => {
                    const w = net.weights[l][j * inSize + i];
                    return (
                      <rect
                        key={`hm-${l}-${j}-${i}`}
                        x={badgeX + i * cellW}
                        y={badgeY + j * cellH}
                        width={cellW - 1} height={cellH - 1}
                        rx={1}
                        fill={weightColorInterp(w, maxAbsWeight)}
                      />
                    );
                  })
                )}
              </g>
            );
          })}

          {/* ── Sheaf: global section badge ─────────────────────────────── */}
          {mode === 'sheaf' && loss !== null && (
            <g>
              <rect
                x={8} y={SVG_H - 32} width={180} height={20}
                rx={5}
                fill={loss < 0.02 ? '#dcfce7' : loss < 0.1 ? '#fef9c3' : '#fee2e2'}
                stroke={loss < 0.02 ? '#22c55e' : loss < 0.1 ? '#ca8a04' : '#ef4444'}
                strokeWidth={1}
              />
              <text
                x={16} y={SVG_H - 18}
                fontSize="9" fontFamily="sans-serif" fontWeight="600"
                fill={loss < 0.02 ? '#166534' : loss < 0.1 ? '#92400e' : '#991b1b'}
              >
                {loss < 0.02 ? 'Section consistent ✓' : loss < 0.1 ? 'Near-section ≈' : 'Inconsistent section ✗'}
                {'  '}loss={loss.toFixed(4)}
              </text>
            </g>
          )}

          {/* ── Mode-specific annotations ───────────────────────────────── */}

          {/* Forward mode: animate button overlay */}
          {mode === 'forward' && (
            <g
              style={{ cursor: isAnimating ? 'default' : 'pointer' }}
              onClick={runForwardAnim}
            >
              <rect
                x={SVG_W / 2 - 38} y={SVG_H - 30} width={76} height={20}
                rx={10}
                fill={isAnimating ? '#e5e7eb' : '#1e40af'}
              />
              <text
                x={SVG_W / 2} y={SVG_H - 16}
                textAnchor="middle" fontSize="9.5" fontFamily="sans-serif" fontWeight="700"
                fill={isAnimating ? '#9ca3af' : 'white'}
                style={{ pointerEvents: 'none' }}
              >
                {isAnimating ? 'propagating…' : '▶ Forward pass'}
              </text>
            </g>
          )}

          {/* Gradient mode: animate button overlay */}
          {mode === 'gradient' && (
            <g
              style={{ cursor: isGradAnimating ? 'default' : 'pointer' }}
              onClick={runGradAnim}
            >
              <rect
                x={SVG_W / 2 - 44} y={SVG_H - 30} width={88} height={20}
                rx={10}
                fill={isGradAnimating ? '#e5e7eb' : '#92400e'}
              />
              <text
                x={SVG_W / 2} y={SVG_H - 16}
                textAnchor="middle" fontSize="9.5" fontFamily="sans-serif" fontWeight="700"
                fill={isGradAnimating ? '#9ca3af' : 'white'}
                style={{ pointerEvents: 'none' }}
              >
                {isGradAnimating ? 'backprop…' : '◀ Backprop'}
              </text>
            </g>
          )}

          {/* Weights mode: re-init button */}
          {mode === 'weights' && (
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setNet(xavierInit(layers))}
            >
              <rect
                x={SVG_W - 82} y={SVG_H - 30} width={74} height={20}
                rx={10} fill="#f3f4f6" stroke="#d1d5db" strokeWidth={1}
              />
              <text
                x={SVG_W - 45} y={SVG_H - 16}
                textAnchor="middle" fontSize="9" fontFamily="sans-serif" fontWeight="600"
                fill="#6b7280"
                style={{ pointerEvents: 'none' }}
              >
                ↺ Re-init
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── Bottom info bar ──────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 bg-gray-50/80 backdrop-blur px-4 py-2 font-sans flex items-center gap-4 flex-wrap text-[11px]">

        {/* Mode badge */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {mode}
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Architecture */}
        <span className="text-gray-500">
          arch: <span className="font-mono font-bold text-gray-700">{archStr}</span>
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Activation function */}
        <span className="text-gray-500">
          act: <span className="font-mono font-bold text-gray-700">{activationFn}</span>
        </span>

        <div className="w-px h-4 bg-gray-200" />

        {/* Total params */}
        <span className="text-gray-500">
          params: <span className="font-mono font-bold text-gray-700">{totalParams}</span>
        </span>

        {/* Loss readout */}
        {loss !== null && (mode === 'gradient' || mode === 'sheaf') && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              loss:{' '}
              <span className={`font-mono font-bold ${loss < 0.05 ? 'text-green-600' : loss < 0.2 ? 'text-amber-600' : 'text-red-500'}`}>
                {loss.toFixed(5)}
              </span>
            </span>
          </>
        )}

        {/* Forward mode: output readout */}
        {mode === 'forward' && outputLayer && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              output:{' '}
              <span className="font-mono font-bold text-blue-700">
                [{outputLayer.map(v => v.toFixed(3)).join(', ')}]
              </span>
            </span>
          </>
        )}

        {/* Editable hint */}
        {editable && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-400 text-[10px] italic">
              {mode === 'forward' ? 'click input neurons to edit' : mode === 'weights' ? 'click edge to edit weight' : ''}
            </span>
          </>
        )}

        {/* Gradient mode: max gradient */}
        {mode === 'gradient' && (
          <>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-gray-500">
              max ∇:{' '}
              <span className="font-mono font-bold text-amber-700">{maxGrad.toFixed(4)}</span>
            </span>
            {maxGrad < 0.001 && (
              <span className="text-[10px] text-red-400 font-semibold">vanishing gradient!</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

'use client';

/**
 * app/hill-climbing/page.tsx
 * ---------------------------
 * Página interactiva de demostración del algoritmo Hill Climbing.
 *
 * BUGS CORREGIDOS:
 *  #3 — runAlgorithm: resultRef se actualiza ANTES de llamar applyStep
 *  #4 — goPrev/goNext: eliminado doble setState; jumpToStep maneja todo
 *  #5 — Animación: animStepRef se resetea correctamente al ejecutar nuevo algoritmo
 *  #6 — isChosen: se lee del campo marcado en la fuente (hillClimbing.ts), no por valor
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import NavMenu from '@/components/NavMenu';
import {
  Position, CellType, MazeConfig, HCStep, HCResult, HCVariant,
  generateSuccessMaze, generateTrapMaze, mazeHeuristic, mazeValueToString,
  runMazeHC,
  nQueensHeuristic, nQueensValueToString,
  generateSuccessNQueens, generateTrapNQueens, runNQueensHC,
} from '@/lib/hillClimbing';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const MAZE_SIZE = 12;
const DEFAULT_N = 8;
const N_OPTIONS = [6, 8, 10, 12];

const VARIANTS: { id: HCVariant; label: string; desc: string }[] = [
  { id: 'simple',         label: 'Simple HC',       desc: 'Elige el primer vecino que mejore f(s)' },
  { id: 'steepest',       label: 'Steepest-Ascent',  desc: 'Elige el mejor vecino de todos' },
  { id: 'random-restart', label: 'Random-Restart',   desc: 'Reinicios aleatorios para escapar máximos locales' },
];

type Tab  = 'maze' | 'nqueens';
type Case = 'success' | 'trap';

// ─────────────────────────────────────────────
// HELPERS DE COLOR / TEXTO
// ─────────────────────────────────────────────

function getCellColor(cell: CellType, isAgent: boolean, isPath: boolean, isGoal: boolean, isTrapped: boolean): string {
  if (isAgent && isGoal)    return 'bg-emerald-400 ring-2 ring-emerald-300 shadow-md shadow-emerald-500/50';
  if (isAgent && isTrapped) return 'bg-rose-500 ring-2 ring-rose-400 animate-pulse';
  if (isAgent)              return 'bg-amber-400 ring-2 ring-amber-300 shadow-md shadow-amber-400/40';
  if (cell === 'goal')      return 'bg-emerald-500/90 shadow-sm shadow-emerald-500/30';
  if (cell === 'start')     return 'bg-indigo-500/70';
  if (cell === 'wall')      return 'bg-slate-600/90 shadow-inner';
  if (isPath)               return 'bg-indigo-900/60';
  return 'bg-slate-800/40 hover:bg-slate-800/70';
}

function getDeltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-rose-400';
  return 'text-amber-400';
}

function reasonLabel(reason: HCStep['reason']): string {
  switch (reason) {
    case 'mejora':         return '✅ Mejora';
    case 'maximo_local':   return '🚫 Máx. local';
    case 'meta_alcanzada': return '🎯 Meta';
    case 'meseta':         return '〰️ Meseta';
  }
}

function reasonBadge(reason: HCStep['reason']): string {
  switch (reason) {
    case 'mejora':         return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50';
    case 'maximo_local':   return 'bg-rose-900/50 text-rose-300 border-rose-700/50';
    case 'meta_alcanzada': return 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50';
    case 'meseta':         return 'bg-amber-900/50 text-amber-300 border-amber-700/50';
  }
}

function reasonDot(reason: HCStep['reason']): string {
  switch (reason) {
    case 'mejora':         return 'bg-emerald-400';
    case 'maximo_local':   return 'bg-rose-400';
    case 'meta_alcanzada': return 'bg-indigo-400';
    case 'meseta':         return 'bg-amber-400';
  }
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function HillClimbingPage() {

  // ── Tabs y configuración ─────────────────────
  const [activeTab,  setActiveTab]  = useState<Tab>('maze');
  const [activeCase, setActiveCase] = useState<Case>('success');
  const [variant,    setVariant]    = useState<HCVariant>('steepest');
  const [nValue,     setNValue]     = useState<number>(DEFAULT_N);

  // ── Estado visual del laberinto ──────────────
  const [mazeConfig, setMazeConfig] = useState<MazeConfig | null>(null);
  const [agentPos,   setAgentPos]   = useState<Position | null>(null);
  const [mazePath,   setMazePath]   = useState<Position[]>([]);

  // ── Estado visual N-Reinas ───────────────────
  const [queensState, setQueensState] = useState<number[]>([]);

  // ── Resultado y navegación ───────────────────
  const [result,        setResult]        = useState<HCResult | null>(null);
  const [inspectedStep, setInspectedStep] = useState<number>(-1);
  const [isPlaying,     setIsPlaying]     = useState<boolean>(false);
  const [animSpeed,     setAnimSpeed]     = useState<number>(450);

  // ── Refs anti-stale-closure ──────────────────
  const animRef       = useRef<NodeJS.Timeout | null>(null);
  const animStepRef   = useRef<number>(-1);
  const animSpeedRef  = useRef<number>(450);
  const resultRef     = useRef<HCResult | null>(null);
  const activeTabRef  = useRef<Tab>('maze');
  const stepListRef   = useRef<HTMLDivElement>(null);

  // Sincronizar refs
  useEffect(() => { animSpeedRef.current = animSpeed; }, [animSpeed]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ─────────────────────────────────────────────
  // INICIALIZAR PROBLEMA
  // ─────────────────────────────────────────────

  const initProblem = useCallback((tab: Tab, cas: Case, n: number) => {
    if (animRef.current) clearInterval(animRef.current);
    setIsPlaying(false);
    setResult(null);
    resultRef.current = null;
    setInspectedStep(-1);
    animStepRef.current = -1;

    if (tab === 'maze') {
      const config = cas === 'success'
        ? generateSuccessMaze(MAZE_SIZE)
        : generateTrapMaze(MAZE_SIZE);
      setMazeConfig(config);
      setAgentPos({ ...config.start });
      setMazePath([{ ...config.start }]);
    } else {
      const initialState = cas === 'success'
        ? generateSuccessNQueens(n)
        : generateTrapNQueens(n);
      setQueensState(initialState);
      setMazePath([]);
    }
  }, []);

  // Inicialización al montar (patrón intencional: genera el problema inicial una sola vez)
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { initProblem('maze', 'success', DEFAULT_N); }, []);
  useEffect(() => { return () => { if (animRef.current) clearInterval(animRef.current); }; }, []);

  // ─────────────────────────────────────────────
  // APLICAR PASO A LA VISUALIZACIÓN
  // ─────────────────────────────────────────────

  const applyStep = useCallback((res: HCResult, stepIndex: number) => {
    if (!res || stepIndex < 0 || stepIndex >= res.steps.length) return;
    const step = res.steps[stepIndex];

    if (activeTabRef.current === 'maze') {
      const pos = step.currentState as Position;
      setAgentPos({ ...pos });
      // Camino = todos los estados anteriores al paso actual
      const path = res.steps.slice(0, stepIndex + 1).map(s => s.currentState as Position);
      setMazePath(path);
    } else {
      setQueensState([...(step.currentState as number[])]);
    }
  }, []);

  // ─────────────────────────────────────────────
  // EJECUTAR ALGORITMO
  // ─────────────────────────────────────────────

  const runAlgorithm = useCallback(() => {
    // Limpiar animación anterior
    if (animRef.current) clearInterval(animRef.current);
    setIsPlaying(false);
    // FIX #5: resetear animStepRef ANTES de calcular
    animStepRef.current = -1;

    let res: HCResult;
    if (activeTab === 'maze' && mazeConfig) {
      res = runMazeHC(mazeConfig, variant, 200, 15);
    } else {
      const initState = activeCase === 'success'
        ? generateSuccessNQueens(nValue)
        : generateTrapNQueens(nValue);
      res = runNQueensHC(nValue, initState, variant, 100, 50);
    }

    // FIX #3: actualizar resultRef ANTES de llamar applyStep
    resultRef.current = res;
    setResult(res);

    // Resetear visualización al estado inicial
    if (activeTab === 'maze' && mazeConfig) {
      setAgentPos({ ...mazeConfig.start });
      setMazePath([{ ...mazeConfig.start }]);
    } else {
      const initState = activeCase === 'success'
        ? generateSuccessNQueens(nValue)
        : generateTrapNQueens(nValue);
      setQueensState(initState);
    }

    setInspectedStep(0);
    applyStep(res, 0);
  }, [activeTab, mazeConfig, variant, activeCase, nValue, applyStep]);

  // ─────────────────────────────────────────────
  // NAVEGACIÓN DE PASOS
  // ─────────────────────────────────────────────

  const jumpToStep = useCallback((idx: number) => {
    const res = resultRef.current;
    if (!res || idx < 0 || idx >= res.steps.length) return;
    setInspectedStep(idx);
    applyStep(res, idx);
    setTimeout(() => {
      stepListRef.current?.querySelector(`[data-step="${idx}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  }, [applyStep]);

  // FIX #4: goPrev y goNext leen de resultRef directamente, sin doble setState
  const goPrev = useCallback(() => {
    const res = resultRef.current;
    if (!res) return;
    setInspectedStep(prev => {
      const next = Math.max(0, prev - 1);
      applyStep(res, next);
      setTimeout(() => {
        stepListRef.current?.querySelector(`[data-step="${next}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
      return next;
    });
  }, [applyStep]);

  const goNext = useCallback(() => {
    const res = resultRef.current;
    if (!res) return;
    setInspectedStep(prev => {
      const next = Math.min(res.steps.length - 1, prev + 1);
      applyStep(res, next);
      setTimeout(() => {
        stepListRef.current?.querySelector(`[data-step="${next}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
      return next;
    });
  }, [applyStep]);

  // ─────────────────────────────────────────────
  // ANIMACIÓN
  // ─────────────────────────────────────────────

  const startAnimation = useCallback(() => {
    const res = resultRef.current;
    if (!res || res.steps.length === 0) return;

    // Si estamos al final, reiniciar al principio
    if (animStepRef.current >= res.steps.length - 1) {
      animStepRef.current = -1;
      setInspectedStep(-1);
    }

    setIsPlaying(true);
    animRef.current = setInterval(() => {
      const r = resultRef.current;
      if (!r) return;
      const next = animStepRef.current + 1;
      if (next >= r.steps.length) {
        clearInterval(animRef.current!);
        setIsPlaying(false);
        return;
      }
      animStepRef.current = next;
      setInspectedStep(next);
      applyStep(r, next);
      setTimeout(() => {
        stepListRef.current?.querySelector(`[data-step="${next}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    }, animSpeedRef.current);
  }, [applyStep]);

  const pauseAnimation = useCallback(() => {
    if (animRef.current) clearInterval(animRef.current);
    setIsPlaying(false);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animRef.current) clearInterval(animRef.current);
    setIsPlaying(false);
    animStepRef.current = -1;
    const res = resultRef.current;
    if (res && res.steps.length > 0) { setInspectedStep(0); applyStep(res, 0); }
  }, [applyStep]);

  // ─────────────────────────────────────────────
  // HANDLERS DE PESTAÑA / CASO / N
  // ─────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    activeTabRef.current = tab;
    initProblem(tab, activeCase, nValue);
  };
  const handleCaseChange = (cas: Case) => { setActiveCase(cas); initProblem(activeTab, cas, nValue); };
  const handleNChange    = (n: number)  => { setNValue(n);       initProblem(activeTab, activeCase, n); };

  // ─────────────────────────────────────────────
  // RENDER: LABERINTO
  // ─────────────────────────────────────────────

  const renderMaze = () => {
    if (!mazeConfig) return null;
    const { grid, goal } = mazeConfig;
    const size = grid.length;
    const pathSet = new Set(mazePath.map(p => `${p.row},${p.col}`));

    return (
      <div className="flex flex-col items-center gap-4">
        {/* Leyenda del laberinto */}
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap justify-center">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block"/><span>Agente</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"/><span>Meta</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-500 inline-block"/><span>Muro</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-800/50 inline-block"/><span>Camino</span></span>
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gap: '2px',
            maxWidth: '420px',
            width: '100%',
          }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const isAgent   = agentPos?.row === r && agentPos?.col === c;
              const isGoal    = goal.row === r && goal.col === c;
              const isTrapped = isAgent && !isGoal && result !== null && !result.success && inspectedStep === result.steps.length - 1;
              const isPath    = pathSet.has(`${r},${c}`) && !isAgent;
              const bg        = getCellColor(cell, isAgent, isPath, isGoal, isTrapped);

              return (
                <div
                  key={`${r}-${c}`}
                  className={`aspect-square rounded-sm ${bg} flex items-center justify-center transition-all duration-150`}
                  title={`(${r},${c}) f=${mazeHeuristic({row:r,col:c}, goal)}`}
                >
                  {isAgent && isGoal && <span className="text-[11px] leading-none select-none">🎉</span>}
                  {isAgent && isTrapped && <span className="text-[11px] leading-none select-none">⚠️</span>}
                  {isAgent && !isGoal && !isTrapped && <span className="text-[10px] leading-none select-none">🤖</span>}
                  {isGoal && !isAgent && <span className="text-[10px] leading-none select-none">🎯</span>}
                </div>
              );
            })
          )}
        </div>

        {/* Info posición */}
        {agentPos && (
          <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/50">
            Agente <span className="font-mono text-amber-300">({agentPos.row},{agentPos.col})</span>
            {' '}→{' '}f(s) =
            <span className="font-mono text-indigo-300 ml-1">{mazeHeuristic(agentPos, mazeConfig.goal)}</span>
            <span className="text-slate-500 ml-1">({mazeValueToString(mazeHeuristic(agentPos, mazeConfig.goal))})</span>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // RENDER: N-REINAS
  // ─────────────────────────────────────────────

  const renderNQueens = () => {
    const n = queensState.length;
    if (n === 0) return null;

    // Detectar reinas en conflicto
    const conflictRows = new Set<number>();
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (queensState[i] === queensState[j] ||
            Math.abs(queensState[i] - queensState[j]) === Math.abs(i - j)) {
          conflictRows.add(i);
          conflictRows.add(j);
        }
      }
    }
    const fValue = nQueensHeuristic(queensState);
    const conflicts = -fValue;

    return (
      <div className="flex flex-col items-center gap-4">
        {/* Leyenda */}
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap justify-center">
          <span className="flex items-center gap-1"><span className="text-emerald-300">♕</span><span>Sin conflicto</span></span>
          <span className="flex items-center gap-1"><span className="text-rose-300">♛</span><span>En conflicto</span></span>
        </div>

        {/* Tablero */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${n}, 1fr)`,
            maxWidth: '400px',
            width: '100%',
            border: '1px solid rgb(71 85 105 / 0.4)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: n }, (_, row) =>
            Array.from({ length: n }, (_, col) => {
              const hasQueen   = queensState[row] === col;
              const isConflict = hasQueen && conflictRows.has(row);
              const isDark     = (row + col) % 2 === 0;

              let bg = isDark ? 'bg-slate-700/80' : 'bg-slate-600/60';
              if (isConflict)      bg = isDark ? 'bg-rose-950/80' : 'bg-rose-900/60';
              else if (hasQueen)   bg = isDark ? 'bg-emerald-950/80' : 'bg-emerald-900/60';

              return (
                <div
                  key={`${row}-${col}`}
                  className={`aspect-square ${bg} flex items-center justify-center transition-colors duration-150`}
                >
                  {hasQueen && (
                    <span className={`select-none font-bold transition-colors ${
                      n <= 8 ? 'text-lg' : n <= 10 ? 'text-base' : 'text-sm'
                    } ${isConflict ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {isConflict ? '♛' : '♕'}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Estado */}
        <div className={`text-xs rounded-lg px-4 py-2 border text-center ${
          fValue === 0
            ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300'
            : 'bg-slate-800/60 border-slate-700/50 text-slate-300'
        }`}>
          f(s) = <span className="font-mono font-bold">{fValue}</span>
          {' '} — {' '}
          {conflicts === 0
            ? '✅ Solución perfecta'
            : `${conflicts} par${conflicts === 1 ? '' : 'es'} en conflicto`}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // RENDER: TELEMETRÍA
  // ─────────────────────────────────────────────

  const renderTelemetry = () => {
    if (!result || inspectedStep < 0 || inspectedStep >= result.steps.length) {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-600">
          <span className="text-3xl">📊</span>
          <p className="text-sm">Ejecuta el algoritmo para ver la telemetría.</p>
        </div>
      );
    }

    const step   = result.steps[inspectedStep];
    const isMaze = activeTab === 'maze';

    return (
      <div className="flex flex-col gap-3">

        {/* Cabecera: iteración + motivo */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">
              Iter. {step.iterationNumber}
            </span>
            {(step.restartNumber ?? 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/40">
                Reinicio #{step.restartNumber}
              </span>
            )}
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${reasonBadge(step.reason)}`}>
            {reasonLabel(step.reason)}
          </span>
        </div>

        {/* Estado actual */}
        <div className="bg-slate-800/70 rounded-lg p-3 text-xs border border-slate-700/40">
          <p className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Estado actual</p>
          {isMaze ? (
            <p className="font-mono text-amber-300 text-sm">
              ({(step.currentState as Position).row}, {(step.currentState as Position).col})
            </p>
          ) : (
            <p className="font-mono text-amber-300 break-all leading-relaxed">
              [{(step.currentState as number[]).join(', ')}]
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-slate-400">f(s) =</span>
            <span className="font-mono font-bold text-indigo-300">{step.currentValue}</span>
            <span className="text-slate-500">
              {isMaze ? mazeValueToString(step.currentValue) : nQueensValueToString(step.currentValue)}
            </span>
          </div>
        </div>

        {/* Vecino elegido */}
        {step.chosenNeighbor !== null && step.chosenValue !== null && (
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-3 text-xs">
            <p className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px] mb-1">Vecino elegido</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-emerald-300 font-bold">f = {step.chosenValue}</span>
              <span className={`font-mono font-bold ${getDeltaColor(step.chosenValue - step.currentValue)}`}>
                Δf = {step.chosenValue - step.currentValue >= 0 ? '+' : ''}{step.chosenValue - step.currentValue}
              </span>
            </div>
          </div>
        )}

        {/* Tabla de vecinos */}
        {step.neighbors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Vecinos evaluados
              </p>
              <span className="text-[10px] text-slate-600">
                {step.neighbors.length}{step.neighbors.length === 30 ? ' (máx 30)' : ''}
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-700/60 text-xs">
              <table className="w-full">
                <thead className="bg-slate-900 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 text-slate-500 font-semibold">Movimiento</th>
                    <th className="text-right px-2 py-1.5 text-slate-500 font-semibold">f</th>
                    <th className="text-right px-2 py-1.5 text-slate-500 font-semibold">Δf</th>
                  </tr>
                </thead>
                <tbody>
                  {step.neighbors.map((n, i) => (
                    <tr
                      key={i}
                      className={`border-t border-slate-800/60 ${
                        // FIX #6: usar campo isChosen del objeto, no comparar valores
                        n.isChosen
                          ? 'bg-emerald-950/40'
                          : i % 2 === 0 ? 'bg-slate-900/20' : ''
                      }`}
                    >
                      <td className="px-2 py-1 font-mono text-slate-300 flex items-center gap-1">
                        {n.isChosen && <span className="text-emerald-400 text-[10px]">★</span>}
                        {n.label}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-200">{n.value}</td>
                      <td className={`px-2 py-1 text-right font-mono font-bold ${getDeltaColor(n.delta)}`}>
                        {n.delta >= 0 ? '+' : ''}{n.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // RENDER: LISTA DE PASOS
  // ─────────────────────────────────────────────

  const renderStepList = () => {
    if (!result) return null;
    return (
      <div ref={stepListRef} className="flex flex-col gap-0.5 max-h-56 overflow-y-auto pr-0.5">
        {result.steps.map((step, idx) => {
          const isActive = idx === inspectedStep;
          return (
            <button
              key={idx}
              data-step={idx}
              onClick={() => jumpToStep(idx)}
              className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-indigo-600/80 text-white shadow-sm'
                  : idx < inspectedStep
                    ? 'bg-slate-800/50 text-slate-500 hover:bg-slate-800'
                    : 'bg-slate-800/20 text-slate-600 hover:bg-slate-800/50'
              }`}
            >
              {/* Indicador de color */}
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-white' : reasonDot(step.reason)}`}/>
              {/* Número */}
              <span className={`flex-shrink-0 ${isActive ? 'text-indigo-200' : 'text-slate-600'}`}>
                {String(idx + 1).padStart(3, ' ')}.
              </span>
              {/* Reinicio badge */}
              {(step.restartNumber ?? 0) > 0 && (
                <span className="text-[9px] px-1 rounded bg-amber-900/60 text-amber-400 flex-shrink-0">
                  R{step.restartNumber}
                </span>
              )}
              {/* Valor actual → elegido */}
              <span className="flex-1 truncate">
                f={step.currentValue}
                {step.chosenValue !== null && (
                  <span className={getDeltaColor(step.chosenValue - step.currentValue)}>
                    {' '}→{step.chosenValue}
                  </span>
                )}
              </span>
              {/* Razón abreviada */}
              <span className="flex-shrink-0 text-[9px]">
                {reasonLabel(step.reason).split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────

  const hasResult = result !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Nav ── */}
      <nav className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-13 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 text-lg">🧲</span>
            <span className="font-bold text-white text-sm">Hill Climbing Lab</span>
          </div>
          {/* Menú desplegable de navegación compartido */}
          <NavMenu />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-5">

        {/* ── Tabs de problema ── */}
        <div className="flex gap-1.5 p-1 bg-slate-900/60 rounded-xl border border-slate-800 w-fit">
          {(['maze', 'nqueens'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {tab === 'maze' ? '🗺️ Laberinto 2D' : '♛ N-Reinas'}
            </button>
          ))}
        </div>

        {/* ── Descripción + Controles (fila superior) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Descripción */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 leading-relaxed">
            {activeTab === 'maze' ? (
              <>
                <p className="text-white font-semibold mb-1">🗺️ Laberinto 2D</p>
                El agente 🤖 parte de <span className="font-mono text-amber-300">(0,0)</span> y busca la meta 🎯
                en <span className="font-mono text-emerald-300">(11,11)</span>. Heurística:{' '}
                <code className="text-indigo-300">f(s) = −Manhattan(s, meta)</code>.
                {' '}El agente elige siempre el vecino con <em>mayor f</em> (menos distancia).
                <br/><span className="text-rose-400">Caso B:</span> una barrera con embudo crea un máximo local ineludible.
              </>
            ) : (
              <>
                <p className="text-white font-semibold mb-1">♛ N-Reinas (N = {nValue})</p>
                Colocar {nValue} reinas en un tablero {nValue}×{nValue} sin que ningún par se ataque.
                Heurística: <code className="text-indigo-300">f(s) = −(pares en conflicto)</code>.
                Meta: <code className="text-emerald-300">f = 0</code>.
                <br/><span className="text-rose-400">Caso B:</span> estado inicial que lleva a máximo local inevitable.
              </>
            )}
          </div>

          {/* Controles de configuración */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">

            {/* Caso A / B */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Caso de prueba</p>
              <div className="flex gap-1.5">
                {(['success', 'trap'] as Case[]).map(cas => (
                  <button
                    key={cas}
                    onClick={() => handleCaseChange(cas)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeCase === cas
                        ? cas === 'success'
                          ? 'bg-emerald-700/80 text-white border border-emerald-600/50'
                          : 'bg-rose-700/80 text-white border border-rose-600/50'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
                    }`}
                  >
                    {cas === 'success' ? '✅ Caso A — Éxito' : '🚫 Caso B — Máx. local'}
                  </button>
                ))}
              </div>
            </div>

            {/* Variante */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Variante HC</p>
              <div className="flex gap-1.5 flex-wrap">
                {VARIANTS.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVariant(v.id)}
                    title={v.desc}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      variant === v.id
                        ? 'bg-indigo-600 text-white border border-indigo-500/50'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector N (solo N-Reinas) */}
            {activeTab === 'nqueens' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">N (tamaño tablero)</p>
                <div className="flex gap-1.5">
                  {N_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => handleNChange(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        nValue === n
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {n}×{n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Barra de acciones ── */}
        <div className="flex items-center gap-2 flex-wrap bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">

          <button
            onClick={runAlgorithm}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-indigo-900/40 hover:shadow-md"
          >
            ▶ Ejecutar HC
          </button>

          <button
            onClick={() => initProblem(activeTab, activeCase, nValue)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
          >
            🔄 Reiniciar
          </button>

          {/* Separador */}
          {hasResult && <div className="w-px h-6 bg-slate-700 mx-1"/>}

          {/* Controles de reproducción */}
          {hasResult && (
            <>
              <div className="flex gap-1">
                <button onClick={() => jumpToStep(0)}                      title="Al inicio"      className="px-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors">⏮</button>
                <button onClick={goPrev}                                   title="Paso anterior"  className="px-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors">◀</button>
                {isPlaying
                  ? <button onClick={pauseAnimation}  title="Pausar"    className="px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm transition-colors font-medium">⏸ Pausa</button>
                  : <button onClick={startAnimation}  title="Reproducir" className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm transition-colors font-medium">▶ Play</button>
                }
                <button onClick={goNext}                                   title="Paso siguiente" className="px-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors">▶</button>
                <button onClick={() => jumpToStep(result!.steps.length-1)} title="Al final"       className="px-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors">⏭</button>
                <button onClick={stopAnimation}                            title="Detener"        className="px-2 py-2 bg-rose-800 hover:bg-rose-700 text-white rounded-lg text-sm transition-colors">⏹</button>
              </div>

              {/* Velocidad */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                <span>🐢</span>
                <input
                  type="range" min={80} max={1200} step={50} value={animSpeed}
                  onChange={e => { const v = +e.target.value; setAnimSpeed(v); animSpeedRef.current = v; }}
                  className="w-20 accent-indigo-500"
                />
                <span>🐇</span>
                <span className="font-mono text-slate-400 w-12">{animSpeed}ms</span>
              </div>

              {/* Indicador de paso actual */}
              <div className="ml-auto text-xs text-slate-500 font-mono">
                {inspectedStep >= 0 ? `${inspectedStep + 1}/${result!.steps.length}` : '—'}
              </div>
            </>
          )}
        </div>

        {/* ── Layout principal ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Columna izquierda: visualización (3/5) */}
          <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {activeTab === 'maze' ? '🗺️ Laberinto' : '♛ Tablero N-Reinas'}
              </h2>
              {hasResult && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                  result!.success
                    ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40'
                    : 'bg-rose-900/40 text-rose-300 border-rose-700/40'
                }`}>
                  {result!.success ? '🎯 Éxito' : '🚫 Máximo local'}
                  {result!.totalRestarts > 0 && ` · ${result!.totalRestarts} reinicio${result!.totalRestarts>1?'s':''}`}
                </span>
              )}
            </div>
            {activeTab === 'maze' ? renderMaze() : renderNQueens()}
          </div>

          {/* Columna derecha: telemetría + pasos (2/5) */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Telemetría */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">📊 Telemetría</h2>
                {hasResult && inspectedStep >= 0 && (
                  <span className="text-[10px] font-mono text-indigo-400">
                    {inspectedStep + 1} / {result!.steps.length}
                  </span>
                )}
              </div>
              {renderTelemetry()}
            </div>

            {/* Lista de pasos */}
            {hasResult && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">📋 Iteraciones</h2>
                  <span className="text-[10px] text-slate-600">{result!.steps.length} pasos</span>
                </div>
                {renderStepList()}
              </div>
            )}

            {/* Banner de resultado final */}
            {hasResult && (
              <div className={`rounded-xl p-3 border text-xs ${
                result!.success
                  ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
              }`}>
                {result!.success ? (
                  <>🎯 <strong>¡Meta alcanzada!</strong> {result!.steps.length} iteraciones.
                    {result!.totalRestarts > 0 && ` (${result!.totalRestarts} reinicios)`}</>
                ) : (
                  <>🚫 <strong>Máximo local.</strong> El agente se detuvo sin alcanzar la meta.
                    {result!.totalRestarts === 0 && <> Prueba con <strong>Random-Restart</strong>.</>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Leyenda de conceptos ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          {[
            { color: 'bg-emerald-900/40 border-emerald-800/40 text-emerald-400', title: '✅ Mejora (Δf > 0)', body: 'El vecino mejora f. El agente avanza.' },
            { color: 'bg-rose-900/40 border-rose-800/40 text-rose-400',         title: '🚫 Máximo local',   body: 'Ningún vecino supera f actual. Estancado.' },
            { color: 'bg-amber-900/40 border-amber-800/40 text-amber-400',      title: '〰️ Meseta (Δf=0)', body: 'Vecinos con igual f. Sin progreso claro.' },
            { color: 'bg-indigo-900/40 border-indigo-800/40 text-indigo-400',   title: '🔄 Random-Restart', body: 'Reinicio aleatorio para escapar máximos locales.' },
          ].map(({ color, title, body }) => (
            <div key={title} className={`rounded-lg p-3 border ${color} bg-opacity-30`}>
              <p className="font-semibold mb-1">{title}</p>
              <p className="text-slate-400">{body}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}

'use client';

// ============================================================
// ARCHIVO: app/pathfinding/page.tsx
// PROPÓSITO: Sección "Ruta más rápida" — compara BFS, DFS, Dijkstra, A* y
//            Voraz sobre laberintos editables, mostrando las 5 FASES de cada
//            iteración, con control de velocidad y paso a paso.
//            Además usa la API de Gemini (/api/chat) para explicar pasos,
//            comparar algoritmos y hasta proponer una ruta que se valida aquí.
// La lógica de los algoritmos vive en lib/pathfinding.ts (sin React).
// ============================================================

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import NavMenu from '@/components/NavMenu';
import {
  ALGORITHMS, AlgoId, Maze, MazeKind, SearchResult, Phase,
  generateMaze, runSearch, compareAll, toIdx, FRONTIER, CLOSED,
} from '@/lib/pathfinding';

// ─────────────────────────────────────────────
// CONSTANTES DE LA INTERFAZ
// ─────────────────────────────────────────────

/** Las 5 fases de cada iteración de búsqueda */
const PHASES: { n: Phase; icon: string; name: string; what: string }[] = [
  { n: 1, icon: '🏁', name: 'Inicialización', what: 'Se crea la frontera con el nodo inicial (solo una vez al comienzo).' },
  { n: 2, icon: '🎯', name: 'Selección',      what: 'Se extrae de la frontera el siguiente nodo según el criterio del algoritmo.' },
  { n: 3, icon: '❓', name: 'Prueba de meta', what: 'Se pregunta: ¿este nodo es la meta? Si sí, termina; si no, continúa.' },
  { n: 4, icon: '🔍', name: 'Expansión',      what: 'Se generan los vecinos transitables y se calcula su costo g(n).' },
  { n: 5, icon: '🔄', name: 'Actualización',  what: 'Se guardan padres/costos, entran a la frontera y se cierra el nodo. Nueva iteración.' },
];

const KINDS: { id: MazeKind; label: string }[] = [
  { id: 'perfect', label: '🌀 Laberinto clásico' },
  { id: 'random',  label: '🧱 Obstáculos aleatorios' },
  { id: 'open',    label: '⬜ Terreno abierto' },
  { id: 'trap',    label: '🪤 Trampa en U' },
];

const TOOLS = [
  { id: 'wall',  label: '🧱 Muro' },
  { id: 'mud',   label: '🟫 Lodo (×5)' },
  { id: 'erase', label: '🧽 Borrar' },
  { id: 'start', label: '🚩 Inicio' },
  { id: 'goal',  label: '🏆 Meta' },
] as const;
type ToolId = (typeof TOOLS)[number]['id'];

type StepMode = 'fase' | 'iteracion';

/** Convierte el nivel de velocidad (1-40) a milisegundos entre pasos */
const levelToMs = (lvl: number) => Math.round(1500 / lvl);

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function PathfindingPage() {
  // ── Parámetros del generador de laberintos ──
  const [size, setSize] = useState(21);
  const [kind, setKind] = useState<MazeKind>('perfect');
  const [density, setDensity] = useState(0.28);
  const [mud, setMud] = useState(false);

  // ── Laberinto y búsqueda ──
  const [maze, setMaze] = useState<Maze | null>(null);
  const [algo, setAlgo] = useState<AlgoId>('astar');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [comparison, setComparison] = useState<Record<AlgoId, SearchResult> | null>(null);

  // ── Reproducción ──
  const [playing, setPlaying] = useState(false);
  const [speedLvl, setSpeedLvl] = useState(8);
  const [mode, setMode] = useState<StepMode>('fase');

  // ── Edición ──
  const [tool, setTool] = useState<ToolId>('wall');
  const paintingRef = useRef(false);

  // ── Gemini ──
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPath, setAiPath] = useState<number[] | null>(null);
  const [aiVerdict, setAiVerdict] = useState('');

  const stepListRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────
  // GENERAR / REINICIAR
  // ─────────────────────────────────────────────

  /** Limpia todo lo derivado de un laberinto anterior */
  const resetSearch = useCallback(() => {
    setResult(null); setStepIdx(0); setPlaying(false);
    setComparison(null); setAiPath(null); setAiVerdict('');
  }, []);

  /** Crea un laberinto nuevo con una semilla aleatoria */
  const regen = useCallback(() => {
    setMaze(generateMaze({ rows: size, cols: size, kind, density, mud }));
    resetSearch();
  }, [size, kind, density, mud, resetSearch]);

  // Se regenera al cambiar cualquier parámetro (y al montar)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { regen(); }, [regen]);

  // ─────────────────────────────────────────────
  // EJECUCIÓN DE LA BÚSQUEDA
  // ─────────────────────────────────────────────

  const run = useCallback((a: AlgoId = algo) => {
    if (!maze) return;
    setAlgo(a);
    setResult(runSearch(maze, a));
    setStepIdx(0);
    setPlaying(false);
  }, [maze, algo]);

  const lastIdx = result ? result.steps.length - 1 : 0;

  /** Siguiente / anterior índice según el modo (por fase o por iteración completa) */
  const nextIndex = useCallback((i: number) => {
    if (!result) return i;
    const last = result.steps.length - 1;
    if (mode === 'fase') return Math.min(i + 1, last);
    for (let j = i + 1; j <= last; j++) if (result.steps[j].phase === 5 || j === last) return j;
    return last;
  }, [result, mode]);

  const prevIndex = useCallback((i: number) => {
    if (!result) return i;
    if (mode === 'fase') return Math.max(i - 1, 0);
    for (let j = i - 1; j > 0; j--) if (result.steps[j].phase === 5) return j;
    return 0;
  }, [result, mode]);

  // Animación automática
  useEffect(() => {
    if (!playing || !result) return;
    const t = setInterval(() => setStepIdx(i => nextIndex(i)), levelToMs(speedLvl));
    return () => clearInterval(t);
  }, [playing, result, speedLvl, nextIndex]);

  // Detener la reproducción al llegar al final
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (playing && result && stepIdx >= result.steps.length - 1) setPlaying(false);
  }, [stepIdx, playing, result]);

  // Auto-scroll de la lista de iteraciones
  useEffect(() => {
    const it = result?.steps[stepIdx]?.iteration;
    stepListRef.current?.querySelector(`[data-iter="${it}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [stepIdx, result]);

  const togglePlay = () => {
    if (!result) { run(); setPlaying(true); return; }
    if (stepIdx >= lastIdx) setStepIdx(0);
    setPlaying(p => !p);
  };

  // ─────────────────────────────────────────────
  // EDICIÓN MANUAL DEL LABERINTO (clic y arrastre)
  // ─────────────────────────────────────────────

  const paintCell = (i: number) => {
    if (!maze) return;
    const cost = maze.cost.slice();
    let { start, goal } = maze;
    if (tool === 'start') { if (i !== goal) { cost[i] = cost[i] === 0 ? 1 : cost[i]; start = i; } }
    else if (tool === 'goal') { if (i !== start) { cost[i] = cost[i] === 0 ? 1 : cost[i]; goal = i; } }
    else if (i !== start && i !== goal) cost[i] = tool === 'wall' ? 0 : tool === 'mud' ? 5 : 1;
    else return;
    setMaze({ ...maze, cost, start, goal });
    resetSearch();
  };

  useEffect(() => {
    const up = () => { paintingRef.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // ─────────────────────────────────────────────
  // GEMINI (reutiliza el endpoint /api/chat)
  // ─────────────────────────────────────────────

  const askGemini = async (prompt: string): Promise<string> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        config: {
          modelName: 'gemini-3.8-flash',
          systemInstruction:
            'Eres un tutor de Inteligencia Artificial. Responde en español, claro y breve, ' +
            'con ejemplos concretos sobre algoritmos de búsqueda de rutas.',
          temperature: 0.4, maxOutputTokens: 1500, topP: 0.95, topK: 40,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al consultar Gemini');
    return data.text as string;
  };

  /** Envuelve una consulta con estado de carga y manejo de errores */
  const withAi = async (fn: () => Promise<void>) => {
    setAiLoading(true); setAiText('');
    try { await fn(); }
    catch (e) { setAiText('⚠️ ' + (e instanceof Error ? e.message : 'Error desconocido')); }
    finally { setAiLoading(false); }
  };

  /** 1) Explica con palabras sencillas el paso que se está viendo */
  const aiExplainStep = () => withAi(async () => {
    if (!result) throw new Error('Primero ejecuta un algoritmo.');
    const s = result.steps[stepIdx];
    const ph = PHASES.find(p => p.n === s.phase)!;
    setAiText(await askGemini(
      `Estoy viendo el algoritmo ${ALGORITHMS[algo].name} en un laberinto. ` +
      `Estoy en la iteración ${s.iteration}, fase ${s.phase} (${ph.name}). ` +
      `El sistema muestra: "${s.message}". Frontera=${s.frontierSize}, nodos cerrados=${s.closedCount}. ` +
      `Explícame qué está pasando y por qué, en 4-5 líneas, como a un estudiante.`,
    ));
  });

  /** 2) Compara los 5 algoritmos con datos reales de este laberinto */
  const aiCompare = () => withAi(async () => {
    if (!maze) return;
    const cmp = comparison ?? compareAll(maze);
    setComparison(cmp);
    const rows = (Object.keys(cmp) as AlgoId[]).map(k => {
      const r = cmp[k];
      return `- ${ALGORITHMS[k].name}: ${r.found ? `costo=${r.pathCost}, casillas=${r.pathLength}` : 'sin ruta'}, ` +
        `nodos expandidos=${r.nodesExpanded}, frontera máx=${r.maxFrontier}`;
    }).join('\n');
    setAiText(await askGemini(
      `Laberinto ${maze.rows}x${maze.cols}${mud ? ' con terrenos de lodo (costo 5)' : ''}. Resultados reales:\n${rows}\n\n` +
      `Analiza: ¿cuál es mejor aquí y por qué? ¿Cuáles no son óptimos y por qué? ` +
      `¿Qué tan útil fue la heurística de A*? Máximo 10 líneas.`,
    ));
  });

  /** 3) Le pide a Gemini que proponga la ruta y la VALIDA contra el laberinto */
  const aiSolve = () => withAi(async () => {
    if (!maze) return;
    const { rows, cols, cost, start, goal } = maze;
    let ascii = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = toIdx(r, c, cols);
        ascii += i === start ? 'S' : i === goal ? 'G' : cost[i] === 0 ? '#' : cost[i] > 1 ? '~' : '.';
      }
      ascii += '\n';
    }
    const text = await askGemini(
      `Laberinto ${rows}x${cols}. Coordenadas [fila, columna] con origen (0,0) arriba a la izquierda.\n` +
      `# = muro, . = costo 1, ~ = lodo (costo 5), S = inicio, G = meta.\n\n${ascii}\n` +
      `Encuentra la ruta de MENOR COSTO de S a G moviéndote solo arriba/abajo/izquierda/derecha sin cruzar #. ` +
      `Responde ÚNICAMENTE con un arreglo JSON de pares [fila,columna] que incluya S y G, sin explicación.`,
    );
    // Extrae el arreglo JSON de la respuesta
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { setAiPath(null); setAiVerdict('❌ Gemini no devolvió un arreglo JSON válido.'); setAiText(text); return; }
    let pts: number[][];
    try { pts = JSON.parse(m[0]); } catch { setAiVerdict('❌ El JSON de Gemini no se pudo interpretar.'); setAiText(text); return; }

    // Validación estricta de la ruta propuesta
    const idxs = pts.map(p => toIdx(p[0], p[1], cols));
    let verdict = '';
    let total = 0;
    if (pts.some(p => !Array.isArray(p) || p.length !== 2 || p[0] < 0 || p[0] >= rows || p[1] < 0 || p[1] >= cols)) verdict = 'hay coordenadas fuera del mapa';
    else if (idxs[0] !== start) verdict = 'no empieza en S';
    else if (idxs[idxs.length - 1] !== goal) verdict = 'no termina en G';
    else {
      for (let k = 1; k < pts.length && !verdict; k++) {
        const d = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
        if (d !== 1) verdict = `salto no permitido entre [${pts[k - 1]}] y [${pts[k]}]`;
        else if (cost[idxs[k]] === 0) verdict = `cruza un muro en [${pts[k]}]`;
        else total += cost[idxs[k]];
      }
    }
    const best = runSearch(maze, 'dijkstra');
    if (verdict) {
      setAiPath(null);
      setAiVerdict(`❌ Ruta inválida: ${verdict}. (El óptimo real cuesta ${best.pathCost}.)`);
    } else {
      setAiPath(idxs);
      setAiVerdict(total === best.pathCost
        ? `✅ ¡Ruta válida y ÓPTIMA! Costo ${total} (igual que Dijkstra).`
        : `⚠️ Ruta válida pero no óptima: costo ${total} vs óptimo ${best.pathCost}.`);
    }
    setAiText('Respuesta cruda de Gemini:\n' + text);
  });

  // ─────────────────────────────────────────────
  // DATOS DERIVADOS PARA RENDERIZAR
  // ─────────────────────────────────────────────

  const step = result ? result.steps[stepIdx] : null;

  /** Conjunto de celdas de la ruta final (solo se muestra en el último paso si hubo ruta) */
  const pathSet = useMemo(
    () => new Set(result && result.found && stepIdx === lastIdx ? result.path : []),
    [result, stepIdx, lastIdx],
  );
  const aiPathSet = useMemo(() => new Set(aiPath ?? []), [aiPath]);

  /** Decisión de cada vecino evaluado (para dibujar anillos de color en fases 4 y 5) */
  const neighborMap = useMemo(() => {
    const m = new Map<number, string>();
    if (step && (step.phase === 4 || step.phase === 5)) step.neighbors.forEach(n => m.set(n.idx, n.decision));
    return m;
  }, [step]);

  /** Índice del primer paso de cada iteración (para la lista) */
  const iterations = useMemo(() => {
    if (!result) return [] as { iter: number; first: number; cur: number }[];
    const out: { iter: number; first: number; cur: number }[] = [];
    result.steps.forEach((s, i) => { if (s.phase === 2 && s.current !== null) out.push({ iter: s.iteration, first: i, cur: s.current }); });
    return out;
  }, [result]);

  const fmt = (i: number | null) => (i === null || !maze ? '—' : `(${Math.floor(i / maze.cols)},${i % maze.cols})`);

  /** Clases de color de una celda */
  const cellClass = (i: number): string => {
    if (!maze) return '';
    const c = maze.cost[i];
    if (step && step.current === i) return 'bg-amber-400 ring-2 ring-amber-200 z-10 scale-110';
    if (pathSet.has(i)) return 'bg-yellow-300';
    if (aiPathSet.has(i)) return 'bg-fuchsia-500';
    if (i === maze.start) return 'bg-indigo-500';
    if (i === maze.goal) return 'bg-emerald-500';
    if (c === 0) return 'bg-slate-600';
    const s = step ? step.state[i] : 0;
    if (s === FRONTIER) return 'bg-cyan-400/80';
    if (s === CLOSED) return c > 1 ? 'bg-violet-700/80' : 'bg-violet-900/80';
    return c > 1 ? 'bg-amber-800/70' : 'bg-slate-800/50';
  };

  const ringClass = (i: number): string => {
    const d = neighborMap.get(i);
    if (!d) return '';
    return d === 'nuevo' || d === 'mejora' ? 'ring-2 ring-emerald-400' : 'ring-2 ring-rose-500/80';
  };

  const bestCost = comparison
    ? Math.min(...(Object.values(comparison).filter(r => r.found).map(r => r.pathCost)), Infinity)
    : Infinity;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Barra superior con menú desplegable ── */}
      <nav className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧭</span>
            <div>
              <h1 className="font-bold text-sm leading-tight">Ruta más rápida</h1>
              <p className="text-[10px] text-slate-400 leading-tight">BFS · DFS · Dijkstra · A* · Voraz</p>
            </div>
          </div>
          <NavMenu />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-5">

        {/* ═════════ 1. GENERADOR DE LABERINTOS ═════════ */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Tipo de laberinto</p>
            <select
              value={kind}
              onChange={e => setKind(e.target.value as MazeKind)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Tamaño: <span className="text-indigo-300 font-mono">{maze?.rows ?? size}×{maze?.cols ?? size}</span>
            </p>
            <input type="range" min={11} max={41} step={2} value={size}
              onChange={e => setSize(+e.target.value)} className="w-full accent-indigo-500" />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Densidad de muros: <span className="text-indigo-300 font-mono">{Math.round(density * 100)}%</span>
            </p>
            <input type="range" min={0.05} max={0.45} step={0.01} value={density}
              disabled={kind !== 'random'}
              onChange={e => setDensity(+e.target.value)}
              className="w-full accent-indigo-500 disabled:opacity-30" />
          </div>

          <div className="flex flex-col gap-2 justify-end">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={mud} onChange={e => setMud(e.target.checked)} className="accent-amber-500 w-4 h-4" />
              🟫 Terrenos de lodo (costo ×5)
            </label>
            <button onClick={regen}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors">
              🎲 Nuevo laberinto
            </button>
          </div>
        </section>

        {/* ═════════ 2. ALGORITMO + CONTROLES DE REPRODUCCIÓN ═════════ */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
          {/* Selector de método */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Método</span>
            {(Object.keys(ALGORITHMS) as AlgoId[]).map(k => (
              <button key={k}
                onClick={() => { setAlgo(k); if (result) run(k); }}
                title={ALGORITHMS[k].desc}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  algo === k ? 'bg-indigo-600 border-indigo-400/50 text-white' : 'bg-slate-800 border-transparent text-slate-300 hover:bg-slate-700'
                }`}>
                {ALGORITHMS[k].short}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            <span className="text-slate-300 font-semibold">{ALGORITHMS[algo].name}:</span> {ALGORITHMS[algo].desc}{' '}
            <span className="text-indigo-300">Estructura: {ALGORITHMS[algo].structure}.</span>{' '}
            <span className="text-emerald-300">{ALGORITHMS[algo].optimal}.</span>
          </p>

          {/* Controles */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => run()} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold">
              🔎 Buscar ruta
            </button>
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <button disabled={!result} onClick={() => { setPlaying(false); setStepIdx(0); }} title="Al inicio"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-sm">⏮</button>
            <button disabled={!result} onClick={() => { setPlaying(false); setStepIdx(prevIndex(stepIdx)); }} title="Paso atrás"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-sm">◀</button>
            <button onClick={togglePlay}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${playing ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
              {playing ? '⏸ Pausa' : '▶ Reproducir'}
            </button>
            <button disabled={!result} onClick={() => { setPlaying(false); setStepIdx(nextIndex(stepIdx)); }} title="Paso adelante"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-sm">▶</button>
            <button disabled={!result} onClick={() => { setPlaying(false); setStepIdx(lastIdx); }} title="Al final"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-sm">⏭</button>

            <div className="w-px h-6 bg-slate-700 mx-1" />

            {/* Granularidad del paso */}
            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
              {(['fase', 'iteracion'] as StepMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-2 ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  {m === 'fase' ? 'Por fase' : 'Por iteración'}
                </button>
              ))}
            </div>

            {/* Velocidad */}
            <div className="flex items-center gap-2 text-xs text-slate-400 ml-1">
              <span>🐢</span>
              <input type="range" min={1} max={40} value={speedLvl}
                onChange={e => setSpeedLvl(+e.target.value)} className="w-28 accent-indigo-500" />
              <span>🐇</span>
              <span className="font-mono text-slate-300 w-20">x{speedLvl} · {levelToMs(speedLvl)}ms</span>
            </div>

            {result && (
              <span className="ml-auto text-xs font-mono text-slate-400">
                paso {stepIdx + 1}/{result.steps.length}
              </span>
            )}
          </div>

          {/* Barra de progreso (se puede arrastrar) */}
          {result && (
            <input type="range" min={0} max={lastIdx} value={stepIdx}
              onChange={e => { setPlaying(false); setStepIdx(+e.target.value); }}
              className="w-full accent-indigo-500" />
          )}
        </section>

        {/* ═════════ 3. LAS 5 FASES ═════════ */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              🔁 Las 5 fases de búsqueda
            </h2>
            <span className="text-[11px] text-slate-500">
              1 se hace una vez · luego se repite el ciclo <span className="text-indigo-300 font-semibold">2 → 3 → 4 → 5 ↺</span> en cada iteración
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {PHASES.map(p => {
              const active = step?.phase === p.n;
              return (
                <button key={p.n}
                  onClick={() => {
                    if (!result || !step) return;
                    // Salta a esa fase dentro de la iteración actual
                    const j = result.steps.findIndex(s => s.iteration === step.iteration && s.phase === p.n);
                    if (j >= 0) { setPlaying(false); setStepIdx(j); }
                  }}
                  className={`text-left rounded-lg p-3 border transition-all ${
                    active
                      ? 'bg-indigo-600/25 border-indigo-400 shadow-lg shadow-indigo-900/40'
                      : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${active ? 'bg-indigo-500' : 'bg-slate-700'}`}>{p.n}</span>
                    <span className="text-sm font-semibold">{p.icon} {p.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{p.what}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ═════════ 4. LABERINTO + PANEL DE DETALLE ═════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* ── Laberinto ── */}
          <section className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            {/* Herramientas de edición */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Editar</span>
              {TOOLS.map(t => (
                <button key={t.id} onClick={() => setTool(t.id)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    tool === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}>{t.label}</button>
              ))}
              <span className="text-[10px] text-slate-600 ml-1">clic o arrastra sobre el mapa</span>
              {maze && <span className="ml-auto text-[10px] text-slate-600 font-mono">semilla {maze.seed}</span>}
            </div>

            {/* Cuadrícula */}
            {maze && (
              <div
                className="mx-auto w-full select-none touch-none"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${maze.cols}, minmax(0, 1fr))`,
                  gap: maze.cols > 31 ? '1px' : '2px',
                  maxWidth: '680px',
                }}
              >
                {maze.cost.map((c, i) => (
                  <div
                    key={i}
                    onPointerDown={() => { paintingRef.current = true; paintCell(i); }}
                    onPointerEnter={() => { if (paintingRef.current) paintCell(i); }}
                    className={`aspect-square rounded-[2px] flex items-center justify-center text-[8px] font-bold leading-none cursor-crosshair transition-colors duration-75 ${cellClass(i)} ${ringClass(i)}`}
                  >
                    {i === maze.start ? 'S' : i === maze.goal ? 'G' : c > 1 ? <span className="opacity-60">~</span> : ''}
                  </div>
                ))}
              </div>
            )}

            {/* Leyenda */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 justify-center">
              {[
                ['bg-amber-400', 'Nodo actual'], ['bg-cyan-400/80', 'Frontera (abierta)'],
                ['bg-violet-900', 'Cerrado (expandido)'], ['bg-yellow-300', 'Ruta final'],
                ['bg-amber-800', 'Lodo ×5'], ['bg-fuchsia-500', 'Ruta de Gemini'],
              ].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm ${c}`} />{l}</span>
              ))}
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm ring-2 ring-emerald-400" />vecino aceptado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm ring-2 ring-rose-500" />vecino descartado</span>
            </div>
          </section>

          {/* ── Panel derecho ── */}
          <section className="lg:col-span-2 flex flex-col gap-4">

            {/* Paso actual */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">📊 Paso actual</h2>
              {!step ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Elige un método y pulsa <b className="text-emerald-400">Buscar ruta</b> para ver cada fase.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      Iteración {step.iteration || '—'} ·{' '}
                      <span className="text-indigo-300">Fase {step.phase}: {PHASES[step.phase - 1].name}</span>
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 leading-relaxed">
                    {step.message}
                  </p>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Frontera', step.frontierSize, 'text-cyan-300'],
                      ['Cerrados', step.closedCount, 'text-violet-300'],
                      ['g(n)', step.g === undefined || !isFinite(step.g) ? '—' : step.g, 'text-amber-300'],
                      ['h(n)', step.h ?? '—', 'text-emerald-300'],
                    ].map(([l, v, c]) => (
                      <div key={String(l)} className="bg-slate-800/60 rounded-lg py-2">
                        <p className={`font-mono font-bold text-sm ${c}`}>{v}</p>
                        <p className="text-[10px] text-slate-500">{l}</p>
                      </div>
                    ))}
                  </div>
                  {step.f !== undefined && isFinite(step.f) && (algo === 'astar') && (
                    <p className="text-xs text-slate-400 text-center">
                      f(n) = g + h = <span className="font-mono text-amber-300">{step.g} + {step.h} = {step.f}</span>
                    </p>
                  )}

                  {/* Próximos en salir de la frontera */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Próximos en salir de la frontera ({ALGORITHMS[algo].structure})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {step.frontierPreview.length === 0 && <span className="text-xs text-slate-600">vacía</span>}
                      {step.frontierPreview.map((p, k) => (
                        <span key={p} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                          k === 0 ? 'bg-cyan-900/40 border-cyan-500/40 text-cyan-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                          {fmt(p)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Vecinos evaluados (fases 4-5) */}
                  {step.neighbors.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Vecinos evaluados</p>
                      <div className="rounded-lg border border-slate-700/60 overflow-hidden text-xs">
                        <table className="w-full">
                          <thead className="bg-slate-900 text-slate-500">
                            <tr>
                              <th className="text-left px-2 py-1">Celda</th>
                              <th className="text-right px-2 py-1">g</th>
                              <th className="text-right px-2 py-1">h</th>
                              <th className="text-right px-2 py-1">Decisión</th>
                            </tr>
                          </thead>
                          <tbody>
                            {step.neighbors.map(n => (
                              <tr key={n.idx} className="border-t border-slate-800">
                                <td className="px-2 py-1 font-mono text-slate-300">{fmt(n.idx)}</td>
                                <td className="px-2 py-1 text-right font-mono">{n.g}</td>
                                <td className="px-2 py-1 text-right font-mono">{n.h}</td>
                                <td className={`px-2 py-1 text-right font-medium ${
                                  n.decision === 'nuevo' || n.decision === 'mejora' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {{ nuevo: 'nuevo ✔', mejora: 'mejora ✔', sin_mejora: 'sin mejora', cerrado: 'cerrado', ya_visto: 'ya visto' }[n.decision]}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Resultado final */}
            {result && (
              <div className={`rounded-xl p-4 border text-sm ${
                result.found ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200' : 'bg-rose-950/40 border-rose-800/50 text-rose-200'}`}>
                {result.found ? (
                  <>
                    🏆 <b>Ruta encontrada</b> — {result.pathLength} casillas · costo <b>{result.pathCost}</b><br />
                    <span className="text-xs opacity-80">
                      {result.nodesExpanded} nodos expandidos · {result.iterations} iteraciones · frontera máx {result.maxFrontier}
                    </span>
                  </>
                ) : <>🚫 <b>No existe ruta</b> entre S y G (se exploraron {result.nodesExpanded} nodos).</>}
              </div>
            )}

            {/* Lista de iteraciones */}
            {result && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">📋 Iteraciones ({iterations.length})</h2>
                <div ref={stepListRef} className="max-h-60 overflow-y-auto flex flex-col gap-0.5 pr-1">
                  {iterations.map(it => {
                    const active = step?.iteration === it.iter;
                    return (
                      <div key={it.iter} data-iter={it.iter}
                        className={`rounded-md px-2 py-1 text-[11px] font-mono ${active ? 'bg-indigo-600/30 border border-indigo-500/40' : 'bg-slate-800/30 hover:bg-slate-800/60'}`}>
                        <button onClick={() => { setPlaying(false); setStepIdx(it.first); }} className="w-full text-left flex justify-between">
                          <span>#{it.iter} · {fmt(it.cur)}</span>
                          <span className="text-slate-500">g={result.steps[it.first].g}</span>
                        </button>
                        {active && (
                          <div className="flex gap-1 mt-1">
                            {[2, 3, 4, 5].map(ph => {
                              const j = result.steps.findIndex(s => s.iteration === it.iter && s.phase === ph);
                              if (j < 0) return null;
                              return (
                                <button key={ph} onClick={() => { setPlaying(false); setStepIdx(j); }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${step?.phase === ph ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                  F{ph}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ═════════ 5. COMPARACIÓN DE LOS 5 MÉTODOS ═════════ */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">📊 Comparación en este laberinto</h2>
            <button onClick={() => maze && setComparison(compareAll(maze))}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium">
              Comparar los 5 métodos
            </button>
          </div>
          {!comparison ? (
            <p className="text-xs text-slate-500">Pulsa “Comparar” para ejecutar los 5 algoritmos sobre el mismo mapa.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1.5 pr-3">Método</th><th className="pr-3">Costo</th><th className="pr-3">Casillas</th>
                    <th className="pr-3">Nodos expandidos</th><th className="pr-3">Iteraciones</th>
                    <th className="pr-3">Frontera máx.</th><th className="pr-3">¿Óptimo?</th><th />
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(comparison) as AlgoId[]).map(k => {
                    const r = comparison[k];
                    const opt = r.found && r.pathCost === bestCost;
                    return (
                      <tr key={k} className="border-t border-slate-800">
                        <td className="py-1.5 pr-3 font-semibold">{ALGORITHMS[k].short}</td>
                        <td className="pr-3 font-mono">{r.found ? r.pathCost : '—'}</td>
                        <td className="pr-3 font-mono">{r.found ? r.pathLength : '—'}</td>
                        <td className="pr-3 font-mono">{r.nodesExpanded}</td>
                        <td className="pr-3 font-mono">{r.iterations}</td>
                        <td className="pr-3 font-mono">{r.maxFrontier}</td>
                        <td className={`pr-3 font-semibold ${opt ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {!r.found ? 'sin ruta' : opt ? '✔ óptimo' : '✘ no'}
                        </td>
                        <td><button onClick={() => run(k)} className="text-indigo-300 hover:text-indigo-200 underline">ver</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ═════════ 6. GEMINI ═════════ */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">🤖 Gemini AI (API del proyecto)</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={aiExplainStep} disabled={aiLoading || !result}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-xs font-medium">
              💡 Explicar el paso actual
            </button>
            <button onClick={aiCompare} disabled={aiLoading}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-xs font-medium">
              ⚖️ Analizar y comparar métodos
            </button>
            <button onClick={aiSolve} disabled={aiLoading}
              className="px-3 py-2 bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-40 rounded-lg text-xs font-medium">
              🧠 Pedirle a Gemini la ruta más rápida
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            La última opción envía el mapa a Gemini, recibe una ruta en JSON y la <b>valida aquí</b> (muros, saltos, costo)
            contra el resultado óptimo de Dijkstra. Úsala en mapas pequeños (≤ 21×21) para mejores resultados.
          </p>
          {aiLoading && <p className="text-sm text-indigo-300 animate-pulse">Consultando a Gemini…</p>}
          {aiVerdict && (
            <p className={`text-sm rounded-lg px-3 py-2 border ${
              aiVerdict.startsWith('✅') ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200'
              : aiVerdict.startsWith('⚠️') ? 'bg-amber-950/40 border-amber-800/50 text-amber-200'
              : 'bg-rose-950/40 border-rose-800/50 text-rose-200'}`}>
              {aiVerdict}
            </p>
          )}
          {aiText && (
            <div className="whitespace-pre-wrap text-sm text-slate-200 bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 max-h-72 overflow-y-auto leading-relaxed">
              {aiText}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

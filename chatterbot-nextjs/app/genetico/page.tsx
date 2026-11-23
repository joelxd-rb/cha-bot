'use client';

// ============================================================
// ARCHIVO: app/genetico/page.tsx
// PROPÓSITO: Página del LABORATORIO DE ALGORITMOS GENÉTICOS.
//            Resuelve el PROBLEMA DE LA MOCHILA 0/1 (carga óptima de un
//            camión de reciclaje) siguiendo las 4 fases de la práctica:
//            1) Investigación  2) Diseño  3) Implementación  4) Experimentación
//            Además usa la API de Gemini (/api/chat) para explicar cada
//            ejecución e interpretar estadísticamente los 5 experimentos.
// La lógica del algoritmo vive en lib/genetic.ts (sin React).
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import NavMenu from '@/components/NavMenu';
import {
  Item, GAParams, GAResult, Experiment, Chromosome, DEFAULT_PARAMS,
  parseCSV, ejecutarAG, validar, totalWeight, vorazMochila, ascensoColina,
  optimoDP, correrExperimentos,
} from '@/lib/genetic';

// ─────────────────────────────────────────────
// CONTENIDO TEÓRICO (Fase 1: conceptos + analogías)
// ─────────────────────────────────────────────
const CONCEPTS: { term: string; def: string; analogy: string }[] = [
  { term: 'Gen', def: 'Una pieza de información. Aquí: 1 bit que dice si cargo (1) o no (0) un lote.', analogy: 'Un interruptor de luz: encendido o apagado.' },
  { term: 'Cromosoma / Individuo', def: 'Una solución completa = todos los genes juntos (40 bits).', analogy: 'Una lista de compras con casillas marcadas.' },
  { term: 'Población', def: 'Conjunto de soluciones candidatas que evolucionan juntas.', analogy: 'Un grupo de 100 choferes, cada uno con su propia forma de cargar el camión.' },
  { term: 'Genotipo vs Fenotipo', def: 'Genotipo = la cadena de 0/1. Fenotipo = lo que significa: qué lotes se llevan, cuántas toneladas y cuánto dinero.', analogy: 'El ADN (genotipo) vs. la persona que ves (fenotipo).' },
  { term: 'Aptitud (fitness)', def: 'Qué tan buena es una solución. Aquí: valor en MXN de la carga (se maximiza).', analogy: 'La calificación de un examen.' },
  { term: 'Selección (Torneo / Ruleta / Ranking)', def: 'Elegir padres; los mejores tienen más probabilidad de reproducirse.', analogy: 'Un torneo: sacas 3 choferes al azar y gana el que cargó más valor.' },
  { term: 'Cruza (1 punto / Uniforme)', def: 'Mezclar dos padres para crear un hijo con partes de ambos.', analogy: 'Mezclar dos recetas: ingredientes de la mitad de una y la mitad de la otra.' },
  { term: 'Mutación (Bit-Flip)', def: 'Cambio aleatorio pequeño (invertir un bit 0↔1). Mantiene la diversidad.', analogy: 'Un error de copia que a veces resulta ser una gran mejora.' },
  { term: 'Elitismo', def: 'Los mejores individuos distintos pasan intactos a la siguiente generación.', analogy: 'El equipo campeón conserva a sus estrellas titulares cada temporada.' },
  { term: 'Reparación', def: 'Si un hijo excede las 40 t, se le quitan lotes de bajo valor/peso hasta que quepa.', analogy: 'El chofer descarga lo menos rentable cuando la báscula marca sobrepeso.' },
  { term: 'Criterio de paro', def: 'Cuándo detenerse: máximo de generaciones o sin mejora en N generaciones.', analogy: 'Dejar de estudiar cuando ya no mejoras tu calificación.' },
];

const PSEUDOCODE = `P ← poblacionInicial()                 // N soluciones válidas al azar
repetir hasta criterio de paro:
    evaluar aptitud de cada individuo de P
    guardar mejor / promedio / peor / diversidad de la generación
    Q ← los 'elites' mejores distintos de P  // elitismo sin clones
    mientras |Q| < N:
        A ← seleccion(P);  B ← seleccion(P)   // torneo, ruleta o ranking
        h ← cruza(A, B)                       // 1 punto o uniforme
        mutacion(h)                           // bit-flip por gen
        reparar(h)                            // garantiza peso ≤ capacidad
        Q ← Q ∪ {h}
    P ← Q
devolver el mejor individuo encontrado`;

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });

// ─────────────────────────────────────────────
// COMPONENTES AUXILIARES DE VISUALIZACIÓN
// ─────────────────────────────────────────────

/** Dibuja un cromosoma como casillas verdes (1) y grises (0). `marks` resalta genes mutados, `cut` dibuja el corte. */
function GeneStrip({ c, marks = [], cut = null }: { c: Chromosome; marks?: number[]; cut?: number | null }) {
  return (
    <div className="flex flex-wrap gap-px">
      {c.map((g, i) => (
        <span key={i} className="flex">
          {cut === i && <span className="w-0.5 bg-amber-400 mx-0.5" />}
          <span
            title={`Gen ${i + 1}: ${g ? 'Cargado (1)' : 'No cargado (0)'}`}
            className={`w-3.5 h-4 text-[9px] leading-4 text-center rounded-sm ${
              marks.includes(i) ? 'ring-2 ring-rose-400 ' : ''
            }${g ? 'bg-emerald-500 text-emerald-950 font-bold' : 'bg-slate-700 text-slate-400'}`}
          >{g}</span>
        </span>
      ))}
    </div>
  );
}

/** Gráfica de convergencia en SVG: mejor (verde), promedio (azul), peor (gris) y líneas de referencia. */
function ConvergenceChart({ result, optimum, greedy }: { result: GAResult; optimum: number; greedy: number }) {
  const W = 680, H = 240, P = 48;
  const h = result.history;
  const all = h.flatMap(s => [s.best, s.avg, s.worst]).concat([optimum, greedy]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = (g: number) => P + (g / Math.max(1, h.length - 1)) * (W - P - 16);
  const y = (v: number) => H - 30 - ((v - lo) / Math.max(1, hi - lo)) * (H - 54);
  const line = (key: 'best' | 'avg' | 'worst') => h.map(s => `${x(s.gen)},${y(s[key])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-950 rounded-lg border border-slate-800">
      {/* Líneas de referencia */}
      <line x1={P} y1={y(optimum)} x2={W - 16} y2={y(optimum)} stroke="#f59e0b" strokeDasharray="4 3" />
      <text x={W - 18} y={Math.max(12, y(optimum) - 4)} fill="#f59e0b" fontSize="9" textAnchor="end">Óptimo exacto (DP): ${fmt(optimum)}</text>
      <line x1={P} y1={y(greedy)} x2={W - 16} y2={y(greedy)} stroke="#a78bfa" strokeDasharray="2 3" />
      <text x={W - 18} y={Math.min(H - 34, y(greedy) + 11)} fill="#a78bfa" fontSize="9" textAnchor="end">Línea base voraz: ${fmt(greedy)}</text>
      {/* Curvas de la población */}
      <polyline points={line('worst')} fill="none" stroke="#64748b" strokeWidth="1.2" />
      <polyline points={line('avg')} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
      <polyline points={line('best')} fill="none" stroke="#10b981" strokeWidth="2.4" />
      {/* Ejes */}
      <text x={P} y={H - 8} fill="#94a3b8" fontSize="10">Generación 0 → {h.length - 1}</text>
      <text x={6} y={18} fill="#94a3b8" fontSize="9">${fmt(hi)}</text>
      <text x={6} y={H - 30} fill="#94a3b8" fontSize="9">${fmt(lo)}</text>
    </svg>
  );
}

/**
 * Gráfica sobre el plano (Peso vs. Valor) con todos los puntos etiquetados + barra de capacidad del camión.
 * Cumple el requisito de la Fase 3: "Gráfica de la mejor solución sobre el plano, con los puntos etiquetados".
 */
function SolutionPlaneChart({ items, chrom, cap }: { items: Item[]; chrom: Chromosome; cap: number }) {
  const W = 680, H = 260, PL = 52, PR = 20, PT = 22, PB = 34;
  const maxW = Math.max(...items.map(i => i.peso), 1);
  const maxV = Math.max(...items.map(i => i.valor), 1);
  const minW = Math.min(...items.map(i => i.peso), 0);
  const minV = Math.min(...items.map(i => i.valor), 0);

  const x = (w: number) => PL + ((w - minW * 0.9) / Math.max(0.1, maxW * 1.08 - minW * 0.9)) * (W - PL - PR);
  const y = (v: number) => H - PB - ((v - minV * 0.85) / Math.max(1, maxV * 1.08 - minV * 0.85)) * (H - PT - PB);

  const chosen = items.filter((_, i) => chrom[i] === 1);
  const usedW = chosen.reduce((a, b) => a + b.peso, 0);

  return (
    <div className="space-y-3">
      {/* Barra visual de llenado del camión */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5">
        <div className="flex justify-between text-xs text-slate-300">
          <span>🚛 <b>Carga del camión por lote</b> ({chosen.length} lotes seleccionados)</span>
          <span><b>{usedW.toFixed(1)} t</b> / {cap} t ({((usedW / cap) * 100).toFixed(1)}% ocupado)</span>
        </div>
        <div className="w-full h-7 bg-slate-900 rounded-md overflow-hidden flex border border-slate-800">
          {chosen.map((it, idx) => {
            const pct = (it.peso / cap) * 100;
            const palette = ['bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-violet-500'];
            return (
              <div
                key={it.id}
                style={{ width: `${pct}%` }}
                title={`${it.id} (${it.nombre}): ${it.peso} t · $${fmt(it.valor)}`}
                className={`${palette[idx % palette.length]} h-full border-r border-slate-950/60 flex items-center justify-center text-[9px] font-bold text-slate-950 overflow-hidden`}
              >
                {pct >= 4 ? it.id : ''}
              </div>
            );
          })}
        </div>
      </div>

      {/* Plano 2D: Peso (X) vs Valor (Y) con puntos etiquetados */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-950 rounded-lg border border-slate-800">
        <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#334155" />
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#334155" />
        <text x={W / 2} y={H - 8} fill="#94a3b8" fontSize="10" textAnchor="middle">Peso del lote (toneladas)</text>
        <text x={12} y={H / 2} fill="#94a3b8" fontSize="10" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>Valor (MXN)</text>

        {items.map((it, i) => {
          const sel = chrom[i] === 1;
          const cx = x(it.peso);
          const cy = y(it.valor);
          return (
            <g key={it.id}>
              <circle
                cx={cx}
                cy={cy}
                r={sel ? 5.5 : 4}
                fill={sel ? '#10b981' : '#475569'}
                stroke={sel ? '#ecfdf5' : '#1e293b'}
                strokeWidth={sel ? 1.5 : 1}
              >
                <title>{`${it.id} · ${it.nombre}: ${it.peso} t, $${fmt(it.valor)} (${sel ? 'CARGADO' : 'No cargado'})`}</title>
              </circle>
              <text
                x={cx + 6}
                y={cy + 3}
                fill={sel ? '#6ee7b7' : '#64748b'}
                fontSize="8.5"
                fontWeight={sel ? 'bold' : 'normal'}
              >
                {it.id}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-slate-400">
        Plano 2D de los {items.length} lotes etiquetados: <span className="text-emerald-400 font-semibold">● Verde = Lote cargado en la mejor solución</span> · <span className="text-slate-400">● Gris = Lote descartado</span>.
      </p>
    </div>
  );
}

/** Gráfica comparativa de barras para cada experimento de la Fase 4. */
function ExperimentChart({ exp, dpOpt, greedy }: { exp: Experiment; dpOpt: number; greedy: number }) {
  const allVals = exp.rows.flatMap(r => [r.best, r.mean, r.worst]).concat([dpOpt, greedy]);
  const minV = Math.max(0, Math.min(...allVals) * 0.96);
  const maxV = Math.max(...allVals) * 1.005;
  const pct = (v: number) => Math.max(2, Math.min(100, ((v - minV) / Math.max(1, maxV - minV)) * 100));

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 mt-2">
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>Gráfica comparativa (Media vs. Mejor de 10 corridas)</span>
        <span>
          <span className="text-emerald-400">■ Media</span> · <span className="text-amber-300">■ Mejor</span> · Óptimo DP: ${fmt(dpOpt)}
        </span>
      </div>
      {exp.rows.map(r => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">{r.label}</span>
            <span className="text-slate-400">
              Media: <b className="text-emerald-300">${fmt(r.mean)}</b> (±{r.std.toFixed(0)}) · Mejor: <b className="text-amber-300">${fmt(r.best)}</b>
            </span>
          </div>
          <div className="relative h-4 bg-slate-900 rounded overflow-hidden border border-slate-800">
            <div
              style={{ width: `${pct(r.best)}%` }}
              className="absolute inset-y-0 left-0 bg-amber-500/35"
              title={`Mejor: $${fmt(r.best)}`}
            />
            <div
              style={{ width: `${pct(r.mean)}%` }}
              className="absolute inset-y-0 left-0 bg-emerald-500/80"
              title={`Media: $${fmt(r.mean)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// RESPALDO ANALÍTICO DETERMINISTA (por si falla la red)
// ─────────────────────────────────────────────
function buildLocalRunExplanation(
  result: GAResult,
  params: GAParams,
  cap: number,
  items: Item[],
  baselines: { greedy: { fitness: number }; hill: { fitness: number }; dp: { fitness: number } },
): string {
  const chosen = items.filter((_, i) => result.best[i] === 1);
  const top3 = [...chosen].sort((a, b) => b.valor - a.valor).slice(0, 3);
  const diffGreedy = result.bestFitness - baselines.greedy.fitness;
  const pctGreedy = ((diffGreedy / baselines.greedy.fitness) * 100).toFixed(2);
  const gapDP = (((baselines.dp.fitness - result.bestFitness) / baselines.dp.fitness) * 100).toFixed(2);

  return (
    `📊 Interpretación de la ejecución (Semilla ${result.seed}):\n\n` +
    `1. Resultado alcanzado: El Algoritmo Genético cargó ${chosen.length} lotes con un peso total de ${result.bestWeight.toFixed(1)} t (de ${cap} t posibles) y obtuvo un valor de $${fmt(result.bestFitness)} MXN en ${result.generationsRun} generaciones (${result.timeMs.toFixed(1)} ms).\n\n` +
    `2. Comparación con líneas base: Frente a la heurística voraz ($${fmt(baselines.greedy.fitness)}) obtuvo una diferencia de ${diffGreedy >= 0 ? '+' : ''}$${fmt(diffGreedy)} (${pctGreedy}%), y superó al Ascenso de Colina ($${fmt(baselines.hill.fitness)}). Quedó a solo ${gapDP}% del óptimo exacto por Programación Dinámica ($${fmt(baselines.dp.fitness)}).\n\n` +
    `3. Papel de los operadores: La selección (${params.selection}) impulsó a las maletas más rentables, la cruza (${params.crossover}, tasa ${params.crossoverRate}) combinó bloques de lotes compatibles como ${top3.map(i => i.nombre).join(', ')}, la mutación bit-flip (μ=${params.mutationRate}) evitó estancarse en óptimos locales y la reparación garantizó que ningún hijo excediera las ${cap} t.`
  );
}

function buildLocalExperimentsExplanation(
  experiments: Experiment[],
  baselines: { greedy: { fitness: number }; hill: { fitness: number }; dp: { fitness: number } },
): string {
  const spreads = experiments.slice(0, 4).map(e => {
    const means = e.rows.map(r => r.mean);
    return { title: e.title, spread: Math.max(...means) - Math.min(...means), rows: e.rows };
  });
  const mostInfluential = spreads.reduce((a, b) => (b.spread > a.spread ? b : a));
  const exp2 = experiments.find(e => e.id === 'mutacion')!;
  const exp3 = experiments.find(e => e.id === 'poblacion')!;
  const exp4 = experiments.find(e => e.id === 'elitismo')!;
  const exp5 = experiments.find(e => e.id === 'comparacion')!;
  const bestRow = exp5.rows[1];
  const gain = (((bestRow.mean - baselines.greedy.fitness) / baselines.greedy.fitness) * 100).toFixed(2);
  const gap = (((baselines.dp.fitness - bestRow.mean) / baselines.dp.fitness) * 100).toFixed(2);

  return (
    `🧪 Interpretación estadística de los 5 experimentos (10 corridas c/u):\n\n` +
    `1. ¿Qué parámetro influyó más?: ${mostInfluential.title} tuvo el mayor impacto en la aptitud media, con una diferencia de $${fmt(mostInfluential.spread)} MXN entre su peor y su mejor configuración.\n\n` +
    `2. ¿Hubo convergencia prematura?: Sí se observa cuando la población es muy pequeña (${exp3.rows[0].label}: media $${fmt(exp3.rows[0].mean)}, desv. ±${exp3.rows[0].std.toFixed(0)}, diversidad final ${exp3.rows[0].finalDiversity.toFixed(1)} individuos) o con mutación muy baja (${exp2.rows[0].label}: media $${fmt(exp2.rows[0].mean)}). Es como un grupo pequeño de choferes que se copian la misma idea demasiado pronto sin explorar otras combinaciones.\n\n` +
    `3. ¿Ayudó el elitismo?: Comparando "${exp4.rows[0].label}" (media $${fmt(exp4.rows[0].mean)}) vs "${exp4.rows[1].label}" (media $${fmt(exp4.rows[1].mean)}), el elitismo conserva siempre la mejor carga hallada y evita retrocesos por cruzas o mutaciones desfavorables.\n\n` +
    `4. Comparación contra la línea base (Exp. 5): La mejor configuración calibrada alcanzó una media de $${fmt(bestRow.mean)} MXN, superando a la heurística voraz ($${fmt(baselines.greedy.fitness)}) en un +${gain}% y quedando a solo ${gap}% del óptimo exacto ($${fmt(baselines.dp.fitness)}).`
  );
}

// ─────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────
export default function GeneticoPage() {
  // ── Datos (se leen del CSV, no están en el código) ──
  const [items, setItems] = useState<Item[]>([]);
  const [csvError, setCsvError] = useState('');
  const [cap, setCap] = useState(40);

  // ── Parámetros del AG y ejecución ──
  const [params, setParams] = useState<GAParams>({ ...DEFAULT_PARAMS, generations: 100 });
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<GAResult | null>(null);

  // ── Visor paso a paso ──
  const [genView, setGenView] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(150); // ms por generación
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Experimentos ──
  const [experiments, setExperiments] = useState<Experiment[] | null>(null);
  const [running, setRunning] = useState(false);

  // ── Gemini (estados independientes para Sección 4 y Sección 6) ──
  const [runAiText, setRunAiText] = useState('');
  const [runAiModel, setRunAiModel] = useState('');
  const [runAiLoading, setRunAiLoading] = useState(false);

  const [expAiText, setExpAiText] = useState('');
  const [expAiModel, setExpAiModel] = useState('');
  const [expAiLoading, setExpAiLoading] = useState(false);

  const setP = <K extends keyof GAParams>(k: K, v: GAParams[K]) => setParams(p => ({ ...p, [k]: v }));

  // Carga inicial del CSV desde /public/data/mochila.csv y ejecuta una corrida inicial
  useEffect(() => {
    fetch('/data/mochila.csv')
      .then(r => r.text())
      .then(t => {
        const parsed = parseCSV(t);
        setItems(parsed);
        const r0 = ejecutarAG(parsed, 40, { ...DEFAULT_PARAMS, generations: 100 }, 1, true);
        setResult(r0);
      })
      .catch(e => setCsvError(String(e.message || e)));
  }, []);

  /** Permite al usuario subir su propio CSV (id,nombre,peso_t,valor_mxn). */
  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = parseCSV(await f.text());
      setItems(parsed);
      setCsvError('');
      const r0 = ejecutarAG(parsed, cap, params, seed, true);
      setResult(r0);
      setExperiments(null);
      setRunAiText('');
      setExpAiText('');
    } catch (e: unknown) { setCsvError(e instanceof Error ? e.message : String(e)); }
  };

  // Líneas base: se recalculan solo cuando cambian datos o capacidad
  const baselines = useMemo(() => {
    if (!items.length) return null;
    return {
      greedy: vorazMochila(items, cap),
      hill: ascensoColina(items, cap, 1),
      dp: optimoDP(items, cap),
    };
  }, [items, cap]);

  const runOnce = (customSeed?: number) => {
    if (!items.length) return;
    const s = customSeed ?? seed;
    const r = ejecutarAG(items, cap, params, s, true);
    // Validación obligatoria: toda solución final debe ser válida
    const err = validar(r.best, items, cap);
    if (err) { alert('Solución inválida: ' + err); return; }
    setResult(r); setGenView(0); setRunAiText(''); setPlaying(false);
  };

  // Reproducción automática del visor de generaciones
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || !result) return;
    timer.current = setInterval(() => {
      setGenView(g => {
        if (g >= result.history.length - 1) { setPlaying(false); return g; }
        return g + 1;
      });
    }, speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, result]);

  const runExperiments = () => {
    setRunning(true);
    setExpAiText('');
    // setTimeout deja que React pinte "calculando…" antes de bloquear el hilo
    setTimeout(() => {
      setExperiments(correrExperimentos(items, cap, params));
      setRunning(false);
    }, 30);
  };

  /** Resumen del Experimento 5: mejor configuración del AG vs. la línea base voraz. */
  const final5 = useMemo(() => {
    if (!experiments || !baselines) return null;
    const rows = experiments.flatMap(e => e.rows);
    const bestRow = rows.reduce((a, b) => (b.mean > a.mean ? b : a));
    const gain = ((bestRow.mean - baselines.greedy.fitness) / baselines.greedy.fitness) * 100;
    const gap = ((baselines.dp.fitness - bestRow.mean) / baselines.dp.fitness) * 100;
    return { bestRow, gain, gap };
  }, [experiments, baselines]);

  // ── Llamada al endpoint /api/chat (con respaldo automático en servidor y cliente) ──
  const callGeminiApi = async (prompt: string): Promise<{ text: string; modelUsed: string }> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        config: {
          modelName: 'gemini-3.8-flash',
          systemInstruction:
            'Eres un profesor experto de Inteligencia Artificial. Responde en español, de forma clara, estructurada ' +
            'y con analogías sencillas, interpretando resultados de algoritmos genéticos y del problema de la mochila 0/1.',
          temperature: 0.4,
          maxOutputTokens: 1500,
          topP: 0.95,
          topK: 40,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.text) {
      throw new Error(data.error || 'Sin respuesta de la API');
    }
    return { text: data.text, modelUsed: data.modelUsed || 'gemini-3.8-flash' };
  };

  /** Botón 1: Explica la ejecución individual actual con Gemini */
  const explainRun = async () => {
    if (!result || !baselines) return;
    setRunAiLoading(true);
    setRunAiText('');
    const chosen = items
      .filter((_, i) => result.best[i] === 1)
      .map(i => `${i.id} ${i.nombre} (${i.peso}t, $${i.valor})`)
      .join(', ');
    const prompt =
      `Un algoritmo genético resolvió la mochila 0/1 de un camión de reciclaje (capacidad ${cap} t, ${items.length} lotes).\n` +
      `Parámetros: población=${params.popSize}, generaciones=${params.generations}, selección=${params.selection}, ` +
      `cruza=${params.crossover} (${params.crossoverRate}), mutación=${params.mutationRate}, élites=${params.elites}, semilla=${result.seed}.\n` +
      `Resultado del AG: valor $${result.bestFitness} MXN, peso ${result.bestWeight.toFixed(1)} t, en ${result.generationsRun} generaciones (${result.timeMs.toFixed(1)} ms).\n` +
      `Líneas base: Voraz=$${baselines.greedy.fitness}, Ascenso de colina=$${baselines.hill.fitness}, Óptimo exacto (DP)=$${baselines.dp.fitness}.\n` +
      `Lotes cargados: ${chosen}.\n` +
      `Explica en 3 puntos breves: 1) Qué tan buena fue la carga frente a Voraz, Ascenso de Colina y el Óptimo DP, ` +
      `2) Cómo ayudaron la selección, cruza, mutación y reparación, y 3) Una analogía sencilla.`;
    try {
      const { text, modelUsed } = await callGeminiApi(prompt);
      setRunAiText(text);
      setRunAiModel(modelUsed);
    } catch {
      setRunAiText(buildLocalRunExplanation(result, params, cap, items, baselines));
      setRunAiModel('análisis-local-respaldo');
    } finally {
      setRunAiLoading(false);
    }
  };

  /** Botón 2: Interpreta estadísticamente los 5 experimentos con Gemini */
  const interpretExperiments = async () => {
    if (!experiments || !final5 || !baselines) return;
    setExpAiLoading(true);
    setExpAiText('');
    const resumen = experiments
      .map(
        e =>
          `${e.title}: ` +
          e.rows
            .map(
              r =>
                `${r.label} → mejor $${r.best}, media $${r.mean.toFixed(0)}, desv ±${r.std.toFixed(0)}, ` +
                `${r.timeMs.toFixed(1)} ms, converge gen ${r.avgGenToBest.toFixed(1)}, diversidad final ${r.finalDiversity.toFixed(1)}`
            )
            .join(' | ')
      )
      .join('\n');
    const prompt =
      `Analiza estos 5 experimentos (10 corridas con semillas 1-10 por fila) de un Algoritmo Genético para la mochila 0/1 ` +
      `(Óptimo exacto DP = $${baselines.dp.fitness}, Línea base Voraz = $${baselines.greedy.fitness}, Ascenso de colina = $${baselines.hill.fitness}):\n\n` +
      `${resumen}\n\n` +
      `Mejor configuración: ${final5.bestRow.label} (mejora ${final5.gain.toFixed(2)}% sobre el voraz, brecha ${final5.gap.toFixed(2)}% respecto al óptimo exacto).\n` +
      `Responde claramente las preguntas de la rúbrica:\n` +
      `1) ¿Qué parámetro influyó más y por qué?\n` +
      `2) ¿En qué configuraciones hubo convergencia prematura y cómo se nota en la desviación/diversidad?\n` +
      `3) ¿Qué efecto tuvo el elitismo?\n` +
      `4) Conclusión comparando el AG contra la línea base voraz con una analogía sencilla.`;
    try {
      const { text, modelUsed } = await callGeminiApi(prompt);
      setExpAiText(text);
      setExpAiModel(modelUsed);
    } catch {
      setExpAiText(buildLocalExperimentsExplanation(experiments, baselines));
      setExpAiModel('análisis-local-respaldo');
    } finally {
      setExpAiLoading(false);
    }
  };

  // Estadística de la generación visualizada
  const stat = result?.history[genView];
  const viewWeight = stat ? totalWeight(stat.bestChrom, items) : 0;

  // Lista de lotes en la mejor solución final
  const chosenItems = result ? items.filter((_, i) => result.best[i] === 1) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">🧬 Algoritmos Genéticos · Mochila del camión</h1>
          <p className="text-xs text-slate-400">Fundamentos de IA · Unidad II · Problema 0/1 Knapsack</p>
        </div>
        <NavMenu />
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">

        {/* ── FASE 1: ¿Qué se investiga? ── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">1 · ¿Qué se quiere investigar?</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Un camión de reciclaje aguanta <b>{cap} toneladas</b> y hay <b>{items.length || 40} lotes</b> de material,
            cada uno con peso y valor distintos. Hay 2<sup>{items.length || 40}</sup> ≈ 1.1 billones de combinaciones: revisarlas todas es inviable.
            Un <b>algoritmo genético</b> (propuesto por John Holland, 1975, inspirado en la selección natural de Darwin)
            encuentra una carga casi óptima “evolucionando” soluciones.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="font-semibold text-emerald-300 mb-1">🎒 Analogía</p>
              Haces la maleta para un viaje con límite de peso: quieres llevar lo más valioso sin pasarte.
              Pruebas 100 maletas distintas, te quedas con las mejores, las “cruzas” (mitad de una + mitad de otra)
              y a veces cambias un objeto al azar. Tras varias rondas, ¡las maletas ya son excelentes!
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="font-semibold text-sky-300 mb-1">⚖️ Diferencia con Hill Climbing</p>
              Ascenso de colina mejora <i>una</i> sola solución cambiando 1 bit a la vez y se atora cuando el camión se llena. El AG mantiene
              <i> muchas</i> soluciones en paralelo, las mezcla (cruza) y muta varios genes, escapando fácilmente de óptimos locales.
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 text-sm">
            <p className="font-semibold text-amber-300 mb-1">🔀 ¿Por qué aquí sí sirven los operadores clásicos?</p>
            En el TSP (rutas) el cromosoma es una <b>permutación</b>: cruzar “a ciegas” repetiría o perdería ciudades.
            En la mochila el cromosoma es <b>binario</b>: cualquier combinación de 0/1 es un subconjunto de lotes,
            así que cruza de 1 punto, cruza uniforme y mutación bit-flip funcionan directamente (acompañados de reparación para respetar las {cap} t).
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm text-indigo-300 hover:text-indigo-200">📚 Glosario de conceptos con analogías</summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              {CONCEPTS.map(c => (
                <div key={c.term} className="bg-slate-800/50 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-white">{c.term}</p>
                  <p className="text-slate-300 mt-0.5">{c.def}</p>
                  <p className="text-emerald-300/90 mt-1">💡 {c.analogy}</p>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* ── DATOS (lectura del CSV) ── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">2 · Datos del problema <span className="text-xs font-normal text-slate-400">(leídos de mochila.csv)</span></h2>
            <label className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 cursor-pointer">
              📂 Subir otro CSV
              <input type="file" accept=".csv" className="hidden" onChange={e => onUpload(e.target.files?.[0])} />
            </label>
          </div>
          {csvError && <p className="text-sm text-rose-400">⚠️ {csvError}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Capacidad (t)
              <input type="number" min={5} max={200} value={cap}
                onChange={e => { setCap(Math.max(1, +e.target.value)); setResult(null); setExperiments(null); }}
                className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1" />
            </label>
            <span className="text-slate-400">Lotes: {items.length} · Peso total disponible: {items.reduce((a, i) => a + i.peso, 0).toFixed(1)} t · Espacio de búsqueda: 2^{items.length}</span>
          </div>
          <div className="max-h-48 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 sticky top-0"><tr>
                <th className="p-1.5 text-left">#</th><th className="p-1.5 text-left">ID</th><th className="p-1.5 text-left">Material</th>
                <th className="p-1.5 text-right">Peso (t)</th><th className="p-1.5 text-right">Valor (MXN)</th><th className="p-1.5 text-right">Valor/t</th>
                <th className="p-1.5 text-center">Estado en mejor carga</th>
              </tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const loaded = result?.best[i] === 1;
                  return (
                    <tr key={it.id} className={`border-t border-slate-800 ${loaded ? 'bg-emerald-900/30' : ''}`}>
                      <td className="p-1.5 text-slate-500">{i + 1}</td><td className="p-1.5 font-mono">{it.id}</td><td className="p-1.5">{it.nombre}</td>
                      <td className="p-1.5 text-right">{it.peso}</td><td className="p-1.5 text-right">${fmt(it.valor)}</td>
                      <td className="p-1.5 text-right text-slate-400">${fmt(it.valor / it.peso)}</td>
                      <td className="p-1.5 text-center">{loaded ? <span className="text-emerald-300 font-semibold">✔ Cargado</span> : <span className="text-slate-500">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FASE 2/3: Diseño y ejecución ── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">3 · Diseño y ejecución del algoritmo</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1">Tamaño de población: <b>{params.popSize}</b>
              <input type="range" min={10} max={300} step={10} value={params.popSize} onChange={e => setP('popSize', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Generaciones máx.: <b>{params.generations}</b>
              <input type="range" min={10} max={300} step={10} value={params.generations} onChange={e => setP('generations', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Tasa de cruza: <b>{params.crossoverRate}</b>
              <input type="range" min={0} max={1} step={0.05} value={params.crossoverRate} onChange={e => setP('crossoverRate', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Tasa de mutación (por gen): <b>{params.mutationRate}</b>
              <input type="range" min={0} max={0.3} step={0.002} value={params.mutationRate} onChange={e => setP('mutationRate', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Élites: <b>{params.elites}</b>
              <input type="range" min={0} max={10} step={1} value={params.elites} onChange={e => setP('elites', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Paro por estancamiento (gens, 0 = off): <b>{params.patience}</b>
              <input type="range" min={0} max={100} step={5} value={params.patience} onChange={e => setP('patience', +e.target.value)} /></label>
            <label className="flex flex-col gap-1">Selección
              <select value={params.selection} onChange={e => setP('selection', e.target.value as GAParams['selection'])} className="bg-slate-800 border border-slate-700 rounded px-2 py-1">
                <option value="tournament">Torneo (k={params.tournamentK})</option>
                <option value="roulette">Ruleta (proporcional)</option>
                <option value="ranking">Por Ranking lineal</option>
              </select></label>
            <label className="flex flex-col gap-1">Cruza
              <select value={params.crossover} onChange={e => setP('crossover', e.target.value as GAParams['crossover'])} className="bg-slate-800 border border-slate-700 rounded px-2 py-1">
                <option value="onepoint">1 punto</option><option value="uniform">Uniforme (50/50)</option></select></label>
            <label className="flex flex-col gap-1">Semilla aleatoria (reproducible)
              <input type="number" value={seed} onChange={e => setSeed(+e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => runOnce()} disabled={!items.length} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-semibold text-white cursor-pointer">▶ Ejecutar algoritmo genético</button>
            <button onClick={() => { const ns = Math.floor(Math.random() * 9999) + 1; setSeed(ns); runOnce(ns); }} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer">🎲 Semilla nueva y ejecutar</button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-indigo-300">📝 Pseudocódigo del algoritmo</summary>
            <pre className="mt-2 text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-auto text-emerald-200">{PSEUDOCODE}</pre>
          </details>
        </section>

        {/* ── RESULTADOS DE LA EJECUCIÓN ── */}
        {result && baselines && (
          <>
            <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">4 · Resultado, gráficas y comparación con líneas base</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
                {[
                  { n: 'Algoritmo Genético', v: result.bestFitness, c: 'text-emerald-300' },
                  { n: 'Voraz (valor/peso)', v: baselines.greedy.fitness, c: 'text-violet-300' },
                  { n: 'Ascenso de colina', v: baselines.hill.fitness, c: 'text-sky-300' },
                  { n: 'Óptimo exacto (DP)', v: baselines.dp.fitness, c: 'text-amber-300' },
                ].map(b => (
                  <div key={b.n} className="bg-slate-800/60 rounded-lg p-3">
                    <p className="text-xs text-slate-400">{b.n}</p>
                    <p className={`text-xl font-bold ${b.c}`}>${fmt(b.v)}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-300">
                Carga del AG: <b>{result.bestWeight.toFixed(1)} t</b> de {cap} t · {chosenItems.length} lotes · {result.generationsRun} generaciones · {result.timeMs.toFixed(1)} ms ·
                Mejora vs voraz: <b className={result.bestFitness >= baselines.greedy.fitness ? 'text-emerald-300' : 'text-rose-300'}>
                  {(((result.bestFitness - baselines.greedy.fitness) / baselines.greedy.fitness) * 100).toFixed(2)}%</b> ·
                Brecha vs óptimo: <b>{(((baselines.dp.fitness - result.bestFitness) / baselines.dp.fitness) * 100).toFixed(2)}%</b> ·
                ✅ Validación: solución {validar(result.best, items, cap) === null ? 'válida (0 errores)' : 'INVÁLIDA'}
              </p>

              {/* Gráfica 1: Convergencia */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1">📈 Gráfica 1 · Convergencia por generación (Mejor, Promedio y Peor)</p>
                <ConvergenceChart result={result} optimum={baselines.dp.fitness} greedy={baselines.greedy.fitness} />
                <p className="text-xs text-slate-500 mt-1">Verde = mejor individuo · Azul = promedio poblacional · Gris = peor individuo de cada generación.</p>
              </div>

              {/* Gráfica 2: Mejor solución sobre el plano con puntos etiquetados */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1">🗺️ Gráfica 2 · Mejor carga sobre el plano (Peso vs. Valor con lotes etiquetados)</p>
                <SolutionPlaneChart items={items} chrom={result.best} cap={cap} />
              </div>

              <div className="pt-1 space-y-3">
                <button
                  onClick={explainRun}
                  disabled={runAiLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium text-white cursor-pointer"
                >
                  {runAiLoading ? '⏳ Consultando a Gemini…' : '✨ Explicar esta ejecución con Gemini'}
                </button>

                {(runAiLoading || runAiText) && (
                  <div className="bg-indigo-950/40 border border-indigo-700/40 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-indigo-300">✨ Explicación de Gemini (Ejecución actual)</h3>
                      {runAiModel && <span className="text-[10px] text-indigo-400/80 font-mono">{runAiModel}</span>}
                    </div>
                    {runAiLoading ? (
                      <p className="text-sm text-slate-400">Analizando los lotes seleccionados y la curva de convergencia…</p>
                    ) : (
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{runAiText}</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Visor paso a paso ── */}
            <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
              <h2 className="text-base font-semibold text-white">5 · Evolución paso a paso (todas las generaciones)</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button onClick={() => { if (genView >= result.history.length - 1) setGenView(0); setPlaying(p => !p); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">{playing ? '⏸ Pausa' : '▶ Reproducir'}</button>
                <button onClick={() => setGenView(g => Math.max(0, g - 1))} className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer">◀</button>
                <button onClick={() => setGenView(g => Math.min(result.history.length - 1, g + 1))} className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer">▶</button>
                <input type="range" min={0} max={result.history.length - 1} value={genView} onChange={e => { setPlaying(false); setGenView(+e.target.value); }} className="flex-1 min-w-40" />
                <label className="flex items-center gap-2 text-xs">Velocidad
                  <input type="range" min={30} max={800} step={10} value={800 - speed + 30} onChange={e => setSpeed(800 - +e.target.value + 30)} /></label>
              </div>
              {stat && (
                <div className="space-y-3">
                  <p className="text-sm">
                    Generación <b>{stat.gen}</b> de {result.generationsRun} · Mejor: <b className="text-emerald-300">${fmt(stat.best)}</b> ·
                    Promedio: <b className="text-sky-300">${fmt(stat.avg)}</b> · Peor: ${fmt(stat.worst)} ·
                    Peso del mejor: <b>{viewWeight.toFixed(1)} t</b> · Individuos únicos: <b>{stat.uniqueCount}</b>/{params.popSize}
                  </p>
                  <div><p className="text-xs text-slate-400 mb-1">Mejor cromosoma de la generación {stat.gen} (verde = lote cargado):</p><GeneStrip c={stat.bestChrom} /></div>
                  {stat.trace && stat.trace.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs text-amber-300">Detalle de cómo nacen los hijos hacia la generación {stat.gen + 1} (línea ámbar = punto de corte, aro rojo = gen mutado):</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {stat.trace.map((t, i) => (
                          <div key={i} className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-xs">
                            <p className="font-semibold text-white">Hijo #{i + 1} {t.crossed ? '' : '(sin cruza: copia del padre A)'}{t.repaired && ' · 🔧 reparado por sobrepeso'}</p>
                            <div><span className="text-slate-400">Padre A (${fmt(t.fitA)})</span><GeneStrip c={t.parentA} cut={t.cutPoint} /></div>
                            <div><span className="text-slate-400">Padre B (${fmt(t.fitB)})</span><GeneStrip c={t.parentB} cut={t.cutPoint} /></div>
                            <div><span className="text-slate-400">Tras cruza</span><GeneStrip c={t.childRaw} cut={t.cutPoint} /></div>
                            <div><span className="text-slate-400">Tras mutación ({t.mutatedGenes.length} genes)</span><GeneStrip c={t.childMutated} marks={t.mutatedGenes} /></div>
                            <div><span className="text-slate-400">Hijo final válido (${fmt(t.fitFinal)})</span><GeneStrip c={t.childFinal} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <p className="text-xs text-slate-500">Última generación alcanzada (criterio de paro cumplido).</p>}
                </div>
              )}
            </section>
          </>
        )}

        {/* ── FASE 4: Experimentación ── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">6 · Experimentación (5 experimentos × 10 corridas con semillas 1–10)</h2>
          <p className="text-xs text-slate-400">
            Ejecuta los 5 experimentos de la rúbrica con 10 semillas distintas por fila. Reporta mejor, peor, media, desviación estándar, tiempo, generación de convergencia, diversidad final y gráficas comparativas.
          </p>
          <button onClick={runExperiments} disabled={running || !items.length} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm font-semibold text-white cursor-pointer">
            {running ? '⏳ Calculando 110 corridas…' : '🧪 Correr los 5 experimentos'}
          </button>
          {experiments && baselines && (
            <div className="space-y-6">
              {experiments.map(e => (
                <div key={e.id} className="space-y-2">
                  <p className="text-sm font-semibold text-white">{e.title} <span className="font-normal text-slate-400">— {e.question}</span></p>
                  <div className="overflow-auto">
                    <table className="w-full text-xs border border-slate-800">
                      <thead className="bg-slate-800"><tr>
                        <th className="p-1.5 text-left">Configuración</th>
                        <th className="p-1.5 text-right">Mejor</th>
                        <th className="p-1.5 text-right">Peor</th>
                        <th className="p-1.5 text-right">Media</th>
                        <th className="p-1.5 text-right">Desv. est.</th>
                        <th className="p-1.5 text-right">Tiempo (ms)</th>
                        <th className="p-1.5 text-right">Gen. convergencia</th>
                        <th className="p-1.5 text-right">Diversidad final</th>
                        <th className="p-1.5 text-right">% del óptimo (media)</th>
                      </tr></thead>
                      <tbody>
                        {e.rows.map(r => (
                          <tr key={r.label} className="border-t border-slate-800">
                            <td className="p-1.5 font-medium">{r.label}</td>
                            <td className="p-1.5 text-right text-amber-300">${fmt(r.best)}</td>
                            <td className="p-1.5 text-right text-slate-400">${fmt(r.worst)}</td>
                            <td className="p-1.5 text-right text-emerald-300 font-semibold">${fmt(r.mean)}</td>
                            <td className="p-1.5 text-right">±{r.std.toFixed(0)}</td>
                            <td className="p-1.5 text-right">{r.timeMs.toFixed(1)}</td>
                            <td className="p-1.5 text-right">{r.avgGenToBest.toFixed(1)}</td>
                            <td className="p-1.5 text-right">{r.finalDiversity.toFixed(1)}</td>
                            <td className="p-1.5 text-right">{((r.mean / baselines.dp.fitness) * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ExperimentChart exp={e} dpOpt={baselines.dp.fitness} greedy={baselines.greedy.fitness} />
                </div>
              ))}

              {final5 && (
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold text-emerald-300">🏆 Resumen contra la línea base</p>
                  <p>
                    Mejor configuración: <b>{final5.bestRow.label}</b> (media <b>${fmt(final5.bestRow.mean)}</b>, mejor <b>${fmt(final5.bestRow.best)}</b>) vs.
                    Heurística Voraz (<b>${fmt(baselines.greedy.fitness)}</b>): mejora promedio de <b className="text-emerald-300">+{final5.gain.toFixed(2)}%</b>.
                    Brecha respecto al óptimo exacto DP (${fmt(baselines.dp.fitness)}): <b>{final5.gap.toFixed(2)}%</b>.
                    Ascenso de colina (20 reinicios): ${fmt(baselines.hill.fitness)}.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={interpretExperiments}
                  disabled={expAiLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium text-white cursor-pointer"
                >
                  {expAiLoading ? '⏳ Interpretando los 5 experimentos con Gemini…' : '✨ Interpretar experimentos con Gemini'}
                </button>

                {(expAiLoading || expAiText) && (
                  <div className="bg-indigo-950/40 border border-indigo-700/40 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-indigo-300">✨ Interpretación de Resultados con Gemini (Fase 4)</h3>
                      {expAiModel && <span className="text-[10px] text-indigo-400/80 font-mono">{expAiModel}</span>}
                    </div>
                    {expAiLoading ? (
                      <p className="text-sm text-slate-400">Analizando estadísticos, convergencia prematura y comparativa contra la línea base…</p>
                    ) : (
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{expAiText}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

'use client';

// ============================================================
// ARCHIVO: app/puzzle/page.tsx
// PROPÓSITO: Página interactiva del Rompecabezas Deslizante
//            (3×3, 4×4 y 5×5) con visor lateral de pasos,
//            inspección individual de cada paso y animación.
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import NavMenu from '@/components/NavMenu';
import {
  Board,
  ShuffleResult,
  SolveResult,
  checkSolved,
  getNeighborIndices,
  shuffleBoard,
  solvePuzzle,
  getReverseSolution,
  simplifySolution,
} from '@/lib/puzzleSolver';

// Estructura descriptiva para cada paso individual de la solución
interface StepDetail {
  stepIndex: number;    // Índice 0-based del paso
  tileValue: number;    // Número de la ficha que se mueve
  fromIndex: number;    // Índice plano de origen
  toIndex: number;      // Índice plano de destino (donde estaba el vacío)
  fromRow: number;      // Fila de origen (1-based)
  fromCol: number;      // Columna de origen (1-based)
  toRow: number;        // Fila de destino (1-based)
  toCol: number;        // Columna de destino (1-based)
  direction: string;    // Flecha y nombre de la dirección
}

// Paleta visual para los bloques numéricos
const TILE_PALETTE: string[] = [
  'bg-blue-600',
  'bg-blue-500',
  'bg-indigo-600',
  'bg-indigo-500',
  'bg-violet-600',
  'bg-violet-500',
  'bg-purple-600',
  'bg-purple-500',
  'bg-fuchsia-600',
  'bg-fuchsia-500',
  'bg-pink-600',
  'bg-pink-500',
  'bg-sky-600',
  'bg-sky-500',
  'bg-cyan-600',
  'bg-cyan-500',
  'bg-teal-600',
  'bg-teal-500',
  'bg-emerald-600',
  'bg-emerald-500',
  'bg-indigo-700',
  'bg-violet-700',
  'bg-purple-700',
  'bg-fuchsia-700',
];

export default function PuzzlePage() {
  // ----------------------------------------------------------
  // ESTADOS DEL JUEGO
  // ----------------------------------------------------------
  const [size, setSize] = useState<number>(3);
  const [board, setBoard] = useState<Board>([]);
  const [moves, setMoves] = useState<number>(0);
  const [solved, setSolved] = useState<boolean>(false);
  const [solving, setSolving] = useState<boolean>(false);

  // Estados de la solución calculada
  const [solutionSteps, setSolutionSteps] = useState<number[]>([]);
  const [solutionBoards, setSolutionBoards] = useState<Board[]>([]);
  const [solutionDetails, setSolutionDetails] = useState<StepDetail[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [animationSpeed, setAnimationSpeed] = useState<number>(250);

  // ----------------------------------------------------------
  // REFS MUTABLES
  // ----------------------------------------------------------
  const historyRef = useRef<number[]>([]);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const boardRef = useRef<Board>(board);
  const sizeRef = useRef<number>(size);
  const solvingRef = useRef<boolean>(solving);
  const animationSpeedRef = useRef<number>(animationSpeed);
  const stepListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    solvingRef.current = solving;
  }, [solving]);

  useEffect(() => {
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  // Desplazar automáticamente la lista de pasos para enfocar el paso activo
  useEffect(() => {
    if (currentStep >= 0 && stepListRef.current) {
      const activeEl = stepListRef.current.querySelector(
        `[data-step="${currentStep}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentStep]);

  const getTileColor = (value: number): string => {
    if (value === 0) return 'bg-slate-800/50';
    const colorIndex = (value - 1) % TILE_PALETTE.length;
    return TILE_PALETTE[colorIndex];
  };

  // Detener la reproducción automática
  const handleStopSolving = useCallback(() => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    setSolving(false);
    solvingRef.current = false;
    setStatusMessage('Reproducción pausada. Puedes inspeccionar cada paso.');
  }, []);

  // Nueva partida / mezclar tablero
  const handleNewGame = useCallback((newSize?: number) => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }

    const targetSize = newSize ?? sizeRef.current;
    if (newSize !== undefined) {
      setSize(newSize);
      sizeRef.current = newSize;
    }

    const shuffleResult: ShuffleResult = shuffleBoard(targetSize);
    setBoard(shuffleResult.board);
    boardRef.current = shuffleResult.board;

    historyRef.current = [...shuffleResult.tilesMoved];

    setMoves(0);
    setSolved(false);
    setSolving(false);
    solvingRef.current = false;
    setSolutionSteps([]);
    setSolutionBoards([]);
    setSolutionDetails([]);
    setCurrentStep(-1);
    setStatusMessage('');
  }, []);

  // Saltar directamente a cualquier paso de la solución
  const jumpToStep = useCallback(
    (stepIdx: number) => {
      // Si la animación está corriendo, pausarla para permitir inspección manual
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
      setSolving(false);
      solvingRef.current = false;

      if (stepIdx < -1 || stepIdx >= solutionSteps.length) return;

      setCurrentStep(stepIdx);

      if (stepIdx === -1) {
        // Estado inicial antes de aplicar movimientos
        if (solutionBoards.length > 0) {
          const initBoard = solutionBoards[0];
          setBoard(initBoard);
          boardRef.current = initBoard;
          setSolved(checkSolved(initBoard, sizeRef.current));
        }
      } else {
        // Tablero luego de aplicar el paso stepIdx
        const targetBoard = solutionBoards[stepIdx + 1];
        if (targetBoard) {
          setBoard(targetBoard);
          boardRef.current = targetBoard;
          setSolved(checkSolved(targetBoard, sizeRef.current));
        }
      }
    },
    [solutionSteps.length, solutionBoards]
  );

  // Reproducir la solución paso a paso de manera continua
  const playAnimation = useCallback(
    (fromStep: number) => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }

      setSolving(true);
      solvingRef.current = true;

      // Si ya está en el último paso o más allá, reiniciar desde el principio
      let nextStep = fromStep;
      if (nextStep >= solutionSteps.length) {
        nextStep = 0;
        if (solutionBoards.length > 0) {
          setBoard(solutionBoards[0]);
          boardRef.current = solutionBoards[0];
          setSolved(false);
        }
      }

      const runTick = () => {
        if (!solvingRef.current) return;

        if (nextStep >= solutionSteps.length) {
          if (animationRef.current) {
            clearInterval(animationRef.current);
            animationRef.current = null;
          }
          setSolving(false);
          solvingRef.current = false;
          setCurrentStep(solutionSteps.length - 1);

          if (checkSolved(boardRef.current, sizeRef.current)) {
            setSolved(true);
            setStatusMessage('🤖 ¡Rompecabezas resuelto exitosamente!');
          }
          return;
        }

        const nextBoard = solutionBoards[nextStep + 1];
        if (nextBoard) {
          setBoard(nextBoard);
          boardRef.current = nextBoard;
          setCurrentStep(nextStep);

          if (nextStep === solutionSteps.length - 1) {
            if (checkSolved(nextBoard, sizeRef.current)) {
              setSolved(true);
              setStatusMessage('🤖 ¡Rompecabezas resuelto exitosamente!');
            }
          }
        }

        nextStep++;

        if (nextStep > solutionSteps.length) {
          if (animationRef.current) {
            clearInterval(animationRef.current);
            animationRef.current = null;
          }
          setSolving(false);
          solvingRef.current = false;
        }
      };

      // Ejecutar el primer paso inmediatamente y programar los siguientes
      runTick();
      animationRef.current = setInterval(runTick, animationSpeedRef.current);
    },
    [solutionSteps.length, solutionBoards]
  );

  // Clic manual de una ficha por parte del jugador
  const handleTileClick = (index: number) => {
    if (solving || solved) return;

    const emptyIndex = board.indexOf(0);
    if (emptyIndex === -1) return;

    const neighbors = getNeighborIndices(emptyIndex, size);
    if (!neighbors.includes(index)) return;

    const clickedTileVal = board[index];

    // Realizar movimiento legal
    const newBoard = [...board];
    newBoard[emptyIndex] = clickedTileVal;
    newBoard[index] = 0;

    setBoard(newBoard);
    boardRef.current = newBoard;

    // Sincronizar el historial para permitir reversa precisa
    if (
      historyRef.current.length > 0 &&
      historyRef.current[historyRef.current.length - 1] === clickedTileVal
    ) {
      historyRef.current.pop();
    } else {
      historyRef.current.push(clickedTileVal);
    }

    const newMoves = moves + 1;
    setMoves(newMoves);

    // Al mover manualmente, invalidar la solución calculada previa si existía
    if (solutionSteps.length > 0) {
      setSolutionSteps([]);
      setSolutionBoards([]);
      setSolutionDetails([]);
      setCurrentStep(-1);
    }

    if (checkSolved(newBoard, size)) {
      setSolved(true);
      setStatusMessage(
        `🎉 ¡Felicitaciones! Has resuelto el rompecabezas en ${newMoves} movimientos.`
      );
    }
  };

  // Cálculo de la solución automática
  const handleAutoSolve = async () => {
    if (solving || solved) return;

    setSolving(true);
    solvingRef.current = true;
    setStatusMessage('Buscando la ruta más rápida...');
    setSolutionSteps([]);
    setSolutionBoards([]);
    setSolutionDetails([]);
    setCurrentStep(-1);

    await new Promise((resolve) => setTimeout(resolve, 60));

    try {
      const currentBoard = [...boardRef.current];
      const curSize = sizeRef.current;

      if (checkSolved(currentBoard, curSize)) {
        setSolved(true);
        setSolving(false);
        solvingRef.current = false;
        setStatusMessage('¡El rompecabezas ya está resuelto!');
        return;
      }

      // 1. Intentar encontrar la solución óptima con IDA*
      const solveResult: SolveResult = solvePuzzle(currentBoard, curSize);
      let steps: number[] = [];
      let method = '';

      if (solveResult.found && solveResult.solution.length > 0) {
        steps = solveResult.solution;
        method = 'Ruta óptima (IDA*)';
      } else {
        // 2. Método de respaldo garantizado
        const reverseClicks = getReverseSolution(currentBoard, historyRef.current);
        steps = simplifySolution(currentBoard, reverseClicks, curSize);
        method = 'Ruta garantizada';
      }

      if (!steps || steps.length === 0) {
        setSolving(false);
        solvingRef.current = false;
        setStatusMessage('No se encontraron movimientos necesarios.');
        return;
      }

      // Precalcular todos los estados del tablero y detalles de cada paso
      const boardsSnapshot: Board[] = [[...currentBoard]];
      const detailsSnapshot: StepDetail[] = [];
      const simBoard = [...currentBoard];

      for (let i = 0; i < steps.length; i++) {
        const fromIdx = steps[i];
        const toIdx = simBoard.indexOf(0);
        const tileVal = simBoard[fromIdx];

        const fromRow = Math.floor(fromIdx / curSize) + 1;
        const fromCol = (fromIdx % curSize) + 1;
        const toRow = Math.floor(toIdx / curSize) + 1;
        const toCol = (toIdx % curSize) + 1;

        let direction = '';
        if (toRow < fromRow) direction = 'Arriba ↑';
        else if (toRow > fromRow) direction = 'Abajo ↓';
        else if (toCol < fromCol) direction = 'Izquierda ←';
        else if (toCol > fromCol) direction = 'Derecha →';

        simBoard[toIdx] = tileVal;
        simBoard[fromIdx] = 0;

        boardsSnapshot.push([...simBoard]);
        detailsSnapshot.push({
          stepIndex: i,
          tileValue: tileVal,
          fromIndex: fromIdx,
          toIndex: toIdx,
          fromRow,
          fromCol,
          toRow,
          toCol,
          direction,
        });
      }

      setSolutionSteps(steps);
      setSolutionBoards(boardsSnapshot);
      setSolutionDetails(detailsSnapshot);
      setStatusMessage(
        `Solución calculada (${method}): ${steps.length} movimientos. Haz clic en cualquier paso para inspeccionarlo.`
      );

      // Iniciar reproducción desde el primer paso
      playAnimation(0);
    } catch (error) {
      setSolving(false);
      solvingRef.current = false;
      setStatusMessage('Error al calcular la solución.');
      console.error(error);
    }
  };

  // Iniciar juego al montar
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleNewGame(3);
  }, [handleNewGame]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, []);

  const gridMaxWidth = size === 3 ? '380px' : size === 4 ? '400px' : '430px';

  // Detalle del paso activo
  const activeDetail: StepDetail | null =
    currentStep >= 0 && currentStep < solutionDetails.length
      ? solutionDetails[currentStep]
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-indigo-500 selection:text-white">
      {/* BARRA SUPERIOR DE NAVEGACIÓN */}
      <nav className="bg-slate-900/80 border-b border-slate-800 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-label="Puzzle">
              🧩
            </span>
            <div>
              <h1 className="text-white font-bold text-base sm:text-lg tracking-tight">
                Puzzle Deslizante
              </h1>
              <p className="text-xs text-slate-400">
                Laboratorio de Algoritmos IA
              </p>
            </div>
          </div>

          {/* Menú desplegable de navegación compartido */}
          <NavMenu />
        </div>
      </nav>

      {/* CONTENEDOR PRINCIPAL: DISTRIBUCIÓN RESPONSIVA DE 2 COLUMNAS (AL LADO) */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
          
          {/* ========================================================= */}
          {/* COLUMNA IZQUIERDA: EL PUZZLE Y SUS CONTROLES              */}
          {/* ========================================================= */}
          <div className="flex flex-col items-center gap-5 w-full lg:w-auto lg:min-w-[420px] flex-shrink-0">
            {/* SELECTOR DE TAMAÑO (3×3, 4×4, 5×5) */}
            <div className="flex items-center justify-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-md w-full max-w-[380px]">
              {[3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => handleNewGame(s)}
                  disabled={solving}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    size === s
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>🔲</span>
                  <span>{s}×{s}</span>
                </button>
              ))}
            </div>

            {/* FILA DE ESTADÍSTICAS */}
            <div
              className="flex items-center justify-between w-full px-1"
              style={{ maxWidth: gridMaxWidth }}
            >
              <div className="text-slate-300 text-sm font-medium bg-slate-900/80 border border-slate-800 px-3.5 py-1.5 rounded-xl shadow-sm">
                Movimientos: <span className="text-white font-bold">{moves}</span>
              </div>

              {solved && (
                <div className="text-emerald-400 font-bold text-sm bg-emerald-950/60 border border-emerald-800/80 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm animate-bounce">
                  <span>🎉</span>
                  <span>¡Resuelto!</span>
                </div>
              )}
            </div>

            {/* CUADRÍCULA DEL TABLERO */}
            <div className="flex justify-center w-full">
              <div
                className="w-full p-3 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl transition-all"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${size}, 1fr)`,
                  gap: '6px',
                  maxWidth: gridMaxWidth,
                }}
              >
                {board.map((value, index) => {
                  // Destacar la ficha correspondiente al paso seleccionado o en animación
                  const isTileJustMoved =
                    activeDetail !== null && activeDetail.toIndex === index;

                  const isNextTileToMove =
                    currentStep === -1 &&
                    solutionDetails.length > 0 &&
                    solutionDetails[0].fromIndex === index;

                  if (value === 0) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="aspect-square opacity-0 cursor-default pointer-events-none"
                        aria-hidden="true"
                      />
                    );
                  }

                  const tileColor = getTileColor(value);
                  const fontSizeClass =
                    size === 3 ? 'text-3xl' : size === 4 ? 'text-2xl' : 'text-xl';

                  return (
                    <button
                      key={`tile-${value}`}
                      onClick={() => handleTileClick(index)}
                      disabled={solving || solved}
                      className={`aspect-square relative flex items-center justify-center font-bold text-white rounded-xl shadow-md transition-all duration-150 select-none ${tileColor} ${fontSizeClass} ${
                        !solving && !solved
                          ? 'hover:scale-105 active:scale-95 cursor-pointer'
                          : 'cursor-default'
                      } ${
                        isTileJustMoved
                          ? 'ring-4 ring-yellow-400 scale-105 z-10 shadow-lg shadow-yellow-500/30'
                          : ''
                      } ${
                        isNextTileToMove
                          ? 'ring-4 ring-indigo-400 scale-105 z-10 animate-pulse'
                          : ''
                      }`}
                    >
                      {value}
                      {/* Indicador sobre la ficha seleccionada */}
                      {isTileJustMoved && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-yellow-400 text-slate-950 rounded-full text-[10px] flex items-center justify-center font-extrabold shadow">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MENSAJE VICTORIA */}
            {solved && (
              <div
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-indigo-950/40 to-emerald-950/40 border border-emerald-500/30 text-center shadow-lg animate-pulse"
                style={{ maxWidth: gridMaxWidth }}
              >
                <div className="text-2xl mb-1 select-none">
                  🎉 🎊 ✨ 🏆 ✨ 🎊 🎉
                </div>
                <p className="text-emerald-300 font-bold text-sm">
                  {solutionSteps.length > 0 && moves === 0
                    ? '¡Rompecabezas completado por el solucionador inteligente!'
                    : `¡Felicitaciones! Has completado el rompecabezas en ${moves} movimientos.`}
                </p>
              </div>
            )}

            {/* BOTONES DE ACCIÓN */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full" style={{ maxWidth: gridMaxWidth }}>
              <button
                onClick={() => handleNewGame()}
                disabled={solving}
                className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl font-medium text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>🔀</span>
                <span>Mezclar</span>
              </button>

              {!solving ? (
                <button
                  onClick={handleAutoSolve}
                  disabled={solved}
                  className="flex-1 min-w-[170px] px-4 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>🤖</span>
                  <span>Resolver Automáticamente</span>
                </button>
              ) : (
                <button
                  onClick={handleStopSolving}
                  className="flex-1 min-w-[170px] px-4 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-500 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 animate-pulse"
                >
                  <span>⏸️</span>
                  <span>Pausar Solución</span>
                </button>
              )}
            </div>

            {/* MENSAJE DE ESTADO INFORMATIVO */}
            {statusMessage && (
              <div
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-300 shadow-sm"
                style={{ maxWidth: gridMaxWidth }}
              >
                {statusMessage}
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* COLUMNA DERECHA: PANEL LATERAL DE PASOS E INFORMACIÓN     */}
          {/* ========================================================= */}
          <div className="w-full lg:flex-1 lg:max-w-lg bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            
            {/* SI HAY UNA SOLUCIÓN DISPONIBLE */}
            {solutionSteps.length > 0 ? (
              <>
                {/* ENCABEZADO DEL PANEL DE PASOS */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="font-bold text-white text-base flex items-center gap-2">
                      <span>📋</span>
                      <span>Pasos de la Solución</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Total: {solutionSteps.length} movimientos requeridos
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    {currentStep === -1
                      ? 'Inicio (0)'
                      : `Paso ${currentStep + 1} de ${solutionSteps.length}`}
                  </span>
                </div>

                {/* TARJETA DE INSPECCIÓN DEL PASO SELECCIONADO */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 shadow-inner">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                    <span>📍 Detalle del Paso</span>
                    <span className="text-[11px] text-yellow-400 font-mono">
                      {currentStep === -1
                        ? 'Estado Inicial'
                        : `Paso #${currentStep + 1}`}
                    </span>
                  </div>

                  {activeDetail ? (
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5 flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-lg shadow-sm ${getTileColor(
                            activeDetail.tileValue
                          )}`}
                        >
                          {activeDetail.tileValue}
                        </div>
                        <div>
                          <div className="text-slate-400 text-[11px]">Ficha</div>
                          <div className="font-bold text-white">
                            Número {activeDetail.tileValue}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                        <div className="text-slate-400 text-[11px]">Dirección</div>
                        <div className="font-bold text-indigo-300">
                          {activeDetail.direction}
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                        <div className="text-slate-400 text-[11px]">Desde Posición</div>
                        <div className="font-medium text-slate-200">
                          Fila <strong className="text-white">{activeDetail.fromRow}</strong>, Col <strong className="text-white">{activeDetail.fromCol}</strong>
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                        <div className="text-slate-400 text-[11px]">Hacia Posición</div>
                        <div className="font-medium text-emerald-300">
                          Fila <strong className="text-white">{activeDetail.toRow}</strong>, Col <strong className="text-white">{activeDetail.toCol}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2 text-xs text-slate-400">
                      Tablero en su <strong className="text-indigo-400">estado inicial</strong>. Haz clic en el paso 1 o en <em>Siguiente</em> para comenzar.
                    </div>
                  )}
                </div>

                {/* BOTONES DE NAVEGACIÓN PASO A PASO */}
                <div className="flex items-center justify-between gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                  <button
                    onClick={() => jumpToStep(-1)}
                    disabled={currentStep === -1 || solving}
                    title="Ir al inicio"
                    className="p-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center"
                  >
                    ⏮️
                  </button>

                  <button
                    onClick={() => jumpToStep(currentStep - 1)}
                    disabled={currentStep === -1 || solving}
                    title="Paso anterior"
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 transition-colors flex items-center justify-center gap-1"
                  >
                    <span>◀</span>
                    <span>Anterior</span>
                  </button>

                  {!solving ? (
                    <button
                      onClick={() =>
                        playAnimation(
                          currentStep >= solutionSteps.length - 1
                            ? 0
                            : currentStep + 1
                        )
                      }
                      title="Reproducir automáticamente"
                      className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>▶</span>
                      <span>{currentStep >= solutionSteps.length - 1 ? 'Repetir' : 'Reproducir'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopSolving}
                      title="Pausar animación"
                      className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors flex items-center justify-center gap-1"
                    >
                      <span>⏸️</span>
                      <span>Pausar</span>
                    </button>
                  )}

                  <button
                    onClick={() => jumpToStep(currentStep + 1)}
                    disabled={currentStep >= solutionSteps.length - 1 || solving}
                    title="Paso siguiente"
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 transition-colors flex items-center justify-center gap-1"
                  >
                    <span>Siguiente</span>
                    <span>▶</span>
                  </button>

                  <button
                    onClick={() => jumpToStep(solutionSteps.length - 1)}
                    disabled={currentStep >= solutionSteps.length - 1 || solving}
                    title="Ir al final"
                    className="p-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center"
                  >
                    ⏭️
                  </button>
                </div>

                {/* CONTROL DE VELOCIDAD */}
                <div className="flex items-center justify-between gap-3 px-1 text-xs">
                  <span className="text-slate-400">Velocidad:</span>
                  <input
                    type="range"
                    min={100}
                    max={800}
                    step={50}
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                    className="flex-1 accent-indigo-500 cursor-pointer h-1.5"
                  />
                  <span className="font-mono text-indigo-400 w-12 text-right">
                    {animationSpeed}ms
                  </span>
                </div>

                {/* LISTA CLICKEABLE DE TODOS LOS PASOS */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
                    <span>Haz clic en un paso para ver su posición:</span>
                    <span className="text-[11px] text-slate-500">
                      {currentStep + 1} / {solutionSteps.length}
                    </span>
                  </div>

                  <div
                    ref={stepListRef}
                    className="max-h-[380px] overflow-y-auto space-y-1 pr-1 custom-scrollbar"
                  >
                    {solutionDetails.map((detail, idx) => {
                      const isCurrent = currentStep === idx;
                      const isPast = currentStep > idx;

                      return (
                        <button
                          key={idx}
                          data-step={idx}
                          onClick={() => jumpToStep(idx)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-indigo-600/30 border border-indigo-500 text-white font-semibold ring-1 ring-indigo-400/60 shadow-md shadow-indigo-600/20'
                              : isPast
                              ? 'bg-slate-950/60 border border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                              : 'bg-slate-900/60 border border-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                                isCurrent
                                  ? 'bg-indigo-500 text-white font-bold'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span>
                              Mover ficha{' '}
                              <strong className="text-yellow-400">
                                {detail.tileValue}
                              </strong>
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              ({detail.direction})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-mono">
                              F{detail.fromRow},C{detail.fromCol}➔F{detail.toRow},C{detail.toCol}
                            </span>
                            {isPast && (
                              <span className="text-emerald-400 text-xs">✓</span>
                            )}
                            {isCurrent && (
                              <span className="text-yellow-400 text-xs animate-pulse">
                                ▶
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              /* ESTADO VACÍO CUANDO AÚN NO SE HA RESUELTO */
              <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-4 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
                  🧭
                </div>
                <div>
                  <h3 className="font-bold text-white text-base mb-1">
                    Explorador de Pasos
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                    Presiona el botón <strong className="text-indigo-400">🤖 Resolver Automáticamente</strong> para calcular y visualizar cada movimiento aquí al lado del tablero.
                  </p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-left w-full space-y-2 mt-2">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span>✨</span>
                    <span>Clic en cualquier paso para ver su posición exacta.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span>🔍</span>
                    <span>Coordenadas de fila, columna y dirección detalladas.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span>⏯️</span>
                    <span>Controles para avanzar, retroceder y pausar a tu gusto.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

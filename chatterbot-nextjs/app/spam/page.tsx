'use client';

// ============================================================
// ARCHIVO: app/spam/page.tsx
// PROPÓSITO: Interfaz del detector de spam (cliente).
// ============================================================
// Flujo: el usuario escribe asunto y cuerpo → POST /api/spam → el servidor Node
// clasifica con el modelo Naive Bayes → se muestra el veredicto, la probabilidad,
// el idioma detectado y las palabras más influyentes. Al cargar, también pide
// las métricas del modelo (GET /api/spam).
// ============================================================
import { useEffect, useState } from 'react';
import NavMenu from '@/components/NavMenu';
import type { SpamMetrics, SpamPrediction, EvalMetrics } from '@/lib/spamModel';

/** Correos de ejemplo (botones de carga rápida) */
const EXAMPLES = [
  { name: '🇪🇸 Spam', subject: 'Gana dinero rápido', message: 'Haz clic aquí para ganar un premio gratis. Oferta exclusiva, compra ahora con descuento especial.' },
  { name: '🇪🇸 Normal', subject: 'Recordatorio de tu cita', message: 'Te recordamos tu cita de mañana con el nutricionista. Confirmamos que recibimos tu pedido.' },
  { name: '🇺🇸 Spam', subject: 'You have WON a free prize!!!', message: 'Click here now to claim your free viagra, cheap meds and lottery money. Limited offer, act now!' },
  { name: '🇺🇸 Normal', subject: 'meeting tomorrow', message: 'Hi Gary, please send me the production report for the pipeline before our meeting tomorrow at 10 am. Thanks, Vince' },
];

/** Formatea un número 0..1 como porcentaje con un decimal */
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Tarjeta con exactitud, precisión, recall, F1 y matriz de confusión de un idioma */
function MetricsCard({ title, m }: { title: string; m: EvalMetrics }) {
  const items: [string, number][] = [['Exactitud', m.accuracy], ['Precisión', m.precision], ['Recall', m.recall], ['F1', m.f1]];
  return (
    <div className="rounded-xl p-4 bg-slate-900 border border-slate-800">
      <p className="font-semibold text-sm mb-2">{title} <span className="text-xs text-slate-400 font-normal">({m.size} correos de prueba)</span></p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {items.map(([k, v]) => (
          <div key={k} className="bg-slate-800 rounded-lg py-2">
            <p className="text-base font-bold">{pct(v)}</p><p className="text-[11px] text-slate-400">{k}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">VP {m.confusion.tp} · FP {m.confusion.fp} · VN {m.confusion.tn} · FN {m.confusion.fn}</p>
    </div>
  );
}

/** Componente principal de la página /spam */
export default function SpamPage() {
  // Estado de los campos del formulario
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [res, setRes] = useState<SpamPrediction | null>(null);
  const [metrics, setMetrics] = useState<SpamMetrics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Al montar: pide las métricas del modelo; si falla, muestra el motivo (p. ej. modelo no entrenado)
  useEffect(() => {
    fetch('/api/spam').then(r => r.json())
      .then(d => (d.metrics ? setMetrics(d.metrics) : setError(d.error ?? 'No se pudo cargar el modelo')))
      .catch(() => setError('No se pudo conectar con el servidor'));
  }, []);

  /** Envía el correo al servidor y guarda el resultado (o el error) en el estado */
  async function analyze() {
    if (!subject.trim() && !message.trim()) { setError('Escribe un asunto o un mensaje.'); return; }
    setLoading(true); setError(''); setRes(null);
    try {
      const r = await fetch('/api/spam', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Error del servidor'); else setRes(d);
    } catch { setError('Error de conexión'); }
    setLoading(false);
  }

  /** Vacía el formulario y el resultado */
  const clear = () => { setSubject(''); setMessage(''); setRes(null); setError(''); };
  /** Atajo para colorear la tarjeta de resultado */
  const isSpam = res?.label === 'spam';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold">🛡️ Detector de Spam</h1>
          <p className="text-xs text-slate-400">Naive Bayes · aprendizaje supervisado · Enron (EN) + HuggingFace (ES)</p>
        </div>
        <NavMenu />
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(e => (
            <button key={e.name} onClick={() => { setSubject(e.subject); setMessage(e.message); setRes(null); setError(''); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700">
              {e.name}
            </button>
          ))}
        </div>

        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto" maxLength={500}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:border-indigo-500" />
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Cuerpo del correo (español o inglés)" rows={8}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:border-indigo-500" />
        <div className="flex gap-2">
          <button onClick={analyze} disabled={loading || !metrics}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-sm">
            {loading ? 'Analizando…' : 'Analizar correo'}
          </button>
          <button onClick={clear} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm border border-slate-700">Limpiar</button>
        </div>

        {error && <p className="text-rose-400 text-sm">⚠️ {error}</p>}

        {res && (
          <div className={`rounded-xl p-5 border ${isSpam ? 'bg-rose-950/40 border-rose-700' : 'bg-emerald-950/40 border-emerald-700'}`}>
            <p className="text-2xl font-bold">{isSpam ? '🚫 SPAM' : '✅ Correo legítimo (HAM)'}</p>
            <div className="h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
              <div className={`h-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: pct(res.spamProbability) }} />
            </div>
            <p className="text-sm text-slate-300 mt-2">
              Probabilidad de spam: <b>{pct(res.spamProbability)}</b> · idioma detectado: <b>{res.language === 'es' ? 'Español' : 'Inglés'}</b> · palabras reconocidas: {res.tokensUsed}/{res.tokensTotal}
            </p>
            {res.lowConfidence && (
              <p className="text-amber-300 text-xs mt-2">⚠️ Casi ninguna palabra es conocida por el modelo; el resultado es poco fiable.</p>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
              <div><p className="text-rose-300 font-semibold mb-1">Palabras que indican spam</p>
                {res.topSpamWords.length === 0 && <span className="text-slate-500">—</span>}
                {res.topSpamWords.map(w => <span key={w.word} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded bg-rose-900/60">{w.word}</span>)}</div>
              <div><p className="text-emerald-300 font-semibold mb-1">Palabras que indican ham</p>
                {res.topHamWords.length === 0 && <span className="text-slate-500">—</span>}
                {res.topHamWords.map(w => <span key={w.word} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded bg-emerald-900/60">{w.word}</span>)}</div>
            </div>
          </div>
        )}

        {metrics && (
          <section className="space-y-3">
            <p className="font-semibold text-sm">📊 Métricas del modelo en datos de prueba (no vistos al entrenar)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <MetricsCard title="🇪🇸 Español" m={metrics.es} />
              <MetricsCard title="🇺🇸 Inglés" m={metrics.en} />
            </div>
            <p className="text-xs text-slate-500">Entrenamiento: {metrics.trainSize.es} mensajes en español · {metrics.trainSize.en} correos en inglés. El dataset en español es pequeño y de mensajes cortos; correos largos pueden ser menos precisos.</p>
          </section>
        )}
      </main>
    </div>
  );
}

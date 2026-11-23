// ============================================================
// ARCHIVO: app/api/spam/route.ts
// PROPÓSITO: Endpoint del servidor (Node.js) del detector de spam.
// ============================================================
// Rutas:
//   GET  /api/spam  → devuelve las métricas del modelo entrenado
//   POST /api/spam  → recibe { subject, message } y devuelve la predicción
//
// Códigos HTTP:
//   200 OK · 400 petición inválida · 503 modelo no entrenado · 500 error interno
// ============================================================
import { NextResponse, connection } from 'next/server';
import { predictSpam, getSpamMetrics, ModelNotTrainedError } from '@/lib/spamModel';

/** Límite de caracteres analizados (evita que un correo enorme bloquee el servidor) */
const MAX_CHARS = 200_000;

/** Convierte un error en una respuesta JSON con el código HTTP adecuado */
function errorResponse(e: unknown) {
  if (e instanceof ModelNotTrainedError) {
    return NextResponse.json({ error: e.message }, { status: 503 }); // el servidor no está listo
  }
  return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
}

/** GET: métricas de evaluación (exactitud, precisión, recall, F1) por idioma */
export async function GET() {
  // connection() marca la ruta como dinámica: con cacheComponents activo,
  // Next.js no debe congelar en el build un modelo que se lee del disco.
  await connection();
  try {
    return NextResponse.json({ metrics: getSpamMetrics() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST: clasifica un correo como spam o ham */
export async function POST(req: Request) {
  // 1) Leer el JSON; si el cuerpo es inválido es culpa del cliente → 400
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo debe ser JSON válido.' }, { status: 400 });
  }

  // 2) Validar y normalizar los campos (solo se aceptan strings)
  const { subject, message } = (body ?? {}) as { subject?: unknown; message?: unknown };
  const text = [subject, message]
    .map(v => (typeof v === 'string' ? v : ''))
    .join(' ')
    .slice(0, MAX_CHARS);
  if (!text.trim()) {
    return NextResponse.json({ error: 'Escribe un asunto o un mensaje.' }, { status: 400 });
  }

  // 3) Predecir
  try {
    return NextResponse.json(predictSpam(text));
  } catch (e) {
    return errorResponse(e);
  }
}

// ============================================================
// ARCHIVO: app/api/chat/route.ts
// PROPÓSITO: Endpoint del Backend (API Route de Next.js)
// ============================================================
// Este archivo corre EXCLUSIVAMENTE en el servidor (Node.js).
// Aquí es donde se maneja la comunicación segura con Google Gemini.
//
// Flujo de datos:
// 1. El frontend envía un POST con { messages, config }
// 2. Este endpoint valida los datos recibidos
// 3. Inicializa el SDK de Google GenAI con la API Key SECRETA
// 4. Envía la petición a Gemini con los hiperparámetros del usuario
// 5. Retorna la respuesta generada como JSON al frontend
//
// SEGURIDAD: La API Key (GEMINI_API_KEY) NUNCA sale del servidor.
// El navegador del usuario NUNCA tiene acceso a ella.
// ============================================================

// NextResponse — Utilidad de Next.js para construir respuestas HTTP
import { NextResponse } from 'next/server';

// GoogleGenAI — SDK oficial unificado de Google para modelos generativos
import { GoogleGenAI } from '@google/genai';

// Importamos el tipo del cuerpo de la petición para validación de tipos
import { ChatRequestBody } from '@/types/chat';

// ============================================================
// INICIALIZACIÓN DEL CLIENTE SDK
// ============================================================
// Leemos la API Key desde las variables de entorno del servidor.
// process.env.GEMINI_API_KEY solo existe en Node.js (servidor),
// nunca se envía al navegador porque NO tiene prefijo NEXT_PUBLIC_.
const apiKey = process.env.GEMINI_API_KEY;

// Advertencia en consola del servidor si la clave no está configurada
if (!apiKey) {
  console.warn(
    '⚠️ ADVERTENCIA: GEMINI_API_KEY no está configurada en .env.local'
  );
}

// Creamos una instancia del cliente GoogleGenAI.
// Se inicializa una sola vez cuando el servidor arranca (patrón singleton).
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// ============================================================
// HANDLER POST — Maneja las peticiones POST a /api/chat
// ============================================================
// Next.js App Router usa convenciones de nombres de funciones:
// export async function POST → maneja método HTTP POST
// export async function GET  → maneja método HTTP GET
// etc.
export async function POST(req: Request) {
  try {
    // ----------------------------------------------------------
    // PASO 1: Verificar que la API Key esté configurada
    // ----------------------------------------------------------
    // Si no hay API Key, retornamos error 500 (error del servidor)
    if (!apiKey) {
      return NextResponse.json(
        { error: 'La API Key de Gemini no está configurada en el servidor.' },
        { status: 500 }
      );
    }

    // ----------------------------------------------------------
    // PASO 2: Extraer y validar el cuerpo de la petición
    // ----------------------------------------------------------
    // req.json() parsea el body JSON enviado desde el frontend
    const body: ChatRequestBody = await req.json();

    // Desestructuración: extraemos messages y config del body
    const { messages, config } = body;

    // Validación: El historial no puede estar vacío
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'El historial de mensajes no puede estar vacío.' },
        { status: 400 } // 400 = Bad Request (error del cliente)
      );
    }

    // ----------------------------------------------------------
    // PASO 3: Formatear el historial para el SDK de Gemini
    // ----------------------------------------------------------
    // La API de Gemini espera un array de objetos con esta forma:
    // { role: 'user' | 'model', parts: [{ text: '...' }] }
    //
    // Nuestro frontend envía { role, content }, así que lo
    // transformamos al formato que espera el SDK.
    const contents = messages.map((m) => ({
      role: m.role,                    // 'user' o 'model'
      parts: [{ text: m.content }],    // El texto va dentro de "parts"
    }));

    // ----------------------------------------------------------
    // PASO 4: Llamar a la API de Gemini con los hiperparámetros
    // ----------------------------------------------------------
    // ai.models.generateContent() es el método principal del SDK.
    // Aquí enviamos:
    //   - model: Qué modelo usar (seleccionado por el usuario)
    //   - contents: El historial completo de la conversación
    //   - config: Los hiperparámetros que controlan la generación
    const response = await ai.models.generateContent({
      // Modelo seleccionado por el usuario (default: gemini-2.5-flash)
      model: config.modelName || 'gemini-3.8-flash',

      // Historial de la conversación formateado
      contents: contents,

      // Configuración de generación (hiperparámetros)
      config: {
        // System Instruction: Define el rol/personalidad del asistente.
        // Si está vacío, se envía undefined (Gemini usa su default).
        systemInstruction: config.systemInstruction
          ? config.systemInstruction
          : undefined,

        // Temperatura: Controla la aleatoriedad/creatividad.
        // 0.0 = respuestas deterministas y predecibles
        // 1.0 = balance entre creatividad y coherencia
        // 2.0 = respuestas muy creativas pero posiblemente incoherentes
        temperature: config.temperature,

        // Max Output Tokens: Limita la longitud de la respuesta.
        // Un token ≈ 4 caracteres en inglés, ~3 en español.
        // 64 tokens ≈ 1-2 oraciones
        // 4096 tokens ≈ varias páginas de texto
        maxOutputTokens: config.maxOutputTokens,

        // Top-P (Nucleus Sampling): Filtra tokens por probabilidad acumulada.
        // 0.95 = considera tokens que suman 95% de probabilidad.
        // Valor más bajo = respuestas más conservadoras.
        topP: config.topP,

        // Top-K: Solo considera los K tokens más probables.
        // topK=1 = solo el token más probable (muy determinista)
        // topK=40 = elige entre los 40 tokens más probables
        topK: config.topK,
      },
    });

    // ----------------------------------------------------------
    // PASO 5: Extraer y retornar la respuesta
    // ----------------------------------------------------------
    // response.text contiene el texto generado por Gemini.
    // Si por alguna razón no hay texto, mostramos un mensaje default.
    const replyText = response.text || 'Sin respuesta generada por el modelo.';

    // Retornamos la respuesta como JSON con status 200 (éxito)
    // También incluimos usageMetadata (tokens usados) para monitoreo
    return NextResponse.json({
      text: replyText,               // Texto de la respuesta de Gemini
      usageMetadata: response.usageMetadata, // Métricas de uso de tokens
    });
  } catch (error: any) {
    // ----------------------------------------------------------
    // MANEJO DE ERRORES — Captura cualquier excepción
    // ----------------------------------------------------------
    // Logeamos el error en la consola del servidor (no visible para el usuario)
    console.error('❌ Error en /api/chat:', error);

    // Retornamos un mensaje de error genérico al frontend
    // con status 500 (Internal Server Error)
    return NextResponse.json(
      {
        error:
          error.message ||
          'Ocurrió un error al procesar la solicitud con Gemini.',
      },
      { status: 500 }
    );
  }
}

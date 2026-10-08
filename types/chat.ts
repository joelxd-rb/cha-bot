// ============================================================
// ARCHIVO: types/chat.ts
// PROPÓSITO: Definición de tipos e interfaces TypeScript
// ============================================================
// Este archivo centraliza TODAS las estructuras de datos que
// fluyen entre el frontend (React) y el backend (API Route).
// Usar TypeScript nos da:
//   - Autocompletado en el IDE
//   - Detección de errores en tiempo de compilación
//   - Documentación implícita del contrato de datos
// ============================================================

/**
 * Role — Define quién envía el mensaje.
 * - 'user': El estudiante/usuario que escribe en el chat
 * - 'model': La respuesta generada por Gemini AI
 * - 'system': Mensajes internos del sistema (no enviados a la API)
 */
export type Role = 'user' | 'model' | 'system';

/**
 * Message — Representa un único mensaje en la conversación.
 * Cada mensaje tiene un identificador único, un rol, contenido
 * de texto y una marca de tiempo para mostrar la hora.
 */
export interface Message {
  id: string;           // Identificador único (usamos Date.now())
  role: Role;           // Quién envió el mensaje
  content: string;      // El texto del mensaje
  timestamp: Date;      // Cuándo se envió (para mostrar hora en la UI)
}

/**
 * ModelConfig — Configuración de hiperparámetros del modelo LLM.
 * Estos valores se envían al backend para controlar CÓMO responde Gemini.
 *
 * - modelName: Qué modelo usar (gemini-2.5-flash, gemini-1.5-pro, etc.)
 * - systemInstruction: El "System Prompt" que define el rol/personalidad
 * - temperature: Controla la creatividad (0=determinista, 2=muy creativo)
 * - maxOutputTokens: Límite máximo de tokens en la respuesta
 * - topP: Nucleus sampling — filtra tokens por probabilidad acumulada
 * - topK: Limita la selección a los K tokens más probables
 */
export interface ModelConfig {
  modelName: string;           // Nombre del modelo de Gemini a usar
  systemInstruction: string;   // Instrucciones de sistema/contexto/rol
  temperature: number;         // 0.0 a 2.0 — creatividad de la respuesta
  maxOutputTokens: number;     // 64 a 4096 — longitud máxima de respuesta
  topP: number;                // 0.0 a 1.0 — nucleus sampling
  topK: number;                // 1 a 100 — top-k sampling
}

/**
 * ChatRequestBody — Estructura del cuerpo JSON que el frontend
 * envía al endpoint POST /api/chat.
 * Contiene el historial de mensajes (solo user/model) y la
 * configuración actual del modelo seleccionada por el usuario.
 */
export interface ChatRequestBody {
  messages: Array<{
    role: 'user' | 'model';    // Solo roles válidos para la API de Gemini
    content: string;           // Contenido textual del mensaje
  }>;
  config: ModelConfig;         // Configuración de hiperparámetros
}

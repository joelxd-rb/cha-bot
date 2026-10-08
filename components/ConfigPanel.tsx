// ============================================================
// ARCHIVO: components/ConfigPanel.tsx
// PROPÓSITO: Panel lateral de configuración de hiperparámetros del LLM
// ============================================================
// Este componente permite al usuario ajustar en TIEMPO REAL
// cómo responde el modelo de IA. Cada slider/selector modifica
// un parámetro que se envía al backend en cada petición.
//
// 'use client' — Directiva obligatoria de Next.js App Router.
// Indica que este componente se ejecuta en el NAVEGADOR (cliente),
// ya que necesita interactividad (estados, eventos, onChange).
// ============================================================
'use client';

import React from 'react';
// Importamos el tipo ModelConfig para tipar las props correctamente
import { ModelConfig } from '@/types/chat';

// Iconos de lucide-react — Librería de iconos SVG limpios y modernos
import { Settings, Sliders, Sparkles, BookOpen } from 'lucide-react';

// ============================================================
// INTERFAZ DE PROPS — Define qué recibe este componente del padre
// ============================================================
interface ConfigPanelProps {
  config: ModelConfig;                        // Estado actual de la configuración
  onChange: (newConfig: ModelConfig) => void;  // Función para actualizar la configuración
}

// ============================================================
// COMPONENTE ConfigPanel
// ============================================================
// React.FC<ConfigPanelProps> — Componente funcional tipado con TypeScript
// Recibe { config, onChange } del componente padre (page.tsx)
export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onChange }) => {

  // ----------------------------------------------------------
  // handleChange — Función genérica para actualizar cualquier campo
  // ----------------------------------------------------------
  // Usa "keyof ModelConfig" para aceptar cualquier propiedad válida
  // del objeto config (modelName, temperature, etc.)
  // El spread operator {...config} copia todos los valores actuales
  // y [key]: value sobrescribe solo el campo que cambió.
  const handleChange = (key: keyof ModelConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    // aside — Semántica HTML5 para contenido complementario/lateral
    // Clases Tailwind CSS:
    //   w-full lg:w-80 → Ancho completo en móvil, 320px en desktop
    //   bg-slate-900   → Fondo oscuro
    //   border-l       → Borde izquierdo para separación visual
    //   overflow-y-auto → Scroll vertical si el contenido excede la altura
    <aside className="w-full lg:w-80 bg-slate-900 border-l border-slate-800 p-5 flex flex-col gap-6 text-slate-200 overflow-y-auto h-full">

      {/* ======== ENCABEZADO DEL PANEL ======== */}
      {/* Título con icono de engranaje para identificar la sección */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <Settings className="w-5 h-5 text-indigo-400" />
        <h2 className="font-semibold text-lg text-white">
          Parámetros del Modelo
        </h2>
      </div>

      {/* ======== SELECTOR DE MODELO ======== */}
      {/* Permite elegir entre diferentes modelos de Gemini.
          Cada modelo tiene diferentes capacidades:
          - gemini-2.5-flash: Rápido y equilibrado (recomendado)
          - gemini-1.5-flash: Versión anterior, aún funcional
          - gemini-1.5-pro: Mayor capacidad de razonamiento, más lento */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium flex items-center gap-1.5 text-slate-300">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Modelo
        </label>
        <select
          value={config.modelName}
          onChange={(e) => handleChange('modelName', e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="gemini-3.8-flash">
            Gemini 3.8 Flash (Rápido & Equilibrado)
          </option>
        </select>
      </div>

      {/* ======== SYSTEM PROMPT / CONTEXTO ======== */}
      {/* El System Instruction es una de las herramientas más poderosas.
          Le dice al modelo QUIÉN ES y CÓMO debe comportarse.
          Ejemplos:
          - "Eres un tutor de TypeScript que solo responde en español"
          - "Responde únicamente en formato JSON"
          - "Eres un experto en ciberseguridad. Sé conciso." */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            System Prompt (Contexto)
          </span>
        </label>
        <p className="text-xs text-slate-400">
          Define el rol, tono y restricciones del asistente.
        </p>
        <textarea
          rows={4}
          value={config.systemInstruction}
          onChange={(e) => handleChange('systemInstruction', e.target.value)}
          placeholder="Ej: Eres un tutor universitario de desarrollo de software especializado en TypeScript..."
          className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* ======== SLIDER DE TEMPERATURA ======== */}
      {/* TEMPERATURA — Concepto clave de LLMs
          Controla la "creatividad" o "aleatoriedad" de las respuestas:

          0.0 → Respuestas deterministas, siempre la misma respuesta.
                Ideal para: código, datos factuales, matemáticas.

          1.0 → Balance entre creatividad y coherencia.
                Ideal para: conversaciones, tutorías, explicaciones.

          2.0 → Máxima creatividad, respuestas muy variadas.
                Ideal para: brainstorming, escritura creativa, ideas.

          Técnicamente: La temperatura escala los logits (probabilidades)
          antes del sampling. Temperatura alta = distribución más uniforme. */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-sm">
          <label className="font-medium text-slate-300">
            Temperatura (Creatividad)
          </label>
          {/* Muestra el valor actual con fuente monoespaciada */}
          <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
            {config.temperature}
          </span>
        </div>
        {/* input type="range" — Slider nativo de HTML */}
        <input
          type="range"
          min="0.0"
          max="2.0"
          step="0.1"
          value={config.temperature}
          onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
          className="accent-indigo-500 w-full cursor-pointer"
        />
        {/* Etiquetas descriptivas debajo del slider */}
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>0.0 (Preciso/Lógico)</span>
          <span>1.0 (Balanceado)</span>
          <span>2.0 (Creativo)</span>
        </div>
      </div>

      {/* ======== SLIDER DE MAX OUTPUT TOKENS ======== */}
      {/* MAX OUTPUT TOKENS — Limita la longitud de la respuesta.
          Un "token" es una unidad de texto (≈ 4 caracteres en inglés).

          64 tokens  ≈ 1-2 oraciones cortas
          1024 tokens ≈ un párrafo largo
          4096 tokens ≈ varias páginas de texto

          IMPORTANTE: Este es un LÍMITE MÁXIMO, no un mínimo.
          El modelo puede responder con menos tokens si la respuesta
          es naturalmente corta. Pero NUNCA excederá este límite. */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-sm">
          <label className="font-medium text-slate-300">
            Límite de Tokens (Salida)
          </label>
          <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
            {config.maxOutputTokens}
          </span>
        </div>
        <input
          type="range"
          min="64"
          max="4096"
          step="64"
          value={config.maxOutputTokens}
          onChange={(e) =>
            handleChange('maxOutputTokens', parseInt(e.target.value, 10))
          }
          className="accent-indigo-500 w-full cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>64 (Corto)</span>
          <span>2048 (Medio)</span>
          <span>4096 (Extenso)</span>
        </div>
      </div>

      {/* ======== SLIDER DE TOP-P (NUCLEUS SAMPLING) ======== */}
      {/* TOP-P — Nucleus Sampling
          Controla la diversidad de tokens considerados para la respuesta.

          Funciona así: ordena todos los tokens posibles por probabilidad
          y selecciona los que sumen hasta el valor de Top-P.

          topP = 0.95 → Considera tokens que sumen 95% de probabilidad.
          topP = 0.50 → Solo considera los tokens más probables (50%).
          topP = 1.00 → Considera TODOS los tokens (máxima diversidad).

          Se usa EN COMBINACIÓN con la temperatura para un control fino. */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-sm">
          <label className="font-medium text-slate-300">
            Top-P (Nucleus Sampling)
          </label>
          <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
            {config.topP}
          </span>
        </div>
        <input
          type="range"
          min="0.0"
          max="1.0"
          step="0.05"
          value={config.topP}
          onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
          className="accent-indigo-500 w-full cursor-pointer"
        />
      </div>
    </aside>
  );
};

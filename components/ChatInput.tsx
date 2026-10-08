// ============================================================
// ARCHIVO: components/ChatInput.tsx
// PROPÓSITO: Campo de texto y botón de envío de mensajes
// ============================================================
// Este componente maneja la entrada de texto del usuario.
// Funcionalidades:
//   - Envío con Enter (sin Shift)
//   - Salto de línea con Shift + Enter
//   - Botón de envío con icono
//   - Animación de carga mientras espera respuesta
//   - Deshabilitado cuando está procesando
//
// 'use client' — Necesario porque usa useState (estado local)
// y eventos del DOM (onChange, onKeyDown, onClick).
// ============================================================
'use client';

import React, { useState, KeyboardEvent } from 'react';
// Send — Icono de avión de papel para el botón de enviar
// Loader2 — Icono de spinner para el estado de carga
import { Send, Loader2 } from 'lucide-react';

// ============================================================
// INTERFAZ DE PROPS
// ============================================================
interface ChatInputProps {
  onSendMessage: (content: string) => void; // Callback que envía el mensaje al padre
  isLoading: boolean;                       // ¿Se está procesando una petición?
}

// ============================================================
// COMPONENTE ChatInput
// ============================================================
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
}) => {
  // Estado local para el texto que el usuario está escribiendo.
  // useState('') inicializa con un string vacío.
  const [input, setInput] = useState('');

  // ----------------------------------------------------------
  // handleSend — Envía el mensaje al padre y limpia el campo
  // ----------------------------------------------------------
  // trim() elimina espacios en blanco al inicio y final.
  // Solo envía si hay texto Y no está cargando.
  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim()); // Llama la función del padre
      setInput('');                 // Limpia el campo de texto
    }
  };

  // ----------------------------------------------------------
  // handleKeyDown — Detecta teclas especiales
  // ----------------------------------------------------------
  // Enter (sin Shift): Envía el mensaje
  // Shift + Enter: Permite salto de línea normal en el textarea
  // e.preventDefault() evita que Enter cree una nueva línea
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Evita el salto de línea por defecto
      handleSend();        // Envía el mensaje
    }
  };

  return (
    // Contenedor inferior fijo con borde superior
    // flex items-end: alinea el botón al fondo del textarea
    <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-end gap-2">

      {/* ======== CAMPO DE TEXTO (TEXTAREA) ======== */}
      {/* textarea en vez de input para soportar múltiples líneas.
          rows={2}: altura inicial de 2 líneas.
          resize-none: desactiva el redimensionamiento manual.
          disabled={isLoading}: bloquea la escritura mientras carga. */}
      <textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)} // Actualiza el estado con cada tecla
        onKeyDown={handleKeyDown}                   // Detecta Enter para enviar
        placeholder="Escribe tu consulta aquí... (Shift + Enter para salto de línea)"
        disabled={isLoading}
        className="flex-1 bg-slate-800 text-slate-100 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
      />

      {/* ======== BOTÓN DE ENVIAR ======== */}
      {/* Condiciones de deshabilitado:
          - !input.trim(): no hay texto escrito
          - isLoading: ya hay una petición en proceso
          Muestra spinner (Loader2) cuando carga, flecha (Send) cuando está listo */}
      <button
        onClick={handleSend}
        disabled={!input.trim() || isLoading}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white p-3 rounded-xl transition-all flex items-center justify-center h-12 w-12"
      >
        {/* Renderizado condicional:
            - Si isLoading → muestra spinner con animación CSS (animate-spin)
            - Si no → muestra icono de enviar */}
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
      </button>
    </div>
  );
};

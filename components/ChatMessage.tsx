// ============================================================
// ARCHIVO: components/ChatMessage.tsx
// PROPÓSITO: Renderiza cada burbuja de mensaje en la conversación
// ============================================================
// Este componente recibe un objeto Message y lo muestra como una
// burbuja de chat estilizada. Diferencia visualmente entre:
//   - Mensajes del usuario (derecha, color indigo)
//   - Mensajes del modelo/bot (izquierda, color slate oscuro)
//
// NO necesita 'use client' porque no tiene estado ni efectos.
// Es un componente de presentación puro (solo renderiza props).
// ============================================================

import React from 'react';
// Importamos el tipo Message para tipar las props
import { Message } from '@/types/chat';
// Iconos para el avatar del usuario y del bot
import { User, Bot } from 'lucide-react';

// ============================================================
// INTERFAZ DE PROPS
// ============================================================
interface ChatMessageProps {
  message: Message; // El mensaje a renderizar
}

// ============================================================
// COMPONENTE ChatMessage
// ============================================================
export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  // Determinamos si el mensaje es del usuario para aplicar
  // estilos diferentes (alineación, colores, posición del avatar)
  const isUser = message.role === 'user';

  return (
    // Contenedor flex — Alinea a la derecha (usuario) o izquierda (bot)
    // justify-end: empuja el contenido a la derecha
    // justify-start: empuja el contenido a la izquierda
    <div
      className={`flex gap-3 my-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* ======== AVATAR DEL BOT (solo si NO es usuario) ======== */}
      {/* Se muestra a la izquierda del mensaje del bot.
          flex-shrink-0 evita que el avatar se comprima. */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white shadow-md">
          <Bot className="w-4 h-4" />
        </div>
      )}

      {/* ======== BURBUJA DEL MENSAJE ======== */}
      {/* Estilos condicionales según el rol:
          - Usuario: fondo indigo, texto blanco, esquina superior derecha recta
          - Bot: fondo slate oscuro, borde sutil, esquina superior izquierda recta
          max-w-[80%] limita el ancho al 80% para no ocupar toda la pantalla */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-none'       // Estilo usuario
            : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none' // Estilo bot
        }`}
      >
        {/* Nombre del remitente */}
        <p className="text-xs font-semibold mb-1 opacity-70">
          {isUser ? 'Tú (Estudiante)' : 'Gemini AI'}
        </p>

        {/* Contenido del mensaje */}
        {/* whitespace-pre-wrap: respeta saltos de línea (\n) del texto
            leading-relaxed: interlineado más cómodo para lectura */}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>

        {/* Hora del mensaje (formato HH:MM) */}
        {/* toLocaleTimeString con opciones muestra solo hora y minutos */}
        <span className="block text-[10px] mt-2 opacity-50 text-right">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* ======== AVATAR DEL USUARIO (solo si ES usuario) ======== */}
      {/* Se muestra a la derecha del mensaje del usuario */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 text-slate-200">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};

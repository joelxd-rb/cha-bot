// ============================================================
// ARCHIVO: app/page.tsx
// PROPÓSITO: Página principal — Integra todos los componentes
// ============================================================
// Esta es la vista principal del chatbot. Aquí se:
//   1. Maneja el ESTADO global de la conversación (messages)
//   2. Maneja el ESTADO de la configuración del modelo (config)
//   3. Orquesta la comunicación con el backend (/api/chat)
//   4. Ensambla todos los componentes visuales
//
// 'use client' — Obligatorio porque usa hooks de React:
//   useState: para manejar estados
//   useRef: para referencia al scroll
//   useEffect: para auto-scroll cuando llegan mensajes
// ============================================================
'use client';

import React, { useState, useRef, useEffect } from 'react';
// Importamos nuestros tipos definidos en types/chat.ts
import { Message, ModelConfig } from '@/types/chat';
// Importamos los 3 componentes que creamos
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { ConfigPanel } from '@/components/ConfigPanel';
// Iconos para el header
import { Bot, Trash2 } from 'lucide-react';

// ============================================================
// COMPONENTE PRINCIPAL — ChatPage
// ============================================================
// export default → Next.js usa el export default de page.tsx
// como el componente que se renderiza en la ruta "/" (raíz).
export default function ChatPage() {

  // ----------------------------------------------------------
  // ESTADO 1: messages — Historial de la conversación
  // ----------------------------------------------------------
  // useState<Message[]> — Array tipado de mensajes.
  // Inicializado con un mensaje de bienvenida del bot.
  // Inicializamos con array vacío para evitar errores de pre-render
  // en Next.js 16+ (new Date() no se puede evaluar durante build).
  // El mensaje de bienvenida se agrega en el useEffect de abajo.
  const [messages, setMessages] = useState<Message[]>([]);

  // ----------------------------------------------------------
  // ESTADO 2: isLoading — Indica si hay una petición en curso
  // ----------------------------------------------------------
  // Se usa para:
  //   - Mostrar el spinner de carga
  //   - Deshabilitar el campo de texto
  //   - Mostrar la animación de "escribiendo..."
  const [isLoading, setIsLoading] = useState(false);

  // ----------------------------------------------------------
  // ESTADO 3: config — Configuración actual del modelo
  // ----------------------------------------------------------
  // Estos son los valores INICIALES por defecto.
  // El usuario puede cambiarlos en tiempo real desde el ConfigPanel.
  const [config, setConfig] = useState<ModelConfig>({
    modelName: 'gemini-3.8-flash',        // Modelo rápido y equilibrado
    systemInstruction:                      // System Prompt por defecto
      'Eres un tutor amigable y experto en ingeniería de software y programación.',
    temperature: 0.7,                       // Balance creatividad/precisión
    maxOutputTokens: 1024,                  // ~2-3 párrafos de respuesta
    topP: 0.95,                             // Nucleus sampling estándar
    topK: 40,                               // Top-K estándar
  });

  // ----------------------------------------------------------
  // useEffect de INICIALIZACIÓN — Mensaje de bienvenida
  // ----------------------------------------------------------
  // Se ejecuta UNA SOLA VEZ cuando el componente se monta ([] vacío).
  // Usamos useEffect para que new Date() se evalúe solo en el cliente,
  // evitando el error de pre-render de Next.js 16.
  useEffect(() => {
    setMessages([
      {
        id: '1',
        role: 'model',
        content:
          '¡Hola! Soy tu asistente basado en Gemini. Puedes ajustar mi contexto, longitud de respuesta y temperatura en el panel lateral.',
        timestamp: new Date(),
      },
    ]);
  }, []);

  // ----------------------------------------------------------
  // REF: messagesEndRef — Referencia para auto-scroll
  // ----------------------------------------------------------
  // useRef crea una referencia a un elemento del DOM.
  // La usamos para hacer scroll automático al último mensaje.
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------------
  // scrollToBottom — Desplaza la vista al último mensaje
  // ----------------------------------------------------------
  // scrollIntoView con behavior: 'smooth' crea una animación suave.
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ----------------------------------------------------------
  // useEffect — Se ejecuta cada vez que cambian los mensajes
  // ----------------------------------------------------------
  // Dependencias: [messages, isLoading]
  // Cada vez que se agrega un mensaje o cambia el estado de carga,
  // hacemos scroll hacia abajo para que el usuario siempre vea
  // el mensaje más reciente.
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // ----------------------------------------------------------
  // handleSendMessage — Función principal de envío de mensajes
  // ----------------------------------------------------------
  // Flujo completo:
  // 1. Crea el mensaje del usuario y lo agrega al historial
  // 2. Activa el estado de carga
  // 3. Prepara el payload (filtra solo mensajes user/model)
  // 4. Envía POST a /api/chat con el historial + configuración
  // 5. Recibe la respuesta y la agrega como mensaje del bot
  // 6. En caso de error, muestra el error como mensaje del bot
  const handleSendMessage = async (text: string) => {
    // PASO 1: Crear el objeto de mensaje del usuario
    const userMessage: Message = {
      id: Date.now().toString(), // ID único basado en timestamp
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    // Agregamos el mensaje del usuario al historial existente
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true); // Activamos la animación de carga

    try {
      // PASO 2: Preparar el payload para el backend
      // Filtramos SOLO mensajes de tipo 'user' y 'model'
      // (excluimos 'system' porque no se envían a la API de Gemini)
      const payloadMessages = newMessages
        .filter((m) => m.role === 'user' || m.role === 'model')
        .map((m) => ({
          role: m.role as 'user' | 'model', // TypeScript cast seguro
          content: m.content,
        }));

      // PASO 3: Enviar la petición POST al backend
      // fetch() es la API nativa del navegador para hacer peticiones HTTP.
      // '/api/chat' es una ruta relativa que Next.js resuelve internamente.
      const res = await fetch('/api/chat', {
        method: 'POST',                                // Método HTTP
        headers: { 'Content-Type': 'application/json' }, // Tipo de contenido
        body: JSON.stringify({                          // Cuerpo de la petición
          messages: payloadMessages,  // Historial de la conversación
          config: config,             // Configuración actual del modelo
        }),
      });

      // PASO 4: Parsear la respuesta JSON del servidor
      const data = await res.json();

      // Verificar si la respuesta fue exitosa (status 200-299)
      if (!res.ok) {
        throw new Error(data.error || 'Error al comunicarse con el servidor');
      }

      // PASO 5: Crear el mensaje de respuesta del bot
      const botMessage: Message = {
        id: (Date.now() + 1).toString(), // +1 para evitar ID duplicado
        role: 'model',
        content: data.text,              // Texto de respuesta de Gemini
        timestamp: new Date(),
      };

      // Agregamos la respuesta al historial
      // Usamos la función callback de setMessages para acceder
      // al estado más reciente (patrón funcional de setState)
      setMessages((prev) => [...prev, botMessage]);

    } catch (error: any) {
      // MANEJO DE ERRORES: Mostramos el error como mensaje del bot
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `⚠️ Error: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);

    } finally {
      // finally se ejecuta SIEMPRE, haya error o no.
      // Desactivamos el estado de carga.
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------------
  // handleClearHistory — Limpia toda la conversación
  // ----------------------------------------------------------
  const handleClearHistory = () => {
    setMessages([]); // Vaciamos el array de mensajes
  };

  // ============================================================
  // RENDERIZADO — Estructura visual de la página
  // ============================================================
  return (
    // Contenedor principal — Ocupa toda la pantalla (h-screen w-screen)
    // flex-col en móvil, flex-row (lg:flex-row) en desktop
    // Esto hace que el ConfigPanel aparezca debajo en móvil y
    // al lado derecho en pantallas grandes.
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-slate-950 overflow-hidden font-sans">

      {/* ======== ÁREA PRINCIPAL DE CHAT ======== */}
      {/* flex-1: Ocupa todo el espacio disponible (menos el panel lateral) */}
      <div className="flex-1 flex flex-col h-full">

        {/* ======== HEADER / BARRA SUPERIOR ======== */}
        {/* Muestra el nombre del bot y un botón para limpiar el chat */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 px-6 flex items-center justify-between backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Icono del bot con fondo semi-transparente */}
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-base">
                Gemini Software Dev Bot
              </h1>
              <p className="text-xs text-slate-400">
                Next.js 15 + Google GenAI SDK
              </p>
            </div>
          </div>

          {/* Botón para limpiar la conversación */}
          <button
            onClick={handleClearHistory}
            title="Limpiar Conversación"
            className="text-slate-400 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </header>

        {/* ======== LISTA DE MENSAJES ======== */}
        {/* overflow-y-auto: permite scroll vertical cuando hay muchos mensajes
            px-4 lg:px-12: padding lateral responsivo */}
        <main className="flex-1 overflow-y-auto px-4 lg:px-12 py-6">
          {/* Iteramos sobre el array de mensajes y renderizamos
              un componente ChatMessage por cada uno.
              key={msg.id} es obligatorio en React para listas. */}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* ======== ANIMACIÓN DE "ESCRIBIENDO..." ======== */}
          {/* Se muestra solo cuando isLoading es true.
              Tres puntos con animación bounce escalonada
              (animation-delay crea el efecto de onda). */}
          {isLoading && (
            <div className="flex gap-3 my-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-none px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}

          {/* Elemento invisible al final para hacer scroll automático */}
          <div ref={messagesEndRef} />
        </main>

        {/* ======== BARRA DE ENTRADA DE TEXTO ======== */}
        {/* Pasamos handleSendMessage como callback y el estado de carga */}
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>

      {/* ======== PANEL LATERAL DE CONFIGURACIÓN ======== */}
      {/* Pasamos el estado config y la función setConfig.
          Cada cambio en el panel se refleja inmediatamente en el estado. */}
      <ConfigPanel config={config} onChange={setConfig} />
    </div>
  );
}

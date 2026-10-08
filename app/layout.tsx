// ============================================================
// ARCHIVO: app/layout.tsx
// PROPÓSITO: Layout raíz de la aplicación Next.js
// ============================================================
// Este archivo define la estructura HTML base que envuelve
// TODAS las páginas de la aplicación. Es como el "esqueleto"
// que contiene el <html>, <head> y <body>.
//
// En Next.js App Router, layout.tsx es OBLIGATORIO en app/.
// Se ejecuta en el SERVIDOR por defecto (Server Component).
// ============================================================

import type { Metadata } from 'next';
// Importamos los estilos globales (Tailwind CSS + customizaciones)
import './globals.css';

// ============================================================
// METADATA — Configuración SEO y del documento HTML
// ============================================================
// Next.js usa este objeto para generar automáticamente las
// etiquetas <title> y <meta> en el <head> del HTML.
export const metadata: Metadata = {
  title: 'Gemini ChatBot — Laboratorio LLM',     // Título en la pestaña del navegador
  description:
    'Chatbot inteligente con Next.js y Google Gemini AI. Práctica de parámetros LLM.', // Meta descripción para SEO
};

// ============================================================
// COMPONENTE RootLayout — Envuelve toda la aplicación
// ============================================================
// children: React.ReactNode — Representa el contenido de cada
// página (page.tsx) que se renderiza DENTRO de este layout.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="es" — Idioma del documento (importante para accesibilidad)
    <html lang="es">
      {/* antialiased — Clase de Tailwind que suaviza las fuentes.
          bg-slate-950 — Color de fondo oscuro base.
          text-white — Color de texto base blanco. */}
      <body className="antialiased bg-slate-950 text-white">
        {/* Aquí se renderiza el contenido de page.tsx */}
        {children}
      </body>
    </html>
  );
}

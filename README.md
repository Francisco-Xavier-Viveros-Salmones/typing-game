# 🏇💨 CABALLOS — Real-Time Multiplayer Typing Racer

<div align="center">

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Durable Objects](https://img.shields.io/badge/Durable_Objects-SQLite_In--Memory-orange?style=for-the-badge&logo=cloudflare)
![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-121%20Pass%20%2F%200%20Fail-success?style=for-the-badge)

**Carreras de mecanografía multijugador en tiempo real con arquitectura Server-Authoritative determinista sobre Cloudflare Edge.**

[Características](#-características-principales) •
[Arquitectura](#-arquitectura-del-sistema) •
[Stack](#-stack-tecnológico) •
[Inicio Rápido](#-inicio-rápido) •
[Scripts & Testing](#-scripts-y-smoke-tests) •
[Roadmap](#-roadmap)

</div>

---

## ⚡ ¿Qué es Caballos?

**Caballos** es un juego competitivo de mecanografía multijugador diseñado bajo un principio inquebrantable: **el cliente no reporta resultados, reporta pulsaciones**.

A diferencia de la mayoría de juegos de tipeo web donde el navegador calcula localmente el WPM y avisa al servidor quién ganó (dejando la puerta abierta a trampas y desincronizaciones), en **Caballos** el cliente y el servidor ejecutan la **misma máquina de estados pura y determinista**. El cliente envía un flujo comprimido de eventos de pulsación (`[dt, code, ...]`) y el backend en **Cloudflare Durable Objects** valida, reproduce y arbitra el estado oficial de la carrera en tiempo real.

---

## 🚀 Características Principales

- **🎮 Motor de Tecleo Server-Authoritative**:
  - Cero trampas de cliente. Si una pulsación no cuadra matemáticamente con el estado del servidor, es rechazada.
  - Predicción local en cliente para latencia percibida de 0 ms con reconciliación determinista.
- **🏇 Mecánicas de Carrera Avanzadas**:
  - **Nitro**: Bonificación de velocidad al encadenar 3 palabras consecutivas sin un solo error.
  - **Tropiezo**: Penalización de congelamiento temporal al acumular 3 errores en la misma palabra.
  - **Muerte Súbita & Modo Vidas**: Modos de supervivencia donde el mínimo fallo cuesta vidas o la eliminación directa.
- **🏆 Sistema Ranked & ELO Dinámico**:
  - Matchmaking competitivo en tiempo real orquestado por un Durable Object dedicado (`Matchmaker`).
  - Algoritmo ELO adaptativo con factor K variable según partidas de colocación, compresión de temporadas y soporte multijugador simultáneo (hasta 6 jinetes por sala).
  - Sistema de puntuación oficial estilo Fórmula 1 puro e idempotente.
- **👻 Replays Fantasma Ultra-Comprimidos (PB & Records)**:
  - Códec binario propio basado en *Varints* que comprime cientos de pulsaciones en unos pocos bytes para almacenar récords personales y mundiales en Cloudflare D1.
  - Modo Solo para competir directamente contra el fantasma de tu mejor marca o el récord de la frase.
- **🛡️ Seguridad & Sesiones en el Edge**:
  - Autenticación mediante cookies `HttpOnly` y `SameSite` validadas en el Worker antes de elevar la conexión a WebSocket.
  - Hash seguro de contraseñas con PBKDF2 (`crypto.subtle`) y validación estricta de nombres y contraseñas.
- **🧪 +120 Tests Unitarios y de Propiedades**:
  - Verificación rigurosa de determinismo, idempotencia, resiliencia ante NaNs, empates deterministas y fuzzing con entradas aleatorias.

---

## 🏗️ Arquitectura del Sistema

```
                        ┌─────────────────────────────────────────┐
                        │            Navegador Web                │
                        │  (React 19 + InputRouter + AudioEngine) │
                        └────────────────────┬────────────────────┘
                                             │
                       HTTPS / API Fetch     │     WSS (WebSocket)
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │      Cloudflare Edge Worker (Entry)     │
                        │    - Auth / Session Check (Origin)      │
                        │    - D1 Database Routing                │
                        └──────────────┬──────────────────┬───────┘
                                       │                  │
                Binding RPC            ▼                  ▼            Binding RPC
       ┌────────────────────────────────────────┐   ┌─────────────────────────────────┐
       │     Durable Object: Matchmaker         │   │    Durable Object: RaceRoom     │
       │  - Cola Ranked en memoria + SQLite     │   │  - Servidor autoritativo de     │
       │  - Asignación de salas por ELO         │   │    carreras (1-6 jugadores)    │
       │  - Control de timeouts                 │   │  - SQLite síncrono para estado  │
       └────────────────────────────────────────┘   └────────────────┬────────────────┘
                                                                     │
                                                                     ▼ Persistencia
                                                    ┌─────────────────────────────────┐
                                                    │     Cloudflare D1 Database      │
                                                    │  - Cuentas, Récords, Fantasmas  │
                                                    │  - Frases, Historial de Ranked  │
                                                    └─────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Runtime & Tooling** | [Bun](https://bun.sh/) | Bundler ultrarrápido, runner de tests y scripts |
| **Edge Compute** | [Cloudflare Workers](https://workers.cloudflare.com/) | Enrutamiento HTTP, validación de sesiones y assets |
| **Stateful Edge** | [Durable Objects](https://developers.cloudflare.com/durable-objects/) + SQLite | WebSockets, salas de carreras en tiempo real y matchmaking |
| **Base de Datos** | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Persistencia global relacional (SQLite distribuido) |
| **Frontend** | [React 19](https://react.dev/) + [SWR](https://swr.vercel.app/) | Interfaz declarativa, gestión de estado y pantallas de carrera |
| **Iconografía** | [@phosphor-icons/react](https://phosphoricons.com/) | Iconos vectoriales ligeros y consistentes |
| **Audio** | Web Audio API | Síntesis sonora de pulsaciones, errores, nitro y cuenta regresiva |

---

## 📂 Estructura del Código

```
typing-game/
├── db/
│   ├── migrations/         # Migraciones SQL para Cloudflare D1
│   └── seed/               # Catálogo inicial de frases clasificadas
├── public/                 # Assets estáticos y bundles compilados
├── scripts/                # Scripts de testeo de carga, smoke tests y seeds
│   ├── generate-seed.ts    # Generación de seed SQL de frases
│   ├── join-as.ts          # Bot CLI para unirse a una sala
│   ├── smoke-race.ts       # Simulación de carrera completa de bots
│   └── smoke-disconnect.ts # Test de desconexiones y abandonos
├── src/
│   ├── client/             # Frontend React 19
│   │   ├── components/     # Pista (Track), Chat, Iconos, Créditos
│   │   ├── engine/         # InputRouter, RaceSocket, TypingEngine, Audio
│   │   ├── screens/        # Home, Lobby, Race, Results, Solo, Ranked, Boards
│   │   └── state/          # Hooks reactivos (useRoom)
│   ├── shared/             # Lógica pura compartida (Isomórfica)
│   │   ├── elo.ts          # Algoritmo ELO y cálculo de deltas
│   │   ├── ghost.ts        # Códec binario Varint de replays
│   │   ├── protocol.ts     # Protocolo formal de mensajes WebSocket
│   │   ├── scoring.ts      # Tabla de puntuación estilo F1
│   │   ├── typing-rules.ts # Máquina de estados de tecleo determinista
│   │   └── wpm.ts          # Cálculo de WPM y precisión normalizada
│   └── worker/             # Backend Cloudflare Worker & Durable Objects
│       ├── do/             # RaceRoom.ts y Matchmaker.ts
│       ├── jobs/           # Tareas programadas (cron de temporadas y GC)
│       ├── lib/            # Criptografía PBKDF2, sesiones y helpers HTTP
│       └── routes/         # Endpoints de Auth, Boards, Solo, Ranked
├── tests/                  # Suite de pruebas unitarias y de propiedades
├── TODO.md                 # Roadmap y backlog del proyecto
├── wrangler.jsonc          # Configuración de Cloudflare Workers, DO y D1
└── package.json
```

---

## ⚡ Inicio Rápido

### Prerrequisitos

- [Bun](https://bun.sh/) (v1.1+ recomendado)
- [Node.js](https://nodejs.org/) & [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

### 1. Clonar e Instalar Dependencias

```bash
git clone https://github.com/Francisco-Xavier-Viveros-Salmones/typing-game.git
cd typing-game
bun install
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo para el entorno local:

```bash
cp .dev.vars.example .dev.vars
```

*(Configura `SESSION_SECRET` y opcionalmente `GEMINI_API_KEY` para la generación con IA)*.

### 3. Aplicar Migraciones en D1 Local

```bash
bun run migrate:local
```

### 4. Iniciar Servidor de Desarrollo

```bash
bun run dev
```

El cliente React se compilará automáticamente en `public/app.js` y Wrangler levantará el Worker local con Durable Objects y D1 en `http://localhost:8787`.

---

## 🧪 Tests y Smoke Tests

Ejecutar la suite completa de más de 120 tests automatizados:

```bash
bun test
```

### Simulación de Carreras con Bots

Puedes levantar bots automáticos contra tu sala local para probar el comportamiento en tiempo real:

```bash
# Simular una carrera con 4 bots compitiendo
bun run scripts/smoke-race.ts

# Probar resiliencia ante desconexiones intempestivas
bun run scripts/smoke-disconnect.ts
```

---

## 🗺️ Roadmap

Consulta el archivo [TODO.md](file:///home/code4u/Documents/code/typing-game/TODO.md) para ver la lista completa y detallada de mejoras planificadas:
- 🧠 Integración de Gemini API para retos diarios y modo código.
- 🛡️ Heurísticas de tecleo e IKI (Inter-Keystroke Intervals) anti-macro.
- 📱 Soporte avanzado para teclados móviles virtuales (IME).
- 🎮 Soundpacks mecánicos (Cherry Blue, Brown, Red) y efectos de partículas.
- 🌐 Deep links directos a salas y reconexión transparente.

---

## 📄 Licencia

Desarrollado con pasión para jinetes del teclado. Código privado / MIT.

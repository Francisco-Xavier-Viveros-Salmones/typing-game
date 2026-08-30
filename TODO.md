# 📌 CABALLOS — Roadmap & TODO Master

Roadmap y lista de tareas pendientes para llevar **Caballos** al siguiente nivel en infraestructura, jugabilidad, inteligencia artificial, seguridad y experiencia de usuario.

---

## 🎯 Estado General y Prioridades

- [x] **Núcleo Server-Authoritative Determinista** (Validación de pulsaciones, cero trampas por cliente)
- [x] **Durable Objects con SQLite Síncrono** (`RaceRoom`, `Matchmaker`)
- [x] **Sistema de Ranked & ELO Adaptativo** (Factor K dinámico, temporadas y compresión de rating)
- [x] **Códec Binario de Grabación Fantasma** (Varints compactos para PB y récords)
- [x] **Suite de Tests de Propiedades e Invariantes** (+120 tests con Bun)
- [ ] **Fase 1: Inteligencia Artificial & Generación de Contenido (Gemini API)**
- [ ] **Fase 2: Anti-Cheat Estadístico & Detección de Bots**
- [ ] **Fase 3: Soporte Móvil Robusto & Entrada IME**
- [ ] **Fase 4: Game Feel, Soundpacks & Pulido Visual**
- [ ] **Fase 5: Networking Resiliente, Invitaciones & Modo Espectador**
- [ ] **Fase 6: Nuevos Modos de Juego & Métricas Avanzadas**

---

## 🧠 1. Inteligencia Artificial & Contenido Dinámico (Gemini API)

Aprovechar el binding `GEMINI_API_KEY` en Cloudflare Workers para enriquecer el catálogo de textos de forma infinita y adaptativa.

- [ ] **Cron Diario de Retos Temáticos**
  - [ ] Implementar tarea programada (`scheduled`) que consulte Gemini API para generar el "Reto del Día".
  - [ ] Categorización automática: Noticias, citas literarias, historia, ciencia, trabalenguas y cultura pop.
  - [ ] Normalización y validación estricta de formato antes de insertar en la tabla `phrases` de D1.
- [ ] **Modo Código / Programación**
  - [ ] Generador de snippets sintácticos de código real (TypeScript, Python, Rust, Go, SQL, HTML/CSS).
  - [ ] Soporte para caracteres especiales (`{}`, `[]`, `=>`, `===`, `&&`, indentaciones).
- [ ] **Entrenador Personal Adaptativo con IA**
  - [ ] Analizar los errores más frecuentes del jugador (teclas problemáticas, combinaciones lentas).
  - [ ] Generar textos a medida optimizados para entrenar los dedos o caracteres donde el usuario flaquea.

---

## 🛡️ 2. Anti-Cheat Estadístico & Heurísticas de Tecleo

Blindar la integridad del ladder y los récords mundiales sin degradar la latencia.

- [ ] **Análisis de Intervalo entre Teclas (IKI - Inter-Keystroke Intervals)**
  - [ ] Medir la varianza y distribución de tiempos entre pulsaciones.
  - [ ] Distinguir patrones humanos (distribución log-normal con pausas naturales entre palabras y ráfagas en dígrafos comunes como `de`, `ción`) vs. macros/scripts (cadencia uniforme o 0 ms estático).
- [ ] **Heurística de Reacción ante Errores**
  - [ ] Detectar tiempos de reacción inhumanos (< 20 ms) entre un fallo y su corrección o tropiezo.
- [ ] **Sistema de Flagging en D1**
  - [ ] Marcar carreras sospechosas sin expulsar inmediatamente (shadow-review).
  - [ ] Evitar que récords no validados estadísticamente reemplacen los fantasmas oficiales de la tabla mundial.

---

## 📱 3. Soporte Móvil & Teclados Virtuales (IME / Composición)

Garantizar una experiencia de escritura nativa y fluida en cualquier dispositivo y distribución de teclado.

- [ ] **Sincronización Avanzada de Input**
  - [ ] Escuchar eventos `beforeinput`, `input` y `compositionend` además de `keydown` en [`src/client/engine/InputRouter.ts`](file:///home/code4u/Documents/code/typing-game/src/client/engine/InputRouter.ts).
  - [ ] Soporte completo para teclados virtuales de Android (Gboard, SwiftKey) e iOS que usan sugerencias de texto y composición.
- [ ] **Soporte de Caracteres Compuestos e IMEs**
  - [ ] Manejo transparente de tildes muertas (`´` + `a` = `á`), diéresis (`¨`), caracteres chinos/japoneses.
- [ ] **UI/UX Responsive para Móviles**
  - [ ] Ajustar la pista de carreras (`Track.tsx`) y el visor de texto para pantallas táctiles verticales.

---

## 🎮 4. Game Feel, Audio & Pulido Visual (Juice)

Transformar cada carrera en una experiencia arcade adictiva y satisfactoria.

- [ ] **Soundpacks de Teclados Mecánicos**
  - [ ] Sintetizar o cargar perfiles sonoros con Web Audio API:
    - *Cherry MX Blue* (Clicky)
    - *Cherry MX Brown* (Táctil)
    - *Cherry MX Red* (Lineal)
    - *Máquina de Escribir Retro* (Vintage con campana de retorno)
    - *Burbujas / Pop* (Relajante)
- [ ] **Efectos Visuales & Animaciones**
  - [ ] Partículas o estela de fuego al mantener la racha de **Nitro**.
  - [ ] Animación de "adelantamiento" con aviso sonoro sutil al rebasar a un contrincante.
  - [ ] Shake de pantalla configurable ante errores o choques.
- [ ] **Telemetría y Gráficos en Resultados**
  - [ ] Gráfico de línea temporal de WPM segundo a segundo en [`src/client/screens/Results.tsx`](file:///home/code4u/Documents/code/typing-game/src/client/screens/Results.tsx).
  - [ ] Desglose de precisión por palabras y porcentaje de tiempo en Nitro vs. Tropiezo.

---

## 🌐 5. Networking, Calidad de Vida & Multijugador

- [ ] **Deep Linking e Invitaciones Directas**
  - [ ] Soporte de rutas URL tipo `caballos.dev/r/:roomCode` para entrar directo al lobby.
  - [ ] Botón interactivo "Copiar enlace de invitación" con feedback visual.
- [ ] **Reconexión Suave de WebSocket**
  - [ ] Mecanismo en [`src/client/engine/RaceSocket.ts`](file:///home/code4u/Documents/code/typing-game/src/client/engine/RaceSocket.ts) para reconectar automáticamente tras microcortes Wi-Fi o cambio de red sin reiniciar la carrera.
  - [ ] Reenvío de pulsaciones pendientes con el último número de secuencia (`seq`).
- [ ] **Modo Espectador en Vivo**
  - [ ] Permitir unirse como observador en salas llenas o carreras ya iniciadas sin alterar el estado de los jinetes.
- [ ] **Chat de Sala Mejorado**
  - [ ] Emojis rápidos, mensajes predeterminados ("¡Buena carrera!", "¡Revancha!") y filtro de spam.

---

## 🏆 6. Nuevos Modos de Juego & Métricas Avanzadas

- [ ] **Modo Battle Royale / Muerte Súbita Progresiva**
  - [ ] Cada vuelta o cada 20 segundos se descalifica al jinete en último lugar hasta que quede solo el ganador.
- [ ] **Heatmap de Rendimiento en Perfil**
  - [ ] Teclado visual interactivo en el perfil del jugador ([`src/client/screens/Boards.tsx`](file:///home/code4u/Documents/code/typing-game/src/client/screens/Boards.tsx)) coloreado según precisión y velocidad promedio por tecla.
- [ ] **Sistema de Logros y Títulos Desbloqueables**
  - [ ] Insignias por hitos: "Centurión (+100 WPM)", "Dedos de Acero (100% precisión en 5 carreras)", "Señor del Nitro", "Fantasma Imparable".
- [ ] **Torneos y Ligas Semanales**
  - [ ] Formato suizo o eliminación directa para comunidades y streams.

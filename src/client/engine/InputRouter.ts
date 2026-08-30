/**
 * Árbitro del foco del teclado.
 *
 * El problema que resuelve: el motor de tecleo viejo tenía un listener de
 * keydown a nivel `document` que llamaba a `hiddenInput.focus()` en CADA tecla.
 * Cualquier otro campo enfocado —el chat— perdía el foco al primer carácter.
 * No bastaba con añadir un atajo: hacía falta que alguien sea dueño del foco.
 *
 * Aquí el foco es un modo explícito. Un solo listener, en fase de captura,
 * montado una vez. El motor de tecleo ya no toca `document` ni llama a focus().
 */

export type InputMode = "typing" | "chat" | "modal" | "idle";

export interface InputRouterOptions {
  getHiddenInput: () => HTMLElement | null;
  getChatInput: () => HTMLElement | null;
  onModeChange?: (mode: InputMode) => void;
  /** Solo se secuestra Tab mientras hay carrera: fuera de ella, Tab navega normal. */
  isRaceRunning: () => boolean;
  /** Preferencia del usuario. Con `false`, la tecla para el chat es "/". */
  useTabForChat: () => boolean;
}

export class InputRouter {
  private mode: InputMode = "idle";
  private opts: InputRouterOptions;
  private handler: (e: KeyboardEvent) => void;

  constructor(opts: InputRouterOptions) {
    this.opts = opts;
    this.handler = this.onKeyDown.bind(this);
  }

  attach() {
    // Captura: se decide antes de que el evento llegue a ningún campo.
    document.addEventListener("keydown", this.handler, true);
  }

  detach() {
    document.removeEventListener("keydown", this.handler, true);
  }

  getMode(): InputMode {
    return this.mode;
  }

  setMode(mode: InputMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.opts.onModeChange?.(mode);

    if (mode === "chat") {
      // En el siguiente microtask: React todavía puede no haber montado el campo.
      queueMicrotask(() => this.opts.getChatInput()?.focus());
    } else if (mode === "typing" && this.opts.isRaceRunning()) {
      this.opts.getHiddenInput()?.focus();
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    // Un diálogo abierto es dueño absoluto del teclado.
    if (this.mode === "modal") return;

    const chatKey = this.opts.useTabForChat() ? "Tab" : "/";
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey;

    if (
      e.key === chatKey &&
      plain &&
      this.mode === "typing" &&
      this.opts.isRaceRunning()
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.setMode("chat");
      return;
    }

    if (e.key === "Escape") {
      this.setMode("typing");
      return;
    }

    // ESTE return es el arreglo completo: escribiendo en el chat, el router no
    // toca el foco jamás.
    if (this.mode === "chat") return;

    if (this.mode !== "typing") return;

    // Solo se fuerza el foco con teclas de contenido. Nunca con Tab, Escape,
    // F1-F12, flechas ni combinaciones con modificador: eso rompería la
    // navegación por teclado.
    const isContentKey = (e.key.length === 1 && plain) || e.key === "Backspace";
    if (!isContentKey) return;

    const hidden = this.opts.getHiddenInput();
    if (hidden && document.activeElement !== hidden) hidden.focus();
  }
}

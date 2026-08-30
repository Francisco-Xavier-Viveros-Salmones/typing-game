import {
  KEY_BACKSPACE,
  KEY_WRONG,
  applyEvent,
  initialState,
  type TypingConfig,
  type TypingState,
} from "../../shared/typing-rules";

export interface KeyFrame {
  /** Pares planos [dt, code, dt, code, ...] listos para el mensaje `keys`. */
  ev: number[];
}

export interface TypingEngineOptions {
  config: TypingConfig;
  /** Reloj monotónico de ronda en ms. Nunca Date.now(). */
  now: () => number;
  onState: (state: TypingState) => void;
  onFrame: (frame: KeyFrame) => void;
  /** El motor solo procesa si el router dice que el modo es 'typing'. */
  canType: () => boolean;
}

const FLUSH_INTERVAL_MS = 80;

/**
 * Captura pulsaciones y predice el estado localmente con EL MISMO reducer que
 * corre en el servidor. El servidor manda; esto solo evita que el juego se
 * sienta laggy.
 *
 * Usa `beforeinput` y no `keydown`: es la única vía que maneja bien teclados
 * móviles y composición IME. El patrón viejo (input oculto + value='') rompía
 * las teclas muertas — `´` + `e` no daba `é`, lo que en español importa mucho.
 */
export class TypingEngine {
  private opts: TypingEngineOptions;
  private input: HTMLInputElement | null = null;
  private state: TypingState;
  private pending: number[] = [];
  private lastEventAt = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private composing = false;

  private onBeforeInput = (e: Event) => this.handleBeforeInput(e as InputEvent);
  private onCompositionStart = () => {
    this.composing = true;
  };
  private onCompositionEnd = (e: Event) => {
    this.composing = false;
    const data = (e as CompositionEvent).data;
    if (data) this.commitText(data);
  };

  constructor(opts: TypingEngineOptions) {
    this.opts = opts;
    this.state = initialState(opts.config);
  }

  attach(input: HTMLInputElement) {
    this.input = input;
    input.addEventListener("beforeinput", this.onBeforeInput);
    input.addEventListener("compositionstart", this.onCompositionStart);
    input.addEventListener("compositionend", this.onCompositionEnd);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  detach() {
    this.input?.removeEventListener("beforeinput", this.onBeforeInput);
    this.input?.removeEventListener("compositionstart", this.onCompositionStart);
    this.input?.removeEventListener("compositionend", this.onCompositionEnd);
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.flush();
    this.input = null;
  }

  getState(): TypingState {
    return this.state;
  }

  /** Reconciliación cuando el servidor y la predicción divergen. */
  correct(index: number, errors: number, lives: number) {
    this.state = { ...this.state, index, errors, lives };
    this.opts.onState(this.state);
  }

  private handleBeforeInput(e: InputEvent) {
    if (!this.opts.canType() || this.state.done) return;

    // Durante la composición no se procesa nada: el texto llega entero en
    // compositionend. Procesar aquí rompería los acentos.
    if (this.composing) return;

    if (e.inputType === "deleteContentBackward") {
      e.preventDefault();
      this.push(KEY_BACKSPACE);
      return;
    }

    if (e.inputType === "insertText" || e.inputType === "insertCompositionText") {
      e.preventDefault();
      if (e.data) this.commitText(e.data);
    }
  }

  private commitText(text: string) {
    if (!this.opts.canType() || this.state.done) return;
    // Se itera por puntos de código, no por unidades UTF-16: un emoji o un
    // carácter fuera del BMP es UNA pulsación, no dos.
    for (const ch of text) {
      if (this.state.done) break;
      const code = ch.codePointAt(0)!;
      const expected = this.opts.config.text.codePointAt(this.state.index);
      this.push(code === expected ? code : KEY_WRONG);
    }
  }

  private push(code: number) {
    const at = this.opts.now();
    const dt = Math.max(0, Math.round(at - this.lastEventAt));
    this.lastEventAt = at;

    this.pending.push(dt, code);
    this.state = applyEvent(this.opts.config, this.state, { at, code });
    this.opts.onState(this.state);

    // Terminar o ser eliminado se manda al instante, sin esperar al lote:
    // el orden de llegada lo decide el servidor por hora de recepción.
    if (this.state.done) this.flush();
  }

  private flush() {
    if (this.pending.length === 0) return;
    const ev = this.pending;
    this.pending = [];
    this.opts.onFrame({ ev });
  }
}

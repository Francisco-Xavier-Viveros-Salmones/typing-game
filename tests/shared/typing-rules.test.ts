import { describe, expect, test } from "bun:test";
import {
  applyEvent,
  ERRORS_FOR_TRIP,
  initialState,
  KEY_BACKSPACE,
  KEY_WRONG,
  replay,
  STREAK_FOR_NITRO,
  TRIP_DURATION_MS,
  type KeyEvent,
  type TypingConfig,
} from "../../src/shared/typing-rules";

const cfg = (over: Partial<TypingConfig> = {}): TypingConfig => ({
  text: "uno dos tres",
  mode: "normal",
  lives: 3,
  ...over,
});

/** Teclea correctamente los primeros n caracteres, un evento cada 100 ms. */
function typeCorrect(config: TypingConfig, n: number, from = 0): KeyEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    at: (from + i + 1) * 100,
    code: config.text.codePointAt(from + i)!,
  }));
}

describe("avance básico", () => {
  test("un carácter correcto avanza el índice", () => {
    const c = cfg();
    const s = applyEvent(c, initialState(c), { at: 100, code: c.text.codePointAt(0)! });
    expect(s.index).toBe(1);
    expect(s.errors).toBe(0);
  });

  test("completar el texto termina la carrera", () => {
    const c = cfg();
    const s = replay(c, typeCorrect(c, c.text.length));
    expect(s.done).toBe(true);
    expect(s.outcome).toBe("finished");
    expect(s.index).toBe(c.text.length);
  });

  test("el índice nunca pasa del final del texto", () => {
    const c = cfg();
    const extra = [...typeCorrect(c, c.text.length), { at: 99_999, code: 65 }];
    expect(replay(c, extra).index).toBe(c.text.length);
  });

  test("backspace no retrocede", () => {
    const c = cfg();
    const s = replay(c, [...typeCorrect(c, 3), { at: 400, code: KEY_BACKSPACE }]);
    expect(s.index).toBe(3);
    expect(s.errors).toBe(0);
  });

  test("no muta el estado anterior", () => {
    const c = cfg();
    const before = initialState(c);
    const snapshot = structuredClone(before);
    applyEvent(c, before, { at: 100, code: c.text.codePointAt(0)! });
    expect(before).toEqual(snapshot);
  });
});

describe("nitro", () => {
  test("entra a las 3 palabras limpias, no antes", () => {
    const c = cfg();
    // "uno dos tres": las palabras cierran en el espacio (índices 3 y 7) y al final.
    const tras2 = replay(c, typeCorrect(c, 8)); // "uno dos "
    expect(tras2.streak).toBe(2);
    expect(tras2.state).toBe("normal");

    const tras3 = replay(c, typeCorrect(c, c.text.length));
    expect(tras3.streak).toBeGreaterThanOrEqual(STREAK_FOR_NITRO);
    expect(tras3.state).toBe("nitro");
  });

  test("una palabra sucia no cuenta para la racha", () => {
    const c = cfg();
    const eventos: KeyEvent[] = [
      ...typeCorrect(c, 2),
      { at: 250, code: KEY_WRONG },
      ...typeCorrect(c, 6, 2), // termina "uno dos "
    ];
    expect(replay(c, eventos).streak).toBe(1); // solo "dos" salió limpia
  });

  test("un error posterior corta el nitro", () => {
    const c = cfg({ text: "aa bb cc dd ee" });
    const conNitro = replay(c, typeCorrect(c, 12));
    expect(conNitro.state).toBe("nitro");

    const tras = applyEvent(c, conNitro, { at: 5000, code: KEY_WRONG });
    expect(tras.state).toBe("normal");
    expect(tras.streak).toBe(0);
  });
});

describe("tropiezo", () => {
  test("salta a los 3 errores en la misma palabra", () => {
    const c = cfg();
    const s = replay(
      c,
      Array.from({ length: ERRORS_FOR_TRIP }, (_, i) => ({ at: (i + 1) * 100, code: KEY_WRONG })),
    );
    expect(s.state).toBe("tripped");
    expect(s.trippedUntil).toBe(300 + TRIP_DURATION_MS);
  });

  test("mientras dura, las teclas se descartan por completo", () => {
    // Antes seguían contando como error y una errata encadenaba decenas.
    const c = cfg();
    let s = replay(
      c,
      Array.from({ length: ERRORS_FOR_TRIP }, (_, i) => ({ at: (i + 1) * 100, code: KEY_WRONG })),
    );
    const erroresAlTropezar = s.errors;

    for (let i = 0; i < 50; i++) s = applyEvent(c, s, { at: 400 + i, code: KEY_WRONG });

    expect(s.errors).toBe(erroresAlTropezar);
    expect(s.index).toBe(0);
  });

  test("se sale solo al pasar el tiempo, sin temporizador", () => {
    const c = cfg();
    let s = replay(
      c,
      Array.from({ length: ERRORS_FOR_TRIP }, (_, i) => ({ at: (i + 1) * 100, code: KEY_WRONG })),
    );
    s = applyEvent(c, s, { at: 300 + TRIP_DURATION_MS, code: c.text.codePointAt(0)! });

    expect(s.state).toBe("normal");
    expect(s.trippedUntil).toBeNull();
    expect(s.index).toBe(1); // la tecla que lo despierta sí cuenta
  });
});

describe("muerte súbita", () => {
  test("un solo error elimina", () => {
    const c = cfg({ mode: "sudden_death" });
    const s = applyEvent(c, initialState(c), { at: 100, code: KEY_WRONG });
    expect(s.done).toBe(true);
    expect(s.outcome).toBe("eliminated");
  });

  test("sin errores se puede terminar", () => {
    const c = cfg({ mode: "sudden_death" });
    expect(replay(c, typeCorrect(c, c.text.length)).outcome).toBe("finished");
  });
});

describe("modo vidas", () => {
  test("cada error cuesta una vida", () => {
    const c = cfg({ mode: "vidas", lives: 3 });
    const s = replay(c, [
      { at: 100, code: KEY_WRONG },
      { at: 200, code: KEY_WRONG },
    ]);
    expect(s.lives).toBe(1);
    expect(s.done).toBe(false);
  });

  test("a cero vidas se elimina", () => {
    const c = cfg({ mode: "vidas", lives: 2 });
    const s = replay(c, [
      { at: 100, code: KEY_WRONG },
      { at: 200, code: KEY_WRONG },
    ]);
    expect(s.lives).toBe(0);
    expect(s.done).toBe(true);
    expect(s.outcome).toBe("eliminated");
  });

  test("con 1 vida (fácil) el primer error elimina", () => {
    const c = cfg({ mode: "vidas", lives: 1 });
    expect(replay(c, [{ at: 100, code: KEY_WRONG }]).outcome).toBe("eliminated");
  });

  test("en modo vidas no se tropieza: la vida ya es la penalización", () => {
    const c = cfg({ mode: "vidas", lives: 10 });
    const s = replay(
      c,
      Array.from({ length: 5 }, (_, i) => ({ at: (i + 1) * 100, code: KEY_WRONG })),
    );
    expect(s.state).not.toBe("tripped");
    expect(s.trippedUntil).toBeNull();
  });

  test("las vidas nunca bajan de cero", () => {
    const c = cfg({ mode: "vidas", lives: 1 });
    const s = replay(
      c,
      Array.from({ length: 10 }, (_, i) => ({ at: (i + 1) * 100, code: KEY_WRONG })),
    );
    expect(s.lives).toBe(0);
  });
});

describe("determinismo — la propiedad que sostiene predicción y autoridad", () => {
  const MODES = ["normal", "sudden_death", "vidas"] as const;

  function randomLog(seed: number, config: TypingConfig): KeyEvent[] {
    let s = seed;
    const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const n = 5 + Math.floor(next() * 60);

    let at = 0;
    let idx = 0;
    return Array.from({ length: n }, () => {
      at += 20 + Math.floor(next() * 400);
      const r = next();
      if (r < 0.65 && idx < config.text.length) {
        const code = config.text.codePointAt(idx)!;
        idx++;
        return { at, code };
      }
      return { at, code: r < 0.9 ? KEY_WRONG : KEY_BACKSPACE };
    });
  }

  test("el mismo log reproducido da estado idéntico", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const config = cfg({ mode: MODES[seed % MODES.length]! });
      const log = randomLog(seed, config);
      expect(replay(config, log)).toEqual(replay(config, log));
    }
  });

  test("reproducir en dos tramos equivale a reproducir de una vez", () => {
    // Es lo que hace el servidor: aplicar lotes de `keys` según llegan.
    for (let seed = 1; seed <= 2000; seed++) {
      const config = cfg({ mode: MODES[seed % MODES.length]! });
      const log = randomLog(seed, config);
      const corte = Math.floor(log.length / 2);

      let porTramos = initialState(config);
      for (const e of log.slice(0, corte)) porTramos = applyEvent(config, porTramos, e);
      for (const e of log.slice(corte)) porTramos = applyEvent(config, porTramos, e);

      expect(porTramos).toEqual(replay(config, log));
    }
  });

  test("los invariantes se mantienen ante cualquier entrada", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const config = cfg({ mode: MODES[seed % MODES.length]! });
      const s = replay(config, randomLog(seed, config));

      expect(s.index).toBeGreaterThanOrEqual(0);
      expect(s.index).toBeLessThanOrEqual(config.text.length);
      expect(s.errors).toBeGreaterThanOrEqual(0);
      expect(s.lives).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.index)).toBe(true);
      if (s.done) expect(s.outcome).not.toBeNull();
    }
  });

  test("el índice nunca decrece a lo largo de un log", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const config = cfg({ mode: MODES[seed % MODES.length]! });
      let state = initialState(config);
      let prev = 0;
      for (const e of randomLog(seed, config)) {
        state = applyEvent(config, state, e);
        expect(state.index).toBeGreaterThanOrEqual(prev);
        prev = state.index;
      }
    }
  });
});

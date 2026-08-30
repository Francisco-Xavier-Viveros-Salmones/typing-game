export const AUTHOR_URL = "https://github.com/Francisco-Xavier-Viveros-Salmones";
export const THANKS_URL = "https://github.com/WanderTheWeeb";
/** La música es de otra persona: va acreditada, no escondida. */
export const MUSIC_CREDIT = "Moonchild — M72";

/** Pie del lobby: autoría y agradecimiento. */
export function Credits() {
  return (
    <footer className="credits">
      <span>
        Creado por{" "}
        <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
          @Pako_FX
        </a>
      </span>
      <span className="credits-sep">·</span>
      <span>
        Agradecimiento especial a{" "}
        <a href={THANKS_URL} target="_blank" rel="noreferrer noopener">
          WanderTheWeeb
        </a>
      </span>
      <span className="credits-sep">·</span>
      <span>Música: {MUSIC_CREDIT}</span>
    </footer>
  );
}

/** Marca de agua fija, abajo a la derecha. */
export function Watermark() {
  return (
    <a className="watermark" href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
      @Pako_FX
    </a>
  );
}

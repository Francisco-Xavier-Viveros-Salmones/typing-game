/**
 * Colores de cuadra.
 *
 * En una carrera de verdad cada propietario tiene un dibujo registrado —
 * listas, aros, chevrón, banda, cuarteles, lunares— y es así como el público
 * distingue a los caballos a distancia. Aquí hace exactamente el mismo trabajo:
 * identifica a cada jinete en el carril, bajo la frase y en el resultado.
 *
 * No es decoración. Como el dibujo va además del color, dos jugadores siguen
 * siendo distinguibles para quien no separa bien rojo y verde.
 */

export type SilkPattern = "solid" | "stripes" | "hoops" | "chevron" | "sash" | "quarters";

/** El patrón sale del dorsal, así que en una sala nunca se repite. */
export const PATTERNS: SilkPattern[] = ["solid", "stripes", "hoops", "chevron", "sash", "quarters"];

export function patternForSlot(slot: number): SilkPattern {
  return PATTERNS[slot % PATTERNS.length]!;
}

export function Silks({
  color,
  slot,
  size = 24,
  title,
}: {
  color: string;
  slot: number;
  size?: number;
  title?: string;
}) {
  const pattern = patternForSlot(slot);
  const id = `silk-${slot}-${pattern}`;

  return (
    <svg
      className="silks"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`${id}-clip`}>
          {/* La silueta de la chaquetilla: hombros marcados y bajo recto. */}
          <path d="M6 3 L9 2 Q12 4 15 2 L18 3 L21 7 L18 9 L18 21 L6 21 L6 9 L3 7 Z" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-clip)`}>
        <rect x="0" y="0" width="24" height="24" fill={color} />

        {pattern === "stripes" && (
          <g fill="rgba(255,255,255,0.82)">
            <rect x="7" y="0" width="3" height="24" />
            <rect x="14" y="0" width="3" height="24" />
          </g>
        )}

        {pattern === "hoops" && (
          <g fill="rgba(255,255,255,0.82)">
            <rect x="0" y="6" width="24" height="3.5" />
            <rect x="0" y="14" width="24" height="3.5" />
          </g>
        )}

        {pattern === "chevron" && (
          <path
            d="M0 20 L12 9 L24 20 L24 14 L12 3 L0 14 Z"
            fill="rgba(255,255,255,0.82)"
          />
        )}

        {pattern === "sash" && (
          <path d="M0 22 L18 0 L24 0 L6 24 Z" fill="rgba(255,255,255,0.82)" />
        )}

        {pattern === "quarters" && (
          <g fill="rgba(255,255,255,0.82)">
            <rect x="0" y="0" width="12" height="12" />
            <rect x="12" y="12" width="12" height="12" />
          </g>
        )}
      </g>

      {/* Un filo oscuro despega la chaquetilla del fondo del panel. */}
      <path
        d="M6 3 L9 2 Q12 4 15 2 L18 3 L21 7 L18 9 L18 21 L6 21 L6 9 L3 7 Z"
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Dorsal. En el hipódromo el número va en el paño de la silla, no en el
 * caballo, y es lo primero que se busca en el programa.
 */
export function SaddleNumber({ slot, color }: { slot: number; color: string }) {
  return (
    <span className="saddle" style={{ ["--silk" as string]: color }}>
      {slot + 1}
    </span>
  );
}

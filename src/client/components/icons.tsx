/**
 * Todos los emojis del juego, sustituidos por iconos Phosphor.
 *
 * Se centralizan aquí para que el mapa emoji→icono sea revisable de un vistazo
 * y para no repetir tamaños ni pesos por toda la interfaz. Phosphor tiene
 * `Horse` de verdad, que es lo que decidió elegirlo frente a Lucide.
 */
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { CrownIcon } from "@phosphor-icons/react/dist/csr/Crown";
import { FireIcon } from "@phosphor-icons/react/dist/csr/Fire";
import { FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { HeartIcon } from "@phosphor-icons/react/dist/csr/Heart";
import { HorseIcon as PhosphorHorse } from "@phosphor-icons/react/dist/csr/Horse";
import { HourglassIcon } from "@phosphor-icons/react/dist/csr/Hourglass";
import { MedalIcon } from "@phosphor-icons/react/dist/csr/Medal";
import { PaintBrushIcon } from "@phosphor-icons/react/dist/csr/PaintBrush";
import { SkullIcon } from "@phosphor-icons/react/dist/csr/Skull";
import { TrophyIcon } from "@phosphor-icons/react/dist/csr/Trophy";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

export {
  ArrowDownIcon as ArrowDown,
  ArrowRightIcon as ArrowRight,
  ArrowUpIcon as ArrowUp,
  CheckCircleIcon as CheckCircle,
  ClipboardTextIcon as ClipboardText,
  CrownIcon as Crown,
  FireIcon as Fire,
  FlagIcon as Flag,
  GearIcon as Gear,
  HeartIcon as Heart,
  PhosphorHorse as Horse,
  HourglassIcon as Hourglass,
  MedalIcon as Medal,
  PaintBrushIcon as PaintBrush,
  SkullIcon as Skull,
  TrophyIcon as Trophy,
  WarningIcon as Warning,
  XIcon as X,
};

/**
 * El sprite de carrera vuelve a ser el emoji 🏇.
 *
 * El caballo de Phosphor es una CABEZA de caballo y se lee como una pieza de
 * ajedrez; el emoji lleva jinete y se entiende al instante a tamaño pequeño.
 * Los iconos de interfaz (corona, corazones, bandera) siguen siendo Phosphor:
 * ahí el emoji era el problema, aquí es la solución.
 *
 * El tinte es un hue-rotate por dorsal, como en la versión original: teñir un
 * emoji con CSS es lo único que hay, porque su color lo pone la fuente.
 */
const TINTES = [
  "hue-rotate(0deg) saturate(4)",      // 1 castaño / naranja
  "hue-rotate(175deg) saturate(4)",    // 2 azul
  "hue-rotate(120deg) saturate(4)",    // 3 verde
  "hue-rotate(38deg) saturate(5) brightness(1.15)", // 4 dorado
  "hue-rotate(255deg) saturate(4)",    // 5 morado
  "hue-rotate(300deg) saturate(4)",    // 6 magenta
];

export function HorseIcon({
  slot = 0,
  size = 32,
}: {
  /** El dorsal decide el tinte, igual que decide los colores de cuadra. */
  slot?: number;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="horse-emoji"
      style={{ fontSize: size, filter: TINTES[slot % TINTES.length] }}
      aria-hidden="true"
    >
      🏇
    </span>
  );
}

/** ❤️ / 🖤 — las vidas restantes. */
export function Lives({ current, max }: { current: number; max: number }) {
  return (
    <span className="lives" aria-label={`${current} de ${max} vidas`}>
      {Array.from({ length: max }, (_, i) => (
        <HeartIcon
          key={i}
          size={14}
          weight={i < current ? "fill" : "regular"}
          className={i < current ? "life-on" : "life-off"}
        />
      ))}
    </span>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  const medalColor =
    rank === 1 ? "#e9c46a" : rank === 2 ? "#c7ccd1" : "#cd7f32";
  return (
    <span className="rank-badge">
      {rank <= 3 ? (
        <MedalIcon size={20} weight="fill" color={medalColor} />
      ) : null}
      <span>{rank}º</span>
    </span>
  );
}

/** 🔺🔻➖ — cambio de puesto respecto a la ronda anterior. */
export function RankDelta({ delta }: { delta: number }) {
  if (!Number.isFinite(delta) || delta === 0) {
    return (
      <span className="delta delta-same" title="sin cambios">
        <ArrowRightIcon size={12} />
      </span>
    );
  }
  return delta > 0 ? (
    <span className="delta delta-up" title={`sube ${delta}`}>
      <ArrowUpIcon size={12} weight="bold" />
      {delta}
    </span>
  ) : (
    <span className="delta delta-down" title={`baja ${-delta}`}>
      <ArrowDownIcon size={12} weight="bold" />
      {-delta}
    </span>
  );
}

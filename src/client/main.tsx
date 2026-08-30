import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AUTHOR_URL, MUSIC_CREDIT, THANKS_URL } from "./components/Credits";

console.log(
  `%cTypeRacer Caballos`,
  "font-size:16px;font-weight:bold;color:#e63946",
);
console.log(`Creado por @Pako_FX — ${AUTHOR_URL}`);
console.log(`Agradecimiento especial a WanderTheWeeb — ${THANKS_URL}`);
console.log(`Música: ${MUSIC_CREDIT}`);

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);

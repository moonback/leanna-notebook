/** Raccourcis clavier du navigateur : une seule table, utilisée par les onglets (Main) et par l'UI (via IPC). */
export type BrowserCommand =
  | "new-tab" | "close-tab" | "next-tab" | "previous-tab" | "duplicate-tab"
  | "reload" | "hard-reload" | "stop" | "back" | "forward"
  | "zoom-in" | "zoom-out" | "zoom-reset" | "fullscreen"
  | "focus-address" | "toggle-ai-panel" | "bookmark" | "show-history" | "show-downloads";

export type KeyInput = { key: string; control?: boolean; meta?: boolean; shift?: boolean; alt?: boolean };

export const BROWSER_COMMANDS: readonly BrowserCommand[] = [
  "new-tab", "close-tab", "next-tab", "previous-tab", "duplicate-tab", "reload", "hard-reload", "stop", "back",
  "forward", "zoom-in", "zoom-out", "zoom-reset", "fullscreen", "focus-address", "toggle-ai-panel", "bookmark",
  "show-history", "show-downloads",
];

/** Commandes traitées par l'interface (le reste est exécuté directement par le moteur). */
export const UI_COMMANDS: ReadonlySet<BrowserCommand> = new Set([
  "focus-address", "toggle-ai-panel", "bookmark", "show-history", "show-downloads",
]);

export function matchShortcut(input: KeyInput): BrowserCommand | null {
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const mod = Boolean(input.control || input.meta);
  const shift = Boolean(input.shift);
  const alt = Boolean(input.alt);

  if (!mod && !alt) {
    if (key === "F5") return "reload";
    if (key === "F11") return "fullscreen";
    if (key === "F6") return "focus-address";
    return null;
  }
  if (alt && !mod) {
    if (key === "ArrowLeft") return "back";
    if (key === "ArrowRight") return "forward";
    if (key === "d") return "focus-address";
    return null;
  }
  if (!mod || alt) return null;
  if (key === "Tab") return shift ? "previous-tab" : "next-tab";
  if (key === "PageDown") return "next-tab";
  if (key === "PageUp") return "previous-tab";
  if (shift) {
    if (key === "r") return "hard-reload";
    if (key === "k") return "duplicate-tab";
    if (key === "l") return "toggle-ai-panel";
    return key === "+" || key === "=" ? "zoom-in" : null;
  }
  switch (key) {
    case "t": return "new-tab";
    case "w": return "close-tab";
    case "r": return "reload";
    case "l": return "focus-address";
    case "d": return "bookmark";
    case "h": return "show-history";
    case "j": return "show-downloads";
    case "+": case "=": return "zoom-in";
    case "-": return "zoom-out";
    case "0": return "zoom-reset";
    default: return null;
  }
}

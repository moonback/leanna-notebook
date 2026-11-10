import { LEANNA_SYSTEM_PROMPT } from "./leanna";
import { ROXANE_SYSTEM_PROMPT } from "./roxane";

export { LEANNA_SYSTEM_PROMPT, ROXANE_SYSTEM_PROMPT };

export type VoicePersona = "leanna" | "roxane";

export const VOICE_SYSTEM_PROMPTS: Record<VoicePersona, string> = {
  leanna: LEANNA_SYSTEM_PROMPT,
  roxane: ROXANE_SYSTEM_PROMPT
};

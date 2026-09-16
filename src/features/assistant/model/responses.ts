/**
 * Deterministic fallback conversation for the assistant skeleton.
 * This keeps common greetings useful without a model or network request; a
 * future server integration should replace this boundary, not the drawer UI.
 */

const FALLBACK_REPLY =
  "I am an early preview and cannot answer that yet. I can help you start with a rooftop, land, or funding projects.";

export function getLocalAssistantReply(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (/\b(bye|goodbye|see you)\b/.test(normalized)) {
    return "Goodbye. Come back whenever you would like help exploring community solar.";
  }

  if (/\b(thank you|thanks|thx)\b/.test(normalized)) {
    return "You are welcome. What else can I help you with?";
  }

  if (/\b(how are you|how's it going|how is it going)\b/.test(normalized)) {
    return "I am ready to help. Would you like to explore rooftop, land, or funding options?";
  }

  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalized)) {
    return "Hello. What can I help you with?";
  }

  if (/\b(help|what can you do)\b/.test(normalized)) {
    return "I can guide you toward the rooftop, land, or project-funding path. This preview does not connect to live project data.";
  }

  if (/\b(roof|rooftop)\b/.test(normalized)) {
    return "Choose “I have a rooftop” below to begin with the rooftop path selected.";
  }

  if (/\b(land|field|car park)\b/.test(normalized)) {
    return "Choose “I have land” below to begin with the land path selected.";
  }

  if (/\b(fund|funding|invest|investment)\b/.test(normalized)) {
    return "Choose “I want to fund projects” below to begin with the funding path selected.";
  }

  return FALLBACK_REPLY;
}
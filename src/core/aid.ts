const DEFAULT_AID = "aid:user-main";

export function normalizeAid(input?: string): string {
  if (!input || input.trim().length === 0) {
    return DEFAULT_AID;
  }

  return input.startsWith("aid:") ? input : `aid:${input}`;
}

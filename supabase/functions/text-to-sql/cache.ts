// Pure helpers for the text-to-SQL response cache (no Deno/Request deps).

export const CACHE_BYPASS_HEADER = "x-cache-bypass";
export const DEFAULT_CACHE_TTL_HOURS = 168;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Case- and whitespace-insensitive so chip presets and hand-typed variants collide.
export function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

// systemPrompt is part of the key so any schema_prompt.ts edit invalidates old entries.
export async function cacheKey(
  systemPrompt: string,
  scopedPrompt: string,
): Promise<string> {
  const version = (await sha256Hex(systemPrompt)).slice(0, 12);
  return `${version}:${await sha256Hex(normalizePrompt(scopedPrompt))}`;
}

export function hashRows(rows: Record<string, unknown>[]): Promise<string> {
  return sha256Hex(JSON.stringify(rows));
}

export function isFresh(
  createdAt: string,
  ttlHours: number,
  now = Date.now(),
): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created < ttlHours * 3_600_000;
}

export function parseTtlHours(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_HOURS;
}

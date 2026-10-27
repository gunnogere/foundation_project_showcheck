import type { Params } from "./types";

// "key=value" per line <-> object.
export const parseParams = (text: string): Params =>
  Object.fromEntries(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
      .filter(([k]) => k)
  );

export const formatParams = (p: Params | null | undefined) =>
  Object.entries(p ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");

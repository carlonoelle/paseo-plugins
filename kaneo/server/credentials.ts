import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export interface Connection {
  baseUrl: string;
  apiKey: string;
  source: "env" | "file";
}

const StoredSchema = z.object({ baseUrl: z.string(), apiKey: z.string() });

function credentialsPath(): string {
  const home = process.env.PASEO_HOME?.trim() || path.join(os.homedir(), ".paseo");
  return path.join(home, "plugin-data", "kaneo", "credentials.json");
}

export function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The Kaneo URL must start with https:// or http://");
  }
  return url.origin + url.pathname.replace(/\/+$/, "").replace(/\/api$/, "");
}

export function readConnection(): Connection | null {
  const envUrl = process.env.KANEO_URL?.trim();
  const envKey = process.env.KANEO_API_KEY?.trim();
  if (envUrl && envKey) return { baseUrl: normalizeBaseUrl(envUrl), apiKey: envKey, source: "env" };
  try {
    const stored = StoredSchema.parse(JSON.parse(readFileSync(credentialsPath(), "utf8")));
    return { baseUrl: stored.baseUrl, apiKey: stored.apiKey, source: "file" };
  } catch {
    return null;
  }
}

export function writeConnection(baseUrl: string, apiKey: string): void {
  const file = credentialsPath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify({ baseUrl, apiKey })}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function clearConnection(): void {
  rmSync(credentialsPath(), { force: true });
}

#!/usr/bin/env node
import { loadSession, isSessionValid } from "./auth.js";
import { getPendingDays } from "./api.js";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CACHE_FILE = join(tmpdir(), "vairix-pending-cache.json");
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

interface CacheData {
  lastCheck: number;
  pendingDays: string[];
}

function readCache(): CacheData | null {
  try {
    const data: CacheData = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    if (Date.now() - data.lastCheck < CACHE_TTL) return data;
  } catch {}
  return null;
}

function writeCache(pendingDays: string[]): void {
  writeFileSync(CACHE_FILE, JSON.stringify({ lastCheck: Date.now(), pendingDays }));
}

async function main() {
  const cached = readCache();
  if (cached !== null) {
    if (cached.pendingDays.length > 0) {
      console.log(
        `Recordatorio: Tienes ${cached.pendingDays.length} dia(s) sin cargar horas este mes en admin.vairix.com: ${cached.pendingDays.join(", ")}.`
      );
    }
    return;
  }

  // No cache — fetch from API
  const session = await loadSession();
  if (!session) return;

  const valid = await isSessionValid(session);
  if (!valid) return;

  try {
    const pending = await getPendingDays();
    writeCache(pending);

    if (pending.length > 0) {
      console.log(
        `Recordatorio: Tienes ${pending.length} dia(s) sin cargar horas este mes en admin.vairix.com: ${pending.join(", ")}.`
      );
    }
  } catch {
    writeCache([]);
  }
}

main();

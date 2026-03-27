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

function output(pendingDays: string[]): void {
  if (pendingDays.length === 0) return;
  const msg = `Tienes ${pendingDays.length} dia(s) sin cargar horas este mes en admin.vairix.com: ${pendingDays.join(", ")}.`;
  console.error(msg);
  console.log(JSON.stringify({ systemMessage: msg }));
}

async function main() {
  const cached = readCache();
  if (cached !== null) {
    output(cached.pendingDays);
    return;
  }

  const session = await loadSession();
  if (!session) return;

  const valid = await isSessionValid(session);
  if (!valid) return;

  try {
    const pending = await getPendingDays();
    writeCache(pending);
    output(pending);
  } catch {
    writeCache([]);
  }
}

main();

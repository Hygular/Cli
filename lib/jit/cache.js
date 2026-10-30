/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile, rm } from "fs/promises";
import { CACHE_DIR, CACHE_FILE } from "./constants.js";

/**
 * Read the scan cache, falling back to an empty cache if it cannot be read or
 * parsed.
 */
export async function loadCache() {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed &&
      parsed.version === 2 &&
      parsed.files &&
      typeof parsed.files === "object"
      ? parsed
      : { version: 2, files: {} };
  } catch {
    return { files: {}, classes: [] };
  }
}

/**
 * Write to a temporary file, then rename it over the cache to avoid partial
 * writes.
 */
export async function saveCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmpFile = `${CACHE_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpFile, JSON.stringify(cache), "utf8");
    await rename(tmpFile, CACHE_FILE);
  } finally {
    await rm(tmpFile, { force: true });
  }
}

/**
 * Hash the file contents to detect changes when its modification time differs.
 */
export async function fileHash(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

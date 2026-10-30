/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { glob, hasMagic } from "glob";
import {
  IGNORE_PATTERNS,
  OUTPUT_PATH,
  ROOT,
  SOURCE_EXTENSIONS,
  normalizePath,
  resolveExtensions,
} from "./constants.js";
import { extractUsage } from "./extractor.js";

export function createScanPatterns(
  scanPatterns,
  extensions = SOURCE_EXTENSIONS,
) {
  if (!Array.isArray(scanPatterns))
    throw new TypeError("jit.scan must be an array of paths.");
  return scanPatterns.map((entry) => {
    if (typeof entry !== "string" || !entry.trim())
      throw new TypeError("jit.scan paths must be non-empty strings.");
    const clean = normalizePath(entry).replace(/\/$/, "") || "/";
    if (hasMagic(clean) || path.extname(clean)) return clean;
    const suffix =
      extensions.length === 1
        ? `*.${extensions[0]}`
        : `*.{${extensions.join(",")}}`;
    return `${clean}/**/${suffix}`;
  });
}

export async function findScanFiles(config) {
  const patterns = createScanPatterns(
    config.jit?.scan || [],
    resolveExtensions(config, SOURCE_EXTENSIONS),
  );
  return [
    ...new Set(
      await glob(patterns, {
        cwd: ROOT,
        ignore: IGNORE_PATTERNS,
        absolute: true,
        nodir: true,
      }),
    ),
  ]
    .filter(
      (file) => file !== OUTPUT_PATH && !file.startsWith(OUTPUT_PATH + "."),
    )
    .sort();
}
export async function hasValidScanFiles(config) {
  return (await findScanFiles(config)).length > 0;
}

/** Hash the bytes being parsed; timestamp-only cache hits can miss replacements. */
export async function scanProject(config, cache = {}) {
  const safelist = config.jit?.safelist || [];
  if (
    !Array.isArray(safelist) ||
    safelist.some((c) => typeof c !== "string" || /\s/.test(c) || !c)
  )
    throw new TypeError("jit.safelist must contain complete class names.");
  const concurrency = config.jit?.concurrency ?? 50;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1024)
    throw new RangeError("jit.concurrency must be an integer from 1 to 1024.");
  const files = await findScanFiles(config);
  const allClasses = new Set(safelist),
    allVars = new Set(),
    allComponents = new Set(),
    allAttributes = new Set(),
    allAnimations = new Set();
  const results = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++,
        file = files[index];
      const rel = normalizePath(path.relative(ROOT, file));
      let content;
      try {
        content = await readFile(file, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const hash = createHash("sha256").update(content).digest("hex");
      const cached = cache.version === 2 ? cache.files?.[rel] : null;
      if (
        cached?.hash === hash &&
        ["classes", "vars", "components", "attributes", "animations"].every(
          (k) =>
            Array.isArray(cached[k]) &&
            cached[k].every((v) => typeof v === "string"),
        )
      )
        results[index] = [rel, cached];
      else {
        const usage = extractUsage(content, file);
        results[index] = [
          rel,
          {
            hash,
            ...Object.fromEntries(
              Object.entries(usage).map(([key, set]) => [key, [...set]]),
            ),
          },
        ];
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  );
  const updatedFiles = Object.create(null);
  for (const result of results) {
    if (!result) continue;
    const [rel, entry] = result;
    updatedFiles[rel] = entry;
    entry.classes.forEach((v) => allClasses.add(v));
    entry.vars.forEach((v) => allVars.add(v));
    entry.components.forEach((v) => allComponents.add(v));
    entry.attributes.forEach((v) => allAttributes.add(v));
    entry.animations.forEach((v) => allAnimations.add(v));
  }
  return {
    allClasses,
    allVars,
    allComponents,
    allAttributes,
    allAnimations,
    updatedCache: { version: 2, files: updatedFiles },
  };
}

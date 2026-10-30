/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import path from "path";
import { resolveFrameworkCSS } from "./resolve-css.js";

export const ROOT = process.cwd();
export const CONFIG_PATH = path.join(ROOT, "hygular.config.js");
export const OUTPUT_PATH = path.join(ROOT, "public", "hygular.build.css");
export const MAIN_CSS = resolveFrameworkCSS(ROOT);
export const CACHE_DIR = path.join(ROOT, "node_modules", ".cache", "hygular");
// Constants
export const CACHE_FILE = path.join(CACHE_DIR, "cache.json");
export const SOURCE_EXTENSIONS = [
  "html",
  "htm",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
];
export const WATCH_EXTENSIONS = SOURCE_EXTENSIONS;
export const IGNORE_PATTERNS = ["**/node_modules/**", "**/.git/**"];
export const DEFAULT_BREAKPOINTS = {
  sm: "640px",
  md: "864px",
  lg: "1120px",
  xl: "1408px",
  "2xl": "1792px",
};
export function resolveExtensions(config, baseExtensions) {
  const extra = config?.jit?.extensions || [];
  if (
    !Array.isArray(extra) ||
    extra.some((v) => typeof v !== "string" || !/^\.?[a-zA-Z0-9]+$/.test(v))
  )
    throw new TypeError("jit.extensions must contain file extensions.");
  return [
    ...new Set([...baseExtensions, ...extra.map((v) => v.replace(/^\./, ""))]),
  ];
}
// Normalize the path for all os
export const normalizePath = (p) => p.replace(/\\/g, "/");

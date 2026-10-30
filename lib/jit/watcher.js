/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import path from "node:path";
import { loadConfig } from "./config.js";
import { existsSync } from "node:fs";
import chokidar from "chokidar";
import { hasMagic } from "glob";
import { resetCompilerCache, resetConfigCache } from "./compiler.js";
import { findScanFiles } from "./scanner.js";
import {
  CONFIG_PATH,
  MAIN_CSS,
  ROOT,
  OUTPUT_PATH,
  normalizePath,
} from "./constants.js";

/** Chokidar watches directories, while the scanner owns glob matching. */
export function getScanTargets(config) {
  return [
    ...new Set(
      (config?.jit?.scan || []).map((pattern) => {
        const value = normalizePath(pattern);
        let target;
        if (!hasMagic(value))
          target = path.extname(value) ? path.dirname(value) : value;
        else {
          const segments = value.split("/");
          const index = segments.findIndex((s) => hasMagic(s));
          target =
            segments.slice(0, index).join("/") ||
            (value.startsWith("/") ? "/" : ".");
        }
        target = path.resolve(ROOT, target);
        // Watch an existing ancestor so a new configured directory is discovered.
        while (!existsSync(target) && path.dirname(target) !== target)
          target = path.dirname(target);
        return target;
      }),
    ),
  ];
}

async function loadConfigSafely() {
  try {
    return await loadConfig(CONFIG_PATH);
  } catch (error) {
    console.error("Hygular: Config error:", error.message);
    return null;
  }
}

export async function startWatcher({
  onChange,
  onMainCssChange,
  debounceMs = 100,
} = {}) {
  let config = await loadConfigSafely();
  let targets = getScanTargets(config);
  let tracked = new Set(await findScanFiles(config || {}));
  const cssPath = path.resolve(MAIN_CSS),
    configPath = path.resolve(CONFIG_PATH);
  const staticTargets = [configPath, cssPath];
  const watcher = chokidar.watch([...staticTargets, ...targets], {
    cwd: ROOT,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    ignored: (file) => {
      const absolute = path.resolve(ROOT, file),
        normalized = normalizePath(absolute);
      if (
        staticTargets.includes(absolute) ||
        cssPath.startsWith(absolute + path.sep)
      )
        return false;
      if (absolute === OUTPUT_PATH || absolute.startsWith(OUTPUT_PATH + "."))
        return true;
      return /(?:^|\/)(?:node_modules|\.git|\.cache)(?:\/|$)/.test(normalized);
    },
  });
  let timer = null,
    inFlight = null,
    pending = false,
    closed = false;
  async function run() {
    timer = null;
    if (closed) return;
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = Promise.resolve()
      .then(() => onChange?.())
      .catch((error) =>
        console.error("Hygular: Rebuild failed:", error.message),
      );
    await inFlight;
    inFlight = null;
    if (pending && !closed) {
      pending = false;
      schedule();
    }
  }
  function schedule() {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  }
  let events = Promise.resolve();
  async function handle(event, file) {
    if (closed) return;
    const absolute = path.resolve(ROOT, file);
    if (absolute === configPath) {
      resetConfigCache();
      const next = await loadConfigSafely();
      if (!next) return;
      const nextTargets = getScanTargets(next);
      await watcher.unwatch(
        targets.filter(
          (t) => !nextTargets.includes(t) && !staticTargets.includes(t),
        ),
      );
      watcher.add([...staticTargets, ...nextTargets]);
      targets = nextTargets;
      config = next;
      tracked = new Set(await findScanFiles(config));
      schedule();
      return;
    }
    if (absolute === cssPath) {
      resetCompilerCache();
      await onMainCssChange?.();
      schedule();
      return;
    }
    if (absolute === OUTPUT_PATH) return;
    const previous = tracked.has(absolute);
    tracked = new Set(await findScanFiles(config || {}));
    if (previous || tracked.has(absolute)) schedule();
  }
  watcher.on("all", (event, file) => {
    if (!["add", "change", "unlink"].includes(event)) return;
    events = events
      .then(() => handle(event, file))
      .catch((error) => console.error("Hygular: Watch error:", error.message));
  });
  watcher.on("error", (error) =>
    console.error("Hygular: Watch error:", error.message),
  );
  const close = watcher.close.bind(watcher);
  watcher.close = async () => {
    closed = true;
    clearTimeout(timer);
    await close();
    await events;
    await inFlight;
  };
  return watcher;
}

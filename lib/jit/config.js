import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let version = 0;

/** Reload the configuration entry in CommonJS and ES module projects. */
export async function loadConfig(configPath) {
  const resolved = require.resolve(configPath);
  delete require.cache[resolved];

  const url = pathToFileURL(resolved);
  url.searchParams.set("update", String(version++));

  const module = await import(url.href);
  return module.default ?? module;
}

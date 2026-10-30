import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "bin/hygular-bin.js",
  "lib/hygular-cli.js",
  "README.md",
  "LICENSE",
  ...[
    "breakpoints",
    "cache",
    "compiler",
    "components",
    "constants",
    "extractor",
    "organizer",
    "parser",
    "resolve-css",
    "scanner",
    "selector",
    "theme",
    "watcher",
  ].map((name) => `lib/jit/${name}.js`),
];
const missing = [];
for (const name of required) {
  try {
    await access(path.join(root, name));
  } catch {
    missing.push(name);
  }
}
if (missing.length) {
  console.error(
    `Missing CLI package files:\n${missing.map((name) => `  ${name}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  const pkg = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (
    pkg.name !== "@hygular/cli" ||
    pkg.bin?.hygular !== "./bin/hygular-bin.js"
  ) {
    throw new Error("Unexpected CLI package name or executable mapping.");
  }
  console.log("Hygular CLI package files are ready.");
}

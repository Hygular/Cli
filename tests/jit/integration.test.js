import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
  utimes,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { once } from "node:events";

const oldCwd = process.cwd();
const dir = await mkdtemp(path.join(tmpdir(), "hygular-jit-test-"));
process.chdir(dir);
await mkdir("src", { recursive: true });
await mkdir("node_modules/@hygular/core/dist/css", { recursive: true });
await writeFile("package.json", '{"type":"module"}');
await writeFile(
  "node_modules/@hygular/core/package.json",
  JSON.stringify({
    name: "@hygular/core",
    version: "1.0.0-beta.1",
    exports: { "./css/source": "./dist/css/hygular.css" },
  }),
);
const cssPath = path.join(dir, "node_modules/@hygular/core/dist/css/hygular.css");
const configPath = path.join(dir, "hygular.config.js");
const config = { jit: { scan: ["src"] } };
await writeFile(configPath, "export default " + JSON.stringify(config));
await writeFile(
  cssPath,
  "@layer theme{:root{--inline:red}}@layer utilities{.a{color:red}.b{color:blue}.c{color:green}}",
);
const { scanProject, createScanPatterns } = await import(
  "../../lib/jit/scanner.js"
);
const { runCompiler, resetCompilerCache, resetConfigCache } = await import(
  "../../lib/jit/compiler.js"
);
const { startWatcher, getScanTargets } = await import(
  "../../lib/jit/watcher.js"
);
const { loadCache, saveCache } = await import("../../lib/jit/cache.js");
after(async () => {
  process.chdir(oldCwd);
  await rm(dir, { recursive: true, force: true });
});

test("absolute directories, braces, single extensions and dot paths", () => {
  assert.deepEqual(createScanPatterns(["/tmp/app"], ["html"]), [
    "/tmp/app/**/*.html",
  ]);
  assert.deepEqual(createScanPatterns(["src/{one,two}.tsx"]), [
    "src/{one,two}.tsx",
  ]);
  assert.deepEqual(createScanPatterns(["."], ["jsx"]), ["./**/*.jsx"]);
  assert.ok(
    getScanTargets({ jit: { scan: ["src/*.{js,tsx}"] } }).includes(
      path.join(dir, "src"),
    ),
  );
});
test("scanner reads HTML, deduplicates overlaps and removes stale cache entries", async () => {
  await writeFile(
    "src/index.html",
    '<div class="a" style="color:var(--inline)">',
  );
  const first = await scanProject({ jit: { scan: ["src", "src/*.html"] } }, {});
  assert.deepEqual([...first.allClasses], ["a"]);
  assert.ok(first.allVars.has("--inline"));
  assert.equal(Object.keys(first.updatedCache.files).length, 1);
  await rm("src/index.html");
  const next = await scanProject(config, first.updatedCache);
  assert.equal(next.allClasses.size, 0);
  assert.equal(Object.keys(next.updatedCache.files).length, 0);
});
test("same timestamp replacement does not return stale classes", async () => {
  const file = "src/view.jsx";
  await writeFile(file, 'const x=<div className="a"/>');
  const info = await stat(file);
  const first = await scanProject(config, {});
  await writeFile(file, 'const x=<div className="b"/>');
  await utimes(file, info.atime, info.mtime);
  const next = await scanProject(config, first.updatedCache);
  assert.ok(next.allClasses.has("b"));
  assert.ok(!next.allClasses.has("a"));
});
test("empty scan clears old cache; safelist remains effective", async () => {
  const first = await scanProject(config, {});
  const next = await scanProject(
    { jit: { scan: [], safelist: ["keep"] } },
    first.updatedCache,
  );
  assert.deepEqual([...next.allClasses], ["keep"]);
  assert.equal(Object.keys(next.updatedCache.files).length, 0);
});
test("invalid concurrency fails instead of silently scanning zero files", async () => {
  for (const concurrency of [0, -1, 0.5, Infinity, "4"])
    await assert.rejects(
      scanProject({ jit: { scan: ["src"], concurrency } }, {}),
      /concurrency/,
    );
});
test("valid warm cache equals cold extraction; corrupted cache is ignored", async () => {
  const first = await scanProject(config, {});
  await saveCache(first.updatedCache);
  const second = await scanProject(config, await loadCache());
  assert.deepEqual(second.updatedCache, first.updatedCache);
  await writeFile("node_modules/.cache/hygular/cache.json", "null");
  assert.deepEqual((await loadCache()).files, {});
});
test("build writes parseable CSS and reuses cache", async () => {
  const first = await runCompiler({ command: "build" });
  assert.ok(first.css.includes(".b"));
  assert.ok(!first.css.includes(".a{"));
  assert.equal(await readFile("public/hygular.build.css", "utf8"), first.css);
  const second = await runCompiler({ command: "build" });
  assert.equal(second.css, first.css);
});
test("failed build rejects and preserves last successful CSS", async () => {
  const before = await readFile("public/hygular.build.css", "utf8");
  await writeFile(cssPath, "@layer utilities {");
  resetCompilerCache();
  await assert.rejects(runCompiler({ command: "build" }));
  assert.equal(await readFile("public/hygular.build.css", "utf8"), before);
  await writeFile(
    cssPath,
    "@layer utilities{.a{color:red}.b{color:blue}.c{color:green}}",
  );
  resetCompilerCache();
});
test("CLI failure exits nonzero and does not run a package installer", async () => {
  const entry = fileURLToPath(
    new URL("../../bin/hygular-bin.js", import.meta.url),
  );
  const result = spawnSync(process.execPath, [entry, "unknown"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
  await writeFile(configPath, "export default {broken:");
  const build = spawnSync(process.execPath, [entry, "build"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(build.status, 1);
  await writeFile(configPath, "export default " + JSON.stringify(config));
  resetConfigCache();
});
test("watch handles edits, additions, deletion, core CSS and config changes without overlapping builds", async () => {
  let count = 0,
    active = 0,
    maxActive = 0,
    cssChanges = 0;
  let notify;
  const watcher = await startWatcher({
    debounceMs: 15,
    onMainCssChange: () => {
      cssChanges++;
    },
    onChange: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        await runCompiler({ command: "dev" });
        count++;
        notify?.();
      } finally {
        active--;
      }
    },
  });
  await once(watcher, "ready");
  async function change(action, check) {
    const done = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("watch rebuild timed out")),
        5000,
      );
      notify = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    await action();
    await done;
    notify = null;
    if (check) await check();
  }
  try {
    await change(
      () => writeFile("src/view.jsx", 'const x=<div className="a"/>'),
      async () =>
        assert.match(
          await readFile("public/hygular.build.css", "utf8"),
          /\.a\s*\{/,
        ),
    );
    await change(() => writeFile("src/new.html", '<div class="c">'));
    await change(
      () => rm("src/new.html"),
      async () =>
        assert.doesNotMatch(
          await readFile("public/hygular.build.css", "utf8"),
          /\.c\s*\{/,
        ),
    );
    await change(() =>
      writeFile(cssPath, "@layer utilities{.a{color:purple}.b{color:blue}}"),
    );
    assert.equal(cssChanges, 1);
    await mkdir("other", { recursive: true });
    await writeFile("other/new.html", '<div class="b">');
    await change(
      () =>
        writeFile(
          configPath,
          "export default " + JSON.stringify({ jit: { scan: ["other"] } }),
        ),
      async () =>
        assert.match(
          await readFile("public/hygular.build.css", "utf8"),
          /\.b\s*\{/,
        ),
    );
    await change(() => writeFile("other/new.html", '<div class="a">'));
    assert.equal(maxActive, 1);
    const settled = count;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(count, settled, "output must not trigger rebuilds");
  } finally {
    await watcher.close();
  }
});

test("project-root watch ignores its output and queues changes during an active build", async () => {
  await writeFile(
    configPath,
    "export default " + JSON.stringify({ jit: { scan: ["."] } }),
  );
  resetConfigCache();
  let count = 0,
    active = 0,
    maxActive = 0,
    releaseFirst;
  const started = new Promise((resolve) => {
    releaseFirst = { started: resolve };
  });
  const gate = new Promise((resolve) => {
    releaseFirst.release = resolve;
  });
  let complete;
  const twoBuilds = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("queued rebuild timed out")),
      5000,
    );
    complete = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  const watcher = await startWatcher({
    debounceMs: 10,
    onChange: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      count++;
      try {
        if (count === 1) {
          releaseFirst.started();
          await gate;
        }
        await runCompiler({ command: "dev" });
        if (count === 2) complete();
      } finally {
        active--;
      }
    },
  });
  await once(watcher, "ready");
  try {
    await writeFile("src/view.jsx", 'const x=<div className="a p-2"/>');
    await Promise.race([
      started,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("initial watch build timed out")),
          5000,
        );
        timer.unref();
      }),
    ]);
    await writeFile("src/view.jsx", 'const x=<div className="b"/>');
    // Allow the filesystem event to arrive while the first build is held open.
    await new Promise((resolve) => setTimeout(resolve, 130));
    releaseFirst.release();
    await twoBuilds;
    assert.equal(maxActive, 1);
    const settled = count;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(count, settled);
  } finally {
    releaseFirst.release();
    await watcher.close();
  }
});

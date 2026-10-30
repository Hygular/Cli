import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveFrameworkCSS } from "../../lib/jit/resolve-css.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "hygular-resolve-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function framework(
  root,
  exports = { "./css/source": "./dist/css/hygular.css" },
) {
  await mkdir(path.join(root, "dist/css"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "hygular", version: "1.0.0-beta.1", exports }),
  );
  await writeFile(
    path.join(root, "dist/css/hygular.css"),
    "@layer utilities{.p-2{padding:.5rem}}",
  );
}
test("resolves the explicit framework CSS export", async (t) => {
  const root = await fixture(t);
  await framework(path.join(root, "node_modules/@hygular/core"));
  assert.equal(
    resolveFrameworkCSS(root),
    await realpath(
      path.join(root, "node_modules/@hygular/core/dist/css/hygular.css"),
    ),
  );
});
test("resolves a framework hoisted into an ancestor directory", async (t) => {
  const root = await fixture(t);
  await framework(path.join(root, "node_modules/@hygular/core"));
  const project = path.join(root, "packages/app");
  await mkdir(project, { recursive: true });
  assert.equal(
    resolveFrameworkCSS(project),
    await realpath(
      path.join(root, "node_modules/@hygular/core/dist/css/hygular.css"),
    ),
  );
});
test("resolves a symlinked framework without hardcoded package layout", async (t) => {
  const root = await fixture(t),
    store = path.join(root, "store/framework");
  await framework(store);
  await mkdir(path.join(root, "app/node_modules/@hygular"), {
    recursive: true,
  });
  await symlink(
    store,
    path.join(root, "app/node_modules/@hygular/core"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal(
    resolveFrameworkCSS(path.join(root, "app")),
    await realpath(path.join(store, "dist/css/hygular.css")),
  );
});
test("supports a relocated source file through package exports", async (t) => {
  const root = await fixture(t),
    pkg = path.join(root, "node_modules/@hygular/core");
  await framework(pkg, { "./css/source": "./source.css" });
  await writeFile(path.join(pkg, "source.css"), "body{}");
  assert.equal(
    resolveFrameworkCSS(root),
    await realpath(path.join(pkg, "source.css")),
  );
});
test("missing framework produces an actionable error", async (t) => {
  const root = await fixture(t);
  assert.throws(
    () => resolveFrameworkCSS(root),
    /Install a compatible "@hygular\/core" package/,
  );
});
test("does not bypass exports for an incompatible framework", async (t) => {
  const root = await fixture(t);
  await framework(path.join(root, "node_modules/@hygular/core"), {
    "./css": "./dist/css/hygular.css",
  });
  assert.throws(() => resolveFrameworkCSS(root), /@hygular\/core\/css\/source/);
});

/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import path from "node:path";
import { createRequire } from "node:module";

/** Resolve the framework installed in the project, including hoisted packages. */
export function resolveFrameworkCSS(projectRoot = process.cwd()) {
  const requireFromProject = createRequire(
    path.resolve(projectRoot, "package.json"),
  );
  try {
    return requireFromProject.resolve("@hygular/core/css/source");
  } catch (cause) {
    throw new Error(
      'Hygular CLI could not resolve "@hygular/core/css/source" from this project. ' +
        'Install a compatible "@hygular/core" package and ensure its build includes dist/css/hygular.css.',
      { cause },
    );
  }
}

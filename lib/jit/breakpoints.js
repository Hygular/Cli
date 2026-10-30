/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import { DEFAULT_BREAKPOINTS } from "./constants.js";

/**
 * Merge configured breakpoint values with the defaults.
 */
export function resolveBreakpoints(config) {
  const overrides = config?.theme?.breakpoints || config?.breakpoints || {};

  return { ...DEFAULT_BREAKPOINTS, ...overrides };
}

export function applyBreakpoints(root, breakpoints) {
  const varRe = /var\(\s*--breakpoint-([\w-]+)\s*\)/g;

  root.walkAtRules("media", (atrule) => {
    let changed = false;

    const newParams = atrule.params.replace(varRe, (match, alias) => {
      const override = breakpoints[alias];
      if (override) {
        changed = true;
        return override;
      }
      return match;
    });

    if (changed) {
      atrule.params = newParams;
    }
  });
}

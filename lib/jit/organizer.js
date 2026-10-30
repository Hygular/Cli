/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { applyBreakpoints } from "./breakpoints.js";

export function referencedVariables(value) {
  const names = new Set();
  valueParser(value).walk((node) => {
    if (node.type === "function" && node.value.toLowerCase() === "var") {
      const name = node.nodes.find((n) => n.type === "word")?.value;
      if (name?.startsWith("--")) names.add(name);
    }
  });
  return names;
}

/** Preserve theme scopes and cascade order while following variable dependencies. */
export const organizeStyles = (
  inventory,
  themeAST,
  components,
  utilities,
  breakpoints,
  keyframes = [],
  sourceVars = new Set(),
) => ({
  postcssPlugin: "hygular-organizer",
  Once(root) {
    const layers = new Map(
      ["theme", "base", "components", "utilities", "custom"].map((name) => [
        name,
        postcss.atRule({ name: "layer", params: name }),
      ]),
    );
    inventory.base.forEach((i) => layers.get("base").append(i.node.clone()));
    components.forEach((i) => layers.get("components").append(i.node.clone()));
    utilities.forEach((i) => layers.get("utilities").append(i.node.clone()));
    themeAST.customRules.forEach((n) => layers.get("custom").append(n.clone()));
    const global = postcss.root();
    (inventory.global || []).forEach((i) => global.append(i.node.clone()));
    keyframes.forEach((i) =>
      (layers.get(i.layer) || global).append(i.node.clone()),
    );

    const theme = layers.get("theme");
    inventory.theme.forEach((i) => theme.append(i.node.clone()));
    theme.append(themeAST.rootBlock.clone(), themeAST.darkBlock.clone());
    const used = new Set(sourceVars);
    for (const container of [...layers.values()]
      .filter((l) => l !== theme)
      .concat(global)) {
      container.walkDecls((d) =>
        referencedVariables(d.value).forEach((v) => used.add(v)),
      );
    }
    const deps = new Map();
    theme.walkDecls((d) => {
      if (!d.prop.startsWith("--"))
        referencedVariables(d.value).forEach((v) => used.add(v));
      else {
        if (!deps.has(d.prop)) deps.set(d.prop, new Set());
        referencedVariables(d.value).forEach((v) => deps.get(d.prop).add(v));
      }
    });
    for (const variable of used)
      for (const dep of deps.get(variable) || []) used.add(dep);
    theme.walkDecls((d) => {
      if (d.prop.startsWith("--") && !used.has(d.prop)) d.remove();
    });
    function trim(container) {
      for (const node of [...(container.nodes || [])]) {
        if (node.nodes) {
          trim(node);
          if (!node.nodes?.length) node.remove();
        }
      }
    }
    trim(theme);
    root.removeAll();
    // Imports must precede all non-import rules, except layer-order statements.
    global.walkAtRules("import", (n) => {
      root.append(n.clone());
      n.remove();
    });
    if (themeAST.importRule) root.append(themeAST.importRule.clone());
    const activeLayers = [...layers].filter(
      ([name, node]) => name !== "custom" || node.nodes?.length,
    );
    root.append(
      postcss.atRule({
        name: "layer",
        params: activeLayers.map(([name]) => name).join(", "),
      }),
    );
    activeLayers.forEach(([, node]) => {
      if (node.nodes?.length) root.append(node);
    });
    root.append(global.nodes);
    applyBreakpoints(root, breakpoints);
  },
});

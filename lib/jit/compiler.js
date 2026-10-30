/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import path from "node:path";
import { readFile, mkdir, rename, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import postcss from "postcss";
import cssnano from "cssnano";
import valueParser from "postcss-value-parser";
import { CONFIG_PATH, MAIN_CSS, OUTPUT_PATH } from "./constants.js";
import { parseCSSInventory } from "./parser.js";
import { buildThemeAST } from "./theme.js";
import { scanProject } from "./scanner.js";
import { loadCache, saveCache } from "./cache.js";
import { organizeStyles, referencedVariables } from "./organizer.js";
import { extractAllClasses, filterSelector } from "./selector.js";
import { resolveBreakpoints } from "./breakpoints.js";
import { COMPONENTS, expandComponents } from "./components.js";

let cachedInventory = null,
  cachedConfig = null;

function pruneItem(item, match) {
  const node = item.node.clone();
  function prune(container) {
    if (container.type === "rule") {
      const selector = match(container.selector);
      if (!selector) return false;
      container.selector = selector;
    }
    for (const child of [...(container.nodes || [])]) {
      if (child.nodes && !prune(child)) child.remove();
    }
    return !container.nodes || container.nodes.length > 0;
  }
  return prune(node) ? { ...item, node } : null;
}

function activeAnimations(items, inventory, themeAST, sourceAnimations) {
  const definitions = new Map();
  const readDefinitions = (node) =>
    node.walkDecls?.((d) => {
      if (d.prop.startsWith("--")) {
        if (!definitions.has(d.prop)) definitions.set(d.prop, []);
        definitions.get(d.prop).push(d.value);
      }
    });
  [...inventory.theme, ...items].forEach((i) => readDefinitions(i.node));
  readDefinitions(themeAST.rootBlock);
  readDefinitions(themeAST.darkBlock);
  const known = new Set(inventory.keyframes.map((i) => i.name));
  const used = new Set();
  const keywords = new Set(
    "none infinite normal reverse alternate alternate-reverse forwards backwards both running paused ease linear ease-in ease-out ease-in-out step-start step-end initial inherit unset revert revert-layer".split(
      " ",
    ),
  );
  function collect(value, nameOnly, seen = new Set()) {
    const parsed = valueParser(value);
    parsed.walk((token) => {
      if (token.type === "function") return false;
      if (
        (token.type === "word" || token.type === "string") &&
        known.has(token.value) &&
        (nameOnly || token.type === "string" || !keywords.has(token.value))
      )
        used.add(token.value);
    });
    for (const name of referencedVariables(value)) {
      if (seen.has(name)) continue;
      const next = new Set(seen).add(name);
      for (const definition of definitions.get(name) || [])
        collect(definition, nameOnly, next);
    }
    // A fallback may itself contain an animation name.
    parsed.walk((token) => {
      if (token.type === "function" && token.value === "var") {
        const comma = token.nodes.findIndex(
          (n) => n.type === "div" && n.value === ",",
        );
        if (comma >= 0)
          collect(
            valueParser.stringify(token.nodes.slice(comma + 1)),
            nameOnly,
            seen,
          );
      }
    });
  }
  const scan = (node) =>
    node.walkDecls?.((d) => {
      if (/^(?:-webkit-)?animation(?:-name)?$/.test(d.prop))
        collect(d.value, d.prop.endsWith("name"));
    });
  items.forEach((i) => scan(i.node));
  for (const declaration of sourceAnimations) {
    const index = declaration.indexOf(":");
    collect(
      declaration.slice(index + 1),
      declaration.slice(0, index) === "animation-name",
    );
  }
  for (const name of used)
    inventory.keyframes
      .filter((i) => i.name === name)
      .forEach((i) => scan(i.node));
  return inventory.keyframes.filter((i) => used.has(i.name));
}

/** Compile from explicit inputs; the CLI handles project paths and disk caching. */
export async function compileCSS({
  css,
  inventory,
  config = {},
  classes = new Set(),
  components = new Set(),
  variables = new Set(),
  attributes = new Set(),
  animationDeclarations = new Set(),
  minify = false,
}) {
  inventory ||= await parseCSSInventory(css);
  const expanded = expandComponents(classes, components);
  const contexts = [...expanded.components].flatMap((name) => {
    const entry = COMPONENTS[name];
    return (entry?.groups || [entry?.classes || []]).map((group) => ({
      classes: new Set([...classes, ...group]),
      anchors: new Set([
        ...group.filter((c) => !/^(?:is-|has-|with-|user-)/.test(c)),
        ...(entry?.anchors || []),
      ]),
    }));
  });
  const activeAttributes = (name) =>
    attributes.has(name) || expanded.components.has("skeleton");
  function matchComponent(selector) {
    const direct = filterSelector(selector, classes, activeAttributes);
    // Evaluate each selector branch separately; retaining one must not retain its siblings.
    const candidates = new Set(direct ? [direct] : []);
    for (const context of contexts) {
      for (const branch of splitBranches(selector)) {
        if (extractAllClasses(branch).some((c) => context.anchors.has(c))) {
          const matched = filterSelector(
            branch,
            context.classes,
            activeAttributes,
          );
          if (matched) candidates.add(matched);
        }
      }
    }
    // Re-select from the original list to preserve branch order and avoid duplicates.
    const allowed = new Set(
      [...candidates].flatMap(splitBranches).map((s) => s.trim()),
    );
    const result = splitBranches(selector).filter((s) => allowed.has(s.trim()));
    return result.length ? result.join(", ") : null;
  }
  const themeAST = buildThemeAST(config);
  themeAST.customRules = themeAST.customRules
    .map(
      (node) =>
        pruneItem({ node }, (s) => filterSelector(s, expanded.classes))?.node,
    )
    .filter(Boolean);
  if (
    !themeAST.customRules.some(
      (n) => n.type === "rule" && /\.font-/.test(n.selector),
    )
  )
    themeAST.importRule = null;
  const selectedBase = inventory.base
    .map((i) => pruneItem(i, matchComponent))
    .filter(Boolean);
  const selectedInventory = { ...inventory, base: selectedBase };
  const selectedComponents = inventory.components
    .map((i) => pruneItem(i, matchComponent))
    .filter(Boolean);
  const selectedUtilities = inventory.utilities
    .map((i) => pruneItem(i, (s) => filterSelector(s, expanded.classes)))
    .filter(Boolean);
  const animations = activeAnimations(
    [
      ...selectedBase,
      ...(inventory.global || []),
      ...selectedComponents,
      ...selectedUtilities,
      ...themeAST.customRules.map((node) => ({ node })),
    ],
    inventory,
    themeAST,
    animationDeclarations,
  );
  const plugins = [
    organizeStyles(
      selectedInventory,
      themeAST,
      selectedComponents,
      selectedUtilities,
      resolveBreakpoints(config),
      animations,
      variables,
    ),
  ];
  if (minify)
    plugins.push(cssnano({ preset: ["default", { mergeRules: false }] }));
  const result = await postcss(plugins).process(postcss.root(), {
    from: undefined,
  });
  return {
    css: result.css,
    components: [...expanded.components],
    rules: selectedComponents.length + selectedUtilities.length,
  };
}
import { splitSelectorList as splitBranches } from "./selector.js";

export async function runCompiler({ command } = {}) {
  const start = performance.now();
  if (!cachedConfig) {
    cachedConfig = await loadConfig(CONFIG_PATH);
  }
  if (!cachedInventory)
    cachedInventory = await parseCSSInventory(await readFile(MAIN_CSS, "utf8"));
  const usage = await scanProject(cachedConfig, await loadCache());
  const result = await compileCSS({
    inventory: cachedInventory,
    config: cachedConfig,
    classes: usage.allClasses,
    components: usage.allComponents,
    variables: usage.allVars,
    attributes: usage.allAttributes,
    animationDeclarations: usage.allAnimations,
    minify: command === "build",
  });
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const temp = `${OUTPUT_PATH}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, result.css);
    await rename(temp, OUTPUT_PATH);
  } finally {
    await rm(temp, { force: true });
  }
  await saveCache(usage.updatedCache);
  console.log(
    `✓ Hygular: ${result.rules} rules compiled in ${(performance.now() - start).toFixed(1)}ms.`,
  );
  return result;
}
export function resetCompilerCache() {
  cachedInventory = null;
}
export function resetConfigCache() {
  cachedConfig = null;
}

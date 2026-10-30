/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import selectorParser from "postcss-selector-parser";

/** Split only top-level commas; quoted values and escaped names stay intact. */
export function splitSelectorList(selector) {
  return selectorParser()
    .astSync(selector)
    .nodes.map((node) => node.toString().trim());
}

export function decodeCssClassName(raw) {
  return selectorParser().astSync(`.${raw}`).first.first.value;
}

export function extractAllClasses(selector) {
  const classes = new Set();
  selectorParser()
    .astSync(selector)
    .walkClasses((node) => classes.add(node.value));
  return [...classes];
}

function matchesNodes(nodes, classes, activeAttributes) {
  return nodes.every((node) => {
    if (
      node.type === "attribute" &&
      /^(?:data-skeleton|data-hygular-skeleton)/.test(node.attribute) &&
      activeAttributes
    ) {
      return activeAttributes(node.attribute);
    }
    if (node.type === "class") return classes.has(node.value);
    if (node.type !== "pseudo" || !node.nodes?.length) return true;
    const name = node.value.toLowerCase();
    // Absence of a class cannot prove that a negated selector is impossible.
    if (name === ":not") return true;
    if (
      [
        ":is",
        ":where",
        ":has",
        ":matches",
        ":-webkit-any",
        ":-moz-any",
      ].includes(name)
    ) {
      return node.nodes.some((branch) =>
        matchesNodes(branch.nodes, classes, activeAttributes),
      );
    }
    // Unknown functional pseudos are retained conservatively.
    return true;
  });
}

export function filterSelector(selector, classes, activeAttributes) {
  const ast = selectorParser().astSync(selector);
  for (const branch of [...ast.nodes]) {
    if (!matchesNodes(branch.nodes, classes, activeAttributes)) branch.remove();
  }
  return ast.nodes.length ? ast.toString() : null;
}

/** Classes outside functional pseudos; use filterSelector for actual selection. */
export function extractRequiredClasses(selector) {
  const result = new Set();
  const ast = selectorParser().astSync(selector);
  for (const branch of ast.nodes) {
    for (const node of branch.nodes)
      if (node.type === "class") result.add(node.value);
  }
  return [...result];
}

/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import postcss from "postcss";

/** Keep source order and conditional context without duplicating nested rules. */
export async function parseCSSInventory(cssText) {
  const inventory = {
    theme: [],
    base: [],
    components: [],
    utilities: [],
    keyframes: [],
    global: [],
  };
  const root = postcss.parse(cssText);
  function visit(container, layer = "global", wrappers = []) {
    for (const node of container.nodes || []) {
      if (node.type === "comment") continue;
      if (node.type === "atrule" && node.name === "layer") {
        if (!node.nodes) {
          // The organizer supplies the framework layer order.
          if (
            !node.params
              .split(",")
              .every((s) =>
                ["theme", "base", "components", "utilities"].includes(s.trim()),
              )
          ) {
            add(node, layer, wrappers);
          }
          continue;
        }
        if (
          Object.hasOwn(inventory, node.params.trim()) &&
          node.params.trim() !== "keyframes"
        ) {
          visit(node, node.params.trim(), wrappers);
        } else visit(node, layer, [...wrappers, node]);
      } else if (
        node.type === "atrule" &&
        /^(?:-webkit-)?keyframes$/i.test(node.name)
      ) {
        const item = wrap(node, wrappers);
        inventory.keyframes.push({
          ...item,
          name: node.params.trim().replace(/^(['"])(.*)\1$/, "$2"),
          layer,
        });
      } else if (
        node.type === "atrule" &&
        node.nodes &&
        [
          "media",
          "supports",
          "container",
          "scope",
          "starting-style",
          "document",
        ].includes(node.name)
      ) {
        visit(node, layer, [...wrappers, node]);
      } else add(node, layer, wrappers);
    }
  }
  function wrap(node, wrappers) {
    let copy = node.clone();
    for (const parent of [...wrappers].reverse()) {
      const wrapper = parent.clone({ nodes: [] });
      wrapper.append(copy);
      copy = wrapper;
    }
    return {
      selector: node.type === "rule" ? node.selector : null,
      node: copy,
    };
  }
  function add(node, layer, wrappers) {
    inventory[layer].push(wrap(node, wrappers));
  }
  visit(root);
  return inventory;
}

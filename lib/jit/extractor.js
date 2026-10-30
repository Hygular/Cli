/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

import { parse } from "@babel/parser";
import { componentName } from "./components.js";

const helpers = new Set(["clsx", "cn", "cx", "cva", "tv", "variants"]);
const options = {
  sourceType: "unambiguous",
  plugins: ["jsx", "typescript"],
  errorRecovery: true,
};
const propName = (n) => n?.name ?? n?.value;
const memberName = (n) => (n?.computed ? n.property?.value : n?.property?.name);
const markerNames = new Set([
  "data-hygular",
  "data-hygular-toggle",
  "data-target",
  "data-trigger",
]);

/** Extract class-bearing expressions without executing application code. */
export function extractUsage(content, filename = "") {
  const classes = new Set(),
    components = new Set(),
    attributes = new Set(),
    animations = new Set();
  const add = (value) => {
    for (const word of String(value).split(/\s+/))
      if (word && !word.includes("${")) classes.add(word);
  };
  const mark = (value) => {
    for (const part of String(value).split(/\s+/)) {
      const name = componentName(part);
      if (name) components.add(name);
    }
  };
  function attr(name, value) {
    attributes.add(name);
    if (name === "style")
      for (const m of value.matchAll(
        /(?:^|;)\s*(animation(?:-name)?)\s*:\s*([^;]+)/g,
      ))
        animations.add(`${m[1]}:${m[2]}`);
    if (name === "class" || name === "className") add(value);
    if (markerNames.has(name)) mark(value);
    if (["data-src", "data-src"].includes(name))
      components.add("lazyimage");
    if (/^(?:data-)?skeleton$|^data-skeleton$/.test(name))
      components.add("skeleton");
  }
  function markup(text) {
    text = text.replace(/<!--[\s\S]*?-->/g, "");
    const tags = /<[A-Za-z](?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
    for (const tag of text.matchAll(tags)) {
      const attrs =
        /(?:^|\s)([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      for (const m of tag[0].matchAll(attrs))
        attr(m[1], m[2] ?? m[3] ?? m[4] ?? "");
    }
  }
  const html = Boolean(filename) && !/\.[cm]?[jt]sx?$/i.test(filename);
  if (html) markup(content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""));
  const sources = html
    ? [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
        (m) => m[1],
      )
    : [content];
  for (const source of sources) {
    let ast;
    try {
      ast = parse(source, options);
      if (ast.errors.length) throw ast.errors[0];
    } catch (error) {
      if (!filename || html) {
        markup(source);
        continue;
      }
      throw new Error(`Cannot scan ${filename}: ${error.message}`, {
        cause: error,
      });
    }
    const scopes = new WeakMap();
    const rootScope = { parent: null, bindings: new Map() };
    function walk(node, scope, visit) {
      if (!node || typeof node !== "object" || !node.type) return;
      visit(node, scope);
      for (const [key, value] of Object.entries(node)) {
        if (
          [
            "loc",
            "comments",
            "tokens",
            "errors",
            "leadingComments",
            "trailingComments",
            "innerComments",
          ].includes(key)
        )
          continue;
        if (Array.isArray(value))
          value.forEach((child) =>
            walk(child, scopes.get(node) || scope, visit),
          );
        else if (value?.type) walk(value, scopes.get(node) || scope, visit);
      }
    }
    const bindPattern = (n, scope) => {
      if (n?.type === "Identifier") scope.bindings.set(n.name, null);
      else if (n?.type === "ObjectPattern")
        n.properties.forEach((p) => bindPattern(p.value || p.argument, scope));
      else if (n?.type === "ArrayPattern")
        n.elements.forEach((p) => bindPattern(p, scope));
      else if (n?.type === "AssignmentPattern") bindPattern(n.left, scope);
    };
    walk(ast, rootScope, (node, parent) => {
      let scope = parent;
      if (
        [
          "Program",
          "BlockStatement",
          "ArrowFunctionExpression",
          "FunctionExpression",
          "FunctionDeclaration",
        ].includes(node.type)
      ) {
        scope = { parent, bindings: new Map() };
        scopes.set(node, scope);
        node.params?.forEach((p) => bindPattern(p, scope));
      }
      if (node.type === "VariableDeclarator") {
        bindPattern(node.id, scope);
        if (node.id.type === "Identifier")
          scope.bindings.set(node.id.name, { node: node.init, scope });
      }
      if (node.type === "ImportDeclaration")
        for (const spec of node.specifiers) {
          scope.bindings.set(spec.local.name, {
            source: node.source.value,
            imported:
              spec.imported?.name ||
              (spec.type === "ImportNamespaceSpecifier" ? "*" : "default"),
          });
        }
    });
    function binding(name, scope) {
      for (let s = scope; s; s = s.parent)
        if (s.bindings.has(name)) return s.bindings.get(name);
      return undefined;
    }
    function strings(node, scope, mode = "classes", seen = new Set()) {
      if (!node || seen.has(node)) return;
      const next = new Set(seen).add(node);
      const isAnimation = mode === "animation" || mode === "animation-name";
      const emit = isAnimation
        ? (value) => animations.add(`${mode}:${value}`)
        : mode === "marker"
          ? mark
          : add;
      if (node.type === "StringLiteral") emit(node.value);
      else if (node.type === "Identifier") {
        const b = binding(node.name, scope);
        if (b?.node) strings(b.node, b.scope, mode, next);
      } else if (node.type === "TemplateLiteral") {
        if (isAnimation) {
          if (!node.expressions.length)
            emit(node.quasis[0].value.cooked ?? node.quasis[0].value.raw);
          return;
        }
        // Drop an entire interpolated token, including its static prefix/suffix.
        const text = node.quasis
          .map(
            (q, i) =>
              (q.value.cooked ?? q.value.raw) +
              (i < node.expressions.length ? "\u0000" : ""),
          )
          .join("");
        text
          .split(/\s+/)
          .filter((s) => s && !s.includes("\u0000"))
          .forEach(emit);
        node.expressions.forEach((n, i) => {
          const left = node.quasis[i].value.raw,
            right = node.quasis[i + 1].value.raw;
          if ((!left || /\s$/.test(left)) && (!right || /^\s/.test(right)))
            strings(n, scope, mode, next);
        });
      } else if (node.type === "ConditionalExpression") {
        strings(node.consequent, scope, mode, next);
        strings(node.alternate, scope, mode, next);
      } else if (node.type === "LogicalExpression") {
        if (node.operator !== "&&") strings(node.left, scope, mode, next);
        strings(node.right, scope, mode, next);
      } else if (node.type === "ArrayExpression")
        node.elements.forEach((n) => strings(n, scope, mode, next));
      else if (
        [
          "TSAsExpression",
          "TSNonNullExpression",
          "TSSatisfiesExpression",
          "ParenthesizedExpression",
        ].includes(node.type)
      )
        strings(node.expression, scope, mode, next);
      else if (node.type === "ObjectExpression") {
        for (const p of node.properties) {
          if (p.type === "SpreadElement")
            strings(p.argument, scope, mode, next);
          else if (mode === "variant") strings(p.value, scope, mode, next);
          else if (!p.computed) emit(propName(p.key));
          else strings(p.key, scope, mode, next);
        }
      } else if (
        node.type === "CallExpression" &&
        helpers.has(node.callee.name)
      ) {
        if (["cva", "tv", "variants"].includes(node.callee.name)) {
          const offset = node.callee.name === "cva" ? 1 : 0;
          if (offset) strings(node.arguments[0], scope, mode, next);
          for (const p of node.arguments[offset]?.properties || []) {
            const key = propName(p.key);
            if (["base", "slots", "variants"].includes(key))
              strings(p.value, scope, "variant", next);
            if (key === "compoundVariants")
              for (const item of p.value.elements || []) {
                for (const field of item.properties || [])
                  if (["class", "className"].includes(propName(field.key)))
                    strings(field.value, scope, mode, next);
              }
          }
        } else node.arguments.forEach((n) => strings(n, scope, mode, next));
      }
    }
    walk(ast, rootScope, (node, inherited) => {
      const scope = scopes.get(node) || inherited;
      if (node.type === "JSXAttribute") {
        const name = propName(node.name);
        attributes.add(name);
        const value =
          node.value?.type === "JSXExpressionContainer"
            ? node.value.expression
            : node.value;
        if (name === "class" || name === "className") strings(value, scope);
        if (["data-src", "data-hygular-src"].includes(name))
          components.add("lazyimage");
        if (markerNames.has(name)) strings(value, scope, "marker");
        if (["data-skeleton", "data-hygular-skeleton"].includes(name))
          components.add("skeleton");
      }
      if (node.type === "StringLiteral" && /<[A-Za-z][\s\S]*>/.test(node.value))
        markup(node.value);
      if (
        node.type === "TemplateLiteral" &&
        node.quasis.some((q) => /<[A-Za-z]/.test(q.value.raw))
      ) {
        markup(
          node.quasis
            .map(
              (q, i) =>
                q.value.raw + (i < node.expressions.length ? "${dynamic}" : ""),
            )
            .join(""),
        );
      }
      if (
        node.type === "ObjectProperty" &&
        ["class", "className"].includes(propName(node.key))
      )
        strings(node.value, scope);
      if (
        node.type === "ObjectProperty" &&
        ["animation", "animationName", "animation-name"].includes(
          propName(node.key),
        )
      ) {
        strings(
          node.value,
          scope,
          propName(node.key) === "animation" ? "animation" : "animation-name",
        );
      }
      if (
        node.type === "AssignmentExpression" &&
        memberName(node.left) === "className"
      )
        strings(node.right, scope);
      if (
        !["CallExpression", "NewExpression", "OptionalCallExpression"].includes(
          node.type,
        )
      )
        return;
      const callee = node.callee;
      if (helpers.has(callee.name)) strings(node, scope);
      if (
        ["add", "remove", "toggle", "replace"].includes(memberName(callee)) &&
        memberName(callee.object) === "classList"
      ) {
        node.arguments
          .slice(0, memberName(callee) === "toggle" ? 1 : undefined)
          .forEach((n) => strings(n, scope));
      }
      if (
        memberName(callee) === "setAttribute" &&
        node.arguments[0]?.type === "StringLiteral"
      ) {
        const name = node.arguments[0].value;
        attributes.add(name);
        if (name === "class") strings(node.arguments[1], scope);
        if (markerNames.has(name)) strings(node.arguments[1], scope, "marker");
      }
      let target = callee;
      const members = [];
      while (
        target?.type === "MemberExpression" ||
        target?.type === "OptionalMemberExpression"
      ) {
        members.unshift(memberName(target));
        target = target.object;
      }
      let b = binding(target?.name, scope);
      if (
        b?.node?.type === "NewExpression" &&
        b.node.callee.type === "Identifier"
      ) {
        const constructor = binding(b.node.callee.name, b.scope);
        if (
          constructor?.source === "@hygular/core" &&
          constructor.imported === "Hygular"
        )
          b = constructor;
      }
      if (b?.source === "@hygular/core" || b?.source === "@hygular/core/react") {
        const publicName =
          b.imported === "*" ||
          b.imported === "default" ||
          b.imported === "Hygular"
            ? members[0]
            : b.imported;
        const name = componentName(publicName || "");
        if (name) components.add(name);
      }
    });
  }
  return {
    classes,
    components,
    attributes,
    animations,
    vars: extractVarsFromContent(content),
  };
}

export function extractClassesFromContent(content) {
  return extractUsage(content).classes;
}
export function extractVarsFromContent(content) {
  return new Set(
    [...content.matchAll(/var\(\s*(--[^),\s]+)/g)].map((m) => m[1]),
  );
}

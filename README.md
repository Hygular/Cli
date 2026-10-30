# Hygular CLI

Compile the Hygular CSS used by your project and rebuild it as source files change.

## Install

```sh
npm install hygular@beta
npm install --save-dev @hygular/cli@beta
```

Requires Node.js 20.19.0 or newer. The framework and CLI are separate packages;
projects using the prebuilt CSS do not need the CLI.

## Configure

Create `hygular.config.js` in your project root. This example uses an ESM project
with `"type": "module"` in its `package.json`.

```js
export default {
  jit: {
    scan: ["src", "index.html"],
    safelist: [],
  },
};
```

For a CommonJS project, use `module.exports = { jit: { scan: ["src", "index.html"] } };`.

## Build

```sh
npx hygular build
npx hygular dev
```

Both commands read configuration relative to the current project directory and
write `public/hygular.build.css`. Include that file in your application.

Complete class names generated from external data belong in `jit.safelist`.
Built-in runtime component dependencies are maintained in `lib/jit/components.js`.

The CLI resolves the installed framework through `@hygular/core/css/source`. That export
must point to `dist/css/hygular.css`; the CLI does not assume a particular physical
`node_modules` layout.

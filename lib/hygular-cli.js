/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

/**
 * Run a CSS build or watch source files for changes.
 */
export async function runCli(command = process.argv[2]) {
  if (!command || ["--help", "-h", "help"].includes(command)) {
    console.log(`
Hygular CLI

Usage:
  hygular build    Generate minified CSS
  hygular dev      Watch source files and rebuild CSS
`);
    return;
  }

  if (!["build", "dev"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const { runCompiler, resetCompilerCache } = await import(
    "./jit/compiler.js"
  );

  if (command === "build") {
    await runCompiler({ command });
    return;
  }

  const { startWatcher } = await import("./jit/watcher.js");

  console.log("Hygular: Watch mode is active. Listening for changes...");

  try {
    await runCompiler({ command });
  } catch (error) {
    console.error(`Hygular: ${error.message}`);
  }

  await startWatcher({
    onChange: async () => runCompiler({ command }),
    onMainCssChange: resetCompilerCache,
  });
}

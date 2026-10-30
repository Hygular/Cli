#!/usr/bin/env node

/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

try {
  const { runCli } = await import("../lib/hygular-cli.js");
  await runCli();
} catch (error) {
  console.error(`Hygular: ${error.message}`);
  process.exitCode = 1;
}

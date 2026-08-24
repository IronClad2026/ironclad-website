#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildRedactedFailure,
  executeFixtureCommand,
  loadFixtureEnvironment,
  parseArgs,
} from "./lib/staging-synthetic-uat.mjs";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDirectory, "..");
let parsedCommand;

try {
  parsedCommand = parseArgs(process.argv.slice(2));
  const env = await loadFixtureEnvironment({ rootDir: repositoryRoot });
  const result = await executeFixtureCommand(parsedCommand, {
    env,
    rootDir: repositoryRoot,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(buildRedactedFailure(error, parsedCommand))}\n`
  );
  process.exitCode = 1;
}

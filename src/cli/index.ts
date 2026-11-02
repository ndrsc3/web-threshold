#!/usr/bin/env node
import { run } from "./run.js";

void run(process.argv.slice(2), process.cwd()).then((code) => {
  process.exitCode = code;
});

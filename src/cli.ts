#!/usr/bin/env node
import { createProgram } from './cli/program.js';
import { createCliContext } from './cli/shared.js';

const ctx = createCliContext(process.argv);
const program = createProgram(ctx);

program.parseAsync(process.argv).catch((error) => {
  console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

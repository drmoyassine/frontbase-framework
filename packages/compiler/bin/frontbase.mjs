#!/usr/bin/env node
// frontbase CLI shim → @frontbase/compiler CLI program.
import { createProgram } from '../dist/cli/index.js';
const program = createProgram();
program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
});

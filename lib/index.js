"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib = require("tslib");
const util_1 = require("./util");
util_1.assign(global, tslib);
require("./register");
const repl_1 = require("./repl");
const options = require('optimist')
    .usage(`Usage:
    ts-repl [options]`)
    .alias('h', 'help')
    .describe('h', 'Print this help message');
const argv = options.argv;
if (argv.h) {
    options.showHelp();
    process.exit(1);
}
console.log('TS-REPL');
console.log(':help'.blue.bold, 'for commands in repl');
console.log('---------------------------------------');
repl_1.startRepl();

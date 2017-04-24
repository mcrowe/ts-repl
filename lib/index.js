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
    .describe('h', 'Print this help message')
    .alias('r', 'require')
    .describe('r', 'Require a module');
const argv = options.argv;
if (argv.h) {
    options.showHelp();
    process.exit(1);
}
let libs = [];
if (argv.r) {
    if (Array.isArray(argv.r)) {
        libs = libs.concat(argv.r);
    }
    else {
        libs.push(argv.r);
    }
}
console.log('TS-REPL');
console.log(':help'.blue.bold, 'for commands in repl');
console.log('---------------------------------------');
repl_1.startRepl(libs);

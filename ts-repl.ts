import * as tslib from 'tslib'
import {assign} from './src/util'
assign(global, tslib)

import './src/register'

import {startRepl} from './src/repl'

const options = require('optimist')
  .usage(`Usage:
    ts-repl [options]`)
  .alias('h', 'help')
  .describe('h', 'Print this help message')

const argv = options.argv


if (argv.h) {
  options.showHelp()
  process.exit(1)
}

console.log('TS-REPL')
console.log(':help'.blue.bold, 'for commands in repl')
console.log('---------------------------------------')
startRepl()
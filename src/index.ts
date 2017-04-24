import * as tslib from 'tslib'
import {assign} from './util'
assign(global, tslib)

import './register'

import { startRepl } from './repl'

const options = require('optimist')
  .usage(`Usage:
    ts-repl [options]`)
  .alias('h', 'help')
  .describe('h', 'Print this help message')
  .alias('r', 'require')
  .describe('r', 'Require a module')

const argv = options.argv


if (argv.h) {
  options.showHelp()
  process.exit(1)
}


let libs: string[] = []

if (argv.r) {
  if (Array.isArray(argv.r)) {
    libs = libs.concat(argv.r)
  } else {
    libs.push(argv.r)
  }
}

console.log('TS-REPL')
console.log(':help'.blue.bold, 'for commands in repl')
console.log('---------------------------------------')
startRepl(libs)
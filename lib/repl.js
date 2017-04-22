"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readlineTTY = require("node-color-readline");
const readlineNoTTY = require("readline");
const util = require("util");
const vm = require("vm");
const console_1 = require("console");
const path = require("path");
const child_process = require("child_process");
const fs = require("fs");
const service_1 = require("./service");
const util_1 = require("./util");
var Module = require('module');
const verbose = false;
require("colors");
// node-color-readline blows up in non-TTY envs
const readline = process.stdout.isTTY ? readlineTTY : readlineNoTTY;
let defaultPrompt = 'ts> ';
const MORE_LINES_PROMPT = '..';
// a buffer for multiline editing
var multilineBuffer = '';
var rl = createReadLine();
function colorize(line) {
    let colorized = '';
    let regex = [
        [/\/\/.*$/m, 'grey'],
        [/(['"`\/]).*?(?!<\\)\1/, 'cyan'],
        [/[+-]?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?/, 'cyan'],
        [/\b(true|false|null|undefined|NaN|Infinity)\b/, 'blue'],
        [/\b(in|if|for|while|var|new|function|do|return|void|else|break)\b/, 'green'],
        [/\b(instanceof|with|case|default|try|this|switch|continue|typeof)\b/, 'green'],
        [/\b(let|yield|const|class|extends|interface|type)\b/, 'green'],
        [/\b(try|catch|finally|Error|delete|throw|import|from|as)\b/, 'red'],
        [/\b(eval|isFinite|isNaN|parseFloat|parseInt|decodeURI|decodeURIComponent)\b/, 'yellow'],
        [/\b(encodeURI|encodeURIComponent|escape|unescape|Object|Function|Boolean|Error)\b/, 'yellow'],
        [/\b(Number|Math|Date|String|RegExp|Array|JSON|=>|string|number|boolean)\b/, 'yellow'],
        [/\b(console|module|process|require|arguments|fs|global)\b/, 'yellow'],
        [/\b(private|public|protected|abstract|namespace|declare|@)\b/, 'magenta'],
        [/\b(keyof|readonly)\b/, 'green'],
    ];
    while (line !== '') {
        let start = +Infinity;
        let color = '';
        let length = 0;
        for (let reg of regex) {
            let match = reg[0].exec(line);
            if (match && match.index < start) {
                start = match.index;
                color = reg[1];
                length = match[0].length;
            }
        }
        colorized += line.substring(0, start);
        if (color) {
            colorized += line.substr(start, length)[color];
        }
        line = line.substr(start + length);
    }
    return colorized;
}
function createReadLine() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        colorize: colorize,
        completer(line) {
            let code = multilineBuffer + '\n' + line;
            return service_1.completer(code);
        }
    });
}
// Much of this function is from repl.REPLServer.createContext
function createContext() {
    var builtinLibs = require('repl')._builtinLibs;
    var context;
    context = vm.createContext();
    util_1.assign(context, global);
    context.console = new console_1.Console(process.stdout);
    context.global = context;
    context.global.global = context;
    context.module = new Module('<repl>');
    try {
        // hack for require.resolve("./relative") to work properly.
        context.module.filename = path.resolve('repl');
    }
    catch (e) {
        // path.resolve('repl') fails when the current working directory has been
        // deleted.  Fall back to the directory name of the (absolute) executable
        // path.  It's not really correct but what are the alternatives?
        const dirname = path.dirname(process.execPath);
        context.module.filename = path.resolve(dirname, 'repl');
    }
    context.module.paths = Module._nodeModulePaths(context.module.filename);
    context.paths = Module._resolveLookupPaths(process.cwd(), context.module)[1];
    var req = context.module.require.bind(context.module);
    context.require = req;
    // Lazy load modules on use
    builtinLibs.forEach(function (name) {
        Object.defineProperty(context, name, {
            get: function () {
                var lib = require(name);
                context[name] = lib;
                return lib;
            },
            // Allow creation of globals of the same name
            set: function (val) {
                delete context[name];
                context[name] = val;
            },
            configurable: true
        });
    });
    return context;
}
function printHelp() {
    console.log(`
ts-repl commands
:type symbol       print the type of an identifier
:doc  symbol       print the documentation for an identifier
:clear             clear all the code
:print             print code input so far
:help              print this manual
:paste             enter paste mode
:load filename     source typescript file in current context`);
}
var context = createContext();
function startEvaluate(code) {
    multilineBuffer = '';
    let allDiagnostics = service_1.getDiagnostics(code);
    if (allDiagnostics.length) {
        console.warn(allDiagnostics.join('\n').bold.red);
        return repl(defaultPrompt);
    }
    let current = service_1.getCurrentCode();
    if (verbose) {
        console.log(current.green);
    }
    try {
        var result = vm.runInContext(current, context);
        // If the result is a promise. Output its value when resolved.
        if (result && result.then) {
            result.then((val) => console.log(util.inspect(val, false, 2, true))).catch((err) => console.log(err.stack));
        }
        console.log(util.inspect(result, false, 2, true));
    }
    catch (e) {
        console.log(e.stack);
    }
}
function waitForMoreLines(code, indentLevel) {
    if (/\n{2}$/.test(code)) {
        console.log('You typed two blank lines! start new command'.yellow);
        multilineBuffer = '';
        return repl(defaultPrompt);
    }
    var nextPrompt = '';
    for (var i = 0; i < indentLevel; i++) {
        nextPrompt += MORE_LINES_PROMPT;
    }
    multilineBuffer = code;
    repl(nextPrompt);
}
function replLoop(_, code) {
    code = multilineBuffer + '\n' + code;
    let diagnostics = service_1.testSyntacticError(code);
    if (diagnostics.length === 0) {
        startEvaluate(code);
        repl(defaultPrompt);
    }
    else {
        let openCurly = (code.match(/\{/g) || []).length;
        let closeCurly = (code.match(/\}/g) || []).length;
        let openParen = (code.match(/\(/g) || []).length;
        let closeParen = (code.match(/\)/g) || []).length;
        // at lease one indent in multiline
        let indentLevel = (openCurly - closeCurly + openParen - closeParen) || 1;
        waitForMoreLines(code, indentLevel || 1);
    }
}
function addLine(line) {
    multilineBuffer += '\n' + line;
}
function enterPasteMode() {
    console.log('// entering paste mode, press ctrl-d to evaluate'.cyan);
    console.log('');
    let oldPrompt = defaultPrompt;
    rl.setPrompt('');
    rl.on('line', addLine);
    rl.once('close', () => {
        console.log('evaluating...'.cyan);
        rl.removeListener('line', addLine);
        startEvaluate(multilineBuffer);
        rl = createReadLine();
        repl(defaultPrompt = oldPrompt);
    });
}
function loadFile(filename) {
    try {
        let filePath = path.resolve(filename);
        let fileContents = fs.readFileSync(filePath, 'utf8');
        if (verbose) {
            console.log(`loading file: ${filePath}`.cyan);
            console.log(colorize(fileContents));
            console.log('evaluating...'.cyan);
        }
        startEvaluate(fileContents);
    }
    catch (e) {
        console.log(e);
    }
}
function getSource(name) {
    let declarations = service_1.getDeclarations();
    for (let file in declarations) {
        let names = declarations[file];
        if (names[name]) {
            let decl = names[name];
            let pager = process.env.PAGER;
            let parent = decl[0].parent;
            let text = parent ? parent.getFullText() : '';
            if (!pager || text.split('\n').length < 24) {
                console.log(text);
                repl(defaultPrompt);
                return;
            }
            process.stdin.pause();
            var tty = require('tty');
            tty.setRawMode(false);
            var temp = require('temp');
            let tempFile = temp.openSync('DUMMY_FILE' + Math.random());
            fs.writeFileSync(tempFile.path, text);
            let display = child_process.spawn('less', [tempFile.path], {
                'stdio': [0, 1, 2]
            });
            display.on('exit', function () {
                temp.cleanupSync();
                tty.setRawMode(true);
                process.stdin.resume();
                repl(defaultPrompt);
            });
            return;
        }
    }
    console.log(`identifier ${name} not found`.yellow);
}
// main loop
function repl(prompt) {
    'use strict';
    rl.question(prompt, function (code) {
        if (/^:(type|doc)/.test(code)) {
            let identifier = code.split(' ')[1];
            if (!identifier) {
                console.log(':type command need names!'.red);
                return repl(prompt);
            }
            const ret = service_1.getType(identifier, code.indexOf('doc') === 1);
            if (ret) {
                console.log(colorize(ret));
            }
            else {
                console.log(`no info for "${identifier}" is found`.yellow);
            }
            return repl(prompt);
        }
        if (/^:source/.test(code)) {
            let identifier = code.split(' ')[1];
            if (!identifier) {
                console.log(':source command need names!'.red);
                return repl(prompt);
            }
            getSource(identifier);
            return;
        }
        if (/^:help/.test(code)) {
            printHelp();
            return repl(prompt);
        }
        if (/^:clear/.test(code)) {
            service_1.clearHistory();
            multilineBuffer = '';
            context = createContext();
            return repl(defaultPrompt);
        }
        if (/^:print/.test(code)) {
            console.log(colorize(service_1.acceptedCodes));
            return repl(prompt);
        }
        if (/^:paste/.test(code) && !multilineBuffer) {
            return enterPasteMode();
        }
        if (/^:load/.test(code) && !multilineBuffer) {
            let filename = code.split(' ')[1];
            if (!filename) {
                console.log(':load: file name expected'.red);
                return repl(prompt);
            }
            loadFile(filename);
            return repl(prompt);
        }
        replLoop(prompt, code);
    });
}
exports.repl = repl;
function startRepl() {
    repl(defaultPrompt);
}
exports.startRepl = startRepl;

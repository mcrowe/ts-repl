"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const path = require("path");
const child_process = require("child_process");
const fs = require("fs");
function runCode(argv) {
    // run code in temp path, and cleanup
    var temp = require('temp');
    temp.track();
    process.on('SIGINT', () => temp.cleanupSync());
    process.on('SIGTERM', () => temp.cleanupSync());
    let tempPath = temp.mkdirSync('tsrun');
    let outDir = tempPath;
    if (argv.o) {
        outDir = path.join(tempPath, argv.o);
    }
    let compileError = compile(argv._, {
        outDir,
        noEmitOnError: true,
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
    });
    if (compileError)
        process.exit(compileError);
    linkDir(process.cwd(), tempPath);
    // slice argv. 0: node, 1: tsun binary 2: arg
    var newArgv = process.argv.slice(2).map(arg => {
        if (!/\.ts$/.test(arg))
            return arg;
        return path.join(outDir, arg.replace(/ts$/, 'js'));
    });
    child_process.execFileSync('node', newArgv, {
        stdio: 'inherit'
    });
    process.exit();
}
exports.runCode = runCode;
function linkDir(src, dest) {
    let files = ['node_modules', 'typings'];
    for (let file of files) {
        let srcpath = path.join(src, file);
        let destpath = path.join(dest, file);
        fs.symlinkSync(srcpath, destpath, 'dir');
    }
}
function compile(fileNames, options) {
    var program = ts.createProgram(fileNames, options);
    var emitResult = program.emit();
    var allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    allDiagnostics.forEach(diagnostic => {
        var message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (!diagnostic.file)
            return console.log(message);
        var { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    });
    var exitCode = emitResult.emitSkipped ? 1 : 0;
    return exitCode;
}

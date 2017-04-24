"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const path = require("path");
const fs_1 = require("fs");
const diff = require("diff");
const util_1 = require("./util");
// codes has been accepted by service, as opposed to codes in buffer and user input
// if some action fails to compile, acceptedCodes will be rolled-back
exports.acceptedCodes = getInitialCommands();
// a counter indicating repl edition history, every action will increment it
var versionCounter = 0;
function findConfigFile(searchPath) {
    while (true) {
        const fileName = path.join(searchPath, "tsconfig.json");
        if (fs_1.existsSync(fileName)) {
            return fileName;
        }
        const parentPath = path.dirname(searchPath);
        if (parentPath === searchPath) {
            break;
        }
        searchPath = parentPath;
    }
    return undefined;
}
const CWD = process.cwd();
const DEFAULT_OPTIONS = {
    target: ts.ScriptTarget.ES5,
    newLine: ts.NewLineKind.LineFeed,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    noUnusedLocals: false,
    configFilePath: path.join(CWD, 'tsconfig.json'),
};
// these option must be set in repl environment
const OVERRIDE_OPTIONS = {
    module: ts.ModuleKind.CommonJS,
    noEmitHelpers: true,
    noUnusedLocals: false,
    sourceMap: false,
    noEmit: false
};
function compileOption() {
    let configFile = findConfigFile(process.cwd());
    if (!configFile) {
        return () => DEFAULT_OPTIONS;
    }
    let configText = fs_1.readFileSync(configFile, 'utf8');
    let result = ts.parseConfigFileTextToJson(configFile, configText);
    if (result.error) {
        return () => DEFAULT_OPTIONS;
    }
    let optionOrError = ts.convertCompilerOptionsFromJson(result.config.compilerOptions, path.dirname(configFile));
    if (optionOrError.errors.length) {
        return () => DEFAULT_OPTIONS;
    }
    let options = optionOrError.options;
    // override some impossible option
    util_1.assign(options, OVERRIDE_OPTIONS);
    return () => options;
}
const resolvedOpt = compileOption()();
const DUMMY_FILE = resolvedOpt.rootDir ? resolvedOpt.rootDir + 'TSUN.repl.generated.ts' : 'TSUN.repl.generated.ts';
var serviceHost = {
    getCompilationSettings: compileOption(),
    getScriptFileNames: () => [DUMMY_FILE],
    getScriptVersion: (fileName) => {
        return fileName === DUMMY_FILE ? versionCounter.toString() : '1';
    },
    getScriptSnapshot: (fileName) => {
        try {
            var text = fileName === DUMMY_FILE
                ? exports.acceptedCodes
                : fs_1.readFileSync(fileName).toString();
            return ts.ScriptSnapshot.fromString(text);
        }
        catch (e) {
            return undefined;
        }
    },
    getCurrentDirectory: () => CWD,
    getDirectories: ts.sys.getDirectories,
    directoryExists: ts.sys.directoryExists,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options)
};
var service = ts.createLanguageService(serviceHost);
exports.getDeclarations = (function () {
    var declarations = {};
    let declFiles = getDeclarationFiles();
    for (let file of declFiles) {
        let text = fs_1.readFileSync(file, 'utf8');
        declarations[file] = collectDeclaration(ts.createSourceFile(file, text, ts.ScriptTarget.Latest));
    }
    return function (cached = false) {
        if (!cached) {
            declarations[DUMMY_FILE] = collectDeclaration(ts.createSourceFile(DUMMY_FILE, exports.acceptedCodes, ts.ScriptTarget.Latest));
        }
        return declarations;
    };
})();
function getDeclarationFiles() {
    var libPaths = [path.resolve(__dirname, '../node_modules/@types/node/index.d.ts')];
    return libPaths;
}
function getInitialCommands() {
    const lines = getDeclarationFiles().map(dir => `/// <reference path="${dir}" />`);
    return lines.join('\n');
}
// private api hacks
function collectDeclaration(sourceFile) {
    let decls = sourceFile.getNamedDeclarations();
    var ret = {};
    for (let decl in decls) {
        ret[decl] = Array.isArray(decls[decl]) && decls[decl].map((t) => t.name);
    }
    return ret;
}
function completer(line) {
    // append new line to get completions, then revert new line
    versionCounter++;
    let originalCodes = exports.acceptedCodes;
    exports.acceptedCodes += line;
    if (':' === line[0]) {
        let candidates = ['type', 'detail', 'source', 'paste', 'clear', 'print', 'help'];
        candidates = candidates.map(c => ':' + c).filter(c => c.indexOf(line) >= 0);
        return [candidates, line.trim()];
    }
    let completions = service.getCompletionsAtPosition(DUMMY_FILE, exports.acceptedCodes.length);
    if (!completions) {
        exports.acceptedCodes = originalCodes;
        return [[], line];
    }
    let prefix = /[A-Za-z_$]+$/.exec(line);
    let candidates = [];
    if (prefix) {
        let prefixStr = prefix[0];
        candidates = completions.entries.filter((entry) => {
            let name = entry.name;
            return name.substr(0, prefixStr.length) == prefixStr;
        }).map(entry => entry.name);
    }
    else {
        candidates = completions.entries.map(entry => entry.name);
    }
    exports.acceptedCodes = originalCodes;
    return [candidates, prefix ? prefix[0] : line];
}
exports.completer = completer;
function getType(name, detailed) {
    versionCounter++;
    let originalCodes = exports.acceptedCodes;
    exports.acceptedCodes += '\n;' + name;
    let typeInfo = service.getQuickInfoAtPosition(DUMMY_FILE, exports.acceptedCodes.length - 1);
    let ret = '';
    if (typeInfo) {
        ret = detailed
            ? ts.displayPartsToString(typeInfo.documentation)
            : ts.displayPartsToString(typeInfo.displayParts);
    }
    exports.acceptedCodes = originalCodes;
    return ret;
}
exports.getType = getType;
function getDiagnostics(code) {
    let fallback = exports.acceptedCodes;
    exports.acceptedCodes += code;
    versionCounter++;
    let allDiagnostics = service.getCompilerOptionsDiagnostics()
        .concat(service.getSemanticDiagnostics(DUMMY_FILE));
    let ret = allDiagnostics.map(diagnostic => {
        let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        return message;
    });
    if (ret.length)
        exports.acceptedCodes = fallback;
    return ret;
}
exports.getDiagnostics = getDiagnostics;
let lastOutput = '';
function getCurrentCode() {
    let emit = service.getEmitOutput(DUMMY_FILE);
    let output = emit.outputFiles[0].text;
    let changes = diff.diffLines(lastOutput, output);
    let ret = changes.filter(c => c.added).map(c => c.value).join('\n');
    lastOutput = output;
    return ret;
}
exports.getCurrentCode = getCurrentCode;
function testSyntacticError(code) {
    let fallback = exports.acceptedCodes;
    versionCounter++;
    exports.acceptedCodes += code;
    let diagnostics = service.getSyntacticDiagnostics(DUMMY_FILE);
    exports.acceptedCodes = fallback;
    return diagnostics;
}
exports.testSyntacticError = testSyntacticError;
function clearHistory() {
    exports.acceptedCodes = getInitialCommands();
    lastOutput = '';
}
exports.clearHistory = clearHistory;

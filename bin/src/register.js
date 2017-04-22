"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const fs = require("fs");
require.extensions['.ts'] = function (module, filename) {
    var text = fs.readFileSync(filename, 'utf8');
    module._compile(ts.transpile(text, {}, filename), filename);
};

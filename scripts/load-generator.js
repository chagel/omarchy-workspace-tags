// Load Generator.js as plain JavaScript.
//
// `.pragma library` is a QML directive node cannot parse, and the file has no
// exports of its own, so the symbols are returned explicitly -- which also
// fails loudly if one is renamed out from under a caller.

const fs = require("fs")
const path = require("path")

const NAMES = [
  "DEFAULTS", "BINDINGS", "LABEL_STYLES", "LAYOUTS", "MODIFIERS", "STRIDE", "MAX_TAGS",
  "resolve", "render", "parseBinding", "formatBinding", "modifierSymbol", "tagLabel",
  "labelWidth", "toStringList"
]

function loadGenerator() {
  const source = fs
    .readFileSync(path.join(__dirname, "..", "Generator.js"), "utf8")
    .replace(/^\s*\.pragma\s+library\s*/, "")

  return new Function(source + "\n;return { " + NAMES.join(", ") + " };")()
}

module.exports = { loadGenerator }

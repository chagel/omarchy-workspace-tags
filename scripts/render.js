// Print the Hyprland config the panel would write, for the settings this
// machine is actually running.
//
//   node scripts/render.js
//
// Same Generator.js the widget uses, so the output is what the panel produces
// on save -- which is what makes it safe to diff against the live file.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { loadGenerator } = require("./load-generator")

const shellPath = path.join(os.homedir(), ".config/omarchy/shell.json")
const shell = JSON.parse(fs.readFileSync(shellPath, "utf8"))

const entry = Object.values(shell.bar.layout)
  .flat()
  .find(e => e && e.id === "chagel.workspace-tags")

if (!entry) {
  console.error("chagel.workspace-tags is not in the bar layout")
  process.exit(1)
}

process.stdout.write(loadGenerator().render(entry))

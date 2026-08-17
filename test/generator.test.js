// Tests for Generator.js -- the settings-to-Lua layer.
//
//   node test/generator.test.js
//
// No dependencies and no test framework: this has to run anywhere the plugin
// can be checked out. Generator.js is deliberately free of Qt so it can be
// exercised outside the shell, which is what makes this possible at all.

const assert = require("assert")
const fs = require("fs")
const path = require("path")
const { loadGenerator } = require("../scripts/load-generator")

const g = loadGenerator()

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log("  ok    " + name)
  } catch (error) {
    failures++
    console.log("  FAIL  " + name + "\n          " + error.message.split("\n")[0])
  }
}

// ---- Settings resolution

test("tag count is clamped to what the digit row can bind", () => {
  // A tenth tag would ask for `CONTROL + 10`, which Hyprland accepts and then
  // registers as nothing, so the cap is a correctness bound rather than taste.
  assert.strictEqual(g.resolve({ tags: 12 }).tags, 9)
  assert.strictEqual(g.resolve({ tags: 20 }).tags, 9)
  assert.strictEqual(g.resolve({ tags: 0 }).tags, 1)
  assert.strictEqual(g.resolve({ tags: 5 }).tags, 5)
})

test("tag count survives junk", () => {
  assert.strictEqual(g.resolve({ tags: "x" }).tags, g.DEFAULTS.tags)
  assert.strictEqual(g.resolve({ tags: undefined }).tags, g.DEFAULTS.tags)
  assert.strictEqual(g.resolve({}).tags, g.DEFAULTS.tags)
})

test("block size is a constant, not a setting", () => {
  // Nothing resolves it into the settings object, so there is nowhere for a
  // second, disagreeing copy to live.
  assert.strictEqual(g.DEFAULTS.stride, undefined)
  assert.strictEqual(g.resolve({ stride: 99 }).stride, undefined)
  assert.ok(g.render({ stride: 99, monitors: ["A"] }).includes("local STRIDE = " + g.STRIDE))
})

test("monitors accept a QVariantList, not just a real array", () => {
  // Settings arrive from shell.json as a QVariantList proxy: it indexes and
  // reports length like an array, but Array.isArray is false for it. Checking
  // that once threw every configured monitor away and left each screen
  // unpinned.
  const proxy = Object.assign(Object.create(null), { 0: "A", 1: "B", length: 2 })
  assert.deepStrictEqual(g.resolve({ monitors: proxy }).monitors, ["A", "B"])
  assert.deepStrictEqual(g.resolve({ monitors: ["A", "B"] }).monitors, ["A", "B"])
})

test("monitors tolerate a bare string, blanks and nothing at all", () => {
  assert.deepStrictEqual(g.resolve({ monitors: "A" }).monitors, ["A"])
  assert.deepStrictEqual(g.resolve({ monitors: ["A", "", "B"] }).monitors, ["A", "B"])
  assert.deepStrictEqual(g.resolve({ monitors: undefined }).monitors, [])
  assert.deepStrictEqual(g.resolve({}).monitors, [])
})

// ---- Labels

test("every label style renders all nine tags", () => {
  for (const style of g.LABEL_STYLES) {
    for (let tag = 1; tag <= 9; tag++) {
      const label = g.tagLabel(tag, style.value)
      assert.ok(label && label.length > 0, style.value + " tag " + tag)
    }
  }
})

test("chinese-formal uses the traditional forms", () => {
  // The point of the formal set is that it is hard to alter, and the
  // traditional glyphs are what belong on a cheque: 貳 參 陸, not 贰 参 陆.
  assert.strictEqual(g.tagLabel(2, "chinese-formal"), "貳")
  assert.strictEqual(g.tagLabel(3, "chinese-formal"), "參")
  assert.strictEqual(g.tagLabel(6, "chinese-formal"), "陸")
})

test("greek is lowercase, so it cannot be mistaken for letters", () => {
  assert.strictEqual(g.tagLabel(1, "greek"), "α")
  assert.strictEqual(g.tagLabel(1, "letters"), "A")
  assert.notStrictEqual(g.tagLabel(2, "greek"), g.tagLabel(2, "letters"))
})

test("a tag beyond a style's table falls back to its number", () => {
  for (const style of ["roman", "greek", "chinese", "chinese-formal"]) {
    assert.strictEqual(g.tagLabel(12, style), "12")
  }
})

test("an unknown style is numbers, not blank", () => {
  assert.strictEqual(g.tagLabel(4, "no-such-style"), "4")
  assert.strictEqual(g.tagLabel(4, undefined), "4")
})

test("styles whose glyphs are wider get wider cells", () => {
  // Cells are uniform so the row reads as a grid, which means the widest label
  // in a style sets the width for all of them. "VIII" is four characters, and
  // CJK is drawn full-width by the fallback font.
  assert.ok(g.labelWidth("roman") > g.labelWidth("numbers"))
  assert.ok(g.labelWidth("chinese") > g.labelWidth("numbers"))
  assert.strictEqual(g.labelWidth("chinese-formal"), g.labelWidth("chinese"))
  assert.strictEqual(g.labelWidth("anything-else"), g.labelWidth("numbers"))
})

// ---- Keybindings

test("every modifier has a symbol, and anything else keeps its name", () => {
  for (const modifier of g.MODIFIERS) {
    assert.notStrictEqual(g.modifierSymbol(modifier), modifier)
  }
  assert.strictEqual(g.modifierSymbol("HYPER"), "HYPER")
})

test("binding strings split into modifiers and a key", () => {
  assert.deepStrictEqual(g.parseBinding("SUPER + SHIFT"), { mods: ["SUPER", "SHIFT"], key: "" })
  assert.deepStrictEqual(g.parseBinding("SUPER + bracketleft"), { mods: ["SUPER"], key: "bracketleft" })
  assert.deepStrictEqual(g.parseBinding(""), { mods: [], key: "" })
  assert.deepStrictEqual(g.parseBinding("PRINT"), { mods: [], key: "PRINT" })
})

test("modifier spellings fold onto one chip", () => {
  assert.deepStrictEqual(g.parseBinding("CONTROL").mods, ["CTRL"])
  assert.deepStrictEqual(g.parseBinding("WIN").mods, ["SUPER"])
  assert.deepStrictEqual(g.parseBinding("  super+ctrl +  comma "), { mods: ["SUPER", "CTRL"], key: "comma" })
})

test("a token that is not a modifier is kept as the key", () => {
  // Dropping it would silently rewrite someone's binding.
  assert.strictEqual(g.parseBinding("SUPER + XF86AudioPlay").key, "XF86AudioPlay")
  assert.strictEqual(g.parseBinding("SUPER + mouse_down").key, "mouse_down")
})

test("modifiers are written back in one fixed order", () => {
  assert.strictEqual(g.formatBinding(["SHIFT", "SUPER"], ""), "SUPER + SHIFT")
  assert.strictEqual(g.formatBinding(["ALT", "SUPER"], "comma"), "SUPER + ALT + comma")
  assert.strictEqual(g.formatBinding([], "PRINT"), "PRINT")
  assert.strictEqual(g.formatBinding([], ""), "")
})

test("parsing is idempotent", () => {
  for (const spec of ["SUPER + SHIFT + ALT", "alt+super+ctrl+comma", "CONTROL + 1"]) {
    const once = g.parseBinding(spec)
    const twice = g.parseBinding(g.formatBinding(once.mods, once.key))
    assert.deepStrictEqual(twice, once, spec)
  }
})

test("the shipped defaults survive a round trip unchanged", () => {
  // Normalising must not rewrite bindings that were already written by hand,
  // which is why the modifier order matches the one Omarchy's configs use.
  for (const binding of g.BINDINGS) {
    const spec = g.DEFAULTS[binding.key]
    const parsed = g.parseBinding(spec)
    const back = g.formatBinding(parsed.mods, parsed.key)
    const expected = spec.replace(/\bCONTROL\b/, "CTRL")
    assert.strictEqual(back, expected, binding.key)
  }
})

test("every binding has a default and a label", () => {
  for (const binding of g.BINDINGS) {
    assert.ok(binding.label, binding.key + " has no label")
    assert.ok(g.DEFAULTS[binding.key], binding.key + " has no default")
  }
})

// ---- Generated config

const lua = g.render({ monitors: ["Left Monitor", "Right Monitor"] })

test("the generated config declares the tag and block counts", () => {
  assert.match(lua, /^local TAGS = 9$/m)
  assert.match(lua, new RegExp("^local STRIDE = " + g.STRIDE + "$", "m"))
})

test("every one of Omarchy's digit rows is retired, by keycode", () => {
  // Omarchy binds the row as code:<n+9>. Keysym and keycode binds are
  // independent, so unbinding by keysym would not have reached them -- and this
  // cannot disturb a `SUPER + 1` of the user's own.
  for (const mods of ["SUPER", "SUPER + SHIFT", "SUPER + SHIFT + ALT"]) {
    assert.ok(lua.includes('hl.unbind("' + mods + ' + " .. code)'), mods)
  }
})

test("every binding reaches the generated config", () => {
  assert.ok(lua.includes("view(tag)"))
  assert.ok(lua.includes("tag_window(tag, true)"))
  assert.ok(lua.includes("tag_window(tag, false)"))
  assert.ok(lua.includes("step(1)") && lua.includes("step(-1)"))
  assert.ok(lua.includes("cycle_layout()"))
  assert.ok(lua.includes("omarchy-shell shell toggle chagel.workspace-tags"))
  assert.ok(lua.includes('hl.dsp.focus({ monitor = "l" })'))
  assert.ok(lua.includes('hl.dsp.window.move({ monitor = "r" })'))
})

test("a key is unbound before it is bound", () => {
  // Binding a held key in Hyprland stacks rather than replaces, so anything
  // taken over has to be released first.
  const bindings = lua.split("\n").filter(line => line.startsWith("o.bind("))
  assert.ok(bindings.length > 0)
  for (const line of bindings) {
    const spec = /^o\.bind\((".*?")/.exec(line)
    if (!spec) continue
    assert.ok(lua.includes("hl.unbind(" + spec[1] + ")"), "not unbound first: " + spec[1])
  }
})

test("listed monitors are pinned, and an empty list pins nothing", () => {
  // A pinning rule is the one that names a monitor. workspace_rule also shows
  // up in the layout cycler, which is there whether or not anything is pinned.
  const pins = source => (source.match(/monitor = "desc:"/g) || []).length
  assert.ok(pins(lua) > 0)
  assert.ok(lua.includes('"Left Monitor"') && lua.includes('"Right Monitor"'))
  assert.strictEqual(pins(g.render({ monitors: [] })), 0)
})

test("monitors are walked by index, never with ipairs", () => {
  // omarchy-menu-keybindings re-runs this config under a stubbed `hl` whose
  // fields resolve to a self-referencing table. ipairs never terminates on it,
  // and because a hang is not an error the cheatsheet simply never opens.
  const walks = lua.split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .filter(line => line.includes("hl.get_monitors()"))
  assert.ok(walks.length > 0)
  for (const line of walks) {
    assert.ok(!line.includes("ipairs"), "ipairs over hl.get_monitors(): " + line.trim())
  }
})

test("all three tiled layouts are offered", () => {
  assert.deepStrictEqual(g.LAYOUTS, ["dwindle", "master", "scrolling"])
  assert.ok(lua.includes('local LAYOUTS = { "dwindle", "master", "scrolling" }'))
})

test("per-tag layouts are stored where Omarchy already keeps them", () => {
  // Its own toggle writes the same path, which is what stops the two
  // disagreeing.
  assert.ok(lua.includes("omarchy/workspace-layouts"))
})

test("settings that only describe the bar never reach the compositor", () => {
  for (const key of ["tagLabels", "activeGlyph", "showSettingsIcon", "settingsGlyph",
                     "emptyOpacity", "occupiedOpacity", "dimUnfocusedMonitor"]) {
    assert.ok(!lua.includes(key), key + " leaked into the generated config")
  }
  for (const symbol of ["⌘", "⌃", "⇧", "⌥"]) {
    assert.ok(!lua.includes(symbol), "modifier symbol leaked into the generated config")
  }
})

test("a monitor description cannot break out of its Lua string", () => {
  // Descriptions are user data: they arrive from the compositor and go into a
  // generated file as string literals.
  const nasty = g.render({ monitors: ['He said "hi" \\ then left', "]]--"] })
  assert.ok(nasty.includes('"He said \\"hi\\" \\\\ then left"'))
  assert.ok(nasty.includes('"]]--"'))
})

test("the generated config compiles as Lua", () => {
  const { execFileSync, spawnSync } = require("child_process")
  const available = spawnSync("sh", ["-c", "command -v luac"]).status === 0
  if (!available) {
    console.log("        (skipped: luac not installed)")
    return
  }

  const file = path.join(require("os").tmpdir(), "workspace-tags.generated.test.lua")
  for (const monitors of [[], ["One"], ["One", "Two", "Three"]]) {
    fs.writeFileSync(file, g.render({ monitors }))
    execFileSync("luac", ["-p", file])
  }
  fs.unlinkSync(file)
})

test("the manifest's defaults match the generator's", () => {
  // Two copies of twenty values, in different languages, with no build step to
  // keep them together. Nothing reads the manifest copy at runtime -- resolve()
  // fills absent keys -- but it is what the marketplace listing shows, so a
  // silent divergence misdocuments the plugin.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
  assert.deepStrictEqual(manifest.barWidget.defaults, g.DEFAULTS)
})

test("every binding in the manifest is one the generator emits", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
  for (const binding of g.BINDINGS) {
    assert.ok(binding.key in manifest.barWidget.defaults, binding.key + " missing from the manifest")
  }
})

console.log(failures === 0 ? "\nall passed" : "\n" + failures + " failed")
process.exit(failures === 0 ? 0 : 1)

.pragma library

// Renders ~/.config/hypr/workspace-tags.lua from the widget's settings.
//
// Kept as a plain library so the panel, the bar widget, and the test script all
// agree on one definition of what the settings mean, and so the rendering can
// be exercised without a compositor.

// One block of ten workspace ids per monitor, fixed rather than configurable.
//
// The only constraint the block size ever had was "at least as many ids as
// there are tags", and tags cannot exceed 9: the bindings append the tag number
// to a modifier, so a tenth tag asks for `CONTROL + 10`, which Hyprland accepts
// and then silently registers as nothing. With tags capped at 9, ten is the
// only sensible block -- and it makes an id readable on sight, since the tens
// digit is the monitor and the units digit is the tag.
var STRIDE = 10
var MAX_TAGS = 9

// Label styles for the tags. Presets rather than free text: a label has to stay
// legible at bar size and line up with its neighbours, which arbitrary strings
// do not.
var LABEL_STYLES = [
  { value: "numbers", label: "Numbers" },
  { value: "roman", label: "Roman" },
  { value: "greek", label: "Greek" },
  { value: "chinese", label: "Chinese" },
  { value: "chinese-formal", label: "Chinese (formal)" },
  { value: "letters", label: "Letters" },
  { value: "dots", label: "Dots" }
]

// The whole modifier vocabulary. Small and fixed, which is why the settings
// page offers it as chips: a mistyped modifier is not rejected by Hyprland, it
// simply registers nothing, so free text turns a typo into a key that silently
// does not work.
// Order matters only for display and for the string that gets stored -- to
// Hyprland modifiers are a mask. This particular order is the one Omarchy's own
// configs already use ("SUPER + SHIFT + ALT"), so normalising does not rewrite
// bindings that were already written by hand.
var MODIFIERS = ["SUPER", "CTRL", "SHIFT", "ALT"]

// What the chips draw. The bar font carries all four natively, so none of them
// fall back to another face at a different weight or width -- which rules out
// the obvious alternative for SUPER (U+2756 ❖), whose only cover here is the
// CJK font, drawn full-width.
//
// The set is the Mac one, kept whole rather than mixed: ⌃ ⇧ ⌥ are already those
// symbols, so borrowing ⊞ for SUPER alone would straddle two conventions. Each
// chip names its modifier in a tooltip, so the symbol never has to be guessed.
var MODIFIER_SYMBOLS = {
  SUPER: "\u2318",
  CTRL: "\u2303",
  SHIFT: "\u21E7",
  ALT: "\u2325"
}

function modifierSymbol(modifier) {
  return MODIFIER_SYMBOLS[modifier] || String(modifier)
}

// Hyprland accepts several spellings for the same modifier; fold them all onto
// one chip so a config written by hand still lights up correctly.
var MODIFIER_ALIASES = {
  SUPER: "SUPER", WIN: "SUPER", LOGO: "SUPER", MOD4: "SUPER",
  CTRL: "CTRL", CONTROL: "CTRL",
  ALT: "ALT", MOD1: "ALT",
  SHIFT: "SHIFT"
}

// "SUPER + SHIFT + bracketleft" -> { mods: ["SUPER","SHIFT"], key: "bracketleft" }
// Anything that is not a known modifier is the key, so an unknown token is kept
// rather than dropped -- losing it would silently rewrite the binding.
function parseBinding(spec) {
  var parts = String(spec === undefined || spec === null ? "" : spec).split("+")
  var mods = []
  var key = ""

  for (var i = 0; i < parts.length; i++) {
    var token = parts[i].replace(/^\s+/, "").replace(/\s+$/, "")
    if (!token) continue

    var canonical = MODIFIER_ALIASES[token.toUpperCase()]
    if (canonical) {
      if (mods.indexOf(canonical) === -1) mods.push(canonical)
    } else {
      key = token
    }
  }

  // Canonical order here too, so parsing is idempotent: the chips, the stored
  // string and a re-parse of it all agree however the binding was typed.
  mods.sort(function (left, right) {
    return MODIFIERS.indexOf(left) - MODIFIERS.indexOf(right)
  })

  return { mods: mods, key: key }
}

// Always emitted in MODIFIERS order, so the same combination reads the same way
// however it was typed. Order is irrelevant to Hyprland -- modifiers are a mask.
function formatBinding(mods, key) {
  var ordered = []

  for (var i = 0; i < MODIFIERS.length; i++) {
    if (mods.indexOf(MODIFIERS[i]) !== -1) ordered.push(MODIFIERS[i])
  }

  var text = ordered.join(" + ")
  if (!key) return text
  return text ? text + " + " + key : key
}

// Hyprland's three tiled layouts. A workspace rule can set any of them per
// workspace, which is what makes a per-tag layout possible at all -- and
// `master` is the one Omarchy's own dwindle/scrolling toggle skips, despite
// being the master-and-stack arrangement dwm is built around.
var LAYOUTS = ["dwindle", "master", "scrolling"]

var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]
// Lowercase, because half the uppercase Greek alphabet (Α Β Ε Ζ Η Ι) is drawn
// identically to Latin and would be indistinguishable from the letters style.
var GREEK = ["\u03B1", "\u03B2", "\u03B3", "\u03B4", "\u03B5", "\u03B6", "\u03B7", "\u03B8", "\u03B9"]
var CHINESE = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"]
// The formal numerals (大寫), the ones written on cheques because the common
// forms are a stroke or two away from each other and easy to alter. Denser than
// the common set at bar size, but the nine stay distinct from one another,
// which is all a tag label has to do. Traditional forms throughout -- 貳 參 陸
// rather than the simplified 贰 参 陆.
var CHINESE_FORMAL = ["\u58F9", "\u8CB3", "\u53C3", "\u8086", "\u4F0D", "\u9678", "\u67D2", "\u634C", "\u7396"]

function tagLabel(tag, style) {
  if (style === "roman") return ROMAN[tag - 1] || String(tag)
  if (style === "greek") return GREEK[tag - 1] || String(tag)
  if (style === "chinese") return CHINESE[tag - 1] || String(tag)
  if (style === "chinese-formal") return CHINESE_FORMAL[tag - 1] || String(tag)
  if (style === "letters") return String.fromCharCode(64 + tag)
  if (style === "dots") return "\u25CF"
  return String(tag)
}

// How wide a tag cell has to be for each style, in Style.space units. Cells are
// uniform so the row reads as a grid, which means the widest label in a style
// sets the width for all of them: "VIII" is four characters, and CJK is drawn
// full-width by the fallback font since the bar font carries no CJK at all.
var LABEL_WIDTHS = { roman: 40, chinese: 28, "chinese-formal": 28 }

function labelWidth(style) {
  return LABEL_WIDTHS[style] || 20
}

var DEFAULTS = {
  tags: 9,
  // Widget-only: describe the bar row, never the generated config.
  tagLabels: "numbers",
  // The settings button at the end of the tag row. Safe to turn off, because
  // the keybinding below reaches the panel without it -- which is the whole
  // reason that binding exists.
  showSettingsIcon: true,
  settingsGlyph: "󱂬",
  monitors: [],
  activeGlyph: "󱓻",
  dimUnfocusedMonitor: true,
  occupiedOpacity: 0.85,
  emptyOpacity: 0.3,
  viewMods: "CONTROL",
  moveMods: "SUPER + SHIFT",
  moveSilentMods: "SUPER + SHIFT + ALT",
  focusMonitorLeft: "SUPER + bracketleft",
  focusMonitorRight: "SUPER + bracketright",
  moveMonitorLeft: "SUPER + SHIFT + comma",
  moveMonitorRight: "SUPER + SHIFT + period",
  nextTag: "SUPER + mouse_down",
  previousTag: "SUPER + mouse_up",
  cycleLayout: "SUPER + ALT + L",
  openSettings: "SUPER + ALT + W"
}

// Every key whose binding the generated config takes over. Order is the order
// the settings page lists them in.
// Grouped the way the keys are reached for: first everything that changes what
// you are looking at, then everything that moves a window -- tags before
// monitors in each. Order here is the order the settings page lists them; the
// generator only iterates, so it is free to change.
// Grouped the way the keys are reached for: everything that changes what you
// are looking at, then everything that moves a window -- tags before monitors
// in each -- and last the two that are neither. Cycling a layout rearranges a
// tag rather than moving between or into one, and opening the settings is not
// about windows at all. Order here is the order the settings page lists them;
// the generator only iterates, so it is free to change.
var BINDINGS = [
  { key: "viewMods", label: "View tag N", digits: true },
  { key: "nextTag", label: "Next tag" },
  { key: "previousTag", label: "Previous tag" },
  { key: "focusMonitorLeft", label: "Focus monitor left" },
  { key: "focusMonitorRight", label: "Focus monitor right" },
  { key: "moveMods", label: "Move window to tag N", digits: true },
  { key: "moveSilentMods", label: "Move window to tag N silently", digits: true },
  { key: "moveMonitorLeft", label: "Move window to left monitor" },
  { key: "moveMonitorRight", label: "Move window to right monitor" },
  { key: "cycleLayout", label: "Cycle this tag's layout" },
  { key: "openSettings", label: "Open these settings" }
]

function clampInt(value, low, high, fallback) {
  var n = parseInt(value, 10)
  if (isNaN(n)) return fallback
  return Math.max(low, Math.min(high, n))
}

// Never Array.isArray here. Settings reach QML from shell.json as a
// QVariantList, and Array.isArray is false for that proxy even though it
// indexes and reports length like an array -- so the check silently threw the
// configured monitors away and every screen came back unpinned. Walking by
// length works for both the proxy and a real array, which is what the plain
// JS callers (tests, the generator run from node) hand in.
function toStringList(value) {
  var out = []
  if (!value) return out
  if (typeof value === "string") return value ? [value] : out
  if (typeof value.length !== "number") return out

  for (var i = 0; i < value.length; i++) {
    var entry = String(value[i] === undefined || value[i] === null ? "" : value[i])
    if (entry.length > 0) out.push(entry)
  }

  return out
}

function resolve(settings) {
  var s = settings || {}
  var out = {}

  for (var key in DEFAULTS) {
    out[key] = (s[key] === undefined || s[key] === null) ? DEFAULTS[key] : s[key]
  }

  out.tags = clampInt(out.tags, 1, MAX_TAGS, DEFAULTS.tags)
  out.monitors = toStringList(out.monitors)

  return out
}

// Lua long strings would be simpler, but a monitor description is user data and
// could contain "]]"; %q-style escaping of a normal string cannot be broken out
// of by anything a description can hold.
function luaString(value) {
  return '"' + String(value === undefined || value === null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r") + '"'
}

// The modifier half of a digit binding, with the trailing separator: the tag
// number is concatenated onto it in the generated Lua.
function modsPrefix(mods) {
  const base = String(mods || "").trim().replace(/\s*\+\s*$/, "")
  return base ? base + " + " : ""
}

function render(settings) {
  var c = resolve(settings)
  var lines = []
  var i

  lines.push("-- Generated by the Workspace Tags plugin (chagel.workspace-tags).")
  lines.push("--")
  lines.push("-- Edits here are overwritten the next time the plugin's settings are saved.")
  lines.push("-- Change these values from the widget's panel instead -- this file is")
  lines.push("-- generated output, not something to maintain by hand.")
  lines.push("--")
  lines.push("-- Each monitor owns a private block of workspace ids, so a tag key always means")
  lines.push("-- \"tag N on the monitor I am looking at\" and can never move focus to another")
  lines.push("-- screen -- it never names an id that lives there.")
  lines.push("")
  lines.push("local TAGS = " + c.tags)
  lines.push("local STRIDE = " + STRIDE)
  lines.push("")
  lines.push("local MONITORS = {")
  for (i = 0; i < c.monitors.length; i++) {
    lines.push("  " + luaString(c.monitors[i]) + ",")
  }
  lines.push("}")
  lines.push("")
  lines.push("local declared = {}")
  lines.push("for slot, description in ipairs(MONITORS) do")
  lines.push("  declared[description] = slot")
  lines.push("end")
  lines.push("")
  lines.push("-- Always walk hl.get_monitors() by index rather than with ipairs.")
  lines.push("--")
  lines.push("-- omarchy-menu-keybindings recovers the descriptions for Lua binds by running")
  lines.push("-- the config through a plain `lua` with a stubbed hl, where every unknown field")
  lines.push("-- resolves to a table whose __index returns itself. ipairs stops at the first")
  lines.push("-- nil and that stub never produces one, so it spins forever -- and a hang is not")
  lines.push("-- an error, so the pcall around the scan never returns and the cheatsheet simply")
  lines.push("-- never opens. `#` on the same stub is 0, which walks nothing.")
  lines.push("local function slot_of(monitor)")
  lines.push("  local slot = declared[monitor.description]")
  lines.push("  if slot then")
  lines.push("    return slot")
  lines.push("  end")
  lines.push("")
  lines.push("  local monitors = hl.get_monitors()")
  lines.push("  slot = #MONITORS + 1")
  lines.push("  for index = 1, #monitors do")
  lines.push("    local other = monitors[index]")
  lines.push("    if not declared[other.description] and other.x < monitor.x then")
  lines.push("      slot = slot + 1")
  lines.push("    end")
  lines.push("  end")
  lines.push("")
  lines.push("  return slot")
  lines.push("end")
  lines.push("")
  lines.push("local function base_of(monitor)")
  lines.push("  return (slot_of(monitor) - 1) * STRIDE")
  lines.push("end")
  lines.push("")

  if (c.monitors.length > 0) {
    lines.push("-- Pin every declared id to its monitor, so the partition is enforced rather")
    lines.push("-- than merely followed by the bindings. Tag 1 of each block is that monitor's")
    lines.push("-- default, so a screen that comes up empty lands on its own tag 1.")
    lines.push("for slot, description in ipairs(MONITORS) do")
    lines.push("  for tag = 1, TAGS do")
    lines.push("    hl.workspace_rule({")
    lines.push("      workspace = tostring((slot - 1) * STRIDE + tag),")
    lines.push("      monitor = \"desc:\" .. description,")
    lines.push("      default = tag == 1 or nil,")
    lines.push("    })")
    lines.push("  end")
    lines.push("end")
  } else {
    lines.push("-- No monitors listed in the settings, so nothing is pinned: slots are assigned")
    lines.push("-- left to right from whatever is connected. List them to pin the blocks.")
  }
  lines.push("")
  lines.push("-- Last tag seen on each monitor, so re-pressing the tag you are on returns to")
  lines.push("-- the previous one the way dwm's view does. binds:workspace_back_and_forth")
  lines.push("-- would do this for free, but its \"previous\" is global: switch monitors in")
  lines.push("-- between and it sends you to the other screen, which is what this config")
  lines.push("-- exists to prevent.")
  lines.push("local current, previous = {}, {}")
  lines.push("")
  lines.push("local function sample()")
  lines.push("  local monitors = hl.get_monitors()")
  lines.push("  for index = 1, #monitors do")
  lines.push("    local monitor = monitors[index]")
  lines.push("    local workspace = monitor.active_workspace")
  lines.push("    if workspace and not workspace.special then")
  lines.push("      local slot = slot_of(monitor)")
  lines.push("      if current[slot] ~= workspace.id then")
  lines.push("        previous[slot] = current[slot]")
  lines.push("        current[slot] = workspace.id")
  lines.push("      end")
  lines.push("    end")
  lines.push("  end")
  lines.push("end")
  lines.push("")
  lines.push("hl.on(\"hyprland.start\", sample)")
  lines.push("hl.on(\"workspace.active\", sample)")
  lines.push("hl.on(\"monitor.focused\", sample)")
  lines.push("-- hyprland.start does not fire on `hyprctl reload`, so seed it here too.")
  lines.push("sample()")
  lines.push("")
  lines.push("local function view(tag)")
  lines.push("  local monitor = hl.get_active_monitor()")
  lines.push("  if not monitor then")
  lines.push("    return")
  lines.push("  end")
  lines.push("")
  lines.push("  local slot = slot_of(monitor)")
  lines.push("  local target = (slot - 1) * STRIDE + tag")
  lines.push("  local active = monitor.active_workspace")
  lines.push("")
  lines.push("  if active and active.id == target then")
  lines.push("    target = previous[slot]")
  lines.push("    if not target then")
  lines.push("      return")
  lines.push("    end")
  lines.push("  end")
  lines.push("")
  lines.push("  hl.dispatch(hl.dsp.focus({ workspace = tostring(target) }))")
  lines.push("end")
  lines.push("")
  lines.push("local function tag_window(tag, follow)")
  lines.push("  local monitor = hl.get_active_monitor()")
  lines.push("  if not monitor then")
  lines.push("    return")
  lines.push("  end")
  lines.push("")
  lines.push("  local target = tostring(base_of(monitor) + tag)")
  lines.push("  hl.dispatch(hl.dsp.window.move(follow and { workspace = target } or { workspace = target, follow = false }))")
  lines.push("end")
  lines.push("")
  lines.push("-- The selectors Hyprland offers for this (e+1, r+1) walk every workspace on")
  lines.push("-- every monitor, so the step is computed here instead.")
  lines.push("local function step(delta)")
  lines.push("  local monitor = hl.get_active_monitor()")
  lines.push("  if not monitor then")
  lines.push("    return")
  lines.push("  end")
  lines.push("")
  lines.push("  local base = base_of(monitor)")
  lines.push("  local active = monitor.active_workspace")
  lines.push("  local tag = active and (active.id - base) or 1")
  lines.push("  if tag < 1 or tag > TAGS then")
  lines.push("    tag = 1")
  lines.push("  end")
  lines.push("")
  lines.push("  hl.dispatch(hl.dsp.focus({ workspace = tostring(base + ((tag - 1 + delta) % TAGS) + 1) }))")
  lines.push("end")
  lines.push("")

  // Binding a key that is already held stacks rather than replaces, so
  // everything taken over is unbound first. Omarchy binds the digit row as
  // layout-independent keycodes (code:<n+9>), which are the same physical keys
  // as the symbols bound below.
  // ---- Per-tag layout
  lines.push("-- Per-tag layout: dwm's other half, where each tag remembers how its windows")
  lines.push("-- are arranged rather than the whole session sharing one arrangement.")
  lines.push("local LAYOUTS = { " + LAYOUTS.map(luaString).join(", ") + " }")
  lines.push("")
  lines.push("-- Persisted where Omarchy already keeps per-workspace layouts rather than in")
  lines.push("-- this file. omarchy-hyprland-workspace-layout-toggle writes the same path and")
  lines.push("-- default/hypr/workspace-layouts.lua restores it on every reload, so the two")
  lines.push("-- toggles cannot disagree -- and because that restore runs after this file, a")
  lines.push("-- layout picked at runtime survives the next regeneration.")
  lines.push("local layouts_dir = require(\"default.hypr.paths\").state_home .. \"/omarchy/workspace-layouts\"")
  lines.push("")
  lines.push("local function cycle_layout()")
  lines.push("  local workspace = hl.get_active_workspace()")
  lines.push("  -- A special workspace has no id to write a rule for.")
  lines.push("  if not workspace or workspace.special then")
  lines.push("    return")
  lines.push("  end")
  lines.push("")
  lines.push("  local index = 0")
  lines.push("  for position = 1, #LAYOUTS do")
  lines.push("    if LAYOUTS[position] == workspace.tiled_layout then")
  lines.push("      index = position")
  lines.push("    end")
  lines.push("  end")
  lines.push("")
  lines.push("  -- index stays 0 for a layout that is not in the list, which lands on the")
  lines.push("  -- first one rather than erroring.")
  lines.push("  local layout = LAYOUTS[(index % #LAYOUTS) + 1]")
  lines.push("  local id = tostring(workspace.id)")
  lines.push("")
  lines.push("  hl.workspace_rule({ workspace = id, layout = layout })")
  lines.push("")
  lines.push("  os.execute(\"mkdir -p \" .. string.format(\"%q\", layouts_dir))")
  lines.push("  local file = io.open(layouts_dir .. \"/\" .. id .. \".lua\", \"w\")")
  lines.push("  if file then")
  lines.push("    file:write(string.format(\"hl.workspace_rule({ workspace = %q, layout = %q })\\n\", id, layout))")
  lines.push("    file:close()")
  lines.push("  end")
  lines.push("")
  lines.push("  hl.exec_cmd(o.notify(\"Tag layout: \" .. layout))")
  lines.push("end")
  lines.push("")

  lines.push("-- Binding a held key stacks rather than replaces, so every key taken over here")
  lines.push("-- is unbound first.")
  lines.push("--")
  lines.push("-- All three of Omarchy's digit rows go, not just the ones that collide. They")
  lines.push("-- switch and move by *absolute* workspace, and once ids are partitioned an")
  lines.push("-- absolute id belongs to one particular monitor -- so pressing one from the")
  lines.push("-- other screen teleports you there, which is the behaviour this config exists")
  lines.push("-- to remove. Leaving them bound would keep the bug on a spare key.")
  lines.push("--")
  lines.push("-- They are unbound by keycode because that is how Omarchy binds them. Keysym")
  lines.push("-- and keycode binds are independent: this cannot disturb a `SUPER + 1` of your")
  lines.push("-- own, and a keysym unbind would not have reached Omarchy's.")
  lines.push("for tag = 1, TAGS do")
  lines.push("  local code = \"code:\" .. tostring(tag + 9)")
  lines.push("  hl.unbind(\"SUPER + \" .. code)")
  lines.push("  hl.unbind(\"SUPER + SHIFT + \" .. code)")
  lines.push("  hl.unbind(\"SUPER + SHIFT + ALT + \" .. code)")
  for (i = 0; i < BINDINGS.length; i++) {
    if (!BINDINGS[i].digits) continue
    lines.push("  hl.unbind(" + luaString(modsPrefix(c[BINDINGS[i].key])) + " .. tag)")
  }
  lines.push("end")
  lines.push("")
  lines.push("for tag = 1, TAGS do")
  lines.push("  o.bind(" + luaString(modsPrefix(c.viewMods)) + " .. tag, \"View tag \" .. tag, function()")
  lines.push("    view(tag)")
  lines.push("  end)")
  lines.push("  o.bind(" + luaString(modsPrefix(c.moveMods)) + " .. tag, \"Move window to tag \" .. tag, function()")
  lines.push("    tag_window(tag, true)")
  lines.push("  end)")
  lines.push("  o.bind(" + luaString(modsPrefix(c.moveSilentMods)) + " .. tag, \"Move window to tag \" .. tag .. \" silently\", function()")
  lines.push("    tag_window(tag, false)")
  lines.push("  end)")
  lines.push("end")
  lines.push("")

  // Everything that is not a digit row: same shape, differing only in what the
  // key does. A Lua expression for a dispatcher, a `function() ... end` for a
  // local call, a quoted string for a command.
  var singles = [
    { key: "nextTag", label: "Next tag", action: "function()\n  step(1)\nend" },
    { key: "previousTag", label: "Previous tag", action: "function()\n  step(-1)\nend" },
    { key: "cycleLayout", label: "Cycle this tag's layout", action: "function()\n  cycle_layout()\nend" },
    { key: "openSettings", label: "Open these settings",
      action: luaString("omarchy-shell shell toggle chagel.workspace-tags") },
    { key: "focusMonitorLeft", label: "Focus monitor left", action: 'hl.dsp.focus({ monitor = "l" })' },
    { key: "focusMonitorRight", label: "Focus monitor right", action: 'hl.dsp.focus({ monitor = "r" })' },
    { key: "moveMonitorLeft", label: "Move window to left monitor", action: 'hl.dsp.window.move({ monitor = "l" })' },
    { key: "moveMonitorRight", label: "Move window to right monitor", action: 'hl.dsp.window.move({ monitor = "r" })' }
  ]

  for (i = 0; i < singles.length; i++) {
    lines.push("hl.unbind(" + luaString(c[singles[i].key]) + ")")
    lines.push("o.bind(" + luaString(c[singles[i].key]) + ", " + luaString(singles[i].label)
      + ", " + singles[i].action + ")")
  }
  lines.push("")

  lines.push("-- There is deliberately no binding for hl.dsp.workspace.swap_monitors: swapping")
  lines.push("-- two monitors' active workspaces would put a pinned id on the wrong screen and")
  lines.push("-- fight the rules above. Move the windows, not the workspace.")

  return lines.join("\n") + "\n"
}

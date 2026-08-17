# Workspace Tags

Per-monitor workspace tags for Omarchy, in the style of dwm — a bar widget that
belongs to the monitor it is drawn on, and the Hyprland config to match,
configured entirely from the widget's own settings panel.

Omarchy's stock workspace widget is written for a single screen. A bar surface
exists per monitor, but the widget renders a fixed workspace range and lights
whichever workspace Hyprland reports as *globally* focused. On two monitors both
bars draw the same row, and the bar on the screen you are not looking at
highlights a workspace that is not even on it.

```
                      stock                        this plugin
  left monitor    [1] 2  3  4  5              [1] 2  3  4  5  6  7  8  9
  right monitor   [1] 2  3  4  5               1  2  3  4  5 [6] 7  8  9
                   └── both bars agree,        └── each bar shows its own
                       and one of them lies        screen's tags
```

![The tag row and the settings panel](preview.png)

## What it does

The widget reads its workspace state from the monitor its own bar surface is on,
never from global focus. Tags render in three states — the one you are on, the
ones holding windows, and empty ones — and the selection on the monitor you are
*not* focused on is dimmed, so both bars can show a selection without competing
over which is the current one.

That alone works on stock Omarchy with nothing else configured — the widget
needs no telling which mode it is in. It derives each screen's block by rounding
the live workspace id down to the block size, which is 0 for the ordinary shared
pool, so the same arithmetic covers both and the bar can never disagree with
where Hyprland actually put a workspace.

Turn on tag mode and it goes further, the way dwm does: each monitor gets a
private set of tags, and a tag key always means "show tag N on the monitor I am
looking at".

## Requirements

- Omarchy with `omarchy-shell` (Quickshell)
- Hyprland 0.56+ for tag mode, which uses the Lua config API (`hl.bind` with
  function dispatchers, `hl.workspace_rule`)

Both Chinese label styles additionally need a CJK font (Noto Sans CJK, for
instance). Every other style renders in the bar font.

Nothing is downloaded, built, or installed. There is no network access, no
privileged operation, and no bundled binary.

### What it touches

Everything below is in your own config, and nothing under `~/.config/hypr` is
written until you turn **Per-monitor tags** on. Before that the plugin only
touches its own entry in `shell.json`.

| | |
|---|---|
| `~/.config/omarchy/shell.json` | its own settings entry, through the bar's `updateEntryInline` — on a settings change, and once on first run when it records the monitors it found. Also the bar layout: the master switch stands Omarchy's workspace widget down while tags are on and restores it after, and the Omarchy-menu switch does the same for that button |
| `~/.config/hypr/hyprland.lua` | **written**, but only when you flip the master switch: one fenced block appended at the end, taken back out when you flip it off. The file is copied to `hyprland.lua.bak.<timestamp>` first, and nothing else in the file is touched |
| `~/.config/hypr/workspace-tags.lua` | generated once tags are on, and rewritten on each later settings change. Created by this plugin and owned by it |
| `~/.local/state/omarchy/workspace-layouts/<id>.lua` | one line per tag whose layout you cycled, written by the generated config. Omarchy's own layout toggle writes the same path |

Both files are written through Quickshell's `FileView` with `atomicWrites`, not
through a shell redirect. The only commands it runs are:

- `hyprctl dispatch …` — focus a monitor and a workspace when a tag is clicked
- `hyprctl reload` — after writing the generated config, or the require line
- `cp` — the `hyprland.lua` backup, before the master switch edits it
- `omarchy-shell shell toggle …` — the keybinding that opens the settings panel

## Install

```bash
omarchy plugin add https://github.com/chagel/omarchy-workspace-tags.git --enable
```

It lands at the left of the bar and stands Omarchy's own workspace widget down
on first run, so you are not left with two rows of workspaces. Move it with
`omarchy bar move chagel.workspace-tags --section center` if you would rather it
sat elsewhere.

**Click the icon after the tags to open settings**, or press `SUPER`+`ALT`+`W`.
Everything is configured there — there is no file to hand-edit. Clicking a tag
only ever views that tag, so nothing about the row depends on which mouse button
you use.

The icon can be turned off. With per-monitor tags on, `SUPER`+`ALT`+`W` still
reaches the panel; with it off, `omarchy-shell shell toggle chagel.workspace-tags`
does.

The panel is split in two, since these settings are rarely touched together:

| Tab | |
|---|---|
| **Tags** | How many, how they are labelled, and how they look |
| **Shortcuts** | Every keybinding, and what the generated Hyprland config takes over |

For per-monitor tags, open the settings and turn on **Per-monitor tags**. That
adds one line to your own `~/.config/hypr/hyprland.lua` — backed up first,
fenced so it can be removed again — and turning the switch off takes it back
out.

That line is unavoidable: keybindings and workspace rules can only live in
Hyprland's own config, and no Omarchy plugin kind writes there. It survives
`omarchy update` — the migrations that touch `hyprland.lua` are guarded,
surgical edits — but `omarchy refresh hyprland` overwrites that file along with
every other hypr config, and the switch will read as off again afterwards.

## Remove

Turn **Per-monitor tags** off first. That takes the line back out of your
`hyprland.lua` and gives Omarchy's own workspace widget back. Then:

```bash
omarchy plugin remove chagel.workspace-tags
```

Removing the plugin while tags are still on leaves both behind, because nothing
of ours runs afterwards to undo them. To unpick it by hand: delete the fenced
`workspace-tags` block from `~/.config/hypr/hyprland.lua`, then
`rm ~/.config/hypr/workspace-tags.lua`, then
`omarchy plugin enable omarchy.workspaces`. Drop the line before the file it
loads — the config is read top to bottom.

Layouts you cycled leave a file each under
`~/.local/state/omarchy/workspace-layouts/`. That directory is Omarchy's own, so
delete only the ids this plugin created (11 and up, on a second monitor), or
leave them: a rule for a workspace you never visit does nothing.

Windows keep their workspace ids — `16` stays `16`, now an ordinary workspace in
the shared pool. Renumber with:

```bash
hyprctl dispatch 'hl.dsp.workspace.change_id({ workspace = 16, id = 6 })'
```

## How tag mode works

Without it, workspaces stay one flat pool shared by every monitor: Omarchy binds
the digits to an *absolute* workspace selector and pins nothing to a screen, so a
digit key does not name a place — it names wherever that workspace drifted to
last. Pressing it teleports focus and cursor to the other monitor instead of
showing you something on this one.

dwm never had that problem. The plugin restores it by partitioning the workspace
id space into one block per monitor:

| monitor | tags | workspace ids |
|---|---|---|
| leftmost | 1–9 | 1–9 |
| next | 1–9 | 11–19 |
| next | 1–9 | 21–29 |

Blocks are ten wide and tags cap at nine, both because a binding appends the tag
number to a modifier: a tenth tag asks for `CONTROL + 10`, which Hyprland
accepts and then registers as nothing. It also makes an id readable — tens digit
is the monitor, units the tag, so `16` is monitor 2's tag 6.

Every binding resolves a tag against the *focused* monitor's block, so a digit
key cannot move focus between screens — not by policy, but because it never
names an id that lives on another one.

Monitors need no setting up. Each is detected and remembered the first time it
appears, left to right, and its block is pinned to it. A remembered monitor
keeps its block whether or not it is plugged in, so unplugging one never
renumbers the others — which is why nothing is forgotten automatically. To
reorder or prune, edit the widget's `monitors` entry in `shell.json`.

### Default bindings

All editable in the panel.

| Key | dwm | Action |
|---|---|---|
| `CTRL` + `1`–`9` | `view` | Show tag N on this monitor; press again to return to the previous tag |
| `SUPER`+`SHIFT` + `1`–`9` | `tag` | Move the window to tag N here, and follow it |
| `SUPER`+`SHIFT`+`ALT` + `1`–`9` | `tag` | Move it there and stay put |
| `SUPER` + `[` / `]` | `focusmon` | Focus the monitor left / right |
| `SUPER`+`SHIFT` + `,` / `.` | `tagmon` | Move the window to the monitor left / right |
| `SUPER` + wheel | | Previous / next tag, wrapping within this monitor |
| `SUPER`+`ALT` + `L` | layout keys | Cycle this tag's layout: dwindle → master → scrolling |
| `SUPER`+`ALT` + `W` | | Open this plugin's settings panel |

Modifiers are chips — `⌘` `⌃` `⇧` `⌥`, each naming itself in a tooltip — rather
than a text field. Their vocabulary is four words, and a mistyped modifier is not
an error in Hyprland: it registers nothing. That is exactly the part that must
not be free text. The key itself stays a text field, since its vocabulary is
every key on the board plus names like `mouse_down`. The three digit rows take
modifiers only; the tag number is appended.

The symbols are the Mac set kept whole: `⌃ ⇧ ⌥` already are those glyphs, so
borrowing `⊞` for Super alone would straddle two conventions, and the one
obvious alternative (`❖`) has no cover in the bar font — it would fall back to
the CJK face and draw full-width.

Spellings are folded (`CONTROL` and `CTRL` light the same chip) and the stored
string is written back in a fixed modifier order, so the same combination always
reads the same way however it was typed.

Whatever the generated config takes over is unbound first, since binding a held
key in Hyprland stacks rather than replaces.

All three of Omarchy's digit rows are retired, not just the colliding ones: they
switch by *absolute* workspace, which once ids are partitioned means teleporting
to whichever monitor owns that id.

This cannot disturb digit bindings of your own — Omarchy binds the row by
keycode (`SUPER + code:10`) and that is how the generated config unbinds it, and
keysym and keycode binds are independent in Hyprland.

### Per-tag layouts

dwm's other half: each tag remembers how its windows are arranged, rather than
the whole session sharing one arrangement. Hyprland ships three tiled layouts
and a workspace rule can set any of them per workspace, so the cycle key walks
`dwindle → master → scrolling` for the tag you are on and leaves every other tag
as it was. `master` is the master-and-stack arrangement dwm is built around —
and the one Omarchy's own dwindle/scrolling toggle skips.

The choice is written to `~/.local/state/omarchy/workspace-layouts/<id>.lua`,
which is where `omarchy-hyprland-workspace-layout-toggle` already writes and
what `default/hypr/workspace-layouts.lua` restores on every reload. Reusing it
means the two toggles cannot disagree, and because that restore runs *after* the
generated config, a layout picked at runtime survives regeneration.

### Migrating existing workspaces

Turning tag mode on moves workspaces outside the first block to the monitor that
now owns them, taking their windows along. To keep a window where it is,
renumber its workspace into the right block *before* the first reload — on the
second monitor that means its tag number plus the block size:

```bash
hyprctl dispatch 'hl.dsp.workspace.change_id({ workspace = 6, id = 16 })'
```

## Settings

| Setting | Default | |
|---|---|---|
| `tags` | `9` | Tags per monitor, 1–9 |
| `monitors` | *(detected)* | Remembered monitors, left to right. Maintained by the plugin; no UI — edit shell.json to reorder or prune |
| `tagLabels` | `numbers` | Label style — see the table below |
| `showSettingsIcon` | `true` | Show the settings icon after the tags |
| `settingsGlyph` | `󱂬` | That icon's glyph |
| `activeGlyph` | `󱓻` | Marker for the active tag; empty shows its label |
| `dimUnfocusedMonitor` | `true` | Dim the selection on the monitor you are not on |
| `occupiedOpacity` | `0.85` | Opacity of tags holding windows |
| `emptyOpacity` | `0.3` | Opacity of empty tags |

Every keybinding is a setting too — `viewMods`, `moveMods`, `moveSilentMods`,
`focusMonitorLeft`/`Right`, `moveMonitorLeft`/`Right`, `nextTag`, `previousTag`,
`cycleLayout` and `openSettings`, with the defaults in the table above. All of
them are edited from the Shortcuts tab; none needs hand-editing.

### The Omarchy logo

The Tags tab carries a switch for the Omarchy logo. It draws nothing of its own —
the logo is `omarchy.menu`, a widget in its own right, and the switch simply puts
it on the bar at the head of the left section or takes it off. Drawing a copy
would leave two logos side by side whenever the real one was still enabled.

Nothing is stored for it: the bar layout already knows, and a copy in this
plugin's settings would go stale the moment the widget was moved from Omarchy's
own bar editor. The switch reads the live layout instead.

### Labels

Tags are labelled `numbers` by default. Presets rather than free text, because a
label has to stay legible at bar size and line up with its neighbours:

| `tagLabels` | 1–9 |
|---|---|
| `numbers` | 1 2 3 4 5 6 7 8 9 |
| `roman` | I II III IV V VI VII VIII IX |
| `greek` | α β γ δ ε ζ η θ ι |
| `chinese` | 一 二 三 四 五 六 七 八 九 |
| `chinese-formal` | 壹 貳 參 肆 伍 陸 柒 捌 玖 |
| `letters` | A B C D E F G H I |
| `dots` | ● ● ● ● ● ● ● ● ● |

Cells are a uniform width so the row reads as a grid, which means the widest
label in a style sets the width for all of them — `roman` and both Chinese sets
get wider cells than the rest. Greek is lowercase because half the uppercase
alphabet (Α Β Ε Ζ Η Ι) is drawn identically to Latin and would be
indistinguishable from `letters`.

Both Chinese sets need a CJK font installed; the bar font carries none, so they
render through fallback (Noto Sans Mono CJK, for instance) and are drawn
full-width. `chinese-formal` is the 大寫 set written on cheques, in traditional
forms (貳 參 陸 rather than 贰 参 陆) — denser at bar size than the common
numerals, but the nine stay distinct from one another, which is all a tag label
has to do.

Tags carry no hover tooltip. Position already says which tag is which, and a
popup chasing the pointer across nine of them is noise on the widget you look at
most — the cost being that a non-numeric label does not name itself on hover.
The settings icon does have one, since a lone glyph on a bar otherwise explains
nothing.

## Tests

```bash
node test/generator.test.js
```

`Generator.js` holds everything that turns settings into Lua and is kept free of
Qt, so it runs under plain node with no dependencies and no framework. The suite
covers the settings that reach the compositor and the ones that must not, the
label tables, binding parsing, and the properties the generated config has to
hold — every Omarchy digit row retired, every key unbound before it is bound,
monitors walked by index rather than `ipairs`, and a monitor description unable
to break out of its Lua string. It compiles the output with `luac -p` when that
is available.

## Notes

- **The generated config is build output.** Saving in the panel rewrites
  `~/.config/hypr/workspace-tags.lua` and reloads Hyprland. Edits to it do not
  survive; change the settings instead.
- **There is deliberately no `swap_monitors` binding.** Swapping two monitors'
  active workspaces would put a pinned id on the wrong screen and fight the
  workspace rules. Move the windows, not the workspace.
- **Back-and-forth is tracked per monitor**, not through
  `binds:workspace_back_and_forth`, whose notion of "previous" is global and
  would send you back to the other screen — the exact behaviour tag mode exists
  to remove.
- **The generated config walks monitors by index, never with `ipairs`.**
  `omarchy-menu-keybindings` re-runs your Hyprland config under a stubbed `hl`
  whose fields resolve to a self-referencing table; `ipairs` never terminates on
  it, and because a hang is not an error the keybindings cheatsheet would simply
  never open.

## License

[MIT](LICENSE)

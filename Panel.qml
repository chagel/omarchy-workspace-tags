import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "Generator.js" as Generator

// The widget's popup: one settings page, and the only thing that writes.
//
// Everything configurable lives here rather than in shell.json by hand. Two
// destinations, and the split matters:
//
//   shell.json                        the widget's own appearance, written
//                                     through the bar with updateEntryInline
//   ~/.config/hypr/workspace-tags.lua generated from the same settings, because
//                                     keybindings cannot live anywhere else --
//                                     no Omarchy plugin kind writes compositor
//                                     config and the shell registers no global
//                                     shortcuts
//
// So the plugin owns the file but not the require that loads it: hyprland.lua
// is the user's, and one line in it is the single manual step.
Panel {
  id: root
  moduleName: "chagel.workspace-tags"
  manageIpc: false

  property var anchorItem: null

  // The bar tracks the widget mounted in its slot -- BarWidget.qml -- not this
  // nested panel, so everything the bar identifies a panel by has to be that
  // widget.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property string contentFontFamily: bar && bar.fontFamily ? bar.fontFamily : Style.font.family

  readonly property string home: String(Quickshell.env("HOME") || "")
  readonly property string configPath: home + "/.config/hypr/workspace-tags.lua"
  readonly property string hyprlandPath: home + "/.config/hypr/hyprland.lua"

  // require works here precisely because the file sits under ~/.config/hypr:
  // bootstrap.lua clears package.loaded for the `hypr` prefix on every reload,
  // so a regenerated file is re-read rather than served from the module cache.
  // Moving it elsewhere would silently break that and need dofile instead.
  // require_optional, never a bare require. The file this names is build output
  // and may legitimately not exist yet -- and a require that cannot find its
  // module throws, which abandons the rest of hyprland.lua, taking the user's
  // look-and-feel and autostart with it. This string is both what the button
  // appends and what the panel offers for copying, so it has to be the safe
  // form in both places.
  readonly property string requireLine:
    "require(\"default.hypr.require_optional\").module(\"hypr.workspace-tags\")"

  // Resolved through the generator so this page, the bar row, and the file all
  // read the same defaults from one place.
  readonly property var config: Generator.resolve(settings)

  // ---- Does hyprland.lua already load the generated file?
  //
  // Read rather than assumed, because the hint telling someone to add a line
  // they already added is worse than no hint. A read failure leaves it showing:
  // better a redundant instruction than a silently inert config.
  property string hyprlandText: ""
  property bool hyprlandRead: false

  // Commented-out lines do not count. A plain substring search would read
  // `-- require("hypr.workspace-tags")` as loaded and report everything fine
  // while none of the bindings existed, which is the one case this check is
  // for.
  // On means the generated Hyprland config is loaded: keybindings exist, ids are
  // partitioned, and this plugin owns the workspace row. Off means it is dormant
  // and Omarchy's own widget is back.
  readonly property bool tagsEnabled: !requireMissing

  readonly property bool requireMissing:
    !hyprlandRead || !hyprlandText.split("\n").some(line => root.loadsConfig(line))

  FileView {
    id: hyprlandFile
    path: root.hyprlandPath
    atomicWrites: true
    preload: true
  // No watcher: watchChanges does not fire when this is a symlink into a
    // dotfiles repo, so the tick below is what notices a change.
    printErrors: false
    onLoaded: {
      root.hyprlandText = text()
      root.hyprlandRead = true
    }
    onLoadFailed: {
      root.hyprlandText = ""
      root.hyprlandRead = false
    }
  }

  // ---- Turning tag mode on and off.
  //
  // One line in the user's own hyprland.lua is what makes the keybindings exist,
  // and no Quickshell plugin can put it there on its own -- so the switch does
  // it, on an explicit flip, backing the file up first.
  //
  // The line is fenced so it can be taken out as cleanly as it went in, and
  // appended at the end because the generated config unbinds keys bound above
  // it: a binding only wins if it is applied last.
  readonly property string fence: "-- workspace-tags"

  readonly property string requireBlock:
    "\n" + fence + ":begin  (managed by the Workspace Tags widget)\n"
    + requireLine + "\n" + fence + ":end\n"

  // Whether a line loads the generated config. One rule, used to detect the
  // state, to add the line and to take it away -- asking the same question
  // three ways is how the enable path came to disagree with the detector and
  // treat a commented-out line as already present.
  function loadsConfig(line) {
    const bare = line.replace(/^\s+/, "")
    return bare.indexOf("--") !== 0 && bare.indexOf("hypr.workspace-tags") !== -1
  }

  function setTagMode(wanted) {
    if (!bar || wanted === root.tagsEnabled || !hyprlandRead) return

    // Handing the workspace row over, and handing it back: whichever of us is
    // running owns it.
    if (pluginRegistry && pluginRegistry.inBar("omarchy.workspaces") === wanted)
      pluginRegistry.setEnabled("omarchy.workspaces", !wanted, { section: "left", index: 0 })

    const lines = hyprlandText.split("\n")
    let next
    if (wanted) {
      next = hyprlandText + requireBlock
    } else {
      // Drops the fenced block, and a line added by hand without one -- else the
      // switch would refuse to turn off. Comments survive, so a note about the
      // plugin outlives being switched off.
      let inFence = false
      next = lines.filter(line => {
        if (line.indexOf(fence + ":begin") !== -1) inFence = true
        const drop = inFence || root.loadsConfig(line)
        if (line.indexOf(fence + ":end") !== -1) inFence = false
        return !drop
      }).join("\n")
    }

    bar.run("cp -- " + Util.shellQuote(root.hyprlandPath)
      + " " + Util.shellQuote(root.hyprlandPath) + ".bak.$(date +%s)")
    hyprlandFile.setText(next)
    reloadCompositor()
  }

  // Does the generated config exist? Opting in happens in a file edited outside
  // this process, so the answer is read back rather than remembered.
  property bool generatedPresent: false

  FileView {
    id: generatedFile
    path: root.configPath
    atomicWrites: true
    preload: true
    printErrors: false
    onLoaded: root.generatedPresent = true
    onLoadFailed: {
      root.generatedPresent = false
      // Finding it gone is itself the trigger: the file can be deleted from
      // under a running shell, and nothing else would notice.
      root.generateIfOptedIn()
    }
  }

  // The require line present and the file it names absent is exactly when a
  // write is owed.
  // Tag mode lives in a file nothing announces changes to. Re-reading on a slow
  // tick is what makes every case converge -- the bar rebuilding when the switch
  // hands the workspace row back, an edit made in another editor, and an
  // `omarchy refresh hyprland` that wipes the line while the shell runs.
  Timer {
    interval: 2000
    repeat: true
    running: true
    onTriggered: hyprlandFile.reload()
  }

  function generateIfOptedIn() {
    if (root.requireMissing || root.generatedPresent) return
    root.regenerate()
    generatedFile.reload()
  }

  onRequireMissingChanged: generateIfOptedIn()

  // Opening the panel re-reads rather than re-checks. The require line is added
  // in another editor, and with no working file watcher (see above) the text
  // held here is otherwise however it looked at startup -- so checking it again
  // would keep reaching the same stale answer. The reload flips requireMissing,
  // which is what actually triggers the write.
  onOpenedChanged: if (opened) generatedFile.reload()

  // ---- The Omarchy logo on the bar.
  //
  // This does not draw anything: the logo is omarchy.menu, a widget of its own,
  // and the toggle simply puts it on the bar or takes it off. Drawing a second
  // copy inside this widget would leave two logos side by side whenever the
  // real one was still enabled.
  //
  // Nothing is stored for it either -- the bar layout already knows, and a copy
  // in our settings would go stale the moment the widget was moved from
  // Omarchy's own bar editor.
  readonly property string logoModule: "omarchy.menu"

  readonly property var pluginRegistry: bar && bar.shell ? bar.shell.pluginRegistry : null

  readonly property bool logoOnBar: {
    if (!pluginRegistry) return false
    // Read so this re-evaluates whenever the layout changes; inBar() is a
    // function call and QML cannot see through it on its own.
    var revision = pluginRegistry.registryRevision
    return revision >= 0 && pluginRegistry.inBar(root.logoModule) === true
  }

  function setLogoOnBar(wanted) {
    if (!pluginRegistry) return
    // Back to the head of the left section, which is where Omarchy ships it and
    // where it reads as a prefix to the tags rather than as a stray icon.
    pluginRegistry.setEnabled(root.logoModule, wanted === true, { section: "left", index: 0 })
  }

  // ---- Adopting monitors.
  //
  // The list is maintained rather than curated. Every monitor gets remembered
  // the first time it is seen, in left-to-right order, and is never dropped on
  // its own -- which is the whole point: a remembered monitor keeps its block
  // when it is unplugged, so the screen that stays behind does not get
  // renumbered and left hunting for windows on ids it no longer owns.
  //
  // Order beyond first sight is not recomputed. A monitor that moves house
  // keeps its block, because renumbering it would move its windows.
  //
  // This is the only thing that writes the list -- there is no settings UI for
  // it. Nothing is ever forgotten, so the list only grows; that costs an unused
  // block of ids per retired monitor and nothing else. Hand-edit the entry in
  // shell.json to reorder or prune.
  readonly property var unadoptedMonitors: {
    var known = config.monitors
    var live = Hyprland.monitors.values
    var fresh = []

    for (var i = 0; i < live.length; i++) {
      var description = String(live[i].description || "")
      if (!description) continue

      var seen = false
      for (var j = 0; j < known.length; j++) {
        if (known[j] === description) seen = true
      }
      if (seen) continue

      var already = false
      for (var k = 0; k < fresh.length; k++) {
        if (fresh[k].description === description) already = true
      }
      if (!already) fresh.push({ description: description, x: Number(live[i].x) || 0 })
    }

    fresh.sort(function(a, b) { return a.x - b.x })
    return fresh
  }

  onUnadoptedMonitorsChanged: if (unadoptedMonitors.length > 0) adoptTimer.restart()

  // Debounced: outputs arrive one at a time as Hyprland enumerates them, and
  // adopting on the first would fix an order before the rest are known.
  Timer {
    id: adoptTimer
    interval: 1200
    repeat: false
    onTriggered: {
      var fresh = root.unadoptedMonitors
      if (fresh.length === 0) return

      var list = root.config.monitors.slice()
      for (var i = 0; i < fresh.length; i++) list.push(fresh[i].description)
      root.editValue("monitors", list)

  }
  }

  // ---- Writing.
  //
  // shell.json first and the Hyprland config from the same merged object, so a
  // failure to reach the compositor cannot leave the two describing different
  // keybindings.
  function editValue(key, value) {
    const merged = Object.assign({}, root.settings)
    merged[key] = value

    // One panel exists per bar surface, so on a two-monitor setup both reach
    // the same conclusion about a newly seen output and both call this. The
    // second call is identical to the first, and rewriting the Hyprland config
    // and reloading the compositor twice for it would be visible. Comparing
    // first makes the duplicate free.
    if (JSON.stringify(Generator.resolve(merged)) === JSON.stringify(root.config)) return

    if (bar && bar.shell && typeof bar.shell.updateEntryInline === "function")
      bar.shell.updateEntryInline(root.moduleName, merged)

    regenerateTimer.restart()
  }

  // printf rather than a heredoc: the payload is quoted as a single shell word,
  // so nothing in a monitor description or a keybinding can end the string and
  // start a command. bash -lc is what execDetached runs, so the redirect works.
  function reloadCompositor() {
    if (bar) bar.run("hyprctl reload >/dev/null 2>&1")
  }

  // Nothing is written under ~/.config/hypr until the user has opted in. Before
  // that the file is dead weight: nothing loads it, and creating it would mean
  // writing compositor config on the strength of being installed.
  function regenerate() {
    if (root.requireMissing) return
    generatedFile.setText(Generator.render(root.settings))
    reloadCompositor()
  }

  // Every chip click is a settings write, and each one regenerated the config
  // and reloaded the compositor -- four clicks to set a modifier meant four
  // full reloads. Coalesce them: shell.json still updates immediately so the
  // UI stays live, and Hyprland is told once the clicking stops.
  Timer {
    id: regenerateTimer
    interval: 400
    repeat: false
    onTriggered: root.regenerate()
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    // Anchored under the settings button rather than centred on the bar: the
    // button is what opens it, and on a two-monitor setup a centred popup gives
    // no clue which screen's tags it is editing.
    centerOnBar: false
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(560))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      // The text fields own the keyboard, or typing a keybinding would be read
      // as a panel shortcut.
      blocked: true
      onCloseRequested: root.close()

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: content.width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: content
          width: scroll.width
          spacing: Style.space(10)

          PanelHero {
            title: "Workspace Tags"
            // The master switch. Everything this plugin does hangs off it, so
            // it sits with the title rather than among the settings it governs.
            trailingControl: Component {
              ToggleSwitch {
                checked: root.tagsEnabled
                foreground: root.contentForeground
                onToggled: root.setTagMode(!root.tagsEnabled)
              }
            }
            // A subline saying what this is, not a readout of two numbers the
            // Tags tab already shows as editable fields two rows below.
            meta: "dwm-style tags, one set per monitor"
            // No pill. It carried "not loaded", which said the same thing as
            // the Per-monitor tags switch two rows below it and said it worse:
            // it never named what was not loaded, and reads like the panel
            // itself is broken. The switch is the state; the header is identity.
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
          }

          PanelSeparator { visible: root.tagsEnabled }

          SettingsView {
            visible: root.tagsEnabled
            width: content.width
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            config: root.config
            logoOnBar: root.logoOnBar

            onValueEdited: function(key, value) { root.editValue(key, value) }
            onLogoToggled: function(wanted) { root.setLogoOnBar(wanted) }
          }
        }
      }
    }
  }
}

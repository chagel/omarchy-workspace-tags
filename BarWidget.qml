import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "Generator.js" as Generator

// A workspace indicator that belongs to the monitor it is drawn on.
//
// Omarchy's stock workspace widget is written for a single screen: it renders a
// fixed id range and lights whichever workspace Hyprland reports as *globally*
// focused. A bar surface exists per monitor, so on two screens both bars draw
// the same row and the bar on the monitor you are not looking at highlights a
// workspace that is not even on it.
//
// This widget asks its own surface which output it is on and reads everything
// off that monitor, and it works the same whether or not the tag config is
// installed:
//
//   without it  workspaces are the usual shared pool of ten, every bar shows
//               1..tags, and each highlights its own screen's active one
//   with it     ids are split into a block of `stride` per monitor (1..9,
//               11..19, 21..29) and each bar shows its own block as tags 1..N
//
// Nothing configures that. The block is the live workspace id rounded down to
// the stride, which is already 0 for the shared pool -- so the same arithmetic
// covers both and cannot disagree with where Hyprland actually put things.
//
// Left click views a tag, right click opens the settings panel.
BarWidget {
  id: root
  moduleName: "chagel.workspace-tags"

  // Resolved through the generator so the bar row, the panel, and the generated
  // config all read one definition of the defaults.
  readonly property var config: Generator.resolve(root.settings)

  readonly property int tags: config.tags
  readonly property int stride: Generator.STRIDE
  readonly property string activeGlyph: config.activeGlyph
  readonly property string tagLabels: config.tagLabels
  readonly property bool showSettingsIcon: config.showSettingsIcon !== false

  // Off means Omarchy's own workspace widget is back on the bar, so drawing tags
  // here as well would put two rows side by side. The icon stays: it is the way
  // back into the settings that turns this on again.
  readonly property bool tagsEnabled: panelLoader.item ? panelLoader.item.tagsEnabled === true : false

  // What actually gets drawn: with no tags on the bar the icon is the only way
  // back into the settings, so it outranks the setting that hides it. One
  // property because the column count, the popup anchor, and the button itself
  // all have to agree -- disagreeing is how a hidden icon ends up wrapped onto
  // a second row.
  readonly property bool settingsIconShown: root.showSettingsIcon || !root.tagsEnabled
  readonly property string barPosition: bar && bar.position ? String(bar.position) : "top"
  readonly property string settingsGlyph: config.settingsGlyph
  readonly property bool dimUnfocusedMonitor: config.dimUnfocusedMonitor !== false
  readonly property real occupiedOpacity: config.occupiedOpacity
  readonly property real emptyOpacity: config.emptyOpacity

  // The output this particular bar surface lives on. QsWindow.window is the
  // attached property Quickshell exposes for exactly this; asking the shared
  // Bar host instead would only ever name the focused screen, which is the bug
  // this widget exists to avoid.
  readonly property string screenName: {
    var window = root.QsWindow.window
    return window && window.screen ? String(window.screen.name || "") : ""
  }

  readonly property var monitor: {
    var values = Hyprland.monitors.values
    for (var i = 0; i < values.length; i++) {
      if (String(values[i].name || "") === root.screenName) return values[i]
    }
    return null
  }

  readonly property int activeId: {
    var m = root.monitor
    return m && m.activeWorkspace ? m.activeWorkspace.id : 0
  }

  // The block this screen owns, from the live id rather than from any setting:
  // ids 1..stride land on block 0, so an unpartitioned pool needs no special
  // case and a bar can never disagree with where Hyprland actually put the
  // workspace. Special workspaces report negative ids, which have no block.
  readonly property int base: root.activeId > 0
    ? Math.floor((root.activeId - 1) / root.stride) * root.stride
    : 0

  // dwm dims the unfocused monitor's selection, so a glance tells you which row
  // your keys are about to act on.
  readonly property bool monitorFocused: {
    var focused = Hyprland.focusedMonitor
    return !!focused && String(focused.name || "") === root.screenName
  }

  function workspaceById(id) {
    var values = Hyprland.workspaces.values
    for (var i = 0; i < values.length; i++) {
      if (values[i].id === id) return values[i]
    }

    return null
  }

  // A click has to land on the monitor whose bar was clicked, not on whichever
  // one happens to be focused -- so focus the output first, then the id out of
  // that monitor's own block.
  function viewTag(tag) {
    if (!root.bar) return

    var dispatch = "hyprctl dispatch "
    root.bar.run(dispatch + Util.shellQuote("hl.dsp.focus({ monitor = \"" + root.screenName + "\" })")
      + " && " + dispatch + Util.shellQuote("hl.dsp.focus({ workspace = \"" + (root.base + tag) + "\" })"))
  }

  // ---- Panel. Shape contract for shell.summon/hide/toggle routing:
  //      Bar.findPanelWidget requires open/close/opened on the bar-widget root.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  // Stand the bar's own open-panel mark down and draw one under the icon
  // instead: Bar.qml centres that mark in the slot, and this slot is the whole
  // tag row, so it drew a rule under nine tags to say one small panel was open.
  // A hint of 0 falls back to the default; a fraction under a half passes the
  // `> 0` guard and then rounds to zero width.
  readonly property real openPanelIndicatorWidth: 0.4
  readonly property real openPanelIndicatorHeight: 0.4

  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    // Under the button that opens it when there is one, so the popup lines up
    // with what was clicked rather than the middle of the tag row.
    if ("anchorItem" in target) target.anchorItem = root.settingsIconShown ? settingsButton : grid
    if ("hostWidget" in target) target.hostWidget = root
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    source: "Panel.qml"
    onLoaded: root.injectPanel()
  }

  readonly property real trailingGap: root.vertical ? 0 : Style.spaceReal(1.5)

  implicitWidth: grid.implicitWidth + trailingGap
  implicitHeight: grid.implicitHeight

  GridLayout {
    id: grid
    anchors.fill: parent
    anchors.rightMargin: root.trailingGap
    // The icon is a sibling of the tags, so it takes a column of its own on a
    // horizontal bar and a row of its own on a vertical one.
    columns: root.vertical ? 1 : (root.tagsEnabled ? root.tags : 0) + (root.settingsIconShown ? 1 : 0)
    columnSpacing: root.vertical ? 0 : Style.space(1)
    rowSpacing: root.vertical ? Style.space(2) : 0

    Repeater {
      // Every tag, always. dwm's bar shows the whole set and leans on
      // occupied/empty styling; a row that grows as workspaces appear slides
      // the tags around under the pointer.
      model: root.tagsEnabled ? root.tags : 0

      WidgetButton {
        required property int index

        readonly property int tag: index + 1
        readonly property var workspace: root.workspaceById(root.base + tag)
        readonly property bool occupied: workspace !== null && workspace.toplevels.values.length > 0
        readonly property bool focused: root.activeId === root.base + tag

        bar: root.bar
        text: (focused && root.activeGlyph !== "")
          ? root.activeGlyph
          : Generator.tagLabel(tag, root.tagLabels)
        // No tooltip. A tag row is glanceable by design -- position already
        // says which tag is which, and a popup chasing the pointer across nine
        // of them is noise on the one widget you look at most.
        //
        // The cost is that a non-numeric label (參, ι, a dot) no longer names
        // itself on hover; position is the only cue left. The settings panel is
        // still reachable by right-clicking any tag, and by
        // `omarchy-shell shell summon chagel.workspace-tags`.
        // Three states rather than the usual two: the tag you are on, tags that
        // hold windows, and empty ones. The active tag on the other monitor is
        // dimmed rather than lit, so both bars can show a selection without
        // competing over which one is "the" current tag.
        opacity: focused
          ? ((root.monitorFocused || !root.dimUnfocusedMonitor) ? 1 : 0.6)
          : (occupied ? root.occupiedOpacity : root.emptyOpacity)
        horizontalMargin: 6
        verticalPadding: 6
        // Cells are a fixed width so the tags line up in a grid rather than
        // jittering as occupancy changes the glyph, which means the widest
        // label in a style sets the width for all of them. Generator owns those
        // numbers, next to the labels they are measured from.
        fixedWidth: root.vertical
          ? root.barSize
          : Style.space(Generator.labelWidth(root.tagLabels))
        fixedHeight: root.barSize
        // Any button views the tag. The tags do one thing, so clicking one is
        // never a guess about which button does what.
        onPressed: root.viewTag(tag)
      }
    }

    WidgetButton {
      id: settingsButton
      visible: root.settingsIconShown
      bar: root.bar
      text: root.settingsGlyph
      tooltipText: "Workspace tag settings"
      // Deliberately not `active`: WidgetButton paints that with the bar's
      // urgent colour, which reads as "something is wrong" rather than "this is
      // open". Brightness carries the open state instead.
      opacity: root.opened ? 1 : 0.45
      horizontalMargin: 6
      verticalPadding: 6
      fixedWidth: root.vertical ? root.barSize : Style.space(22)
      fixedHeight: root.barSize
      onPressed: root.togglePanel()

      // The bar's mark, redrawn under the button that opens the panel. Same
      // shape and placement rule as Bar.qml's: it sits on the module's inner
      // edge, the one facing the desktop, so it underlines a top bar and
      // overlines a bottom one.
      Rectangle {
        readonly property int inset: Style.space(2)

        visible: root.opened
        width: root.vertical ? Style.space(2) : Math.max(Style.space(10), parent.labelWidth)
        height: root.vertical ? Math.max(Style.space(10), parent.height * 0.55) : Style.space(2)
        radius: Math.min(width, height) / 2
        color: Color.accent
        opacity: 0.9

        x: root.vertical
          ? (root.barPosition === "left" ? parent.width - width - inset : inset)
          : Math.round((parent.width - width) / 2)
        y: root.vertical
          ? Math.round((parent.height - height) / 2)
          : (root.barPosition === "bottom" ? inset : parent.height - height - inset)
      }
    }
  }
}

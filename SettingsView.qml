import QtQuick
import qs.Commons
import qs.Ui
import "Generator.js" as Generator

// The settings page. Kept dumb on purpose: it reads state and emits intent, it
// never writes shell.json or the Hyprland config itself. Panel.qml owns both,
// which is what keeps the bar row, the generated config, and this page from
// disagreeing about what is configured.
//
// Four tabs rather than one long column. These settings fall into groups that
// are rarely touched together -- the tag count gets set once, keybindings get
// edited when something conflicts, opacities almost never -- so a single list
// makes the common case (change one thing) the slowest one, and buries the
// shortcuts behind a scroll.
//
// The row helper is called Field rather than Row because QtQuick already has a
// Row positioner and a component of the same name would shadow it.
Column {
  id: root

  property color foreground: "white"
  property string fontFamily: ""
  readonly property color dimForeground: Qt.darker(foreground, 1.4)

  // Resolved settings, and one entry per editable binding, both built by the
  // panel so this page never has to know the defaults.
  property var config: ({})
  property bool logoOnBar: false

  // Which tab is showing. Held here rather than in the panel so it survives
  // closing and reopening the popup: coming back to where you were beats being
  // reset to the first tab every time.
  // One control column, so the rows line up and a theme can move them together.
  readonly property real fieldWidth: Style.spacing.dropdownWidth

  property string tab: "tags"

  signal valueEdited(string key, var value)
  signal logoToggled(bool wanted)

  // Editing a binding is "take what is there, change one part, write the whole
  // string back". The row's `spec` is bound to the stored value, so it cannot
  // be stale by the time this runs.
  function withModifierToggled(spec, modifier) {
    const mods = spec.mods.slice()
    const index = mods.indexOf(modifier)

    if (index >= 0) mods.splice(index, 1)
    else mods.push(modifier)

    return Generator.formatBinding(mods, spec.key)
  }

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(10)

  component Hint: Text {
    width: root.width
    color: root.dimForeground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  component Field: Item {
    id: field
    property string label: ""
    property string caption: ""
    default property alias content: holder.data

    width: root.width
    implicitHeight: Math.max(text.implicitHeight, holder.childrenRect.height)

    Column {
      id: text
      anchors.left: parent.left
      anchors.right: holder.left
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      spacing: 2

      Text {
        width: text.width
        text: field.label
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        wrapMode: Text.WordWrap
      }

      Text {
        visible: field.caption !== ""
        width: text.width
        text: field.caption
        color: root.dimForeground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
      }
    }

    Item {
      id: holder
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: childrenRect.width
      height: childrenRect.height
    }
  }

  // One tab's contents. A Column positioner skips invisible children, so the
  // closed tabs take no height at all and the popup sizes itself to whichever
  // one is open rather than to the tallest.
  component Tab: Column {
    property string name: ""

    visible: root.tab === name
    width: root.width
    spacing: Style.space(10)
  }

  // ---- Tab strip

  ButtonGroup {
    options: [
      { value: "tags", label: "Tags" },
      { value: "keys", label: "Shortcuts" }
    ]
    value: root.tab
    foreground: root.foreground
    fontFamily: root.fontFamily
    onChanged: function(value) { root.tab = value }
  }

  PanelSeparator {}

  // ---- Tags

  Tab {
    name: "tags"

    Field {
      label: "Tags per monitor"
      caption: "Lowering it strands windows on higher tags"

      NumberField {
        value: root.config.tags
        from: 1
        to: Generator.MAX_TAGS
        foreground: root.foreground
        fontFamily: root.fontFamily
        onModified: function(v) { root.valueEdited("tags", v) }
      }
    }



    Field {
      label: "Tag labels"

      Dropdown {
        width: root.fieldWidth
        showLabel: false
        fontFamily: root.fontFamily
        options: Generator.LABEL_STYLES
        value: root.config.tagLabels
        onChanged: function(value) { root.valueEdited("tagLabels", value) }
      }
    }


    Field {
      label: "Active tag marker"
      caption: "Empty shows the label"

      TextField {
        text: root.config.activeGlyph
        implicitWidth: root.fieldWidth
        foreground: root.foreground
        onEditingFinished: root.valueEdited("activeGlyph", text)
      }
    }


    Field {
      label: "Occupied tag opacity"

      PanelSlider {
        width: root.fieldWidth
        value: root.config.occupiedOpacity
        minimum: 0.1
        maximum: 1
        step: 0.05
        onReleased: function(v) { root.valueEdited("occupiedOpacity", v) }
      }
    }


    Field {
      label: "Empty tag opacity"

      PanelSlider {
        width: root.fieldWidth
        value: root.config.emptyOpacity
        minimum: 0
        maximum: 1
        step: 0.05
        onReleased: function(v) { root.valueEdited("emptyOpacity", v) }
      }
    }


    Field {
      label: "Dim the other monitor's marker"

      ToggleSwitch {
        checked: root.config.dimUnfocusedMonitor !== false
        foreground: root.foreground
        onToggled: root.valueEdited("dimUnfocusedMonitor", !(root.config.dimUnfocusedMonitor !== false))
      }
    }


    Field {
      // Always shown, and the caption never changes. Hiding the icon while
      // per-monitor tags is off does leave this panel without a way in from the
      // bar -- the keybinding named below comes from the generated Hyprland
      // config -- but that is recoverable from a terminal with
      // `omarchy-shell shell toggle chagel.workspace-tags`, not a dead end. A
      // row that appears and disappears, or explains itself differently
      // depending on unrelated state, costs more than the case it guards.
      label: "Settings icon"
      caption: "Hidden, use " + root.config.openSettings

      ToggleSwitch {
        checked: root.config.showSettingsIcon !== false
        foreground: root.foreground
        onToggled: root.valueEdited("showSettingsIcon", !(root.config.showSettingsIcon !== false))
      }
    }

    Field {
      label: "Omarchy menu button"

      ToggleSwitch {
        checked: root.logoOnBar
        foreground: root.foreground
        onToggled: root.logoToggled(!root.logoOnBar)
      }
    }
  }

  // ---- Shortcuts, and the generated config that holds them

  Tab {
    name: "keys"
    // Between rows. The controls themselves are short (see the padding below),
    // so the breathing room goes here rather than inside them.
    spacing: Style.space(8)

    Repeater {
      model: Generator.BINDINGS

      Field {
        id: bindingField
        required property var modelData

        // Re-derived from the stored string rather than held separately, so the
        // chips cannot drift out of step with the binding they describe.
        readonly property string value: root.config[modelData.key]
        readonly property var spec: Generator.parseBinding(value)

        label: modelData.label
        // No caption on the digit rows: the "+ 1-N" beside the chips already
        // says the number is appended, and repeating it three times cost more
        // height than the whole modifier row.
        caption: ""

        Row {
          // Between the modifier group and the key. Bigger than the gap
          // between chips on purpose: they are two different things, and
          // reading them as one run of boxes was what made the row feel dense.
          spacing: Style.space(10)

          Row {
            spacing: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter

            // Modifiers as chips. The vocabulary is four words and a mistyped one
            // is not an error in Hyprland -- it just registers nothing -- so this
            // is the part that must not be free text.
            Repeater {
              model: Generator.MODIFIERS

              Button {
                required property string modelData

                // Symbol on the chip, name in the tooltip: the row stays narrow
                // and nothing has to be guessed from the glyph alone.
                text: Generator.modifierSymbol(modelData)
                tooltipText: modelData
                selected: bindingField.spec.mods.indexOf(modelData) !== -1
                bordered: true
                fontSize: Style.font.subtitle
                // Inline-row padding, not standalone-control padding: the kit's
                // defaults (6 vertical, plus the input field's 7) size these for
                // a dialog form and make a nine-row list needlessly tall. The
                // network panel's embedded passphrase field sets the same 2.
                horizontalPadding: Style.space(4)
                verticalPadding: Style.space(2)
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.valueEdited(bindingField.modelData.key,
                  root.withModifierToggled(bindingField.spec, modelData))
                }
            }
          }

          // One fixed-width slot for the key, whatever fills it. Without this
          // the digit rows (which end in a short "+ 1-N") and the key rows
          // (which end in a field) push the chips to different x positions,
          // and the four modifier columns stop lining up down the form.
          Item {
            width: Style.space(104)
            height: keyField.implicitHeight

            // The key itself stays free text: unlike modifiers its vocabulary
            // is every key on the board, plus names like mouse_down.
            TextField {
              id: keyField
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width
              visible: modelData.digits !== true
              font.pixelSize: Style.font.caption
              verticalPadding: Style.space(2)
              text: bindingField.spec.key
              placeholderText: "key"
              foreground: root.foreground
              onEditingFinished: root.valueEdited(bindingField.modelData.key,
                  Generator.formatBinding(bindingField.spec.mods, text))
            }

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.space(4)
              anchors.verticalCenter: parent.verticalCenter
              visible: modelData.digits === true
              text: "+ 1-" + root.config.tags
              color: root.dimForeground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }
      }
    }

    Hint {
      text: "Changes apply immediately."
    }

  }
}

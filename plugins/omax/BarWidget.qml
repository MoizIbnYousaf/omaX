import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// OmaX bar launcher: one glyph, click to open the TUI in a dedicated foot window.
BarWidget {
  id: root
  moduleName: "greensnow.omax"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function launch() {
    launchProcess.running = true
  }

  Process {
    id: launchProcess
    command: ["kitty", "--class=omax", "--title=omaX", Quickshell.env("HOME") + "/.local/bin/omax"]
  }

  IpcHandler {
    target: "greensnow.omax"
    function open(): void { root.launch() }
    function toggle(): void { root.launch() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "𝕏"
    horizontalMargin: 8
    onPressed: function(code) {
      root.launch()
    }
  }
}

/**
 * UI types:
 * floating ball, hotkeys and interface configuration
 */

// Hotkey configuration
export interface TooltipHotkey {
  enabled: boolean; // whether a hotkey is required
  modifierKeys: string[]; // modifier keys, e.g. ['ctrl', 'alt', 'shift']
  key?: string; // optional additional key
  description?: string; // hotkey description
}

// Floating ball configuration
export interface FloatingBallConfig {
  enabled: boolean; // whether the floating ball is shown
  position: number; // vertical position as a percentage (0-100)
  opacity: number; // opacity (0.1-1.0)
}

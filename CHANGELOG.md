# Changelog

## 0.3.0-beta (unreleased)

Everything since 0.2.2-beta.

### Added

- **Port forwarding on a node.** A node carries its own forwards (`local port -> target host : target port`). The tunnel goes through the node and every previous node, each with its own authentication. The target host defaults to `localhost`. The node shows a counter on its start button and a summary line of the enabled forwards.
- **Password authentication** as an alternative to a key, for Connect, ProxyJump and forwarding. Passwords are stored as plain text; exporting an item that contains one asks for confirmation.
- **A different authentication per hop.** Key, password, key + password, or neither can be mixed in one path. `keyboard-interactive` password prompts are answered as well; key passphrases and one-time codes are asked in the terminal.
- **Copy SSH config** copies a node (previous nodes as `ProxyJump`, forwards as `LocalForward`, `Exec` as `RemoteCommand`) in `~/.ssh/config` format.
- Port inputs show only invalid values; enabled forwards with missing ports are flagged.
- **The canvas position and zoom are remembered** for each item and restored when it is opened again, also after restarting the app.
- **Icon picker.** The node image is chosen from a grid of all icons instead of stepping through them one by one. It works with the keyboard too (arrow keys, Home, End).
- Unit tests, tests that run the generated scripts under bash, and CI on Ubuntu and Windows.

### Changed

- **Build and dependencies.** Vue CLI 4 / webpack 4 is replaced by electron-vite / Vite 7 (the old toolchain no longer installed with a current npm). Electron 16 -> 44, electron-builder 26, electron-store 11, ESLint 9. Vue stays on 2.7 and Rete on v1. Sources moved to `src/main`, `src/preload` and `src/renderer`.
- **ssh is no longer started from a shell string.** Values are validated in the main process, written into a temporary script and passed to Git Bash. The renderer is sandboxed and only gets a small IPC API.
- **Projects live in `projects.json`** in the app data folder (atomic write, `.bak` backup) instead of the browser storage. Older data is migrated on first launch.
- The Forward and ProxyJump buttons no longer need a key on the previous node. They are available when every previous node has user, host and port.
- A key given for a hop is the only key offered to it (`IdentitiesOnly`). A busy local port now makes a forward fail visibly.
- The canvas can be panned without a limit (it was stuck inside 1024x1024). Deleting a node that has content asks first.
- **Visual polish.** A dot grid instead of the checkerboard behind the canvas; on a node the name is bold and user / host / port are lighter and smaller; a node without an image shows a neutral server symbol instead of an empty grey frame; popovers and the Settings and Info dialogs are white rounded cards with the same shadow as the right click menu; the open item in the sidebar has a highlight and a blue frame only for keyboard focus; thinner scrollbars; smaller labels in the node settings.
- Popovers opened with the keyboard take the focus, so Tab continues inside them. Popovers are opaque and close with Escape. The right click menus are redesigned: white card with rounded corners, icons, a red *Delete*, a short fade-in, and the canvas entry reads *Add node*.
- Accessibility: the icon-only controls (node menu, sidebar, header, forwards) are real buttons with names for screen readers and tooltips, keyboard focus is visible and reveals the node menu, and the grey helper texts are darker.

### Fixed

- The "previous image" button could not return to the first image.
- A key path with a control character could pass validation after an earlier value had been rejected (shared global regex).
- ProxyJump failed with an error for a node whose key was never set, and wrote an empty `IdentityFile` line for one whose key was cleared. Temp files were written to the working directory and never cleaned up.
- Saved data contained a copy of the previous nodes (including their passwords) inside every node. It is no longer saved and is removed from existing files.
- Failed launches show the reason instead of a generic alert.
- Removing items asks for confirmation, and removing unselected items no longer closes the open editor.
- The port forwarding and settings popovers were pushed out of the window when their node was near the right edge, and never lined up with their icon.
- Sidebar: the search ignores case, long names stay on one line (full name as tooltip), Escape cancels a rename instead of saving it later, and adding an item clears the search so it does not disappear.
- The window title follows the opened item. Before, a new item showed the name of another item, and renaming or removing the opened item left the old name.
- The node right click menu showed two "Delete" entries, one of which skipped the confirmation for nodes with content. There is one now, and it asks. While the editor is locked the right click menus (which did nothing) are replaced by a short hint to unlock the editor.
- An empty screen says what to do, the Info and Settings popups close with Escape, and the Info popup no longer credits the removed Vue CLI plugin.
- Importing a file that is not JSON, or not a jumpspace export, says so instead of showing an internal error.
- An empty "Git Bash path" in Settings means the default. Before, the screen showed the default but Connect failed with "Git Bash was not found".

### Removed

- The unused `upath`, PWA, comment/minimap plugin and `core-js` dependencies, the global Vue mixin and the unused footer placeholder.

### Notes for upgrading

- Password sign-in needs OpenSSH 8.4 or newer (`SSH_ASKPASS_REQUIRE`), which current Git for Windows includes.
- Diagrams that use the older way to forward (an extra node that only holds the target host, with an empty port) keep working unchanged.
- Forwards saved by an older version on a node that has a user, host and port are moved automatically when the data is loaded: they go to the previous node with this node's host as the target, which opens the same tunnel as before. (The previous version of the file stays as `projects.json.bak`.) An entry is left on its node, now pointing to `localhost`, only when the previous node already uses the same local port or there is no previous node.
- Development needs Node.js 20.19+ or 22.12+.

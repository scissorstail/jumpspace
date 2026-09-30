# Changelog

## 0.3.0-beta (unreleased)

Everything since 0.2.2-beta.

### Added

- **Port forwarding on a node.** A node carries its own forwards (`local port -> target host : target port`). The tunnel goes through the node and every previous node, each with its own authentication. The target host defaults to `localhost`. The node shows a counter on its start button and a summary line of the enabled forwards.
- **Password authentication** as an alternative to a key, for Connect, ProxyJump and forwarding. Passwords are stored as plain text; exporting an item that contains one asks for confirmation.
- **A different authentication per hop.** Key, password, key + password, or neither can be mixed in one path. `keyboard-interactive` password prompts are answered as well; key passphrases and one-time codes are asked in the terminal.
- **Copy SSH config** copies a node (previous nodes as `ProxyJump`, forwards as `LocalForward`, `Exec` as `RemoteCommand`) in `~/.ssh/config` format.
- Port inputs show only invalid values; enabled forwards with missing ports are flagged.
- Unit tests, tests that run the generated scripts under bash, and CI on Ubuntu and Windows.

### Changed

- **Build and dependencies.** Vue CLI 4 / webpack 4 is replaced by electron-vite / Vite 7 (the old toolchain no longer installed with a current npm). Electron 16 -> 44, electron-builder 26, electron-store 11, ESLint 9. Vue stays on 2.7 and Rete on v1. Sources moved to `src/main`, `src/preload` and `src/renderer`.
- **ssh is no longer started from a shell string.** Values are validated in the main process, written into a temporary script and passed to Git Bash. The renderer is sandboxed and only gets a small IPC API.
- **Projects live in `projects.json`** in the app data folder (atomic write, `.bak` backup) instead of the browser storage. Older data is migrated on first launch.
- The Forward and ProxyJump buttons no longer need a key on the previous node. They are available when every previous node has user, host and port.
- A key given for a hop is the only key offered to it (`IdentitiesOnly`). A busy local port now makes a forward fail visibly.
- Popovers are opaque.

### Fixed

- The "previous image" button could not return to the first image.
- A key path with a control character could pass validation after an earlier value had been rejected (shared global regex).
- ProxyJump failed with an error for a node whose key was never set, and wrote an empty `IdentityFile` line for one whose key was cleared. Temp files were written to the working directory and never cleaned up.
- Saved data contained a copy of the previous nodes (including their passwords) inside every node. It is no longer saved and is removed from existing files.
- Failed launches show the reason instead of a generic alert.
- Removing items asks for confirmation, and removing unselected items no longer closes the open editor.

### Removed

- The unused `upath`, PWA, comment/minimap plugin and `core-js` dependencies, the global Vue mixin and the unused footer placeholder.

### Notes for upgrading

- Password sign-in needs OpenSSH 8.4 or newer (`SSH_ASKPASS_REQUIRE`), which current Git for Windows includes.
- Diagrams that use the older way to forward (an extra node with an empty port) keep working unchanged.
- Development needs Node.js 20.19+ or 22.12+.

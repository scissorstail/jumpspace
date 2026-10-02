# jumpspace

The visual SSH connection editor. **Quick Open Git Bash with SSH commands**

![1](https://user-images.githubusercontent.com/93466598/144472417-13bef28d-a4e8-43f2-a0ec-16b27f46b103.PNG)

note: This currently only works on Windows

## features

- Draw your servers as nodes and chain them into jump-host paths.
- One click opens the right `ssh` command in a terminal inside the app (or, if you prefer, in a Git Bash window): to a single node, through the whole chain (ProxyJump), or as port forwards.
- Every node has its own authentication (key, password, both, or neither), so one path can mix them.
- Port forwarding is set up on the node itself, also through several hops.
- Copy any node as `~/.ssh/config`.
- Pick an icon for each node from a grid. The canvas position and zoom of each diagram are remembered.

## requirements

1. [Git for Windows](https://gitforwindows.org/) (To install Git Bash)
2. OpenSSH >= 7.6 (Installed together with Git Bash). Password sign-in needs OpenSSH >= 8.4 (`SSH_ASKPASS_REQUIRE`), which current Git for Windows ships.

## usage

### nodes and paths

1. Open the sidebar, add an item (a diagram) and give it a name.
2. Unlock the editor (lock icon), right-click the canvas and choose *Add node*, and drag from a node's right socket to another node's left socket to chain them (jump hosts).
3. Hover a node to open its menu:
   - terminal: **Connect** runs `ssh` to the node in a terminal tab of the app (or in a Git Bash window, see *Settings > Open SSH in*). When the node has previous nodes and every one of them has a user, host and port, it is **ProxyJump** instead, which connects through the whole chain.
   - link: **Port forwarding**, see below. The button with a counter next to it starts the enabled forwards.
   - gear: **Setting** (icon picked from a grid, name, user, host, port, key, password, exec) and *Copy SSH config*. A value that ssh would not accept gets a red border while you type; the note on what is allowed shows under the field while it has the focus or the pointer.
4. The canvas position and zoom of each item are remembered and restored when you open it again. Lock the editor to save changes to the diagram. You can start connections while it is locked.

The node menu also shows when one of its buttons has keyboard focus. Enter opens a popover and moves the focus into it; Escape closes it and returns the focus to its button. Right-click a node for **Duplicate** or **Delete** (a node with content asks first). *Settings* and *Show Info* (gear menu in the header) open with the focus inside; Tab stays in them and Escape closes them.

*Exec* is a command that runs on the server after login, the shell stays open afterwards.

### terminals

Connect, ProxyJump and port forwarding open in a **terminal panel at the bottom of the app**, one tab per session. Password prompts are answered as described below; anything else (a key passphrase, a one-time code, host key questions) is typed into the tab. The dot on a tab shows the state like the path on the canvas (yellow while connecting, green once logged in, grey when ended); it turns red when the session ended with an error, and its tooltip names the session and gives the exit status. With many tabs they first get narrower, then the tab row scrolls (also with the mouse wheel) and keeps the active tab in view. An ended tab can be reconnected with its reconnect button or Enter in the terminal: the same connection starts again in the same tab. Closing a tab ends its ssh session; the arrow on the right hides the panel while the sessions keep running, and the terminal button in the header shows it again. Drag the top edge of the panel to resize it. Copy with Ctrl+Shift+C or Ctrl+Insert (or select and right click), paste with Ctrl+Shift+V, Shift+Insert or a right click; Ctrl+C is sent to the remote program. The path of every session shows its state on the canvas: **connecting** (yellow line, a slow signal, a fast yellow dot) until ssh has logged in, **connected** (signals flow along the connections it goes through and its nodes show a blinking green dot), and **failed** (red dashed line and a red dot) when it could not start or ssh itself failed; the red stays until the tab is closed or reconnected, a normal end clears the path.

*Settings > Open SSH in* switches back to opening a separate **Git Bash window** instead.

### look

A flat, high-contrast synthwave night: a neon grid floor, a striped sun behind a pixel skyline, square panels with hard shadows and pixel lettering. *Settings > Theme* picks one of three palettes: **Neon Night** (pink, yellow and cyan, the default), **Sunset Drive** (coral and orange) and **Vapor Blue** (magenta and mint on navy). *Settings > Background* tones the scenery down: **Depth** (blurred with a haze, the default), **CRT** (scan lines), **Soft**, **Vivid** or **Off**. *Settings > Node glass* (off by default) puts the text under each node on a frosted glass panel; the slider sets how strongly it blurs.

### items (sidebar)

- `+` adds an item. Double-click a name (or *Edit* in its `...` menu) to rename it, Escape cancels. *Copy* duplicates an item, *Remove* asks first.
- The search box filters by name and ignores case. Drag an item to reorder the list, Ctrl+click selects several items for *Export* or *Remove*.
- *Import Items* adds the items of a JSON file. *Export Space* in the gear menu of the header exports everything.

### authentication

Each node has its **own authentication**, so a path can mix them freely (for example key -> password -> key + password).

- *Key*: only that key is offered to that hop (`IdentitiesOnly`).
- *Password*: no key is tried for that hop. It is passed to `ssh` through `SSH_ASKPASS`, never through the command line or a file.
- *Both*: the key is tried first, then the password (this also works for servers that require both).
- *Neither*: `ssh-agent`, the default keys in `~/.ssh` or what you type in the terminal are used.

Password prompts (both the `password` and the `keyboard-interactive` styles) are answered for the hop they belong to. Anything else, such as a key passphrase or a one-time code, is asked in the terminal window.

Passwords are stored as **plain text** in `projects.json` and are part of an exported item (you are asked to confirm the export).

### port forwarding

Open the link icon of a node and add rows of `local port -> target host : target port`. Tick the rows you want and press **Start** (or the button with the counter that appears on the node).

- The tunnel is opened through this node and through every previous node before it, each with its own authentication.
- The target host is seen from this node. Leave it empty for `localhost`, that is a service running on the node itself.
- A node without a port (the older way: an extra node that only holds the target host) still works. It forwards to its own host through the previous nodes. A node that has a user, host and port always forwards through itself (forwards saved by older versions on such a node are moved to the previous node when the data is loaded, so they keep their meaning).
- The node shows the enabled forwards under its name.

### copy SSH config

*Copy SSH config* in the settings copies the node in `~/.ssh/config` format. Previous nodes become `ProxyJump`, enabled forwards become `LocalForward`, `Exec` becomes `RemoteCommand`. Passwords are never included.

### your data

Projects are stored in `projects.json` in the app data folder (`%APPDATA%\jumpspace` on Windows). Each item keeps its name, its nodes and the last canvas view. The previous version of the file is kept as `projects.json.bak`. Settings are stored next to it. Data saved by v0.2.x in the browser storage is migrated automatically on first launch.

## development

```sh
npm install
npm run dev      # electron-vite dev server with HMR
npm run lint
npm test         # unit tests
npm run build    # bundle into ./out
npm run dist     # bundle and create the installer in ./dist_electron
```

Node.js 20.19+ or 22.12+ is required. `.npmrc` sets `legacy-peer-deps` because the Rete v1 plugins declare outdated peer dependencies.

### project layout

```
src/main/       Electron main process
  index.js        window, tray and IPC
  ssh.js          builds the bash script and the ssh config for connect / ProxyJump / forward
  ssh-config.js   "Copy SSH config"
  launcher.js     writes the temp files and starts Git Bash (window)
  terminal.js     terminal sessions inside the app (node-pty), used by the terminal panel
  trust.js        is a URL the app's own page? (IPC sender check, navigation guard),
                  and which page file an app:// request may read
  ipc-result.js   answers { ok, error } to the page instead of throwing
  setting-store.js  reads and saves the settings (defaults for broken values)
  storage.js      projects.json (atomic write, .bak), import parsing
  legacy-forwards.js  moves forwards saved by older versions to their current place
src/shared/     pure modules used by both main and renderer
  setting.js      the app settings and their defaults (Git Bash path, tray,
                  where ssh opens, theme, background, node glass)
  view.js         the canvas zoom range and the check of a saved view
  terminal-marker.js  the invisible "logged in" marker the app terminal shows as "connected"
  validate.js     validation of every value that ends up in a command (main checks
                  before running; the node settings show the same rules while typing)
src/preload/    the small API exposed to the renderer (window.preload)
src/renderer/   Vue 2 + Rete v1 UI ("@" is an alias for src/renderer/src)
  src/utils/      pure logic with unit tests (forwarding rules, canvas view, ...)
  src/components/editor/nodes/site-node/controls/connection-control/
                  the node: component.vue coordinates, forward-menu.vue and
                  connection-settings.vue are its two popovers (the latter uses
                  icon-picker.vue)
  src/components/layout/scene-backdrop.vue
                  the synthwave scenery behind the canvas and its background effects
  src/components/terminal/terminal-panel.vue
                  the terminal panel (xterm.js), one tab per session; terminal-tabs.vue
                  is its tab row (scrolls when there are many tabs)
```

### how ssh is started

1. The UI never runs commands. It sends a small request (`connect`, `proxyJump`, `forward`) to the main process.
2. `validate.js` (in `src/shared/`) checks every value (user, host, port, key path, exec, forwards) and rejects what could turn into an option or an injection into the shell or the ssh config.
3. `ssh.js` builds a temporary bash script (values quoted with POSIX single quotes). A path also gets an `ssh -F` config with one `Host` block per node holding that node's own key / password options.
4. `launcher.js` writes both into the OS temp folder. In the app, `terminal.js` runs the script with bash in a pseudo terminal (node-pty, ConPTY on Windows; Git's `bin\bash.exe` next to the configured `git-bash.exe`) and the panel exchanges key strokes and output with it; only the generated script is ever started, the window only sends key strokes. For a Git Bash window it runs `git-bash.exe -c "bash '<script>'"`. The script removes itself and the config when the session ends (also when its tab is closed), leftovers are swept on the next start.
5. In the app terminal the script also gives ssh `PermitLocalCommand` and a `LocalCommand` that prints an invisible OSC marker once ssh has logged in; the panel reads it to switch the path from connecting to connected. These are command-line options, so the ProxyJump helper processes (whose output is the tunnel) never run it.
6. Passwords are passed as environment variables. The same script is also the `SSH_ASKPASS` program and answers only the prompts of the hop the password belongs to.

### tests

- `npm test` covers validation, script and config building, the askpass routing (it runs the generated script), the launcher (with a fake `spawn`), storage (including the migration of old forwards and the canvas view), the settings, the terminal session manager (with a fake pty) and the pure UI logic.
- `src/main/terminal.test.js` also starts real sessions with `node-pty`: a generated script with a fake `ssh` runs in a real pty, key strokes reach the program, closing a tab ends it (checked outside Windows), and Korean text passes through unchanged in both directions. On Windows this runs through ConPTY and Git's `bash.exe` (`JUMPSPACE_TEST_BASH`).
- `src/main/ssh-script.test.js` runs the generated scripts for real under bash with a fake `ssh`, and lets the real `ssh-add` run a script file as `SSH_ASKPASS`. It needs bash: `/bin/bash` on Linux and macOS, on Windows set `JUMPSPACE_TEST_BASH` to Git Bash (`C:\Program Files\Git\bin\bash.exe`), otherwise it is skipped.
- CI runs lint, tests and the build on Ubuntu. On Windows it runs the tests and the build too, with the bash based tests under the Git Bash of the runner, plus one that starts a generated script through the real `git-bash.exe` (`JUMPSPACE_TEST_GIT_BASH_EXE`), the launcher the app uses.

To try a path against real servers without owning any, start one `sshd` per authentication style on `127.0.0.1` with different ports and chain nodes for them. Every hop is reached through the previous one, so a single machine is enough:

```
Port 2211   # key only:            PasswordAuthentication no
Port 2212   # password only:       PubkeyAuthentication no
Port 2213   # keyboard-interactive: PasswordAuthentication no, KbdInteractiveAuthentication yes, PubkeyAuthentication no
Port 2214   # key and password:    AuthenticationMethods publickey,password
```

## changes

See [CHANGELOG.md](CHANGELOG.md).

## license

MIT, see [LICENSE](LICENSE).

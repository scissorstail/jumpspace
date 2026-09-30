# jumpspace

The visual SSH connection editor. **Quick Open Git Bash with SSH commands**

![1](https://user-images.githubusercontent.com/93466598/144472417-13bef28d-a4e8-43f2-a0ec-16b27f46b103.PNG)

note: This currently only works on Windows

## features

- Draw your servers as nodes and chain them into jump-host paths.
- One click opens Git Bash with the right `ssh` command: to a single node, through the whole chain (ProxyJump), or as port forwards.
- Every node has its own authentication (key, password, both, or neither), so one path can mix them.
- Port forwarding is set up on the node itself, also through several hops.
- Copy any node as `~/.ssh/config`.

## requirements

1. [Git for Windows](https://gitforwindows.org/) (To install Git Bash)
2. OpenSSH >= 7.6 (Installed together with Git Bash). Password sign-in needs OpenSSH >= 8.4 (`SSH_ASKPASS_REQUIRE`), which current Git for Windows ships.

## usage

### nodes and paths

1. Open the sidebar, add an item (a diagram) and give it a name.
2. Unlock the editor (lock icon), right-click the canvas to add a `Site` node, and drag from a node's right socket to another node's left socket to chain them (jump hosts).
3. Hover a node to open its menu:
   - terminal: **Connect** opens Git Bash and runs `ssh` to the node. When the node has previous nodes it is **ProxyJump** instead, which connects through the whole chain.
   - link: **Port forwarding**, see below. The button with a counter next to it starts the enabled forwards.
   - gear: **Setting** (image, name, user, host, port, key, password, exec) and *Copy SSH config*.
4. Lock the editor to save. You can start connections while it is locked. Items can be exported and imported as JSON from the sidebar menu.

*Exec* is a command that runs on the server after login, the shell stays open afterwards.

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
- A node without a port (the older way: an extra node that only holds the target host) still works. It forwards to its own host through the previous nodes. A node that has a user, host and port always forwards through itself.
- The node shows the enabled forwards under its name.

### copy SSH config

*Copy SSH config* in the settings copies the node in `~/.ssh/config` format. Previous nodes become `ProxyJump`, enabled forwards become `LocalForward`, `Exec` becomes `RemoteCommand`. Passwords are never included.

### your data

Projects are stored in `projects.json` in the app data folder (`%APPDATA%\jumpspace` on Windows). The previous version of the file is kept as `projects.json.bak`. Settings are stored next to it. Data saved by v0.2.x in the browser storage is migrated automatically on first launch.

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
  launcher.js     writes the temp files and starts Git Bash
  validate.js     validation of every value that ends up in a command
  storage.js      projects.json (atomic write, .bak)
src/preload/    the small API exposed to the renderer (window.preload)
src/renderer/   Vue 2 + Rete v1 UI ("@" is an alias for src/renderer/src)
  src/utils/      pure logic with unit tests (forwarding rules, ...)
  src/components/editor/nodes/site-node/controls/connection-control/
                  the node: component.vue coordinates, forward-menu.vue and
                  connection-settings.vue are its two popovers
```

### how ssh is started

1. The UI never runs commands. It sends a small request (`connect`, `proxyJump`, `forward`) to the main process.
2. `validate.js` checks every value (user, host, port, key path, exec, forwards) and rejects what could turn into an option or an injection into the shell or the ssh config.
3. `ssh.js` builds a temporary bash script (values quoted with POSIX single quotes). A path also gets an `ssh -F` config with one `Host` block per node holding that node's own key / password options.
4. `launcher.js` writes both into the OS temp folder and runs `git-bash.exe -c "bash '<script>'"`. The script removes itself and the config when the session ends, leftovers are swept on the next start.
5. Passwords are passed as environment variables. The same script is also the `SSH_ASKPASS` program and answers only the prompts of the hop the password belongs to.

### tests

- `npm test` covers validation, script and config building, the askpass routing (it runs the generated script), the launcher (with a fake `spawn`), storage and the pure UI logic.
- `src/main/ssh-script.test.js` runs the generated scripts for real under bash with a fake `ssh`, and lets the real `ssh-add` run a script file as `SSH_ASKPASS`. It needs bash: `/bin/bash` on Linux and macOS, on Windows set `JUMPSPACE_TEST_BASH` to Git Bash (`C:\Program Files\Git\bin\bash.exe`), otherwise it is skipped.
- CI runs lint, tests and the build on Ubuntu, and tests and the build on Windows (with Git Bash).

To try a path against real servers without owning any, start one `sshd` per authentication style on `127.0.0.1` with different ports and chain nodes for them. Every hop is reached through the previous one, so a single machine is enough:

```
Port 2211   # key only:            PasswordAuthentication no
Port 2212   # password only:       PubkeyAuthentication no
Port 2213   # keyboard-interactive: PasswordAuthentication no, KbdInteractiveAuthentication yes, PubkeyAuthentication no
Port 2214   # key and password:    AuthenticationMethods publickey,password
```

## changes

See [CHANGELOG.md](CHANGELOG.md).

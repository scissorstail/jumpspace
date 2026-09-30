# jumpspace

The visual SSH connection editor. **Quick Open Git Bash with SSH commands**

![1](https://user-images.githubusercontent.com/93466598/144472417-13bef28d-a4e8-43f2-a0ec-16b27f46b103.PNG)

note: This currently only works on Windows

## usage

1. Open the sidebar, add an item (a diagram) and give it a name.
2. Unlock the editor, right-click the canvas to add a `Site` node, and drag from a node's right socket to another node's left socket to chain them (jump hosts).
3. Hover a node to open its menu: **Setting** (name, user, host, port, key, password, exec), **Port forwarding**, and the terminal button.
   - **Connect** opens Git Bash and runs `ssh` to the node.
   - **ProxyJump** is shown instead when the node has a previous node; it connects through the whole chain of previous nodes.
   - **Port forwarding** (link icon): add rows of `local port -> target host : target port`, tick the ones you want and press **Start** (or the button with the counter that appears on the node). The tunnel is opened through this node, and through every previous node before it, each with its own authentication. Leave the target host empty for `localhost`, that is a service running on the node itself.
   - A node without a port (the older way: an extra node that only holds the target host) still works. It forwards to its own host through the previous nodes.
   - In **Setting**, *Copy SSH config* copies the node in `~/.ssh/config` format (previous nodes become `ProxyJump`, enabled forwards become `LocalForward`). Passwords are never included.
   - **Password**: instead of a key you can sign in with a password. It is stored as **plain text** in `projects.json` and included when you export the item (you are asked to confirm). It is passed to `ssh` through `SSH_ASKPASS`, not through the command line or a file.
4. Each node has its **own authentication**, so a path can mix them freely (for example key -> password -> key + password).
   - *Key*: only that key is offered to that hop (`IdentitiesOnly`).
   - *Password*: no key is tried for that hop.
   - *Both*: the key is tried first, then the password (also works for servers that require both).
   - *Neither*: `ssh-agent`, the default keys in `~/.ssh` or what you type in the terminal are used.
   - Password prompts (both the `password` and `keyboard-interactive` styles) are answered per hop. Anything else, such as a key passphrase or a one-time code, is asked in the terminal window.
5. Lock the editor to save. Items can be exported/imported as JSON from the sidebar menu.

Projects are stored in `projects.json` in the app data directory (the previous version is kept as `projects.json.bak`).
Data saved by v0.2.x in the browser storage is migrated automatically on first launch.

SSH commands are started from the main process. Every value (user, host, port, key path, ...) is validated and written into a temporary script that is removed when the session ends, so imported items cannot inject shell commands.

## development

```sh
npm install
npm run dev      # electron-vite dev server with HMR
npm run lint
npm test         # unit tests for command building / storage
npm run build    # bundle into ./out
npm run dist     # bundle and create the installer in ./dist_electron
```

Node.js 20.19+ or 22.12+ is required. `.npmrc` sets `legacy-peer-deps` because the Rete v1 plugins declare outdated peer dependencies.

## requirements

1. [Git for Windows](https://gitforwindows.org/) (To install Git Bash)
2. OpenSSH >= 7.6 (Installed together with Git Bash). Password sign-in needs OpenSSH >= 8.4 (`SSH_ASKPASS_REQUIRE`), which current Git for Windows ships.

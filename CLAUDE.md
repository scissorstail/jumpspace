# jumpspace: notes for Claude

A visual SSH connection editor (Electron 44 + Vue 2.7 + Rete v1). Servers are nodes, chained nodes are jump hosts, one click runs the right `ssh` command in a terminal inside the app (Git's `bash.exe` on Windows) or in a Git Bash window. Windows + Git Bash is the target; development and CI also run on Linux.

The owner writes Korean: answer in Korean in chat, keep code, commit messages and docs in English. Code comments are mostly Korean; match the file you are editing.

## Read first

- `README.md`: features, usage, project layout, how ssh is started, tests.
- `LOOP_LOG.md`: the protocol of the hourly maintenance routine, the **owner's decisions**, the backlog and the run log. It is the memory between sessions. Read it before working, append to it after a scheduled run.
- `CHANGELOG.md`: keep the Unreleased section current for user-visible changes.

## Commands

```sh
npm run lint        # eslint (neostandard + vue2), must be clean
npx vitest run      # unit tests (Node env, no DOM)
npm run build       # electron-vite build into ./out
npm run dev         # dev server with HMR
```

Run lint, tests and build before every commit. Node 20.19+ or 22.12+. `.npmrc` sets `legacy-peer-deps` (the Rete v1 plugins declare old peers).

## Rules that matter

- **Nothing user-controlled reaches a shell unchecked.** Every value that ends up in an `ssh` command or config goes through `src/main/validate.js`; `ssh.js` builds a bash script with POSIX single-quoted values. Passwords travel only as environment variables and are answered through `SSH_ASKPASS` (the generated script is its own askpass). Never put passwords or keys into logs, docs or commit messages.
- **The repository is public (MIT).** No secrets, tokens, real hosts or personal data in files or commit messages.
- **Behavior changes need a test.** After adding a test, break the code on purpose once and see it fail. Never skip or delete a failing test to get green.
- The renderer is sandboxed with a narrow IPC API (`src/preload/index.js`). Keep logic that can be pure in `src/renderer/src/utils/` or `src/main/*.js` with tests; components stay thin. Values both processes need (setting defaults and validation, the canvas zoom range) live once in `src/shared/` (no Node modules there).
- **Keep the docs true.** A user-visible change goes into the Unreleased section of `CHANGELOG.md`; a new file in `src/main` or a new node component goes into the "project layout" of `README.md`.
- Saved data (`projects.json`, items are `{ name, data, view? }`) goes through `normalizeItems` in `src/main/storage.js`. Old data must keep loading; add a migration there instead of breaking it.

## Owner's decisions (details in LOOP_LOG.md)

Passwords stay plain text. The Vue 3 / Rete 2 migration is on hold. No Playwright test in the repo. Do not propose those again unless something breaks. The scheduled routine does no research (no web browsing, no looking at other projects or issues); it works on this repository only.

## Git

- Work on `claude/cool-bardeen-9x9ymz`, push there, no pull request unless asked, no force push, no history rewriting.
- Small commits whose message says why. End each commit with the trailer lines the session asks for (`Co-Authored-By: ...` with the model the session names, and the `Claude-Session:` line). Do not copy the model name from older commits.
- CI (`.github/workflows/ci.yml`): Ubuntu runs lint, tests and build; Windows runs the tests, the bash based script tests under Git Bash and the real `git-bash.exe` launcher test. Check the result of the last run with the GitHub MCP tools (`gh` is not available).

## Checking the UI

The app is checked in the real Electron with Playwright under `xvfb-run` (scripts are throwaway, not in the repo): launch `node_modules/electron/dist/electron` with the repo as the app, `--no-sandbox --disable-gpu --user-data-dir=<tmp>`, and seed `<tmp>/projects.json` (`{ "version": 1, "items": [...] }`). Build first (`npm run build`), the app loads `out/`.

## Gotchas learned the hard way

- The popovers (v-tooltip / popper.js 1.x) are moved out of the window by the `arrow` modifier because the arrow element has no styles; it is disabled in `main.js`. Keep it that way.
- Styles of `rete-context-menu-plugin` are scoped (`.item[data-v-x]`); overriding needs a more specific selector such as `div.context-menu div.item`.
- Rete plugins need `regenerator-runtime` (imported first in `main.js`).
- The look (colors, fonts, Bootstrap overrides for buttons, forms, dropdowns, modals, toasts) lives in `src/renderer/src/assets/theme.scss` as CSS variables; components use `var(--js-*)`. No logos or other brands' artwork, only the general style. The moving signal on a connection is a second `path.flow-path` added in `components/editor/index.vue` on `renderconnection` and kept in step on `updateconnection`; it must stay after `path.main-path` because the arrow plugin measures the first path. It is only shown on `.is-live` connections: `markLiveRoutes()` matches open terminal sessions (their `hops`, `user@host:port` in path order, from `utils/terminal-sessions.js`) against the nodes and toggles the class on the Rete node and connection views.
- `b-form-input` with `trim` is fine for typing spaces; do not "fix" it.
- On Windows Git Bash puts its own `/usr/bin` before `PATH`, so tests that fake `ssh` must use a bash function (`BASH_ENV`), not a fake binary on `PATH`.
- Sidebar list items are positioned (for the highlight), so an item whose `...` menu is open needs a higher `z-index` or the menu hides behind the next items.
- Vue 2 reactivity: a property added later to an item needs `$set`; navigator items and `projectData` in `views/Layout.vue` are separate copies that are rebuilt on every `updated` event.
- Terminals in the app: `node-pty` is the only runtime `dependencies` entry (native, N-API, prebuilt for Windows/macOS, compiled with node-gyp on Linux), so electron-vite keeps it external and electron-builder packs it (`npmRebuild: false`, `asarUnpack`). `pty.kill()` only signals bash; `killPty` hangs up the whole process group so ssh ends too.
- The base font is set on `body` (plus `.tooltip`, `.popover`) and inherited. Never put it on `*`: that overrides every class that sets `--js-font-display` on a parent (the text inside a button stays in the base font) and breaks xterm's character grid.
- The pixel font is VT323 under the name `JS Pixel` with `size-adjust: 128%` (`theme.scss`), because VT323 is much smaller than other fonts at the same size. Sizes of display text are chosen for that.
- Palettes are `:root[data-theme=...]` blocks in `theme.scss`; a new one also needs its name in `THEMES` (`src/shared/setting.js`) and a button in the settings popup. The background scene (sky, sun, city, grid) is plain CSS in `components/layout/scene-backdrop.vue`: `.scene-art` holds the picture, `.scene-fx` the overlays, and the setting `backdrop` (`BACKDROPS` in `setting.js`) picks a `.scene-<name>` class (and `#editor-area.backdrop-<name>` in `views/Layout.vue`; Vivid uses it to give lines a dark `drop-shadow`). The setting `nodeBlur` (0..`NODE_BLUR_MAX` px, 0 = off) adds `.node-glass` and `--node-blur` to `#editor-area`: the text under a node (`.info-card`, as wide as the text) becomes a frosted panel with a `backdrop-filter`; the node box itself is left alone (a panel around it also blurred the connections, which are drawn below the nodes). Dim the scene with opacity, not `brightness()`, and warm the sun in dimmed modes: a darkened yellow turns olive.
- Never `pkill -f` a pattern that also appears in your own shell command: it kills the shell running it.
- In Electron 44 `clipboard.readText()`/`writeText()` in main return Promises; await them (the terminal's clipboard IPC and Copy SSH config do).
- `SSH_ASKPASS_REQUIRE` needs OpenSSH 8.4+. Password sign-in was verified against Linux sshd and on Windows only up to the script/askpass mechanics.

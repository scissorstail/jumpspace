# Changelog

## 0.3.0-beta (unreleased)

Everything since 0.2.2-beta.

### Added

- **Connection state on the canvas.** A path opened in the app terminal is yellow while connecting, turns into the flowing pink line with a green dot once ssh has logged in, and becomes a red dashed line with a red dot when the connection failed (until its tab is closed or reconnected). ssh reports the login itself through an invisible marker (`LocalCommand`), so a session waiting for a password stays "connecting". The terminal tab's dot and tooltip follow the same states.
- **Reconnect an ended terminal tab.** A tab whose session ended shows a reconnect button, and Enter in its terminal does the same: the same connection starts again in the same tab (the path lights up again). The request with its password stays in the main process until the tab is closed; the window never keeps it.
- **Terminals inside the app.** Connect, ProxyJump and forwards open in a panel at the bottom of the window (xterm.js + node-pty), one tab per session, instead of a separate Git Bash window. Key passphrases and other prompts are typed into the tab; closing a tab ends the session. *Settings > Open SSH in* brings back the Git Bash window.
- **Background effects.** *Settings > Background* tones down the scenery behind the canvas so the nodes stand out: **Depth** (default: blurred, faded, a light haze on the horizon, so the diagram floats in front), **CRT** (scan lines, a slow rolling band and dark corners), **Soft** (faded, dark edges), **Vivid** (the full scene; lines get a dark outline so they stay visible over the bright sun and grid) or **Off**. Only the scenery changes; nodes, lines and text stay sharp. *Settings > Node glass* (0 to 20 px, off by default) puts the text under each node (name, address, forwards) on a light frosted glass panel, as wide as the text, that blurs the scenery behind it, with any background.
- **Copy and paste in the terminal.** Select text and press Ctrl+Shift+C (or Ctrl+Insert) to copy; Ctrl+Shift+V or Shift+Insert pastes. A right click copies the selection, or pastes when nothing is selected, like in Windows terminals. Ctrl+C still interrupts the remote program.
- **Open paths come alive on the canvas.** While a terminal in the app is open, the connections along its path turn pink with square signals flowing from each hop to the next, and the nodes on it show a small blinking green dot (like the dot on the terminal tab). Idle connections stay still. Nodes are matched by user, host and port, so the same path in another item shows it too. (Not for the separate Git Bash window, whose sessions the app cannot see.)
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
- **A flat synthwave look** with high contrast: a dark violet night with a neon perspective grid, a striped sun clipped at the horizon and a pixel skyline behind the canvas, all in solid colors without glow or blur. Nodes are square dark panels with a neon border and a hard black shadow (pink with a yellow shadow when selected), the name on a pink tag in a pixel font, user / host / port in a monospace font on a dark plate so they stay readable over the scenery, square sockets and a cyan connection with a moving pink signal. The header, the terminal panel and every dialog carry a three-color band; buttons, menus, tabs and labels use pixel capitals, and switches and the terminal tab buttons are square as well. *Settings > Theme* offers three palettes (Neon Night, Sunset Drive, Vapor Blue); the terminal follows the palette. Fonts: VT323 and JetBrains Mono (both OFL), bundled with the app. The animations stop when the system asks for reduced motion.
- **Visual polish.** A dot grid instead of the checkerboard behind the canvas; on a node the name is bold and user / host / port are lighter and smaller; a node without an image shows a neutral server symbol instead of an empty grey frame; popovers and the Settings and Info dialogs are white rounded cards with the same shadow as the right click menu; the open item in the sidebar has a highlight and a blue frame only for keyboard focus; thinner scrollbars; smaller labels in the node settings. Second pass: lighter nodes (2px dark border, soft shadow that grows on hover, a blue ring instead of a dark cover when selected), thinner grey connections, the node menu as round white buttons, the name of the opened item in the header, a pill shaped search box, and confirmation dialogs and toasts as rounded cards.
- The lock button's tooltip no longer stays on screen (showing the opposite label) after a click; it uses the same plain tooltip as the other header buttons. *Close to system tray* in Settings is now *Close to tray* with a short explanation.
- Popovers opened with the keyboard take the focus, so Tab continues inside them. Popovers are opaque and close with Escape. The right click menus are redesigned: white card with rounded corners, icons, a red *Delete*, a short fade-in, and the canvas entry reads *Add node*.
- Accessibility: the icon-only controls (node menu, sidebar, header, forwards) are real buttons with names for screen readers and tooltips, keyboard focus is visible and reveals the node menu, and the grey helper texts are darker.

### Fixed

- With many terminal tabs the active tab and the "Hide terminals" button were scrolled out of sight, so none of the visible tabs looked selected. Tabs now shrink first, the active tab is always scrolled into view, the hide button stays put, the mouse wheel scrolls the tabs, and a tab's tooltip names it. Space selects a tab, and closing a tab with the keyboard no longer selects it first and leaves the focus in the remaining terminal.
- In Vapor Blue, yellow text in the terminal was purple (the palette's sun color) and hard to tell from its magenta. Yellow and green in the terminal are now the same fixed yellow and green as the connection states, in every palette. In Sunset Drive the terminal's red and magenta (both pink) and yellow and cyan (both orange) looked alike; it now has its own violet magenta and cyan.
- With a long target host, the forward line under a node was cut before its count, so "(+5)" for the other forwards disappeared. The count now always shows; only the first forward is shortened.
- Pointing at a sidebar item made it 2px taller (its `...` button was taller than the name), so every item below jumped. The button now fits the row.
- Turning on *Node glass* moved the text under every node about 4px down (the panel's padding). The panel now grows outward around the text, so the text stays exactly where it is with the glass on or off.
- Sidebar items picked with Ctrl+click were only tinted, so neighbours merged into one block and the focused one looked different. Each now has a bar on its left and a thin gap to the next.
- The warning shown when you open another item while the editor is unlocked had a whole question as its title (two lines in the pixel font) and a short, unexplained body. It is now titled *Unsaved changes* and says that changes are saved only when the editor is locked again.
- Opening a node's *Port forwarding* or *Setting* popover with the keyboard left the focus on its button, so Tab went through the other node buttons first. The focus now moves into the popover (it was moved while the popover was still hidden).
- The sidebar search box showed no sign of having the keyboard focus; its border now lights up like other inputs.
- Connection lines ended about 2px above and left of the socket centers (Rete measures sockets without the node's border). The node frame is now drawn as an inset outline, so lines meet the sockets exactly.
- With the sidebar open, the "No diagram open" hint and the header title were partly hidden behind it; they now center in the visible part.
- Small inputs had three different heights (29/31/33px) depending on whether a button was attached, and the remove button of a forward row was taller than its inputs. They now share one height.
- In the settings, a label whose control has a help text below it sat halfway down next to the help text instead of next to the control. Labels now line up with the first line of their control, here and in the node settings.
- The column title "Local port" in the port forwarding popover broke onto two lines. *Delete* in a node's right-click menu used a fixed red instead of the palette's, and turned pink like the other items when pointed at; it now turns red.
- A user, host, key path or exec that the launch would reject was only reported when a connection started. The node settings now mark such a field while you type and say what is allowed (the same rules main checks).
- The red dot of a terminal tab that ended with an error could not be seen while the tab was active (the active tab is pink); the dot now has a dark border there.
- The fields in a node's settings were not tied to their labels: clicking a label now moves to its field, and screen readers announce the field's name.
- The hint toast (for example "Unlock the editor ...") was a light grey box with white text; toasts now use the theme colors, error toasts with a red header.
- A connection that failed in the app terminal (for example *Connection refused*) waited for Enter and looked like an open session: the tab stayed "running" and the path stayed lit. The session now ends right away; the tab shows the exit status and a red dot.
- The "previous image" button could not return to the first image.
- The generated script ignored a hang-up: after its window was closed it could still run its last lines. It now exits on HUP and TERM.
- A key path with a control character could pass validation after an earlier value had been rejected (shared global regex).
- ProxyJump failed with an error for a node whose key was never set, and wrote an empty `IdentityFile` line for one whose key was cleared. Temp files were written to the working directory and never cleaned up.
- Saved data contained a copy of the previous nodes (including their passwords) inside every node. It is no longer saved and is removed from existing files.
- Failed launches show the reason instead of a generic alert.
- Removing items asks for confirmation, and removing unselected items no longer closes the open editor.
- The port forwarding and settings popovers were pushed out of the window when their node was near the right edge, and never lined up with their icon.
- Sidebar: an empty list says how to add an item, and a search without results says so instead of showing nothing.
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

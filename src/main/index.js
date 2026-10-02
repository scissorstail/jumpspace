import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  protocol,
  net,
  ipcMain,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  dialog,
  clipboard,
  webContents
} from 'electron'
import Store from 'electron-store'
import info from '../../package.json'
import icon from '../../resources/icon.png?asset'
import { spawn as spawnPty } from 'node-pty'
import { launch, sweepTempDir } from './launcher.js'
import { createTerminalManager, terminalBash } from './terminal.js'
import { APP_URL, appFilePath, isAppUrl } from './trust.js'
import { toResult } from './ipc-result.js'
import { createSettingStore } from './setting-store.js'
import { buildSshConfig } from './ssh-config.js'
import { createProjectStorage, normalizeItems, parseItems } from './storage.js'

// 터미널에서 복사/붙여넣기로 오가는 글자 수의 상한
const MAX_CLIPBOARD = 1024 * 1024

const isMac = process.platform === 'darwin'

let win = null
let tray = null

// 종료 제어용
let isQuitting = false

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

// Single instance lock. package.json의 name으로 구분
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  main()
}

function main() {
  const settings = createSettingStore(new Store())
  const getSetting = settings.get
  const projects = createProjectStorage(app.getPath('userData'))
  const tempDir = join(app.getPath('temp'), 'jumpspace')

  // 앱 화면(app:// 또는 dev server)에서 온 요청만 처리한다.
  function isTrusted(event) {
    return isAppUrl(event.senderFrame?.url, process.env.ELECTRON_RENDERER_URL)
  }

  function on(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
      if (isTrusted(event)) handler(event, ...args)
    })
  }

  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrusted(event)) throw new Error('Untrusted sender')
      return handler(event, ...args)
    })
  }

  on('window:setTitle', (event, data) => {
    if (win) win.title = (typeof data === 'string' && data ? `${data} - ` : '') + 'jumpspace'
  })

  on('window:mouseMove', (event, data) => {
    // 드래그 종료 후 hover 상태를 갱신하기 위한 가짜 mouseMove 이벤트
    if (win && Number.isFinite(data?.x) && Number.isFinite(data?.y)) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: data.x, y: data.y })
    }
  })

  on('window:toggleDevTools', () => win?.webContents.toggleDevTools())

  on('window:reload', () => win?.webContents.reload())

  handle('setting:get', () => getSetting())

  handle('setting:set', (event, data) => settings.set(data))

  handle('projects:load', () => projects.load())

  handle('projects:save', (event, json) => projects.save(json))

  handle('projects:export', async (event, json, defaultName = 'export.json') => {
    const items = normalizeItems(JSON.parse(json))
    const filename = dialog.showSaveDialogSync(win, {
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON file', extensions: ['json'] }]
    })

    if (!filename) return false

    await writeFile(filename, JSON.stringify(items), 'utf-8')
    return true
  })

  handle('projects:import', async () => {
    const filenames = dialog.showOpenDialogSync(win, {
      filters: [{ name: 'JSON file', extensions: ['json'] }]
    })

    if (!filenames || filenames.length === 0) return null

    return JSON.stringify(parseItems(await readFile(filenames[0], 'utf-8')))
  })

  handle('dialog:selectKeyFile', () => {
    const filenames = dialog.showOpenDialogSync(win, {
      defaultPath: join(app.getPath('home'), '.ssh'),
      properties: ['openFile', 'showHiddenFiles']
    })
    return filenames?.[0] ?? null
  })

  // SSH 실행. 실패해도 예외 대신 { ok: false, error }를 돌려줘서 화면에서 안내할 수 있게 한다.
  for (const kind of ['connect', 'forward', 'proxyJump']) {
    handle(`ssh:${kind}`, (event, payload) => toResult(`ssh:${kind}`, async () => {
      await launch(kind, payload, { tempDir, gitBashPath: getSetting().gitBashPath })
    }))
  }

  // 앱 안의 터미널. 스크립트는 위와 같이 만들고, Git Bash 창 대신 pty에서 실행해 화면(xterm.js)과 주고받는다.
  const terminals = createTerminalManager({
    tempDir,
    getBash: () => terminalBash(getSetting().gitBashPath),
    spawnPty,
    send: (owner, channel, ...args) => {
      const contents = webContents.fromId(owner)
      if (contents && !contents.isDestroyed()) contents.send(channel, ...args)
    }
  })

  handle('terminal:open', (event, kind, payload, size) => toResult(`terminal:${kind}`, async () => ({
    id: await terminals.open(kind, payload, { owner: event.sender.id, cols: size?.cols, rows: size?.rows })
  })))
  // 끝난 탭을 같은 요청으로 다시 연다. 요청(비밀번호 포함)은 main만 갖고 있다.
  handle('terminal:reopen', (event, id, size) => toResult('terminal:reopen', async () => ({
    id: await terminals.reopen(id, event.sender.id, { cols: size?.cols, rows: size?.rows })
  })))
  on('terminal:write', (event, id, data) => terminals.write(id, event.sender.id, data))
  on('terminal:resize', (event, id, cols, rows) => terminals.resize(id, event.sender.id, cols, rows))
  on('terminal:close', (event, id) => terminals.close(id, event.sender.id))

  // 새로고침하거나 창을 닫으면 그 화면의 터미널은 끝낸다.
  app.on('web-contents-created', (event, contents) => {
    const owner = contents.id
    contents.on('did-start-navigation', details => {
      if (details.isMainFrame && !details.isSameDocument) terminals.closeAll(owner)
    })
    contents.on('destroyed', () => terminals.closeAll(owner))
  })
  app.on('before-quit', () => terminals.closeAll())

  // 앱 안의 터미널의 복사/붙여넣기. (샌드박스 렌더러는 클립보드에 직접 접근하지 않는다)
  // (Electron 44의 clipboard.readText()는 Promise를 돌려준다)
  handle('clipboard:writeText', async (event, text) => {
    if (typeof text === 'string' && text.length <= MAX_CLIPBOARD) await clipboard.writeText(text)
  })
  handle('clipboard:readText', async () => String((await clipboard.readText()) ?? '').slice(0, MAX_CLIPBOARD))

  // 접속 정보를 ~/.ssh/config 형식으로 클립보드에 복사한다.
  handle('ssh:copyConfig', (event, request) => toResult('ssh:copyConfig', async () => {
    await clipboard.writeText(buildSshConfig(request?.nodes, { forwards: request?.forwards }))
  }))

  // Singleton instance
  app.on('second-instance', () => showWindow())

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (!isMac) {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(getSetting)
    }
  })

  app.whenReady().then(() => {
    registerAppProtocol()
    sweepTempDir(tempDir)

    tray = new Tray(icon)
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Quit',
        type: 'normal',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ]))
    tray.setToolTip(info.name)
    tray.on('double-click', () => showWindow())

    return createWindow(getSetting)
  }).catch(e => {
    // 창이 없는 상태로 프로세스만 남지 않도록 알리고 종료한다.
    console.error(e)
    dialog.showErrorBox('jumpspace failed to start', String(e?.stack || e))
    isQuitting = true
    app.quit()
  })
}

function showWindow() {
  if (!win) return

  if (!win.isVisible()) {
    win.show()
  } else if (win.isMinimized()) {
    win.restore()
  }

  win.focus()
}

// 기존 버전과 같은 origin(app://.)을 유지해야 이전에 localStorage에 저장한 데이터를 이어서 읽을 수 있다.
function registerAppProtocol() {
  const rendererDir = join(__dirname, '../renderer')

  protocol.handle('app', request => {
    const file = appFilePath(rendererDir, request.url)
    if (!file) return new Response('Forbidden', { status: 403 })

    return net.fetch(pathToFileURL(file).toString())
  })
}

async function createWindow(getSetting) {
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon,
    show: false
  })

  win.removeMenu()

  win.once('ready-to-show', () => win.show())

  // https://www.electronjs.org/docs/api/window-open#native-window-example
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 앱 화면 밖으로 이동하지 못하게 한다.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, process.env.ELECTRON_RENDERER_URL)) {
      event.preventDefault()
    }
  })

  win.on('show', () => win.setSkipTaskbar(false))

  win.on('close', event => {
    if (!isQuitting && getSetting().isHideToTrayOnClose) {
      event.preventDefault()
      win.setSkipTaskbar(true)
      win.hide()
    }
  })

  win.on('closed', () => {
    win = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    await win.loadURL(APP_URL)
  }
}

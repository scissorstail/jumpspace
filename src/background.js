'use strict'
/* global __static */
import info from '../package.json'
import {
  app,
  protocol,
  ipcMain,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  dialog
} from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import path from 'path'
import Store from 'electron-store'

const isDevelopment = process.env.NODE_ENV !== 'production'

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let tray

// 종료 제어용
let isQuitting = false

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

// 세팅 값 저장
const store = new Store()

// Single instance lock. package.json의 name으로 구분
const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  if (isDevelopment && !process.env.IS_TEST) {
    dialog.showErrorBox(
      'singleInstanceLock',
      'Another instance is already running'
    )
  }

  app.quit()
} else {
  // ipc
  ipcMain.handle('getStore', event => {
    return store.get('setting')
  })

  ipcMain.on('setStore', (event, data) => {
    store.set('setting', data)
  })

  ipcMain.on('toggleDevTools', event => {
    win.webContents.toggleDevTools()
  })

  ipcMain.on('reload', event => {
    win.webContents.reload()
  })

  ipcMain.on('loadURL', (event, data) => {
    win.webContents.loadURL(data)
  })

  ipcMain.handle('showSaveDialogSync', (event, data) => {
    return dialog.showSaveDialogSync(data)
  })

  ipcMain.handle('showOpenDialogSync', (event, data) => {
    return dialog.showOpenDialogSync(data)
  })

  // Singleton instance
  app.on('second-instance', () => {
    if (!win.isVisible()) {
      win.show()
    } else if (win.isMinimized()) {
      win.restore()
    }

    win.focus()
  })

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow()
    }
  })

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', async () => {
    if (isDevelopment && !process.env.IS_TEST) {
      // Install Vue Devtools
      try {
        await installExtension(VUEJS_DEVTOOLS)
      } catch (e) {
        console.error('Vue Devtools failed to install:', e.toString())
      }
    }

    tray = new Tray(path.join(__static, 'icon.png'))
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Quit',
        type: 'normal',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(contextMenu)
    tray.setToolTip(info.name)

    tray.on('double-click', () => {
      if (!win.isVisible()) {
        win.show()
      } else if (win.isMinimized()) {
        win.restore()
      }
    })

    createWindow()
  })

  // Exit cleanly on request from parent process in development mode.
  if (isDevelopment) {
    if (process.platform === 'win32') {
      process.on('message', data => {
        if (data === 'graceful-exit') {
          app.quit()
        }
      })
    } else {
      process.on('SIGTERM', () => {
        app.quit()
      })
    }
  }
}

async function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: true
    },
    icon: path.join(__static, 'icon.png'),
    show: false
  })
  win.removeMenu()

  win.once('ready-to-show', () => {
    win.show()
  })

  // https://www.electronjs.org/docs/api/window-open#native-window-example
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    await win.loadURL('app://./index.html')
  }

  win.on('show', async () => {
    win.setSkipTaskbar(false)
  })

  win.on('close', event => {
    const setting = JSON.parse(store.get('setting'))
    if (!isQuitting && setting.isHideToTrayOnClose) {
      event.preventDefault()
      if (!win.isMinimized()) {
        win.setSkipTaskbar(true)
        win.hide()
      }
    } else {
      win = null
    }
  })

  win.on('closed', () => {
    win = null
  })
}

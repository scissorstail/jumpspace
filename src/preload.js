const path = require('path')
const fs = require('graceful-fs')
const exec = require('child_process').exec
const crypto = require('crypto')
const { ipcRenderer, contextBridge } = require('electron')

// https://www.electronjs.org/docs/tutorial/context-isolation#context-isolation
contextBridge.exposeInMainWorld('preload', {
  getStore: () => {
    return ipcRenderer.invoke('getStore')
  },
  setStore: (data) => {
    ipcRenderer.send('setStore', data)
  },
  toggleDevTools: () => {
    ipcRenderer.send('toggleDevTools')
  },
  reloadApp: () => {
    if (process.env.WEBPACK_DEV_SERVER_URL) {
      ipcRenderer.send('reload')
    } else {
      ipcRenderer.send('loadURL', 'app://./index.html')
    }
  },
  readDiagramDirSync: async(dirname) => {
  // eslint-disable-next-line no-undef
    return fs.readdirSync(path.join(__static, 'img', 'diagram', dirname))
  },
  executeCommand: (command, callback = () => {}) => {
    function execute(command, callback) {
      return exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(error)
          alert('executeCommand Error!')
          return
        }

        callback(stdout)
      })
    }

    // call the function
    execute(`${command}`, output => {
      callback(output)
    })
  },
  md5: (data) => {
    return crypto
      .createHash('md5')
      .update(data)
      .digest('hex')
  },
  writeFileSync: (filename, data) => {
    fs.writeFileSync(filename, data, 'utf-8')
  },
  unlinkFile: (filename) => {
    fs.unlink(filename, () => {})
  },
  saveProjectDataAsJSON: async (jsonData, defaultPath = '~/untitled.json') => {
    const filename = await ipcRenderer.invoke('showSaveDialogSync', {
      defaultPath,
      filters: [
        {
          name: 'JSON file',
          extensions: ['json']
        }
      ]
    })

    if (filename) {
      fs.writeFileSync(filename, jsonData, 'utf-8')
    }
  },
  loadProjectDataFromJSON: async () => {
    const filenames = await ipcRenderer.invoke('showOpenDialogSync', {
      filters: [
        {
          name: 'JSON file',
          extensions: ['json']
        }
      ]
    })

    if (filenames && filenames.length > 0) {
      return fs.readFileSync(filenames[0], 'utf-8')
    }

    return null
  }
})

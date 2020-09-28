const path = require('path')
const fs = require('graceful-fs')
const exec = require('child_process').exec
const crypto = require('crypto')
const { ipcRenderer } = require('electron')
const {
  dialog,
  getCurrentWebContents,
  getCurrentWindow
} = require('electron').remote

window.ipcRenderer = ipcRenderer

window.toggleDevTools = function() {
  getCurrentWebContents().toggleDevTools()
}

window.reloadApp = function() {
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    getCurrentWindow().loadURL(process.env.WEBPACK_DEV_SERVER_URL)
  } else {
    getCurrentWindow().loadURL('app://./index.html')
  }
}

window.readDiagramDirSync = async function(dirname) {
  // eslint-disable-next-line no-undef
  return fs.readdirSync(path.join(__static, 'img', 'diagram', dirname))
}

window.executeCommand = function(command, callback = () => {}) {
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
}

window.md5 = function(data) {
  return crypto
    .createHash('md5')
    .update(data)
    .digest('hex')
}

window.writeFileSync = function(filename, data) {
  fs.writeFileSync(filename, data, 'utf-8')
}

window.unlinkFile = function(filename) {
  fs.unlink(filename, () => {})
}

window.saveProjectDataAsJSON = function(
  jsonData,
  defaultPath = '~/untitled.json'
) {
  const filename = dialog.showSaveDialogSync({
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
}

window.loadProjectDataFromJSON = function() {
  const filenames = dialog.showOpenDialogSync({
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

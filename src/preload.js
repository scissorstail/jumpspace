const path = require('path')
const fs = require('graceful-fs')
const exec = require('child_process').exec
const crypto = require('crypto')
const { dialog } = require('electron').remote

window.readDiagramDir = function (dirname, callback) {
  fs.readdir(path.join(__dirname, '../public/img/diagram', dirname), callback)
}

window.executeCommand = function (command, callback = () => {}) {
  function execute (command, callback) {
    exec(command, (error, stdout, stderr) => {
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

window.md5 = function (data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

window.writeFileSync = function (filename, data) {
  fs.writeFileSync(filename, data, 'utf-8')
}

window.unlinkFile = function (filename) {
  fs.unlink(filename, () => {})
}

window.saveProjectDataAsJSON = function (jsonData) {
  const filename = dialog.showSaveDialogSync({
    defaultPath: '~/untitled.json',
    filters: [{
      name: 'JSON file',
      extensions: ['json']
    }]
  })

  if (filename) {
    fs.writeFileSync(filename, jsonData, 'utf-8')
  }
}

window.loadProjectDataFromJSON = function () {
  const filenames = dialog.showOpenDialogSync({
    filters: [{
      name: 'JSON file',
      extensions: ['json']
    }]
  })

  if (filenames?.length > 0) {
    return fs.readFileSync(filenames[0], 'utf-8')
  }

  return null
}

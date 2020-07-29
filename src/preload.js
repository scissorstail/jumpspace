const path = require('path')
const fs = require('graceful-fs')
const exec = require('child_process').exec
// const app = require('electron').remote.app

window.readDiagramDir = function (dirname, callback) {
  fs.readdir(path.join(__dirname, '../public/img/diagram', dirname), callback)
}

/*
window.setupLocalPath = function () {
  const dir = path.join(app.getAppPath(), 'temp')
  !fs.existsSync(dir) && fs.mkdirSync(dir)

  const dir2 = path.join(app.getAppPath(), 'temp_ctl')
  !fs.existsSync(dir2) && fs.mkdirSync(dir2)

  const dir3 = path.join(app.getAppPath(), 'temp_config')
  !fs.existsSync(dir3) && fs.mkdirSync(dir3)
}
*/

window.executeCommand = function (command) {
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
    console.log(`execute output: ${output}`)
  })
}

// const remote = require('electron').remote; window.WriteLog = function (message) { var fs = require('fs'); fs.appendFile('D:/electron.txt', message + '\r\n', function (err) { if (err) throw err; console.log('Saved!') }) }

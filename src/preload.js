const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec

window.readDiagramDir = function (dirname, callback) {
  fs.readdir(path.join(__dirname, '../public/img/diagram', dirname), callback)
}

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
    console.log(output)
  })
}

// const remote = require('electron').remote; window.WriteLog = function (message) { var fs = require('fs'); fs.appendFile('D:/electron.txt', message + '\r\n', function (err) { if (err) throw err; console.log('Saved!') }) }

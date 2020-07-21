const path = require('path')
const fs = require('fs')

window.readDiagramDir = function (dirname, callback) {
  fs.readdir(path.join(__dirname, '../public/img/diagram', dirname), callback)
}

// const remote = require('electron').remote; window.WriteLog = function (message) { var fs = require('fs'); fs.appendFile('D:/electron.txt', message + '\r\n', function (err) { if (err) throw err; console.log('Saved!') }) }

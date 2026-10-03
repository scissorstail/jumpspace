// 패키지된 앱 안의 node-pty가 로드되고 터미널(Windows에서는 ConPTY)로 프로세스를 실행하는지 확인한다.
// 패키지의 실행 파일을 ELECTRON_RUN_AS_NODE=1로 실행한다: node <this file> <unpacked dir>
const { resolve } = require('node:path')

const dir = process.argv[2]
const pty = require(resolve(dir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty'))
const [file, args] = process.platform === 'win32'
  ? ['cmd.exe', ['/c', 'echo packaged-pty-ok']]
  : ['/bin/sh', ['-c', 'echo packaged-pty-ok']]

let output = ''
const timer = setTimeout(() => {
  console.error('no exit after 30s, output:', JSON.stringify(output))
  process.exit(1)
}, 30000)
const proc = pty.spawn(file, args, { cols: 80, rows: 24 })
proc.onData((data) => { output += data })
proc.onExit(({ exitCode }) => {
  // ConPTY는 마지막 출력을 종료 알림 뒤에 보낼 때가 있다.
  setTimeout(() => {
    clearTimeout(timer)
    const ok = exitCode === 0 && output.includes('packaged-pty-ok')
    console.log(ok ? 'packaged node-pty ok' : `failed: exit ${exitCode}, output ${JSON.stringify(output)}`)
    process.exit(ok ? 0 : 1)
  }, 500)
})

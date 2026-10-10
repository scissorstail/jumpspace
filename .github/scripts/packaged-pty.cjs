// 패키지된 앱 안의 node-pty가 로드되고 터미널(Windows에서는 ConPTY)로 프로세스를 실행하는지 확인한다.
// Windows에서는 앱이 쓰는 대로 node-pty에 함께 들어 있는 ConPTY(conpty.dll, OpenConsole.exe)로도 띄워 본다:
// 그 파일들이 패키지에서 빠지면 앱은 Windows의 것으로 물러나서, 눈에 띄지 않고 지나간다.
// 패키지의 실행 파일을 ELECTRON_RUN_AS_NODE=1로 실행한다: node <this file> <unpacked dir>
const { resolve } = require('node:path')

const dir = process.argv[2]
const pty = require(resolve(dir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty'))
const [file, args] = process.platform === 'win32'
  ? ['cmd.exe', ['/c', 'echo packaged-pty-ok']]
  : ['/bin/sh', ['-c', 'echo packaged-pty-ok']]

function run(label, options) {
  return new Promise((resolve) => {
    let output = ''
    const timer = setTimeout(() => {
      console.error(`${label}: no exit after 30s, output:`, JSON.stringify(output))
      resolve(false)
    }, 30000)
    const proc = pty.spawn(file, args, { cols: 80, rows: 24, ...options })
    proc.onData((data) => {
      output += data
      // 새 ConPTY는 시작할 때 터미널에게 묻고(DA1) 답을 3초까지 기다린다. 화면(xterm.js)이 하듯 답한다.
      if (data.includes('\x1b[c')) proc.write('\x1b[?1;2c')
    })
    proc.onExit(({ exitCode }) => {
      // ConPTY는 마지막 출력을 종료 알림 뒤에 보낼 때가 있다.
      setTimeout(() => {
        clearTimeout(timer)
        const ok = exitCode === 0 && output.includes('packaged-pty-ok')
        console.log(ok ? `${label}: packaged node-pty ok` : `${label}: failed: exit ${exitCode}, output ${JSON.stringify(output)}`)
        resolve(ok)
      }, 500)
    })
  })
}

;(async () => {
  const runs = [['default pty', {}]]
  if (process.platform === 'win32') runs.push(['bundled ConPTY', { useConptyDll: true }])

  let ok = true
  for (const [label, options] of runs) {
    try {
      ok = (await run(label, options)) && ok
    } catch (e) {
      console.error(`${label}: failed to start:`, e)
      ok = false
    }
  }
  process.exit(ok ? 0 : 1)
})()

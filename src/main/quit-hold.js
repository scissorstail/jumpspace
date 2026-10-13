// 앱을 끝내기 전에 아직 끝나지 않은 저장을 기다린다.
//
// 기본 설정에서는 창을 닫으면 앱이 끝난다. 잠그자마자 닫으면 그 저장이 아직 main에서 쓰이는 중일 수 있고, 프로세스가 먼저 끝나면
// 그 저장은 projects.json.tmp로만 남는다: 잠가서 저장한 줄 아는 편집이 말없이 사라진다. 보통은 저장이 몇 ms라 그럴 틈이 없다
// (실제 창에서 42번 닫아 42번 남았다). 다른 프로그램(백신, 색인)이 projects.json을 열어 둔 동안은 다르다: Windows가 rename을
// 거절하고 storage.js가 1.5초까지 다시 하는데, 그 사이에 닫은 창은 그대로 앱을 끝냈다 (파일을 0.6초 잡아 두고 4번에 4번, 2026-10-14).
//
// will-quit에서 쓴다 (창이 모두 닫힌 뒤, 프로세스가 끝나기 직전): 저장이 남았으면 끝내기를 막고, 저장이 끝나면 다시 끝낸다.
// 끝나지 않는 저장(멈춘 디스크) 때문에 창 없는 앱이 남지 않도록 limitMs 뒤에는 그냥 끝낸다.
export const QUIT_WAIT_LIMIT_MS = 5000

// isBusy(): 끝나지 않은 일이 있는가. settled(): 그 일이 끝나면 풀리는 Promise. quit(): 다시 끝내기 (app.quit).
// 돌려주는 함수는 will-quit의 event를 받는다.
export function createQuitHold({ isBusy, settled, quit, limitMs = QUIT_WAIT_LIMIT_MS }) {
  let isWaiting = false
  let hasGivenUp = false

  return function holdQuit(event) {
    if (hasGivenUp || !isBusy()) return

    event.preventDefault()
    // 기다리는 동안 또 끝내려 하면(트레이의 Quit) 막기만 한다: 끝내기는 한 번이면 된다
    if (isWaiting) return

    isWaiting = true
    let timer = null
    const finish = gaveUp => {
      if (!isWaiting) return

      isWaiting = false
      // 포기한 뒤에 다시 오는 끝내기는 막지 않는다 (막으면 limitMs마다 되풀이될 뿐이다)
      hasGivenUp = gaveUp
      clearTimeout(timer)
      if (gaveUp) console.error(`Quitting although a save has not ended after ${limitMs} ms`)
      quit()
    }

    timer = setTimeout(() => finish(true), limitMs)
    // 실패한 저장도 끝난 것이다
    Promise.resolve(settled()).then(() => finish(false), () => finish(false))
  }
}

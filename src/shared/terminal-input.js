// 앱 안의 터미널에 치거나 붙여 넣은 글을 main(terminal.js)은 한 번에 MAX_WRITE 단위(string.length)까지만 pty에 쓴다:
// 화면이 보내는 값의 상한이다. 그보다 긴 것(큰 붙여넣기: xterm.js는 붙여 넣은 글을 통째로 한 번에 넘긴다)은 화면
// (terminal-panel.vue)이 보내지 않고 그렇다고 알린다. 예전에는 main이 말없이 버렸다 (#220).
// 나눠 보내지 않는 까닭: Windows에서 Git의 ssh는 붙여 넣은 글을 1초에 수백 자씩 읽고, 읽는 동안 연결을 돌보지 않는다
// (16 000자에 48초, 150 000자는 7분이 지나도 하나도 닿지 않았고, 그 사이 서버가 연결을 끊었다. LOOP_LOG #220).
export const MAX_WRITE = 64 * 1024

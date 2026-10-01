// 앱 안의 터미널에서 "로그인했다"를 알리는 보이지 않는 표시 (OSC 7701 ; connected).
// main(ssh.js)이 ssh의 LocalCommand로 출력하게 하고, 화면(터미널 패널)이 xterm에서 받아 경로를 "연결됨"으로 바꾼다.
export const CONNECTED_OSC = 7701
export const CONNECTED_DATA = 'connected'

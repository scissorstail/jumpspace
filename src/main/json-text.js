// 파일 맨 앞의 BOM(byte order mark, U+FEFF)
const BOM = String.fromCharCode(0xfeff)

// 파일에서 읽은 JSON 글을 읽는다. 맨 앞의 BOM은 건너뛴다: JSON.parse는 그것을 틀린 글자로 보는데, Windows의
// PowerShell 5.1(Set-Content -Encoding UTF8, Out-File)과 메모장의 "UTF-8 (BOM)"이 그렇게 쓴다. 손으로 고친 projects.json은
// 앱이 열지 못했고, 그런 config.json은 빈 것으로 읽혀서 설정과 창의 자리가 말없이 기본값으로 돌아갔다 (#230).
export function parseJson(text) {
  const value = String(text)
  return JSON.parse(value.startsWith(BOM) ? value.slice(1) : value)
}

import { readFile } from 'node:fs/promises'

// 파일 맨 앞의 BOM(byte order mark, U+FEFF)
const BOM = String.fromCharCode(0xfeff)

// 파일에서 읽은 JSON 글을 읽는다. 맨 앞의 BOM은 건너뛴다: JSON.parse는 그것을 틀린 글자로 보는데, Windows의
// PowerShell 5.1(Set-Content -Encoding UTF8, Out-File -Encoding UTF8)과 메모장의 "UTF-8 (BOM)"이 그렇게 쓴다. 손으로 고친
// projects.json은 앱이 열지 못했고, 그런 config.json은 빈 것으로 읽혀서 설정과 창의 자리가 말없이 기본값으로 돌아갔다 (#230).
export function parseJson(text) {
  const value = String(text)
  return JSON.parse(value.startsWith(BOM) ? value.slice(1) : value)
}

// 파일의 바이트를 글로 바꾼다. UTF-8이 기본이고, 맨 앞의 BOM으로 UTF-16을 알아본다: PowerShell 5.1의 >와 Out-File은
// 따로 정하지 않으면 UTF-16 LE로 쓰고, 메모장의 "UTF-16 LE/BE"도 그렇다. UTF-8로 읽으면 BOM은 깨진 글자, 나머지는
// 글자마다 NUL이 끼어서 "not valid JSON"이었다 (#239). 글로 바꾼 뒤에는 그 정보가 없으므로 바이트에서 정한다.
export function decodeText(bytes) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe
    ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}

// 데이터 파일(projects.json, import 파일)을 글로 읽는다. config.json은 electron-store가 UTF-8로 읽어서 여기를 지나지 않는다.
export async function readText(path) {
  return decodeText(await readFile(path))
}

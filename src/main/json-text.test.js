import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeText, parseJson, readText } from './json-text.js'
import { parseItems } from './storage.js'

// 파일 맨 앞의 byte order mark (U+FEFF)
const BOM = String.fromCharCode(0xfeff)
const items = [{ name: '서버 Ü', data: { id: 'x', nodes: {} } }]
const json = JSON.stringify(items)

const utf16le = text => Buffer.from(BOM + text, 'utf16le')
const utf16be = text => utf16le(text).swap16()

describe('decodeText', () => {
  it('reads UTF-8, with or without a byte order mark', () => {
    expect(decodeText(Buffer.from(json))).toBe(json)
    expect(parseJson(decodeText(Buffer.from(BOM + json)))).toEqual(items)
  })

  // PowerShell 5.1의 >와 Out-File (따로 정하지 않으면), 메모장의 "UTF-16 LE" / "UTF-16 BE"
  it('reads UTF-16 by its byte order mark', () => {
    expect(parseJson(decodeText(utf16le(json)))).toEqual(items)
    expect(parseJson(decodeText(utf16be(json)))).toEqual(items)
  })

  it('reads anything else as UTF-8', () => {
    expect(decodeText(Buffer.alloc(0))).toBe('')
    // 한 바이트뿐인 0xff나 0xfe는 BOM이 아니다
    expect(decodeText(Buffer.from([0xff]))).toBe(String.fromCharCode(0xfffd))
    expect(decodeText(Buffer.from([0xff, 0x5b]))).toBe(String.fromCharCode(0xfffd) + '[')
    expect(decodeText(Buffer.from([0xfe, 0x5b]))).toBe(String.fromCharCode(0xfffd) + '[')
    expect(decodeText(Buffer.from([0xfe, 0xfe, 0x5b]))).toBe(String.fromCharCode(0xfffd, 0xfffd) + '[')
  })
})

describe('readText', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jumpspace-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  // import가 이렇게 읽는다 (index.js의 projects:import)
  it('gives an export file in UTF-16 to the import as text', async () => {
    const path = join(dir, 'export.json')

    await writeFile(path, utf16le(json))
    expect(parseItems(await readText(path))).toEqual(items)

    await writeFile(path, utf16be(json))
    expect(parseItems(await readText(path))).toEqual(items)

    await writeFile(path, json)
    expect(parseItems(await readText(path))).toEqual(items)
  })

  it('fails like a read of the file when it cannot be read', async () => {
    await expect(readText(join(dir, 'missing.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

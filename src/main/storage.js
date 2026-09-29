import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FILE_VERSION = 1

// 저장 파일/import 파일에서 읽은 내용을 [{ name, data }] 형태로 정리한다.
export function normalizeItems(value) {
  const items = Array.isArray(value) ? value : value?.items
  if (!Array.isArray(items)) {
    throw new Error('Invalid project data.')
  }

  return items.map(x => {
    if (!x || typeof x !== 'object' || typeof x.data !== 'object' || x.data === null) {
      throw new Error('Invalid project item.')
    }
    return { name: typeof x.name === 'string' ? x.name : '', data: x.data }
  })
}

export function createProjectStorage(dir) {
  const file = join(dir, 'projects.json')
  const backup = join(dir, 'projects.json.bak')

  async function readItems(path) {
    return normalizeItems(JSON.parse(await readFile(path, 'utf-8')))
  }

  return {
    file,
    backup,
    // 저장된 project(JSON 문자열)를 반환한다. 저장된 것이 없으면 null.
    async load() {
      for (const path of [file, backup]) {
        try {
          return JSON.stringify(await readItems(path))
        } catch (e) {
          if (e.code !== 'ENOENT') console.error(`Failed to read ${path}:`, e)
        }
      }
      return null
    },
    // 저장 도중 문제가 생겨도 이전 내용이 남도록 임시 파일에 쓴 뒤 교체하고, 직전 내용은 .bak로 남긴다.
    async save(json) {
      const items = normalizeItems(JSON.parse(json))
      const tmp = `${file}.tmp`

      await writeFile(tmp, JSON.stringify({ version: FILE_VERSION, items }), 'utf-8')
      try {
        await copyFile(file, backup)
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
      }
      await rename(tmp, file)
    }
  }
}

import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FILE_VERSION = 1

// 이전 버전은 계산해서 얻는 값(앞선 노드들의 접속 정보)을 node.data에 그대로 저장했다.
// 앞 노드의 비밀번호까지 중복으로 남기 때문에 저장하지 않고, 이미 저장된 데이터에서도 제거한다.
function stripDerivedData(data) {
  const nodes = Object.fromEntries(Object.entries(data.nodes || {}).map(([id, node]) => {
    if (!node || typeof node !== 'object' || !node.data || typeof node.data !== 'object') {
      return [id, node]
    }
    const { prevNodeDataList, ...rest } = node.data
    return [id, { ...node, data: rest }]
  }))

  return { ...data, nodes }
}

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
    return { name: typeof x.name === 'string' ? x.name : '', data: stripDerivedData(x.data) }
  })
}

// import 파일에서 읽은 문자열을 [{ name, data }]로 바꾼다. 형식이 맞지 않으면 화면에 그대로 보여줄 수 있는 메시지로 실패한다.
export function parseItems(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }

  try {
    return normalizeItems(value)
  } catch {
    throw new Error('The file does not look like a jumpspace export.')
  }
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

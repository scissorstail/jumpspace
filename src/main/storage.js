import { copyFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseJson, readText } from './json-text.js'
import { migrateLegacyForwards } from './legacy-forwards.js'
import { sanitizeView } from '../shared/view.js'

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
    // 캔버스의 마지막 위치와 확대 상태. 쓸 수 없는 값이면 버린다.
    const view = sanitizeView(x.view)
    return { name: typeof x.name === 'string' ? x.name : '', data: migrateLegacyForwards(stripDerivedData(x.data)), ...(view && { view }) }
  })
}

// 화면이 저장하거나 내보내라고 넘긴 것(JSON 문자열)을 [{ name, data }]로 바꾼다. 문자열만 받는다: JSON.parse는 받은 것을 글자로
// 바꿔서 읽으므로, 글자 하나가 든 배열(['[]'])도 빈 목록으로 읽혀서 저장 파일이 빈 목록으로 바뀌었다.
export function itemsFromJson(json) {
  if (typeof json !== 'string') {
    throw new Error('Invalid project data.')
  }
  return normalizeItems(JSON.parse(json))
}

// import 파일에서 읽은 문자열을 [{ name, data }]로 바꾼다. 형식이 맞지 않으면 화면에 그대로 보여줄 수 있는 메시지로 실패한다.
export function parseItems(text) {
  let value
  try {
    value = parseJson(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }

  try {
    return normalizeItems(value)
  } catch {
    throw new Error('The file does not look like a jumpspace export.')
  }
}

// Windows는 다른 곳에서 열어 둔 파일 위로는 rename하지 못한다 (EPERM, EBUSY, EACCES). 백신이나 색인 프로그램, 또는 그 파일을
// 막 읽는 다른 코드가 잠깐 열어 둔 동안이 그렇다. 곧 풀리므로 조금씩 더 기다리며 다시 한다 (모두 합쳐 1.5초쯤).
const RENAME_RETRY_MS = [20, 50, 100, 200, 400, 800]
const BUSY = ['EPERM', 'EBUSY', 'EACCES']

// 저장 파일을 읽지 못한 까닭을 화면과 콘솔에 보일 말로. JSON.parse의 문구는 옮기지 않는다: 틀린 곳 둘레의 글자 몇 개가 들어 있을 수 있고,
// 이 파일에는 비밀번호가 평문으로 있다.
function unreadableReason(e) {
  if (e.code === 'ENOENT') return 'is missing'
  if (e instanceof SyntaxError) return 'is not valid JSON'
  if (e.code) return 'could not be opened (' + e.code + ')'
  return 'does not hold a list of diagrams'
}

// renameFile, wait: 테스트가 실패하는 rename과 기다리지 않는 기다림을 끼워 넣는다
export function createProjectStorage(dir, { renameFile = rename, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const file = join(dir, 'projects.json')
  const backup = join(dir, 'projects.json.bak')

  async function readItems(path) {
    return normalizeItems(parseJson(await readText(path)))
  }

  // 저장 도중 문제가 생겨도 이전 내용이 남도록 임시 파일에 쓴 뒤 교체하고, 직전 내용은 .bak로 남긴다.
  async function writeItems(items) {
    const tmp = `${file}.tmp`

    await writeFile(tmp, JSON.stringify({ version: FILE_VERSION, items }), 'utf-8')
    try {
      await copyFile(file, backup)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }

    for (let attempt = 0; ; attempt++) {
      try {
        return await renameFile(tmp, file)
      } catch (e) {
        if (!BUSY.includes(e.code) || attempt >= RENAME_RETRY_MS.length) throw e
        await wait(RENAME_RETRY_MS[attempt])
      }
    }
  }

  // 앞선 저장이 끝난 뒤에 다음 저장을 시작하게 하는 줄. 실패한 저장도 줄에서는 끝난 것으로 친다.
  let queue = Promise.resolve()
  // 아직 끝나지 않은 저장의 수 (줄에 선 것과 쓰고 있는 것)
  let pending = 0

  return {
    file,
    backup,
    // 저장된 project(JSON 문자열)를 반환한다. 저장된 것이 없으면(두 파일이 다 없으면) null.
    // 파일이 있는데 읽을 수 없고 백업으로도 열지 못하면 던진다. 전에는 그때도 null이었다: 화면은 빈 목록으로 시작했고, 그 뒤의 저장이
    // 읽지 못한 파일과 그 백업을 차례로 덮어썼다 (다이어그램 하나를 만들면 저장이 두 번이라 둘 다 사라졌다).
    // 던지면 화면이 알리고 저장을 막는다 (Layout.vue의 isProjectLoadFailed). 파일은 손대지 않는다: 고칠 수 있는 것은 사람뿐이다.
    async load() {
      const unread = []
      for (const path of [file, backup]) {
        try {
          return JSON.stringify(await readItems(path))
        } catch (e) {
          const isMissing = e.code === 'ENOENT'
          const reason = unreadableReason(e)
          if (!isMissing) console.error(`Failed to read ${path}: ${reason}`)
          unread.push({ isMissing, text: `${basename(path)} ${reason}.` })
        }
      }
      if (unread.every(x => x.isMissing)) return null

      throw new Error([
        ...unread.map(x => x.text),
        'Nothing was changed. Repair or remove what cannot be read, then start the app again. The folder:',
        dir
      ].join('\n'))
    },
    // 저장은 한 번에 하나씩, 부른 순서대로 한다. 화면은 여러 곳에서 저장을 부르고(잠글 때, 목록을 고칠 때, 캔버스를 옮긴 뒤)
    // 그것들이 겹치면 같은 임시 파일을 함께 썼다: 먼저 끝난 쪽이 그 파일을 가져가서 나중 쪽의 rename이
    // "ENOENT ... projects.json.tmp -> projects.json"으로 실패했고, 끝난 순서에 따라 더 오래된 내용이 남을 수도 있었다.
    async save(json) {
      // 쓸 수 없는 내용은 줄을 서기 전에 거절한다
      const items = itemsFromJson(json)
      pending += 1
      const result = queue.then(() => writeItems(items)).finally(() => { pending -= 1 })

      queue = result.catch(() => {})
      return result
    },
    // 끝나지 않은 저장이 있는가. 앱을 끝내기 전에 main이 본다 (quit-hold.js): 쓰는 도중에 프로세스가 끝나면 그 저장은
    // 임시 파일로만 남는다.
    isSaving: () => pending > 0,
    // 지금까지 부른 저장이 모두 끝나면 풀린다. 실패한 저장도 끝난 것이라서 거절되지 않는다.
    settled: () => queue
  }
}

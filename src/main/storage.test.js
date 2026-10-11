import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStorage, normalizeItems, parseItems } from './storage.js'

const items = [{ name: 'a', data: { id: 'test@0.1.0', nodes: {} } }]

describe('storage', () => {
  let dir
  let storage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jumpspace-test-'))
    storage = createProjectStorage(dir)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when nothing is saved', async () => {
    expect(await storage.load()).toBeNull()
  })

  it('round-trips and keeps the previous content as a backup', async () => {
    await storage.save(JSON.stringify(items))
    await storage.save(JSON.stringify([...items, { name: 'b', data: { nodes: {} } }]))

    expect(JSON.parse(await storage.load())).toHaveLength(2)
    expect(JSON.parse(await readFile(storage.backup, 'utf-8')).items).toHaveLength(1)
  })

  it('falls back to the backup when the main file is broken', async () => {
    await storage.save(JSON.stringify(items))
    await storage.save(JSON.stringify(items))
    await writeFile(storage.file, '{broken')

    expect(JSON.parse(await storage.load())).toEqual(items)
  })

  // 화면은 여러 곳에서 저장을 부른다 (잠글 때, 목록을 고칠 때, 캔버스를 옮긴 뒤). 둘이 겹치면 같은 임시 파일을 쓰고,
  // 먼저 끝난 쪽이 그 파일을 가져가서 나중 쪽이 "ENOENT ... rename projects.json.tmp -> projects.json"으로 실패했다.
  it('lets saves overlap: every one succeeds and the last one asked for is what stays', async () => {
    const versions = Array.from({ length: 8 }, (_, i) => JSON.stringify([{ name: `v${i}`, data: { nodes: {} } }]))

    await Promise.all(versions.map(json => storage.save(json)))

    expect(JSON.parse(await storage.load())[0].name).toBe('v7')
    expect(JSON.parse(await readFile(storage.backup, 'utf-8')).items[0].name).toBe('v6')
    expect((await readdir(dir)).sort()).toEqual(['projects.json', 'projects.json.bak'])
  })

  it('writes one save after the other, in the order they were asked for', async () => {
    const order = []
    const saves = ['a', 'b', 'c'].map(name => storage.save(JSON.stringify([{ name, data: { nodes: {} } }])).then(async () => {
      order.push(`${name}:${JSON.parse(await readFile(storage.file, 'utf-8')).items[0].name}`)
    }))

    await Promise.all(saves)

    // 저장이 끝난 순간 파일에는 그 저장의 내용이 있다: 다른 저장이 끼어들지 않았다
    expect(order).toEqual(['a:a', 'b:b', 'c:c'])
  })

  it('goes on saving after a save that failed', async () => {
    await rm(dir, { recursive: true, force: true })
    await expect(storage.save(JSON.stringify(items))).rejects.toMatchObject({ code: 'ENOENT' })

    await mkdir(dir)
    await storage.save(JSON.stringify(items))

    expect(JSON.parse(await storage.load())).toEqual(items)
  })

  // Windows는 다른 곳에서 열어 둔 파일 위로 rename하지 못한다 (백신, 색인, 그 파일을 막 읽는 코드). 위의 테스트가 저장 직후에
  // 파일을 읽는 동안 다음 저장의 rename이 EPERM으로 실패한 적이 있다. 곧 풀리므로 다시 한다.
  describe('when the file is held open elsewhere for a moment', () => {
    const busy = code => Object.assign(new Error(`${code}: operation not permitted, rename`), { code })
    // times번 실패한 뒤에 진짜 rename을 한다
    const flaky = (times, code = 'EPERM') => {
      const calls = []
      const waits = []
      const renameFile = async (from, to) => {
        calls.push(code)
        if (calls.length <= times) throw busy(code)
        return rename(from, to)
      }

      return { calls, waits, storage: createProjectStorage(dir, { renameFile, wait: async ms => { waits.push(ms) } }) }
    }

    it.each(['EPERM', 'EBUSY', 'EACCES'])('tries the rename again after %s and saves', async code => {
      const { calls, waits, storage: held } = flaky(3, code)

      await held.save(JSON.stringify(items))

      expect(calls).toHaveLength(4)
      expect(waits).toEqual([20, 50, 100])
      expect(JSON.parse(await held.load())).toEqual(items)
      expect(await readdir(dir)).toEqual(['projects.json'])
    })

    it('waits longer each time and gives up with the error after the last wait', async () => {
      const { calls, waits, storage: held } = flaky(Infinity)

      await expect(held.save(JSON.stringify(items))).rejects.toMatchObject({ code: 'EPERM' })

      expect(waits).toEqual([20, 50, 100, 200, 400, 800])
      expect(calls).toHaveLength(7)
      expect([...waits].sort((a, b) => a - b)).toEqual(waits)
    })

    it('does not try again after another kind of error', async () => {
      const { calls, waits, storage: held } = flaky(Infinity, 'ENOSPC')

      await expect(held.save(JSON.stringify(items))).rejects.toMatchObject({ code: 'ENOSPC' })

      expect(calls).toHaveLength(1)
      expect(waits).toEqual([])
    })

    it('keeps the saves in their order while one of them waits', async () => {
      const { storage: held } = flaky(2)

      await Promise.all(['a', 'b', 'c'].map(name => held.save(JSON.stringify([{ name, data: { nodes: {} } }]))))

      expect(JSON.parse(await held.load())[0].name).toBe('c')
      expect(JSON.parse(await readFile(held.backup, 'utf-8')).items[0].name).toBe('b')
    })
  })

  it('rejects invalid data in a row of saves without holding up the others', async () => {
    const results = await Promise.allSettled([storage.save(JSON.stringify(items)), storage.save('{"a":1}'), storage.save(JSON.stringify([...items, ...items]))])

    expect(results.map(x => x.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(JSON.parse(await storage.load())).toHaveLength(2)
  })

  it('rejects invalid data without touching the saved file', async () => {
    await storage.save(JSON.stringify(items))

    await expect(storage.save('{"a":1}')).rejects.toThrow()
    await expect(storage.save(JSON.stringify([{ name: 'x' }]))).rejects.toThrow()
    expect(JSON.parse(await storage.load())).toEqual(items)
  })
})

describe('normalizeItems', () => {
  it('accepts both the legacy array and the versioned object', () => {
    expect(normalizeItems(items)).toEqual(items)
    expect(normalizeItems({ version: 1, items })).toEqual(items)
  })

  it('removes derived prevNodeDataList (older versions stored copies of previous nodes, including passwords)', () => {
    const data = {
      id: 'test@0.1.0',
      nodes: {
        1: { id: 1, data: { connection: { name: 'a', password: 'pw' } } },
        2: { id: 2, data: { connection: { name: 'b' }, prevNodeDataList: [{ name: 'a', password: 'pw' }] } }
      }
    }
    const [item] = normalizeItems([{ name: 'x', data }])

    expect(JSON.stringify(item)).not.toContain('prevNodeDataList')
    expect(item.data.nodes[2].data.connection).toEqual({ name: 'b' })
    expect(JSON.stringify(item).match(/"pw"/g)).toHaveLength(1)
    // 원본은 바꾸지 않는다
    expect(data.nodes[2].data.prevNodeDataList).toBeDefined()
  })

  it('keeps items that have no nodes or odd node shapes', () => {
    expect(normalizeItems([{ name: 'x', data: { id: 'a' } }])[0].data).toEqual({ id: 'a', nodes: {} })
    expect(normalizeItems([{ name: 'x', data: { nodes: { 1: null, 2: { id: 2 } } } }])[0].data.nodes).toEqual({ 1: null, 2: { id: 2 } })
  })

  it('drops unknown fields', () => {
    expect(normalizeItems([{ name: 'a', data: {}, evil: 1 }])).toEqual([{ name: 'a', data: { nodes: {} } }])
  })
})

describe('parseItems', () => {
  it('reads an export file', () => {
    const items = [{ name: 'a', data: { id: 'x', nodes: {} } }]

    expect(parseItems(JSON.stringify(items))).toEqual(items)
    expect(parseItems(JSON.stringify({ version: 1, items }))).toEqual(items)
  })

  it('explains what is wrong with a file that cannot be imported', () => {
    expect(() => parseItems('{ not json')).toThrow('The file is not valid JSON.')
    expect(() => parseItems('')).toThrow('The file is not valid JSON.')
    expect(() => parseItems('{"a":1}')).toThrow('The file does not look like a jumpspace export.')
    expect(() => parseItems('[{"name":"x"}]')).toThrow('The file does not look like a jumpspace export.')
    expect(() => parseItems('null')).toThrow('The file does not look like a jumpspace export.')
  })
})

describe('normalizeItems: canvas view', () => {
  const item = view => ({ name: 'a', data: { nodes: {} }, view })

  it('keeps a valid view of the canvas', () => {
    expect(normalizeItems([item({ k: 0.5, x: -10, y: 20 })])[0].view).toEqual({ k: 0.5, x: -10, y: 20 })
  })

  it('drops a view that cannot be used, and adds none when it is missing', () => {
    for (const view of [undefined, null, 'x', {}, { k: 9, x: 0, y: 0 }, { k: 1, x: 'a', y: 0 }, { k: 1, x: NaN, y: 0 }]) {
      expect(normalizeItems([item(view)])[0]).toEqual({ name: 'a', data: { nodes: {} } })
    }
  })

  it('keeps the size of the canvas area that belongs to the view', () => {
    expect(normalizeItems([item({ k: 0.5, x: -10, y: 20, w: 1010, h: 505 })])[0].view).toEqual({ k: 0.5, x: -10, y: 20, w: 1010, h: 505 })
    expect(normalizeItems([item({ k: 0.5, x: -10, y: 20, w: 'x', h: 505 })])[0].view).toEqual({ k: 0.5, x: -10, y: 20 })
  })

  it('does not keep extra keys of the view', () => {
    expect(normalizeItems([item({ k: 1, x: 0, y: 0, evil: 1 })])[0].view).toEqual({ k: 1, x: 0, y: 0 })
  })
})

describe('normalizeItems: old forwards', () => {
  it('moves the forwards saved by an older version so they mean the same as before', () => {
    const conn = (name, extra = {}) => ({ name, user: 'u', host: `${name}.example`, port: '22', forwards: [], ...extra })
    const nodes = {
      1: { id: 1, data: { connection: conn('bastion') }, inputs: { input1: { connections: [] } } },
      2: { id: 2, data: { connection: conn('app', { forwards: [{ checked: true, from: '8080', to: '80' }] }) }, inputs: { input1: { connections: [{ node: 1 }] } } }
    }

    const [item] = normalizeItems([{ name: 'x', data: { nodes } }])

    expect(item.data.nodes[2].data.connection.forwards).toEqual([])
    expect(item.data.nodes[1].data.connection.forwards).toEqual([{ checked: true, from: '8080', to: '80', host: 'app.example' }])
  })
})

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

  it('does not keep extra keys of the view', () => {
    expect(normalizeItems([item({ k: 1, x: 0, y: 0, evil: 1 })])[0].view).toEqual({ k: 1, x: 0, y: 0 })
  })
})

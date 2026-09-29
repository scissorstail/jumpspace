import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStorage, normalizeItems } from './storage.js'

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

  it('drops unknown fields', () => {
    expect(normalizeItems([{ name: 'a', data: {}, evil: 1 }])).toEqual([{ name: 'a', data: {} }])
  })
})

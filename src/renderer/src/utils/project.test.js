import { describe, expect, it, vi } from 'vitest'
import { hasSavedPassword, listEmptyText, loadProjectData, matchesKeyword } from './project'

const item = connection => ({ name: 'a', data: { nodes: { 1: { data: { connection } } } } })

describe('hasSavedPassword', () => {
  it('detects saved passwords', () => {
    expect(hasSavedPassword([item({ password: 'x' })])).toBe(true)
    expect(hasSavedPassword([item({ password: '' }), item({ password: 'x' })])).toBe(true)
  })

  it('ignores items without passwords or with odd shapes', () => {
    expect(hasSavedPassword([])).toBe(false)
    expect(hasSavedPassword([item({ password: '' }), item({}), { name: 'b', data: {} }, null])).toBe(false)
  })
})

describe('matchesKeyword', () => {
  it('ignores case and surrounding spaces', () => {
    expect(matchesKeyword('Production DB', 'production')).toBe(true)
    expect(matchesKeyword('production db', 'PROD')).toBe(true)
    expect(matchesKeyword('Production DB', '  db ')).toBe(true)
  })

  it('matches everything for an empty search, even unnamed items', () => {
    expect(matchesKeyword('', '')).toBe(true)
    expect(matchesKeyword('abc', '   ')).toBe(true)
    expect(matchesKeyword('abc', undefined)).toBe(true)
    expect(matchesKeyword(undefined, null)).toBe(true)
  })

  it('does not match other names, and takes the search literally', () => {
    expect(matchesKeyword('staging', 'prod')).toBe(false)
    expect(matchesKeyword('', 'prod')).toBe(false)
    expect(matchesKeyword('axb', 'a.b')).toBe(false)
    expect(matchesKeyword('a.b', 'a.b')).toBe(true)
  })

  it('works with Korean names', () => {
    expect(matchesKeyword('운영 서버', '서버')).toBe(true)
    expect(matchesKeyword('운영 서버', '개발')).toBe(false)
  })
})

describe('listEmptyText', () => {
  const items = [{ name: 'Production' }, { name: 'Staging' }]

  it('is null while at least one item is visible', () => {
    expect(listEmptyText(items, '')).toBe(null)
    expect(listEmptyText(items, 'stag')).toBe(null)
  })

  it('invites to add an item when the list is empty', () => {
    expect(listEmptyText([], '')).toBe('No items yet. Add one with +.')
    expect(listEmptyText(undefined, 'x')).toBe('No items yet. Add one with +.')
  })

  it('says that the search found nothing', () => {
    expect(listEmptyText(items, '  zzz ')).toBe('No item matches "zzz".')
  })

  it('counts an item being renamed as visible', () => {
    expect(listEmptyText([{ name: '', isEditing: true }], 'zzz')).toBe(null)
  })
})

describe('loadProjectData', () => {
  const items = [{ name: 'a', data: { nodes: {} } }]
  const json = JSON.stringify(items)

  it('reads the saved items', async () => {
    const save = vi.fn()
    expect(await loadProjectData({ load: async () => json, save, legacy: '[{"name":"old"}]' })).toEqual({ items, failed: false })
    expect(save).not.toHaveBeenCalled()
  })

  it('moves the items of an older version from localStorage once, when there is no file yet', async () => {
    const save = vi.fn(async () => {})
    expect(await loadProjectData({ load: async () => null, save, legacy: json })).toEqual({ items, failed: false })
    expect(save).toHaveBeenCalledWith(json)
  })

  it('starts with an empty list when there is nothing at all', async () => {
    expect(await loadProjectData({ load: async () => null, save: vi.fn(), legacy: undefined })).toEqual({ items: [], failed: false })
  })

  it('reports a failure, so that saving is blocked, when reading, migrating or parsing fails', async () => {
    const readError = new Error('EACCES')
    expect(await loadProjectData({ load: async () => { throw readError }, save: vi.fn() })).toEqual({ items: [], failed: true, error: readError })

    const saveError = new Error('disk full')
    expect(await loadProjectData({ load: async () => null, save: async () => { throw saveError }, legacy: json })).toMatchObject({ failed: true, error: saveError })

    // 해석할 수 없는 내용도 실패다. (예전에는 이 오류가 저장 막기를 건너뛰어 다음 저장이 파일을 빈 목록으로 덮어쓸 수 있었다)
    expect(await loadProjectData({ load: async () => '{broken', save: vi.fn() })).toMatchObject({ items: [], failed: true })
  })
})

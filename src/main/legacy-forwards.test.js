import { describe, expect, it } from 'vitest'
import { migrateLegacyForwards } from './legacy-forwards.js'

const conn = (name, extra = {}) => ({ name, user: 'u', host: `${name}.example`, port: '22', forwards: [], ...extra })
const node = (id, connection, prevId) => ({
  id,
  data: { connection },
  inputs: { input1: { connections: prevId ? [{ node: prevId, output: 'output1' }] : [] } }
})
const data = (...nodes) => ({ nodes: Object.fromEntries(nodes.map(n => [n.id, n])) })
const forwardsOf = (result, id) => result.nodes[id].data.connection.forwards

describe('migrateLegacyForwards', () => {
  it('moves old entries of a node with user, host and port to the previous node, aimed at this node', () => {
    const result = migrateLegacyForwards(data(
      node(1, conn('bastion')),
      node(2, conn('app', { forwards: [{ checked: true, from: '8080', to: '80' }, { checked: false, from: '9000', to: '90' }] }), 1)
    ))

    expect(forwardsOf(result, 2)).toEqual([])
    expect(forwardsOf(result, 1)).toEqual([
      { checked: true, from: '8080', to: '80', host: 'app.example' },
      { checked: false, from: '9000', to: '90', host: 'app.example' }
    ])
  })

  it('keeps entries that already have a host, and adds none twice', () => {
    const first = migrateLegacyForwards(data(
      node(1, conn('bastion')),
      node(2, conn('app', { forwards: [{ checked: true, from: '1', to: '2', host: '' }, { checked: true, from: '3', to: '4' }] }), 1)
    ))

    expect(forwardsOf(first, 2)).toEqual([{ checked: true, from: '1', to: '2', host: '' }])
    expect(migrateLegacyForwards(first)).toEqual(first)
  })

  it('leaves the entries of a target node (no port) where they are, with an explicit empty host', () => {
    const result = migrateLegacyForwards(data(
      node(1, conn('bastion')),
      node(2, { name: 'target', host: 'db.internal', port: '', user: '', forwards: [{ checked: true, from: '5432', to: '5432' }] }, 1)
    ))

    expect(forwardsOf(result, 2)).toEqual([{ checked: true, from: '5432', to: '5432', host: null }])
    expect(forwardsOf(result, 1)).toEqual([])
  })

  it('has nowhere to move the entries of a first node: they stay', () => {
    const result = migrateLegacyForwards(data(node(1, conn('solo', { forwards: [{ checked: true, from: '1', to: '2' }] }))))

    expect(forwardsOf(result, 1)).toEqual([{ checked: true, from: '1', to: '2', host: null }])
  })

  it('does not move an entry whose local port is already used by the previous node', () => {
    const result = migrateLegacyForwards(data(
      node(1, conn('bastion', { forwards: [{ checked: true, from: '8080', to: '1', host: 'x' }] })),
      node(2, conn('app', { forwards: [{ checked: true, from: '8080', to: '80' }, { checked: true, from: '8081', to: '81' }] }), 1)
    ))

    expect(forwardsOf(result, 2)).toEqual([{ checked: true, from: '8080', to: '80', host: null }])
    expect(forwardsOf(result, 1).map(x => x.from)).toEqual(['8080', '8081'])
  })

  it('handles a chain: entries of every node move one step up', () => {
    const result = migrateLegacyForwards(data(
      node(1, conn('a')),
      node(2, conn('b', { forwards: [{ checked: true, from: '1', to: '1' }] }), 1),
      node(3, conn('c', { forwards: [{ checked: true, from: '2', to: '2' }] }), 2)
    ))

    expect(forwardsOf(result, 1)).toEqual([{ checked: true, from: '1', to: '1', host: 'b.example' }])
    expect(forwardsOf(result, 2)).toEqual([{ checked: true, from: '2', to: '2', host: 'c.example' }])
    expect(forwardsOf(result, 3)).toEqual([])
  })

  it('does not change its input and copes with odd data', () => {
    const input = data(node(1, conn('a')), node(2, conn('b', { forwards: [{ checked: true, from: '1', to: '1' }] }), 1))
    const copy = structuredClone(input)

    migrateLegacyForwards(input)
    expect(input).toEqual(copy)

    for (const odd of [undefined, null, {}, { nodes: null }, { nodes: { 1: null, 2: { data: null }, 3: { data: { connection: { forwards: 'x' } } } } }]) {
      expect(() => migrateLegacyForwards(odd)).not.toThrow()
    }
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runInThisContext } from 'node:vm'
import { activeForwards, portState } from '../../../../../../utils/forward'

// 노드의 포트포워딩 창. DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내 import만 바꿔서 돌리고
// (computed와 methods를 가짜 this로 부른다), 틀(template)은 글로 읽는다.
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'forward-menu.vue'), 'utf8').replace(/\r\n/g, '\n')
const template = source.slice(0, source.indexOf('</template>\n\n<script>'))
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]

const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (closePopoverOnEscape, activeForwards, portState) {\n${body}\n})`)({}, activeForwards, portState)

// 가짜 this: props와, computed를 값으로 읽는 것, $emit으로 보낸 것의 기록
function menu(props) {
  const emitted = []
  const vm = { value: [], disabled: false, hint: '', plan: { mode: 'forward', defaultHost: 'localhost', reason: '' }, ...props, $refs: {}, $emit: (...args) => emitted.push(args) }
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, emitted }
}

const on = { checked: true, from: 8080, host: null, to: 80 }
const off = { checked: false, from: 9000, host: 'db', to: 5432 }

describe('the port forwarding menu', () => {
  it('runs the script of the component', () => {
    expect(component.name).toBe('ForwardMenu')
    expect(script.match(/^import .*$/gm)).toHaveLength(2)
  })

  it('counts the forwards that are turned on', () => {
    expect(menu({ value: [on, off, on] }).vm.activeCount).toBe(2)
    expect(menu({ value: [] }).vm.activeCount).toBe(0)
  })

  it('can start only with a way to connect and at least one forward turned on', () => {
    expect(menu({ value: [on] }).vm.canStart).toBe(true)
    expect(menu({ value: [off] }).vm.canStart).toBe(false)
    expect(menu({ value: [on], plan: { mode: null, reason: 'Set the host first.' } }).vm.canStart).toBe(false)
  })

  // 누를 수 없는 단추는 왜인지 말한다: 접속할 수 없는 이유가 먼저다
  it('says on the start button what it will do, or why it cannot', () => {
    expect(menu({ value: [on] }).vm.startTitle).toBe('Open 1 tunnel')
    expect(menu({ value: [on, on] }).vm.startTitle).toBe('Open 2 tunnels')
    expect(menu({ value: [off] }).vm.startTitle).toBe('Turn on at least one forward.')
    expect(menu({ value: [off], plan: { mode: null, reason: 'Set the host first.' } }).vm.startTitle).toBe('Set the host first.')
    expect(menu({ value: [on], plan: { mode: null, reason: 'Set the host first.' } }).vm.startTitle).toBe('Set the host first.')
  })

  // 부모(노드의 데이터)의 배열과 그 안의 줄을 고치지 않는다: 늘 새 배열을 돌려준다
  it('changes one row and gives back a new list', () => {
    const value = [on, off]
    const { vm, emitted } = menu({ value })
    vm.change(1, { checked: true })

    expect(emitted).toEqual([['input', [on, { ...off, checked: true }]]])
    expect(emitted[0][1]).not.toBe(value)
    expect(emitted[0][1][0]).toBe(on)
    expect(off.checked).toBe(false)
  })

  it('adds an empty row that is turned off', () => {
    const value = [on]
    const { vm, emitted } = menu({ value })
    vm.add()

    expect(emitted).toEqual([['input', [on, { checked: false, from: null, host: null, to: null }]]])
    expect(value).toHaveLength(1)
  })

  it('removes the row that was asked for', () => {
    const value = [on, off, on]
    const { vm, emitted } = menu({ value })
    vm.remove(1)

    expect(emitted).toEqual([['input', [on, on]]])
    expect(value).toHaveLength(3)
  })

  it('starts the tunnels and closes its window when it is open', () => {
    const closed = []
    const { vm, emitted } = menu({ value: [on] })
    vm.$refs.popover = { isOpen: true, hide: () => closed.push('hide') }
    vm.start()
    expect(emitted).toEqual([['start']])
    expect(closed).toEqual(['hide'])

    // 노드 위의 시작 단추로 눌렀을 때는 창이 닫혀 있다
    const direct = menu({ value: [on] })
    direct.vm.$refs.popover = { isOpen: false, hide: () => closed.push('again') }
    direct.vm.start()
    expect(direct.emitted).toEqual([['start']])
    expect(closed).toEqual(['hide'])
  })

  it('starts nothing when it cannot', () => {
    const { vm, emitted } = menu({ value: [off] })
    vm.start()

    expect(emitted).toEqual([])
  })

  it('wires the rows to those methods and locks them with the editor', () => {
    expect(template).toMatch(/@change="change\(index, \{ checked: \$event \}\)"/)
    expect(template).toMatch(/@update="change\(index, \{ from: \$event \}\)"/)
    expect(template).toMatch(/@update="change\(index, \{ host: \$event \}\)"/)
    expect(template).toMatch(/@update="change\(index, \{ to: \$event \}\)"/)
    expect(template).toMatch(/@click="remove\(index\)"/)
    expect(template).toMatch(/:disabled="disabled"\n\s+@click="add"/)
    expect(template.match(/:disabled="disabled"/g)).toHaveLength(6)
    expect(template).toMatch(/:title="startTitle"\n\s+:disabled="!canStart"\n\s+@click="start"/)
  })

  // 켜 둔 줄의 빈 포트만 틀렸다고 표시한다 (utils/forward의 portState)
  it('marks the ports of a row by its own state', () => {
    expect(template).toMatch(/:state="portState\(forward\.from, forward\.checked\)"/)
    expect(template).toMatch(/:state="portState\(forward\.to, forward\.checked\)"/)
    expect(template).toMatch(/:placeholder="plan\.defaultHost"/)
  })
})

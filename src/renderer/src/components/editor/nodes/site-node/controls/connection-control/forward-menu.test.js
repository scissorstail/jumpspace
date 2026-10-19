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

// 가짜 this: props와, computed를 값으로 읽는 것, $emit으로 보낸 것의 기록, $nextTick으로 미룬 일(ticks, 부르는 것은 테스트)
function menu(props) {
  const emitted = []
  const ticks = []
  const vm = { value: [], disabled: false, hint: '', plan: { mode: 'forward', defaultHost: 'localhost', reason: '' }, ...props, $refs: {}, $emit: (...args) => emitted.push(args), $nextTick: fn => ticks.push(fn) }
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, emitted, ticks }
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

  // 줄 목록이 스크롤되면 끝에 붙은 새 줄은 보이지 않았다 (#280). 부모가 새 줄을 그린 다음에(nextTick) 끝까지 내린다.
  it('scrolls its rows to the end once the row it added is drawn', () => {
    const { vm, emitted, ticks } = menu({ value: [on] })
    vm.add()
    expect(emitted).toHaveLength(1)
    expect(ticks).toHaveLength(1)

    vm.$refs.list = { scrollTop: 0, scrollHeight: 900 }
    ticks[0]()
    expect(vm.$refs.list.scrollTop).toBe(900)
  })

  it('scrolls nothing when there is no list of rows', () => {
    const { vm, ticks } = menu({ value: [] })
    vm.add()
    expect(() => ticks[0]()).not.toThrow()
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

// 노드의 창은 앱 창 안에 머물고(component.vue의 --node-window-max-height), 넘치면 이 창은 줄 목록만 스크롤한다 (#280): 포워드가
// 많으면 창이 앱 창 밖으로 나가서 아래의 줄과 Add, Start에 닿을 수 없었다. 제목, 설명, 단추 줄은 늘 보인다. headless의
// node-window-check가 그 창을 잰다.
describe('the port forwarding window with more forwards than fit', () => {
  const style = source.slice(source.indexOf('<style lang="scss">'))
  // .forward-panel 안의 규칙 하나의 내용 (그 안의 규칙까지), 창 자신의 선언들 (그 안의 첫 규칙 앞까지). 줄마다 \n이 앞에 온다.
  const rule = selector => `\n${style.match(new RegExp(`\\n {2}${selector.replace(/[.+]/g, '\\$&')} \\{\\n([\\s\\S]*?)\\n {2}\\}`))?.[1] ?? ''}`
  const panel = `\n${style.match(/\n\.forward-panel \{\n([\s\S]*?)\n\n/)?.[1] ?? ''}`
  const row = rule('.forward-row')
  const theme = readFileSync(join(here, '../../../../../../assets/theme.scss'), 'utf8').replace(/\r\n/g, '\n')

  it('stays inside the app window and scrolls only its rows', () => {
    expect(panel).toMatch(/\n {2}display: flex;\n {2}flex-direction: column;/)
    expect(panel).toMatch(/\n {2}max-width: 100%;/)
    expect(panel).toMatch(/\n {2}max-height: var\(--node-window-max-height\);/)
    expect(panel).not.toMatch(/overflow/)

    expect(rule('.forward-list')).toMatch(/\n {4}overflow-y: auto;/)
    expect(rule('.forward-list')).toMatch(/^\n {4}min-height: 0;/)
    for (const selector of ['.forward-title', '.forward-hint', '.forward-locked', '.forward-actions']) {
      expect(style).toMatch(new RegExp(`\\n {2}\\${selector} \\{`))
      expect(rule(selector)).not.toMatch(/overflow|max-height/)
    }
  })

  it('draws the list where it scrolls', () => {
    expect(template).toMatch(/v-if="value\.length > 0"\n\s+ref="list"\n\s+class="forward-list"/)
  })

  // 단추와 체크박스의 포커스 테두리(theme.scss: 2px 띄운 2px 선)는 스크롤 영역 밖으로 나가면 잘린다
  it('leaves room around its rows for the focus ring of their buttons and boxes', () => {
    const ring = text => (m => m && Number(m[1]) + Number(m[2]))(text.match(/outline: (\d+)px solid var\(--js-sun\);\n\s+outline-offset: (\d+)px;/))
    const button = ring(theme.slice(theme.indexOf('\n.btn {')))
    const box = ring(theme.slice(theme.indexOf('\n.custom-control-input:focus-visible ~ .custom-control-label::before {')))
    expect(button).toBeGreaterThan(0)
    expect(box).toBe(button)

    const list = rule('.forward-list')
    expect(list).toContain(`\n    margin: 0 -${button}px -${button}px;`)
    expect(list).toContain(`\n    padding: 0 ${button}px ${button}px;`)
    expect(list).toContain(`\n    scroll-padding: ${button}px 0;`)
  })

  // 스크롤 영역 밖으로는 여백이 겹치지 않는다: 줄의 여백(6px)과 다음 것의 여백 중 큰 쪽이던 간격을 그대로 둔다
  it('keeps the gaps after its last row as they were', () => {
    const gap = Number(row.match(/\n {4}margin-bottom: (\d+)px;/)?.[1])
    expect(gap).toBe(6)
    expect(row).toMatch(/\n {4}&:last-child \{\n {6}margin-bottom: 0;\n {4}\}/)
    expect(rule('.forward-list + .forward-locked')).toBe(`\n    margin-top: ${gap}px;`)
    expect(rule('.forward-locked')).toMatch(/\n {4}margin-top: 0\.25rem;/)
    // Add와 Start의 줄은 제 여백(0.5rem, 8px)이 더 컸다
    expect(rule('.forward-actions')).toMatch(/\n {4}margin-top: 0\.5rem;/)
  })
})

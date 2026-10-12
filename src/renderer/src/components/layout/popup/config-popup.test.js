import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 캔버스 메뉴의 "From SSH config"가 어떻게 이어져 있는지를 소스에서 읽는다 (DOM 없이 도는 테스트라서).
// 글을 읽는 일은 src/shared/ssh-config-parse.js, 노드와 연결로 바꾸는 일은 utils/config-import.js가 하고 따로 테스트한다.
const here = dirname(fileURLToPath(import.meta.url))
const read = (...path) => readFileSync(join(here, ...path), 'utf8').replace(/\r\n/g, '\n')
const popup = read('config-popup.vue')
const editor = read('..', '..', 'editor', 'index.vue')
const layout = read('..', '..', '..', 'views', 'Layout.vue')
const menuStyle = read('..', '..', 'editor', 'context-menu.scss')

// 메서드 하나의 본문
const methodOf = (source, name) => source.match(new RegExp(`\\n    (?:async )?${name}\\([^)]*\\) \\{\\n([\\s\\S]*?)\\n    \\}`))?.[1] ?? ''

describe('From SSH config: the menu item', () => {
  it('is an item of the canvas menu and tells the layout where it was pressed', () => {
    const items = editor.match(/\n {6}items: \{\n([\s\S]*?)\n {6}\},/)?.[1] ?? ''

    expect(items).toContain("'From SSH config': () => {")
    expect(items).toContain('this.editor.view.area.mouse')
    expect(items).toContain("this.$emit('ssh-config', [x, y])")
  })

  // 메뉴는 잠금을 푼 동안에만 열린다: 잠긴 다이어그램에는 이 길이 없다.
  it('cannot be reached while the diagram is locked, because no menu opens then', () => {
    expect(editor).toMatch(/this\.editor\.on\('showcontextmenu', \(\) => \{\n\s+if \(this\.isLocked\) \{\n\s+this\.showLockedHint\(\)\n\s+return false/)
  })

  // 플러그인은 메뉴의 너비를 120px로 정해 둔다: 긴 항목이 두 줄이 된다.
  it('stays on one line', () => {
    expect(menuStyle).toMatch(/#rete & \{\n\s+width: max-content;/)
  })

  it('has its own icon, after the one of Add node', () => {
    expect(menuStyle).toMatch(/div\.search \+ div\.item \+ div\.item::before \{\n\s+-webkit-mask-image: \$icon-file-text;\n\s+mask-image: \$icon-file-text;/)
  })
})

describe('From SSH config: the dialog', () => {
  it('is opened by the layout when the editor asks, and hands the plan back to the editor', () => {
    expect(layout).toContain('@ssh-config="openConfigPopup"')
    expect(layout).toMatch(/<ConfigPopup\n\s+:show\.sync="isShowConfigPopup"\n\s+@create="addFromConfig"\n\s+\/>/)
    expect(methodOf(layout, 'openConfigPopup')).toContain('this.configPoint = point')
    expect(methodOf(layout, 'addFromConfig')).toContain('this.$refs.editorRef.addFromConfig(plan, this.configPoint)')
  })

  it('makes nothing in a locked diagram or without a diagram', () => {
    expect(methodOf(layout, 'addFromConfig')).toMatch(/^\s+if \(this\.isEditorLocked \|\| !this\.editorData\) return\n/)
  })

  it('shows what the pasted text gives before anything is made', () => {
    expect(popup).toContain('return importPlan(parseSshConfig(this.text))')
    expect(popup).toContain('v-for="row in plan.rows"')
    expect(popup).toContain('v-for="note in plan.notes"')
  })

  it('creates only when the text gives a node', () => {
    expect(popup).toMatch(/:disabled="!plan\.nodes\.length"\n\s+@click="create"/)
    expect(methodOf(popup, 'create')).toMatch(/^\s+if \(!this\.plan\.nodes\.length\) return\n/)
    expect(methodOf(popup, 'create')).toContain("this.$emit('create', { nodes: this.plan.nodes, links: this.plan.links })")
  })

  // 붙여 넣은 글에는 주소와 계정 이름이 있다: 창을 닫으면 버린다.
  it('forgets the pasted text when it closes', () => {
    expect(popup).toMatch(/watch: \{[^}]*show\(\) \{\n\s+this\.text = ''\n\s+\}/)
  })

  // 읽은 값을 그대로 노드에 넣는다: 클립보드를 읽거나 main에 무엇을 보내는 길을 새로 만들지 않는다.
  it('reads nothing but what is typed or pasted into it', () => {
    expect(popup).not.toMatch(/window\.preload|clipboard/)
  })
})

describe('From SSH config: adding to the canvas', () => {
  const add = methodOf(editor, 'addFromConfig')

  it('makes a Site node for each planned node with its values, then the connections', () => {
    expect(add).toContain("this.editor.components.get('Site')")
    expect(add).toContain('component.createNode({ connection: cloneDeep(data) })')
    expect(add).toContain("this.editor.connect(added[from].outputs.get('output1'), added[to].inputs.get('input1'))")
  })

  // 노드 아래의 글자는 계산이 끝난 뒤에 채워진다: 그 크기로 재서 놓아야 겹치지 않는다.
  it('places the nodes after they were computed and drawn', () => {
    expect(add).toMatch(/await this\.compile\(\)\n\s+await this\.\$nextTick\(\)\n\s+this\.placeGroup\(added, origin\)/)
  })

  it('computes once at the end instead of after every node', () => {
    expect(add).toMatch(/this\.isAdding = true\n\s+try \{[\s\S]*\} finally \{\n\s+this\.isAdding = false\n\s+\}/)
    expect(editor).toContain('if (this.editor.silent || this.isAdding) return')
  })
})

// Esc, 첫 포커스, Tab 가두기는 dismissOnEscape 믹스인이 준다. 그 믹스인은 ref="dialog"인 카드를 찾는다.
describe('the popups that close on Escape', () => {
  const popups = readdirSync(here).filter(name => name.endsWith('.vue'))

  it('are the three we know', () => {
    expect(popups.sort()).toEqual(['config-popup.vue', 'info-popup.vue', 'setting-popup.vue'])
  })

  // 세 창의 제목은 왼쪽에 있다. Info 창은 내용이 가운데 정렬이라 제목에 따로 적는다.
  it('have their title on the left, also the centered Info window', () => {
    expect(read('info-popup.vue')).toMatch(/header="Info"\n\s+header-class="text-left"\n\s+class="text-center"/)
  })

  it.each(popups)('%s is a dialog the mixin can find', name => {
    const source = read(name)

    expect(source).toContain('mixins: [dismissOnEscape]')
    expect(source).toMatch(/<b-card\n\s+v-if="show"\n\s+ref="dialog"\n\s+role="dialog"\n\s+aria-modal="true"\n\s+aria-label="[^"]+"/)
  })
})

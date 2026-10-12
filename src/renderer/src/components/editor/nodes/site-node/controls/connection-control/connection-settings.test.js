import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fieldError, shownFields } from '../../../../../../utils/connection-field'

// 노드 설정 창(Node Setting). DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내 import만 바꿔서
// 돌리고 (computed와 methods를 가짜 this로 부른다), 틀(template)은 글로 읽는다 (forward-menu.test.js와 같은 방법).
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'connection-settings.vue'), 'utf8').replace(/\r\n/g, '\n')
const template = source.slice(0, source.indexOf('</template>\n\n<script>'))
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]

const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (closePopoverOnEscape, fieldError, shownFields, IconPicker) {\n${body}\n})`)({}, fieldError, shownFields, {})

// 가짜 this: props와, computed를 값으로 읽는 것, $emit으로 보낸 것의 기록
function settings(value = {}, props = {}) {
  const emitted = []
  const vm = { value, disabled: false, _uid: 12, ...props, $emit: (...args) => emitted.push(args) }
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, emitted }
}

afterEach(() => vi.unstubAllGlobals())

describe('the node settings', () => {
  it('runs the script of the component', () => {
    expect(component.name).toBe('ConnectionSettings')
    expect(script.match(/^import .*$/gm)).toHaveLength(3)
    expect(component.data()).toEqual({ isPasswordVisible: false })
  })

  it('shows every field while the diagram can be edited', () => {
    const { vm } = settings({ name: 'app' })
    expect(Object.keys(vm.shown)).toEqual(['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec'])
    expect(vm.isBlank).toBe(false)
  })

  it('shows only the filled-in fields while it is locked, a password of spaces among them', () => {
    const { vm } = settings({ name: 'app', user: '', host: 'h', port: null, password: '  ' }, { disabled: true })
    expect(vm.shown).toEqual({ name: true, host: true, password: true })
    expect(vm.isBlank).toBe(false)
  })

  it('says that nothing is filled in only while it is locked', () => {
    expect(settings({}, { disabled: true }).vm.isBlank).toBe(true)
    expect(settings({ user: ' ' }, { disabled: true }).vm.isBlank).toBe(true)
    expect(settings({}, { disabled: false }).vm.isBlank).toBe(false)
  })

  it('has a note for each value ssh would not take, and none for an empty or a good one', () => {
    const { vm } = settings({ user: 'a b', host: 'web 1', port: '70000', keyPath: 'key"file', exec: 'x'.repeat(4097) })
    for (const key of ['user', 'host', 'port', 'keyPath', 'exec']) {
      expect(vm.errors[key], key).toBe(fieldError(key, vm.value[key]))
      expect(typeof vm.errors[key], key).toBe('string')
    }

    const good = settings({ user: 'ops', host: '10.0.0.1', port: '22', keyPath: '', exec: undefined }).vm.errors
    expect(good).toEqual({ user: null, host: null, port: null, keyPath: null, exec: null })
    // 이름과 비밀번호에는 규칙이 없다
    expect(Object.keys(good)).toEqual(['user', 'host', 'port', 'keyPath', 'exec'])
  })

  it('gives a new object with the one changed value, and leaves the old one alone', () => {
    const value = { name: 'app', host: 'h' }
    const { vm, emitted } = settings(value)

    vm.set('host', 'other')
    vm.set('password', ' p ')
    expect(emitted).toEqual([['input', { name: 'app', host: 'other' }], ['input', { name: 'app', host: 'h', password: ' p ' }]])
    expect(value).toEqual({ name: 'app', host: 'h' })
    expect(emitted[0][1]).not.toBe(value)
  })

  it('takes the key file that was picked, and changes nothing when the dialog is cancelled', async () => {
    const answers = ['C:/keys/id_ed25519', null]
    vi.stubGlobal('window', { preload: { selectKeyFile: async () => answers.shift() } })
    const { vm, emitted } = settings({ name: 'app', keyPath: 'old' })

    await vm.selectKeyFile()
    await vm.selectKeyFile()
    expect(emitted).toEqual([['input', { name: 'app', keyPath: 'C:/keys/id_ed25519' }]])
  })

  it('gives every node its own ids for labels and fields', () => {
    expect(settings({}).vm.fieldId('host')).toBe('node-12-host')
    expect(settings({}, { _uid: 13 }).vm.fieldId('host')).toBe('node-13-host')
  })
})

describe('the template of the node settings', () => {
  it('marks a field and shows its note when the value has an error', () => {
    for (const key of ['user', 'host', 'port', 'keyPath', 'exec']) {
      expect(template, key).toContain(`:state="errors.${key} ? false : null"`)
      expect(template, key).toContain(`:invalid-feedback="errors.${key} || ''"`)
    }
  })

  it('sends each field through set() under its own name', () => {
    for (const key of ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec']) {
      expect(template, key).toContain(`@update="set('${key}', $event)"`)
    }
    expect(template).toContain('@input="set(\'diagram\', $event)"')
    expect(template).toContain('@click="selectKeyFile"')
  })

  it('has the line for a locked node without values', () => {
    expect(template).toMatch(/v-if="isBlank"/)
  })
})

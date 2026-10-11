import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTING_FIELDS, fieldError, shownFields } from './connection-field'

describe('fieldError', () => {
  it('accepts valid values and says nothing about empty ones', () => {
    expect(fieldError('user', 'deploy')).toBeNull()
    expect(fieldError('user', 'DOMAIN\\me')).toBeNull()
    expect(fieldError('host', 'db-1.example.internal')).toBeNull()
    expect(fieldError('host', '[fe80::1%eth0]')).toBeNull()
    expect(fieldError('port', '22')).toBeNull()
    expect(fieldError('keyPath', 'C:\\Users\\me\\.ssh\\id_ed25519')).toBeNull()
    expect(fieldError('exec', 'tail -f /var/log/syslog; echo "done"')).toBeNull()
    for (const key of ['user', 'host', 'port', 'keyPath', 'exec']) {
      expect(fieldError(key, '')).toBeNull()
      expect(fieldError(key, '   ')).toBeNull()
      expect(fieldError(key, undefined)).toBeNull()
    }
  })

  it('explains what is wrong with values the launch would reject', () => {
    expect(fieldError('user', 'bad user')).toMatch(/no spaces/)
    expect(fieldError('user', '-oProxyCommand=x')).toMatch(/not - first/)
    expect(fieldError('host', 'bad host;rm')).toMatch(/no spaces/)
    expect(fieldError('host', '-oProxyCommand=x')).toMatch(/not - first/)
    expect(fieldError('port', '99999')).toMatch(/1 and 65535/)
    expect(fieldError('port', 'ssh')).toMatch(/1 and 65535/)
    expect(fieldError('keyPath', 'a"b')).toMatch(/No "/)
    expect(fieldError('exec', 'x'.repeat(4097))).toMatch(/4096/)
  })

  it('does not repeat the value in the message', () => {
    expect(fieldError('host', 'secret host')).not.toContain('secret')
  })

  it('ignores fields without a rule', () => {
    expect(fieldError('name', 'any; thing')).toBeNull()
    expect(fieldError('password', 'p w')).toBeNull()
  })
})

// 편집 중이 아닐 때(잠근 동안) 노드 설정은 값이 들어 있는 칸만 보여준다 (owner, 2026-10).
describe('shownFields', () => {
  const node = { diagram: 'server.png', name: 'bastion', user: 'ops', host: '10.0.0.1', port: '22', keyPath: '', password: null, exec: undefined }

  it('shows every field while the diagram is being edited, filled in or not', () => {
    expect(shownFields(node, false)).toEqual(['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec'])
    expect(shownFields({}, false)).toEqual(SETTING_FIELDS)
    expect(shownFields(undefined, false)).toEqual(SETTING_FIELDS)
  })

  it('shows only the fields with a value while the diagram is locked, in the same order', () => {
    expect(shownFields(node, true)).toEqual(['name', 'user', 'host', 'port'])
    expect(shownFields({ ...node, name: '', keyPath: '~/.ssh/id_ed25519', exec: 'htop' }, true)).toEqual(['user', 'host', 'port', 'keyPath', 'exec'])
  })

  it('shows nothing of a node without values', () => {
    expect(shownFields({}, true)).toEqual([])
    expect(shownFields(undefined, true)).toEqual([])
    expect(shownFields({ name: null, user: undefined, host: '', port: '  ', keyPath: '\t', password: '', exec: ' ' }, true)).toEqual([])
  })

  it('takes a port saved as a number for a value', () => {
    expect(shownFields({ port: 22 }, true)).toEqual(['port'])
    expect(shownFields({ port: 0 }, true)).toEqual(['port'])
  })

  // 비밀번호는 앞뒤 공백도 그대로 저장한다: 공백만 있어도 입력된 값이다.
  it('takes a password of spaces for a value, but not spaces in another field', () => {
    expect(shownFields({ password: '  ' }, true)).toEqual(['password'])
    expect(shownFields({ user: '  ' }, true)).toEqual([])
  })

  it('never lists the icon: the list of icons is left out as a whole', () => {
    expect(shownFields({ diagram: 'server.png' }, true)).toEqual([])
    expect(SETTING_FIELDS).not.toContain('diagram')
  })
})

// 칸을 보이고 숨기는 것은 connection-settings.vue의 v-if다. 칸이 빠지거나 새 칸이 조건 없이 들어오면 여기서 걸린다.
describe('the Node Setting popover', () => {
  const vue = readFileSync(join(__dirname, '..', 'components', 'editor', 'nodes', 'site-node', 'controls', 'connection-control', 'connection-settings.vue'), 'utf8').replace(/\r\n/g, '\n')
  const template = vue.slice(0, vue.indexOf('<script>'))
  const groups = [...template.matchAll(/<b-form-group\n([^>]*)>/g)].map(x => x[1])

  it('has one group for every field, each shown only when its field is', () => {
    const conditions = groups.map(attributes => attributes.match(/v-if="shown\.(\w+)"/)?.[1])

    expect(conditions).toEqual(SETTING_FIELDS)
    for (const [index, key] of SETTING_FIELDS.entries()) expect(groups[index]).toMatch(new RegExp(`:label-for="fieldId\\('${key}'\\)"`))
  })

  it('leaves the list of icons out while the diagram is locked', () => {
    expect(template).toMatch(/<IconPicker\n\s+v-if="!disabled"/)
  })

  it('says so when nothing is left to show', () => {
    expect(template).toMatch(/<p\n\s+v-if="isBlank"/)
    expect(vue).toMatch(/isBlank\(\) \{\n\s+return this\.disabled && Object\.keys\(this\.shown\)\.length === 0\n/)
    expect(vue).toMatch(/shown\(\) \{\n\s+return Object\.fromEntries\(shownFields\(this\.value, this\.disabled\)/)
  })
})

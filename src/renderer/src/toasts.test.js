import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { props } from 'bootstrap-vue/esm/components/toast/toast'
import { describe, expect, it } from 'vitest'

// 앱의 알림(BootstrapVue의 토스트)은 모두 오른쪽 위에 뜨고 x로 바로 닫힌다 (owner, 2026-10-18, #268: 캔버스의 짧은 안내가 아래
// 가운데에 x 없이 떠서 오류처럼 보였고, 닫을 수 없었다). 토스트를 띄우는 두 곳(utils/notify.js의 toastError, 캔버스의 showHint)은
// 자리도 x도 BootstrapVue의 기본에 맡긴다. 그 자리를 머리글 아래로 내리는 것은 theme.scss다 (theme.test.js).
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// 렌더러의 소스 (테스트는 빼고): 이 폴더에서 본 경로와 그 내용
function sources(dir = here) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!/\.(js|vue)$/.test(entry.name) || entry.name.endsWith('.test.js')) return []
    return [{ name: relative(here, path).split('\\').join('/'), text: read(path) }]
  })
}

describe('the messages of the app', () => {
  it('open at the top right with an x, unless a toast asks for something else', () => {
    expect(props.toaster.default()).toBe('b-toaster-top-right')
    expect(props.noCloseButton.default()).toBe(false)
  })

  it('are made in two places, and nothing asks for another place or leaves the x out', () => {
    const all = sources()

    expect(all.filter(file => file.text.includes('$bvToast.toast(')).map(file => file.name).sort()).toEqual(['components/editor/index.vue', 'utils/notify.js'])
    expect(all.flatMap(file => [/\btoaster\s*[:=]/, /\bnoCloseButton\b/, /\bno-close-button\b/].filter(rule => rule.test(file.text)).map(rule => `${file.name} ${rule}`))).toEqual([])
  })

  // 캔버스의 안내는 떠 있는 동안 다시 띄우지 않고, 사라지면 다시 띄운다 (components/editor/index.vue의 showHint). 사라진 것은
  // BootstrapVue가 $root에 보내는 이벤트로 안다: 그 이름이 맞는지는 editor-methods.test.js가 본다.
  it('tell the root when they have gone, with the id they were given', () => {
    const toast = read(require.resolve('bootstrap-vue/esm/components/toast/toast.js'))

    // 사라지는 움직임(Bootstrap의 fade)이 끝나면 hidden을 보낸다: 저절로 사라질 때도 x를 누를 때도 (둘 다 hide()를 부른다)
    expect(toast).toMatch(/onAfterLeave: function onAfterLeave\(\) \{[^}]*var hiddenEvent = this\.buildEvent\(EVENT_NAME_HIDDEN\);\n\s*this\.emitEvent\(hiddenEvent\);/)
    expect(toast).toMatch(/emitEvent: function emitEvent\(bvEvent\) \{\n\s*var type = bvEvent\.type;\n\s*this\.emitOnRoot\(getRootEventName\(NAME_TOAST, type\), bvEvent\);/)
    // 이벤트의 componentId는 토스트의 id이고, 그것은 띄울 때 준 id다
    expect(toast).toMatch(/componentId: this\.safeId\(\)/)
    expect(read(require.resolve('bootstrap-vue/esm/mixins/id.js'))).toMatch(/var id = this\.id \|\| this\.localId_;/)
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import terminal from '../../store/modules/terminal'
import { activatePane, shownPanes, splitPartner } from '../../utils/terminal-sessions'

// 터미널 패널을 좌우로 나누기 (owner, 2026-10-12). 탭 줄은 하나이고, 두 칸에 탭이 하나씩 보인다.
const here = dirname(fileURLToPath(import.meta.url))
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n')
const tabs = read('terminal-tabs.vue')
const panel = read('terminal-panel.vue')

describe('shownPanes', () => {
  it('shows the selected tab alone while the panel is not split', () => {
    expect(shownPanes({ activeKey: 3, sideKey: null, activeSide: 'left' })).toEqual({ left: 3, right: null })
    expect(shownPanes({ activeKey: null, sideKey: null, activeSide: 'left' })).toEqual({ left: null, right: null })
    expect(shownPanes()).toEqual({ left: null, right: null })
  })

  it('puts the selected tab into its half and the other tab into the other one', () => {
    expect(shownPanes({ activeKey: 3, sideKey: 5, activeSide: 'left' })).toEqual({ left: 3, right: 5 })
    expect(shownPanes({ activeKey: 3, sideKey: 5, activeSide: 'right' })).toEqual({ left: 5, right: 3 })
  })
})

describe('activatePane', () => {
  const split = { activeKey: 3, sideKey: 5, activeSide: 'left' }

  it('moves to the other half when its tab is selected, and leaves both halves as they are', () => {
    const moved = activatePane(split, 5)

    expect(moved).toEqual({ activeKey: 5, sideKey: 3, activeSide: 'right' })
    expect(shownPanes(moved)).toEqual(shownPanes(split))
    expect(activatePane(moved, 3)).toEqual(split)
  })

  it('replaces the tab of the selected half with a tab that was not in sight', () => {
    expect(activatePane(split, 7)).toEqual({ activeKey: 7, sideKey: 5, activeSide: 'left' })
    expect(activatePane({ ...split, activeSide: 'right' }, 7)).toEqual({ activeKey: 7, sideKey: 5, activeSide: 'right' })
  })

  it('just selects the tab while the panel is not split', () => {
    expect(activatePane({ activeKey: 3, sideKey: null, activeSide: 'left' }, 7)).toEqual({ activeKey: 7, sideKey: null, activeSide: 'left' })
  })
})

describe('splitPartner', () => {
  const sessions = [{ key: 1 }, { key: 2 }, { key: 3 }]

  it('is the next tab, or the one before the last tab', () => {
    expect(splitPartner(sessions, 1)).toBe(2)
    expect(splitPartner(sessions, 2)).toBe(3)
    expect(splitPartner(sessions, 3)).toBe(2)
  })

  it('is nobody when there is one tab, or the selected tab is not one of them', () => {
    expect(splitPartner([{ key: 1 }], 1)).toBeNull()
    expect(splitPartner(sessions, 9)).toBeNull()
    expect(splitPartner([], null)).toBeNull()
    expect(splitPartner(undefined, 1)).toBeNull()
  })
})

describe('the terminal store: a split panel', () => {
  const { mutations, getters } = terminal
  const fresh = () => {
    const state = JSON.parse(JSON.stringify(terminal.state))
    mutations.terminalOwner(state, 0)
    return state
  }
  const open = (state, title) => {
    mutations.terminalAdd(state, { title, kind: 'connect', payload: {} })
    return state.activeKey
  }
  const panes = state => getters.terminalPanes(state)

  it('cannot be split with one tab', () => {
    const state = fresh()
    const a = open(state, 'a')

    mutations.terminalSplit(state, true)
    expect(panes(state)).toEqual({ left: a, right: null })
  })

  it('shows the selected tab left and its neighbor right, and one tab again when the split ends', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    mutations.terminalPanel(state, false)

    mutations.terminalSplit(state, true)
    expect(panes(state)).toEqual({ left: b, right: a })
    expect(state.activeKey).toBe(b)
    expect(state.isPanelOpen).toBe(true)

    mutations.terminalActivate(state, a)
    expect(panes(state)).toEqual({ left: b, right: a })
    mutations.terminalSplit(state, false)
    expect(panes(state)).toEqual({ left: a, right: null })
    expect(state.activeSide).toBe('left')
  })

  it('opens a new terminal in the selected half', () => {
    const state = fresh()
    const a = open(state, 'a')
    open(state, 'b')
    mutations.terminalSplit(state, true)
    mutations.terminalActivate(state, a)

    const c = open(state, 'c')
    expect(panes(state).right).toBe(c)
    expect(state.activeKey).toBe(c)
  })

  it('ends the split when one of the two tabs in sight is closed, and keeps the other one', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')

    // [c | b], c selected: close the other half
    mutations.terminalSplit(state, true)
    mutations.terminalRemove(state, b)
    expect(panes(state)).toEqual({ left: c, right: null })

    // [c | a], a selected (right): close the selected one
    mutations.terminalSplit(state, true)
    mutations.terminalActivate(state, a)
    mutations.terminalRemove(state, a)
    expect(panes(state)).toEqual({ left: c, right: null })
    expect(state.activeSide).toBe('left')
    expect(state.isPanelOpen).toBe(true)
  })

  it('keeps the split when a tab that is not in sight is closed', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalSplit(state, true)

    mutations.terminalRemove(state, a)
    expect(panes(state)).toEqual({ left: c, right: b })
  })

  it('remembers the split of each diagram', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    mutations.terminalSplit(state, true)
    mutations.terminalActivate(state, a)

    mutations.terminalOwner(state, 1)
    expect(panes(state)).toEqual({ left: null, right: null })
    const other = open(state, 'x')
    expect(panes(state)).toEqual({ left: other, right: null })

    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: b, right: a })
    expect(state.activeKey).toBe(a)
  })

  // 떠나 있는 동안 끝난 세션의 탭은 닫힌다 (exit). 한 칸이 비면 나누지 않은 것으로 돌아온다.
  it('comes back unsplit when one of the two tabs ended meanwhile', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    mutations.terminalSplit(state, true)

    mutations.terminalOwner(state, 1)
    mutations.terminalRemove(state, a)
    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: b, right: null })

    mutations.terminalSplit(state, false)
    const c = open(state, 'c')
    mutations.terminalSplit(state, true)
    mutations.terminalOwner(state, 1)
    mutations.terminalRemove(state, c)
    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: b, right: null })
    expect(state.activeSide).toBe('left')
  })
})

describe('the split in the panel and the tab row', () => {
  it('shows the screens of both halves, each in its half', () => {
    expect(panel).toMatch(/v-show="session\.key === panes\.left \|\| session\.key === panes\.right"/)
    expect(panel).toMatch(/:class="\{ 'is-left': isSplit && session\.key === panes\.left, 'is-right': isSplit && session\.key === panes\.right \}"/)
    expect(panel).toMatch(/&\.is-left \{\n\s+right: calc\(50% \+ 5px\);\n/)
    expect(panel).toMatch(/&\.is-right \{\n\s+left: calc\(50% \+ 11px\);\n/)
  })

  // 다른 칸을 누르면(화면이 포커스를 받는다) 그 탭을 고른 것이다
  it('selects the tab of a half when its terminal gets the focus', () => {
    expect(panel).toMatch(/@focusin="activate\(session\.key\)"/)
    expect(panel).toMatch(/activate\(key\) \{\n\s+if \(key === this\.activeKey && this\.isOpen\) return\n\n\s+this\.\$store\.commit\('terminalActivate', key\)\n/)
  })

  it('fits both screens in sight and gives the keyboard to the selected one', () => {
    expect(panel).toMatch(/fitActive\(focus = false\) \{\n\s+for \(const key of \[this\.panes\.left, this\.panes\.right\]\) this\.fit\(this\.terms\.get\(key\)\)\n\s+if \(focus\) this\.terms\.get\(this\.activeKey\)\?\.term\.focus\(\)\n/)
    expect(panel).toMatch(/shownKeys\(\) \{\n\s+this\.\$nextTick\(\(\) => this\.fitActive\(true\)\)\n/)
  })

  it('has a split button that needs two tabs and is not there while the panel is minimized', () => {
    expect(tabs).toMatch(/<button\n\s+v-if="!isMinimized"\n\s+type="button"\n\s+class="terminal-split"/)
    expect(tabs).toMatch(/:disabled="!isSplit && sessions\.length < 2"\n\s+@click="\$emit\('split', !isSplit\)"/)
    expect(panel).toMatch(/@split="\$store\.commit\('terminalSplit', \$event\)"/)
  })

  it('marks the tab of the other half in the tab row', () => {
    expect(tabs).toMatch(/'is-side': session\.key === sideKey && !isMinimized,/)
    expect(panel).toMatch(/:side-key="sideKey"/)
  })
})

describe('the tab of the other half', () => {
  const { mutations, getters } = terminal
  const open = (state, title) => {
    mutations.terminalAdd(state, { title, kind: 'connect', payload: {} })
    return state.activeKey
  }

  it('is the tab in sight that is not selected, and nobody while the panel is not split', () => {
    const state = JSON.parse(JSON.stringify(terminal.state))
    mutations.terminalOwner(state, 0)
    expect(getters.terminalSideKey(state)).toBeNull()

    const a = open(state, 'a')
    const b = open(state, 'b')
    expect(getters.terminalSideKey(state)).toBeNull()

    mutations.terminalSplit(state, true)
    expect(getters.terminalSideKey(state)).toBe(a)
    mutations.terminalActivate(state, a)
    expect(getters.terminalSideKey(state)).toBe(b)

    mutations.terminalSplit(state, false)
    expect(getters.terminalSideKey(state)).toBeNull()
  })

  it('is what the panel calls split', () => {
    expect(panel).toMatch(/isSplit\(\) \{\n\s+return this\.sideKey !== null\n/)
    expect(panel).toMatch(/sideKey: 'terminalSideKey'/)
  })
})

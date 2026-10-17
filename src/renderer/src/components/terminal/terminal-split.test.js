import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import terminal from '../../store/modules/terminal'
import { activatePane, closePane, moveToSide, restorePanes, shownPanes, splitPartner, tabRowChange } from '../../utils/terminal-sessions'

// 터미널 패널을 좌우로 나누기 (owner, 2026-10-12). 칸마다 제 탭 줄이 있고 (owner, 2026-10-17), 두 칸에 탭이 하나씩 보인다.
const here = dirname(fileURLToPath(import.meta.url))
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n')
const tabs = read('terminal-tabs.vue')
const panel = read('terminal-panel.vue')

describe('shownPanes', () => {
  it('shows the selected tab alone while the panel is not split', () => {
    expect(shownPanes({ activeKey: 3, sideKey: null, rightKeys: [] })).toEqual({ left: 3, right: null })
    expect(shownPanes({ activeKey: null, sideKey: null, rightKeys: [] })).toEqual({ left: null, right: null })
    expect(shownPanes()).toEqual({ left: null, right: null })
  })

  it('shows each tab in the half it belongs to', () => {
    expect(shownPanes({ activeKey: 3, sideKey: 5, rightKeys: [5] })).toEqual({ left: 3, right: 5 })
    expect(shownPanes({ activeKey: 3, sideKey: 5, rightKeys: [3, 7] })).toEqual({ left: 5, right: 3 })
  })

  it('shows no half without a selected tab, also when a tab of the other half is left', () => {
    expect(shownPanes({ activeKey: null, sideKey: 5, rightKeys: [5] })).toEqual({ left: null, right: null })
  })
})

describe('activatePane', () => {
  // 왼쪽 칸: 1, 3 (3이 보인다, 고른 탭), 오른쪽 칸: 5, 7 (5가 보인다)
  const split = { activeKey: 3, sideKey: 5, rightKeys: [5, 7] }

  it('moves to the other half when its tab is selected, and leaves both halves as they are', () => {
    const moved = activatePane(split, 5)

    expect(moved).toEqual({ activeKey: 5, sideKey: 3, rightKeys: [5, 7] })
    expect(shownPanes(moved)).toEqual(shownPanes(split))
    expect(activatePane(moved, 3)).toEqual(split)
  })

  it('shows a tab that was not in sight in its own half, and keeps the tab of the other half', () => {
    expect(shownPanes(activatePane(split, 1))).toEqual({ left: 1, right: 5 })
    expect(activatePane(split, 1)).toEqual({ activeKey: 1, sideKey: 5, rightKeys: [5, 7] })
    // 7은 오른쪽 칸의 탭이다: 그 칸으로 옮겨 가고, 왼쪽 칸에는 3이 남는다
    expect(activatePane(split, 7)).toEqual({ activeKey: 7, sideKey: 3, rightKeys: [5, 7] })
    expect(shownPanes(activatePane(split, 7))).toEqual({ left: 3, right: 7 })
  })

  it('just selects the tab while the panel is not split', () => {
    expect(activatePane({ activeKey: 3, sideKey: null, rightKeys: [] }, 7)).toEqual({ activeKey: 7, sideKey: null, rightKeys: [] })
  })
})

describe('closePane', () => {
  const keys = [1, 3, 5, 7, 9]
  // 왼쪽 칸: 1, 3, 9 (3이 보인다), 오른쪽 칸: 5, 7 (7이 보인다, 고른 탭)
  const split = { activeKey: 7, sideKey: 3, rightKeys: [5, 7] }
  const alone = { activeKey: 3, sideKey: null, rightKeys: [] }

  it('shows the neighbor of the same half when a tab in sight is closed, and stays split', () => {
    expect(closePane(split, 7, keys)).toEqual({ activeKey: 5, sideKey: 3, rightKeys: [5] })
    // 3 다음의 왼쪽 탭은 9다 (5와 7은 오른쪽 칸의 것이다)
    expect(closePane(split, 3, keys)).toEqual({ activeKey: 7, sideKey: 9, rightKeys: [5, 7] })
    expect(closePane({ ...split, sideKey: 9 }, 9, keys)).toEqual({ activeKey: 7, sideKey: 3, rightKeys: [5, 7] })
  })

  it('ends the split when the last tab of a half is closed, and keeps the tab of the other half', () => {
    const two = { activeKey: 3, sideKey: 5, rightKeys: [5] }
    expect(closePane(two, 5, [3, 5])).toEqual({ activeKey: 3, sideKey: null, rightKeys: [] })
    expect(closePane(two, 3, [3, 5])).toEqual({ activeKey: 5, sideKey: null, rightKeys: [] })
    expect(closePane(two, 5, [1, 3, 5])).toEqual({ activeKey: 3, sideKey: null, rightKeys: [] })
  })

  it('changes nothing in sight when a tab that is not in sight is closed', () => {
    expect(closePane(split, 1, keys)).toEqual(split)
    expect(closePane(split, 5, keys)).toEqual({ activeKey: 7, sideKey: 3, rightKeys: [7] })
    expect(closePane(alone, 9, keys)).toEqual(alone)
  })

  it('selects the neighbor when the only tab in sight is closed, or nobody when it was the last', () => {
    expect(closePane(alone, 3, keys)).toEqual({ activeKey: 5, sideKey: null, rightKeys: [] })
    expect(closePane({ activeKey: 9, sideKey: null, rightKeys: [] }, 9, keys)).toEqual({ activeKey: 7, sideKey: null, rightKeys: [] })
    expect(closePane(alone, 3, [3])).toEqual({ activeKey: null, sideKey: null, rightKeys: [] })
  })
})

describe('moveToSide', () => {
  const keys = [1, 3, 5, 7]
  // 왼쪽 칸: 1, 3 (3이 보인다, 고른 탭), 오른쪽 칸: 5, 7 (5가 보인다)
  const split = { activeKey: 3, sideKey: 5, rightKeys: [5, 7] }

  it('shows the moved tab in its new half, with the keyboard, and leaves the other half as it was', () => {
    const moved = moveToSide(split, 1, 'right', keys)
    expect(moved).toEqual({ activeKey: 1, sideKey: 3, rightKeys: [5, 7, 1] })
    expect(shownPanes(moved)).toEqual({ left: 3, right: 1 })

    expect(moveToSide(split, 7, 'left', keys)).toEqual({ activeKey: 7, sideKey: 5, rightKeys: [5] })
  })

  it('shows the neighbor in the half the moved tab was in sight in', () => {
    const moved = moveToSide(split, 3, 'right', keys)
    expect(shownPanes(moved)).toEqual({ left: 1, right: 3 })
    expect(moveToSide(split, 5, 'left', keys)).toEqual({ activeKey: 5, sideKey: 7, rightKeys: [7] })
  })

  it('ends the split when the last tab of a half leaves it, and selects that tab', () => {
    const two = { activeKey: 3, sideKey: 5, rightKeys: [5] }
    expect(moveToSide(two, 5, 'left', [3, 5])).toEqual({ activeKey: 5, sideKey: null, rightKeys: [] })
    expect(moveToSide({ activeKey: 3, sideKey: 5, rightKeys: [1, 5, 7] }, 3, 'right', keys)).toEqual({ activeKey: 3, sideKey: null, rightKeys: [] })
  })

  it('changes nothing for a tab dropped on its own half, a tab that is not there, or a panel that is not split', () => {
    expect(moveToSide(split, 1, 'left', keys)).toEqual(split)
    expect(moveToSide(split, 7, 'right', keys)).toEqual(split)
    expect(moveToSide(split, 9, 'right', keys)).toEqual(split)
    expect(moveToSide({ activeKey: 3, sideKey: null, rightKeys: [] }, 1, 'right', keys)).toEqual({ activeKey: 3, sideKey: null, rightKeys: [] })
  })
})

describe('restorePanes', () => {
  const last = { activeKey: 3, sideKey: 5, rightKeys: [5, 7] }

  it('brings both halves back as they were', () => {
    expect(restorePanes(last, [1, 3, 5, 7])).toEqual(last)
  })

  it('shows the first tab of a half whose tab in sight ended meanwhile', () => {
    expect(restorePanes(last, [1, 3, 7])).toEqual({ activeKey: 3, sideKey: 7, rightKeys: [7] })
    expect(restorePanes(last, [1, 5, 7, 9])).toEqual({ activeKey: 1, sideKey: 5, rightKeys: [5, 7] })
    expect(restorePanes({ ...last, activeKey: 7, sideKey: 3 }, [1, 3, 5])).toEqual({ activeKey: 5, sideKey: 3, rightKeys: [5] })
  })

  it('comes back unsplit when one half has no tab left', () => {
    expect(restorePanes(last, [1, 3])).toEqual({ activeKey: 3, sideKey: null, rightKeys: [] })
    expect(restorePanes(last, [5, 7])).toEqual({ activeKey: 5, sideKey: null, rightKeys: [] })
    expect(restorePanes(last, [])).toEqual({ activeKey: null, sideKey: null, rightKeys: [] })
  })

  it('selects the first tab of a space opened for the first time, and remembers no split that was not there', () => {
    expect(restorePanes(undefined, [4, 6])).toEqual({ activeKey: 4, sideKey: null, rightKeys: [] })
    expect(restorePanes({ activeKey: 6, sideKey: null, rightKeys: [6] }, [4, 6])).toEqual({ activeKey: 6, sideKey: null, rightKeys: [] })
  })
})

describe('tabRowChange', () => {
  it('is a new order of the row when its tabs stay, and a move when one came from the other row', () => {
    expect(tabRowChange([1, 3, 5], [3, 1, 5])).toEqual({ type: 'reorder', keys: [3, 1, 5] })
    expect(tabRowChange([1, 3], [1, 7, 3])).toEqual({ type: 'move', key: 7, keys: [1, 7, 3] })
  })

  // 다른 줄로 끌어 간 탭은 그 줄이 move로 알린다
  it('is nothing for the row a tab left, or a list it cannot tell', () => {
    expect(tabRowChange([1, 3, 5], [1, 5])).toBeNull()
    expect(tabRowChange([1], [1, 7, 9])).toBeNull()
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
  const order = state => getters.terminalSessions(state).map(x => x.key)
  const right = state => getters.terminalRightKeys(state)

  it('cannot be split with one tab', () => {
    const state = fresh()
    const a = open(state, 'a')

    mutations.terminalSplit(state, true)
    expect(panes(state)).toEqual({ left: a, right: null })
    expect(right(state)).toEqual([])
  })

  it('moves only the neighbor of the selected tab into the right half, and puts the row back as it was when the split ends', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalActivate(state, a)
    mutations.terminalPanel(state, false)

    mutations.terminalSplit(state, true)
    expect(panes(state)).toEqual({ left: a, right: b })
    expect(right(state)).toEqual([b])
    expect(state.activeKey).toBe(a)
    expect(state.isPanelOpen).toBe(true)

    // c는 왼쪽 칸의 탭이다: 거기서 a 대신 보이고, 오른쪽에는 b가 남는다
    mutations.terminalActivate(state, c)
    expect(panes(state)).toEqual({ left: c, right: b })
    mutations.terminalActivate(state, b)
    mutations.terminalSplit(state, false)
    expect(panes(state)).toEqual({ left: b, right: null })
    expect(right(state)).toEqual([])
    expect(order(state)).toEqual([a, b, c])
  })

  it('opens a new terminal in the row of the selected half', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    mutations.terminalActivate(state, a)
    mutations.terminalSplit(state, true)

    mutations.terminalActivate(state, b)
    const c = open(state, 'c')
    expect(panes(state)).toEqual({ left: a, right: c })
    expect(right(state)).toEqual([b, c])

    mutations.terminalActivate(state, a)
    const d = open(state, 'd')
    expect(panes(state)).toEqual({ left: d, right: c })
    expect(right(state)).toEqual([b, c])
  })

  it('shows the neighbor of the same half when a tab in sight is closed, and ends the split with the last tab of a half', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalActivate(state, a)
    mutations.terminalSplit(state, true)
    mutations.terminalActivate(state, c)
    // 왼쪽: a, c (c가 보인다), 오른쪽: b

    mutations.terminalRemove(state, c)
    expect(panes(state)).toEqual({ left: a, right: b })
    expect(state.activeKey).toBe(a)

    mutations.terminalRemove(state, b)
    expect(panes(state)).toEqual({ left: a, right: null })
    expect(right(state)).toEqual([])
    expect(state.isPanelOpen).toBe(true)
  })

  it('keeps both halves when a tab that is not in sight is closed', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalSplit(state, true)
    // c를 골랐다 (왼쪽), b는 오른쪽; a는 왼쪽에 있지만 보이지 않는다

    mutations.terminalRemove(state, a)
    expect(panes(state)).toEqual({ left: c, right: b })
  })

  it('takes a tab dragged into the other row into that half, and keeps the order of the tabs in each row', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    const d = open(state, 'd')
    mutations.terminalActivate(state, a)
    mutations.terminalSplit(state, true)
    // 왼쪽: a, c, d (a가 보인다), 오른쪽: b

    // d를 오른쪽 줄의 b 앞으로
    mutations.terminalMove(state, { key: d, side: 'right', keys: [d, b] })
    expect(panes(state)).toEqual({ left: a, right: d })
    expect(state.activeKey).toBe(d)
    expect(right(state)).toEqual([b, d])
    expect(order(state).filter(x => right(state).includes(x))).toEqual([d, b])
    expect(order(state).filter(x => !right(state).includes(x))).toEqual([a, c])

    // 왼쪽 줄에서 a를 끝으로: 오른쪽 줄의 탭은 제자리에 있다
    mutations.terminalReorder(state, [c, a])
    expect(order(state).filter(x => !right(state).includes(x))).toEqual([c, a])
    expect(order(state).filter(x => right(state).includes(x))).toEqual([d, b])

    // 왼쪽 칸의 마지막 탭들을 오른쪽으로: 그러면 나누기가 끝난다
    mutations.terminalMove(state, { key: c, side: 'right', keys: [d, c, b] })
    expect(panes(state)).toEqual({ left: a, right: c })
    mutations.terminalMove(state, { key: a, side: 'right', keys: [a, d, c, b] })
    expect(panes(state)).toEqual({ left: a, right: null })
    expect(right(state)).toEqual([])
    expect(order(state)).toEqual([a, d, c, b])
  })

  it('remembers the halves of each space', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalActivate(state, a)
    mutations.terminalSplit(state, true)
    mutations.terminalMove(state, { key: c, side: 'right', keys: [b, c] })

    mutations.terminalOwner(state, 1)
    expect(panes(state)).toEqual({ left: null, right: null })
    expect(right(state)).toEqual([])
    const other = open(state, 'x')
    expect(panes(state)).toEqual({ left: other, right: null })
    expect(right(state)).toEqual([])

    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: a, right: c })
    expect(state.activeKey).toBe(c)
    expect(right(state)).toEqual([b, c])
  })

  // 떠나 있는 동안 끝난 세션의 탭은 닫힌다 (exit). 한 칸이 비면 나누지 않은 것으로 돌아온다.
  it('comes back unsplit when the tabs of one half ended meanwhile, and with the other tab of a half whose tab in sight ended', () => {
    const state = fresh()
    const a = open(state, 'a')
    const b = open(state, 'b')
    const c = open(state, 'c')
    mutations.terminalActivate(state, a)
    mutations.terminalSplit(state, true)
    mutations.terminalMove(state, { key: c, side: 'right', keys: [b, c] })
    // 왼쪽: a, 오른쪽: b, c (c가 보이고, 골랐다)

    mutations.terminalOwner(state, 1)
    mutations.terminalRemove(state, c)
    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: a, right: b })
    expect(state.activeKey).toBe(b)

    mutations.terminalOwner(state, 1)
    mutations.terminalRemove(state, a)
    mutations.terminalOwner(state, 0)
    expect(panes(state)).toEqual({ left: b, right: null })
    expect(right(state)).toEqual([])
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
    expect(tabs).toMatch(/:disabled="!canSplit"\n\s+@click="\$emit\('split', !isSplit\)"/)
    expect(tabs).toMatch(/canSplit\(\) \{\n\s+return this\.isSplit \|\| this\.sessions\.length >= 2\n/)
    // 누를 수 없는 단추는 이유를 말한다
    expect(tabs).toMatch(/return this\.canSplit \? 'Split: show two terminals side by side' : 'Split needs a second terminal'\n/)
    expect(panel).toMatch(/@split="\$store\.commit\('terminalSplit', \$event\)"/)
  })

  it('has a row of tabs for each half, and tabs can be dragged from one into the other', () => {
    expect(tabs).toMatch(/<draggable\n\s+v-for="row in rows"\n\s+:key="row\.side"\n\s+:value="row\.sessions"/)
    expect(tabs).toMatch(/\n\s+group="terminal-tabs"\n/)
    expect(tabs).toMatch(/@input="dropped\(row, \$event\)"/)
    expect(tabs).toMatch(/v-for="session in row\.sessions"/)
    expect(panel).toMatch(/:right-keys="rightKeys"/)
    expect(panel).toMatch(/rightKeys: 'terminalRightKeys'/)
    expect(panel).toMatch(/@reorder="\$store\.commit\('terminalReorder', \$event\)"\n\s+@move="\$store\.commit\('terminalMove', \$event\)"/)
  })

  // 왼쪽 목록은 왼쪽 화면이 끝나는 곳(패널 폭의 50% - 5px)에서 끝나고, 오른쪽 목록은 오른쪽 화면이 시작하는 곳(50% + 11px)에서 시작한다.
  // 줄의 안쪽은 왼쪽 여백 14px과 오른쪽 여백 8px 사이이고, 목록 사이의 간격은 4px이다.
  it('puts the row of each half over the screen of that half', () => {
    expect(tabs).toMatch(/\n {2}padding: 3px 8px 0 14px;\n/)
    expect(tabs).toMatch(/\.terminal-tab-list \{\n\s+display: flex;\n\s+flex: 1;\n\s+align-items: stretch;\n\s+gap: 4px;/)
    expect(tabs).toMatch(/\.terminal-tabs \{\n\s+display: flex;\n\s+align-items: stretch;\n\s+gap: 4px;/)
    expect(tabs).toMatch(/\.is-split > &\.is-left \{\n\s+flex: 0 0 calc\(50% - 8px\);\n/)
    expect(tabs).toMatch(/\.is-split > &\.is-right \{\n\s+margin-left: 12px;\n/)
    // 두 칸 사이의 줄은 패널의 것과 같은 자리에 탭 줄까지 이어진다
    expect(tabs).toMatch(/&::after \{\n\s+content: '';\n\s+position: absolute;\n\s+top: 0;\n\s+bottom: 0;\n\s+left: calc\(50% - 1px\);\n\s+width: 2px;\n\s+background: var\(--js-line\);\n/)
    expect(panel).toMatch(/\.terminal-divider \{\n\s+position: absolute;\n\s+top: 0;\n\s+bottom: 0;\n\s+left: calc\(50% - 1px\);\n\s+width: 2px;\n\s+background: var\(--js-line\);\n/)
  })

  it('marks the tab of the other half in its row', () => {
    expect(tabs).toMatch(/'is-side': session\.key === sideKey && !isMinimized,/)
    expect(panel).toMatch(/:side-key="sideKey"/)
    // 테두리를 두른다: 아래의 줄 하나는 탭 줄의 테두리와 붙어서 보이지 않았다
    expect(tabs).toMatch(/&\.is-side \{\n\s+color: var\(--js-text\);\n\s+box-shadow: inset 0 0 0 2px var\(--js-primary\);\n/)
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

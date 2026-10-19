<template>
  <div
    id="main-navigator"
    v-click-outside="vcoConfig"
  >
    <!-- navigator-header: 검색, 새 항목, 그 밖의 동작을 한 줄에 둔다 -->
    <div class="main-navigator-header p-1 px-2 layout-divider">
      <b-input-group
        size="sm"
        class="list-search py-1 mr-1"
      >
        <b-input-group-prepend is-text>
          <b-icon
            icon="search"
          />
        </b-input-group-prepend>
        <b-form-input
          v-model="keyword"
          aria-label="Search spaces"
          :debounce="150"
          type="search"
        />
      </b-input-group>

      <b-button
        size="sm"
        variant="light"
        aria-label="New space"
        title="New space"
        :disabled="isSelecting"
        @click="addNewItem"
      >
        <b-icon
          icon="plus"
        />
      </b-button>

      <hr
        class="btn-divider my-0 mx-1 p-0"
      >

      <b-dropdown
        size="sm"
        variant="light"
        :toggle-attrs="{ 'aria-label': 'More actions' }"
        toggle-class="text-decoration-none"
        boundary="window"
        :popper-opts="menuPopperOpts"
        no-caret
        right
      >
        <template #button-content>
          <b-icon
            icon="three-dots-vertical"
          />
        </template>
        <b-dropdown-item
          :disabled="isSelecting"
          @click="addNewItem"
        >
          <small>New space</small>
        </b-dropdown-item>
        <b-dropdown-item
          :disabled="!isSelecting"
          @click="removeSelectedItems"
        >
          <small>Remove spaces</small>
        </b-dropdown-item>
        <b-dropdown-divider />
        <b-dropdown-item
          :disabled="isSelecting"
          @click="importItems"
        >
          <small>Import spaces...</small>
        </b-dropdown-item>
        <b-dropdown-item
          :disabled="!isSelecting"
          @click="exportSelectedItems"
        >
          <small>Export spaces...</small>
        </b-dropdown-item>
      </b-dropdown>
    </div>

    <!-- navigator-content -->
    <div
      class="main-navigator-content"
      :class="{dragging: isDrag}"
    >
      <b-button-toolbar
        key-nav
        class="px-2 py-1"
      >
        <!-- 마지막에 연 다이어그램 몇 개 (설정 > Recent spaces): 목록 위에 따로 있고, 목록의 자리도 그대로 남는다.
             누르면 연다. 이름 바꾸기, 메뉴, 끌기, Ctrl+클릭으로 고르기는 목록에서만 한다. -->
        <div
          v-if="recent.length"
          class="recent-list"
          role="group"
          aria-label="Recent spaces"
        >
          <div
            class="recent-title"
            aria-hidden="true"
          >
            Recent
          </div>
          <b-button
            v-for="item in recent"
            :id="`recent-item-${item.index}`"
            :key="`recent-${item.index}`"
            size="sm"
            block
            class="recent-item disable-transition"
            variant="white"
            @click="openItem(item, { type: $event.type })"
          >
            <span
              class="list-item-name"
              :title="item.name || null"
            >{{ item.name || '(untitled)' }}</span>
            <span
              v-if="terminalCounts.get(item.index)"
              class="list-item-terminals"
              :title="terminalCountText(terminalCounts.get(item.index))"
            >
              <b-icon
                icon="terminal"
                aria-hidden="true"
              />
              <span aria-hidden="true">{{ terminalCounts.get(item.index) }}</span>
              <span class="sr-only">{{ terminalCountText(terminalCounts.get(item.index)) }}</span>
            </span>
          </b-button>
        </div>
        <draggable
          v-model="items"
          class="list-container"
          :disabled="!isDraggable"
          filter=".ignore-dragging, input"
          :prevent-on-filter="false"
          ghost-class="ghost"
          @start="isDrag = true"
          @end="isDrag = false"
          @unchoose="unchoose"
        >
          <template
            v-for="item in items"
          >
            <b-button
              v-if="!item.isEditing"
              v-show="matches(item)"
              :id="`list-item-${item.index}`"
              :key="`button-${item.index}`"
              size="sm"
              block
              :pressed="item === openedItem"
              class="list-item disable-transition"
              :class="{'dropdown-shown': item.isMenuShown, 'selected': item.isSelected}"
              variant="white"
              @dblclick="editItem(item)"
              @click="openItem(item, $event)"
            >
              <span
                class="list-item-name"
                :title="item.name || null"
              >{{ item.name || '(untitled)' }}</span>
              <!-- 이 item에 떠 있는 터미널 탭 수 (다른 item을 열어도 계속 돈다) -->
              <span
                v-if="terminalCounts.get(item.index)"
                class="list-item-terminals"
                :title="terminalCountText(terminalCounts.get(item.index))"
              >
                <b-icon
                  icon="terminal"
                  aria-hidden="true"
                />
                <span aria-hidden="true">{{ terminalCounts.get(item.index) }}</span>
                <span class="sr-only">{{ terminalCountText(terminalCounts.get(item.index)) }}</span>
              </span>
              <div @click.stop>
                <NavigatorItemMenu
                  v-if="!isSelecting"
                  :name="item.name"
                  :terminals="terminalCounts.get(item.index) || 0"
                  @shown="item.isMenuShown = true"
                  @hidden="item.isMenuShown = false"
                  @edit="item.isMenuShown = false; editItem(item)"
                  @copy="item.isMenuShown = false; copyItem(item)"
                  @remove="item.isMenuShown = false; removeItem(item)"
                  @export="exportItems([item], rowFocus(item))"
                  @close-terminals="item.isMenuShown = false; closeTerminals(item)"
                />
              </div>
            </b-button>
            <b-form-input
              v-else
              :id="`list-item-${item.index}`"
              :key="`input-${item.index}`"
              v-model="item.name"
              :lazy="true"
              size="sm"
              type="text"
              class="list-item disable-transition flex-fill ignore-dragging editing"
              placeholder="(untitled)"
              @blur="item.isEditing = false;"
              @keydown.enter="item.isEditing = false;"
              @keydown.esc="cancelEdit(item, $event)"
              @keydown.stop
              @change="emitUpdated"
            />
          </template>
        </draggable>
        <!-- 보이는 항목이 없을 때: 목록이 비었거나 검색에 맞는 항목이 없다 -->
        <p
          v-if="emptyText"
          class="list-empty"
          role="status"
        >
          {{ emptyText }}
        </p>
      </b-button-toolbar>
    </div>
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import isEmpty from 'lodash/isEmpty'
import { hasSavedPassword, listEmptyText, matchesKeyword, EXPORT_PASSWORD_WARNING } from '@/utils/project'
import { countByOwner, sessionsOf } from '@/utils/terminal-sessions'
import { closeTerminalsQuestion, terminalCountText } from '@/utils/terminal-view'
import { copyNavigatorItem, createNavigatorItem, emptyItemData, nextOpened, recentItems, removeNavigatorItems, toProjectItems, SWITCHER_MENU_POPPER } from '@/utils/navigator-items'
import { diagramProblem } from '@/utils/diagram-data'
import { toastError } from '@/utils/notify'
import { UNSAVED_TEXT, UNSAVED_TITLE } from '../../../../shared/unsaved.js'
import NavigatorItemMenu from './navigator-item-menu'

// 목록의 메뉴에서 연 질문이 닫히면 키보드가 돌아갈 곳 (msgBoxConfirm의 returnFocus, 질문이 닫힐 때 찾는다). BootstrapVue는
// 질문을 열 때 포커스가 있던 메뉴 항목으로 돌려주는데, 닫힌 메뉴 안에 숨은 항목은 포커스를 받지 못해서 키보드가 아무 데도
// 없었고 Escape로 목록도 닫히지 않았다 (#279). 줄의 ... 메뉴의 질문은 그 줄로 (rowFocus: ... 단추는 마우스가 줄 위에 있을
// 때만 보인다), More actions의 질문은 그 단추로. 지운 줄은 없으니 그때는 전처럼 아무 데도 가지 않는다.
const MORE_ACTIONS_FOCUS = '#main-navigator [aria-label="More actions"]'

// 다이어그램(item) 목록: 고르기, 검색, 새로 만들기, 이름 바꾸기, 순서 바꾸기, 가져오기/내보내기.
// 헤더의 제목을 누르면 그 아래에 열리는 판(views/Layout.vue의 #diagram-switcher) 안에 있고, 닫혀 있어도 목록 상태는 여기에 남는다.
export default {
  name: 'MainNavigator',
  components: {
    draggable,
    NavigatorItemMenu
  },
  props: {
    projectData: {
      type: Array,
      default: () => []
    },
    isLocked: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      itemIndex: 0,
      isDraggable: true,
      isDrag: false,
      isEditing: false,
      keyword: '',
      items: [],
      openedItem: null,
      vcoConfig: {
        handler: this.onClickOutside,
        middleware: this.dropsSelection,
        isActive: true
      }
    }
  },
  computed: {
    emptyText() {
      return listEmptyText(this.items, this.keyword)
    },
    selectedItems() {
      return this.items.filter(x => x.isSelected)
    },
    // 목록 위에 따로 보이는, 마지막에 연 다이어그램들 (설정 > Recent spaces). 검색하는 동안에는 없다: 찾은 것만 보인다.
    recent() {
      if (!this.$store.getters.setting.showRecentSpaces || this.keyword) return []

      return recentItems(this.items, this.openedItem)
    },
    // item 번호(index) -> 떠 있는 터미널 탭 수
    terminalCounts() {
      return countByOwner(this.$store.getters.allTerminalSessions)
    },
    isSelecting() {
      return this.selectedItems.length > 0
    },
    openedItemIndex() {
      const foundIndex = this.items.findIndex(x => x === this.openedItem)
      return foundIndex !== -1 ? foundIndex : null
    }
  },
  watch: {
    keyword() {
      this.items.forEach(x => { x.isSelected = false })
    },
    items() {
      this.emitUpdated()
    }
  },
  created() {
    this.menuPopperOpts = SWITCHER_MENU_POPPER
    this.items = this.toNavigatorItems(this.projectData)
  },
  methods: {
    terminalCountText,
    // 판이 열리면 바로 찾을 수 있게 검색칸에 포커스를 준다.
    focusSearch() {
      this.$el.querySelector('.list-search input')?.focus()
    },
    unchoose(event) {
      setTimeout(() => {
        const { pageX, pageY } = event.originalEvent
        window.preload.requestWindowMouseMoveEvent({ x: pageX, y: pageY })
        event.item.focus()
      })
    },
    async openItem(item, event = {}) {
      if (event.ctrlKey) {
        this.vcoConfig.isActive = true
        item.isSelected = !item.isSelected
        return
      }

      this.vcoConfig.isActive = false
      this.items.forEach(x => { x.isSelected = false })

      if (this.openedItem !== item) {
        // 에디터가 통째로 읽지 못할 데이터(손으로 만들거나 고친 파일)는 열지 않는다 (utils/diagram-data.js). 열면 앞서 연
        // 다이어그램의 노드나 이 다이어그램의 일부만 캔버스에 남고, 잠글 때 그것이 이 항목에 저장된다. 아무것도 바꾸기 전에,
        // 저장하지 않은 변경을 버릴지 묻기도 전에 본다: 열려 있던 다이어그램과 그 터미널은 그대로다.
        const problem = diagramProblem(item.data)
        if (problem) {
          this.notifyError(`Cannot open "${item.name || '(untitled)'}"`, `${problem}\nNothing was changed.`)
          return
        }

        if (!this.isLocked && !isEmpty(event)) {
          if (!(await this.confirmUnlockedChangeWillBeLost())) {
            return
          }
        }

        this.openedItem = item
        const isMarked = this.markOpened(item)
        this.$emit('selected', { item, index: this.openedItemIndex, isLocked: !item.isEditing })
        // 연 차례를 저장하게 한다: 다음에 켤 때도 Recent가 같다
        if (isMarked) this.emitUpdated()
      } else if (!isEmpty(event)) {
        // 이미 열려 있는 항목을 눌렀다: 그대로 두고 목록만 닫는다.
        this.$emit('hide')
      }
    },
    // 연 차례를 남긴다 (목록 위의 Recent). 이미 가장 나중에 연 것이면 바뀌는 것이 없다 (false): 켜자마자 지난번의 다이어그램을
    // 다시 열 때가 그렇다. (0은 한 번도 열지 않은 것이다: 아무것도 연 적이 없는 목록에서도 처음 여는 것은 바뀐다)
    markOpened(item) {
      const next = nextOpened(this.items)
      if (item.opened > 0 && item.opened === next - 1) return false

      this.$set(item, 'opened', next)
      return true
    },
    async addNewItem() {
      if (!this.isLocked) {
        if (!(await this.confirmUnlockedChangeWillBeLost())) {
          return
        }
      }

      // 검색어에 맞지 않으면 새 항목이 목록에서 사라지므로 검색을 푼다.
      this.keyword = ''

      const newItem = createNavigatorItem({ name: '', data: emptyItemData() }, this.itemIndex++, { isEditing: true })

      this.items.unshift(newItem)
      this.openItem(newItem)

      this.$nextTick(() => this.focusNameBox(newItem))
    },
    // 열려 있는 이름 입력창에 포커스를 준다. 포커스를 받지 못하면 입력창을 닫는다.
    focusNameBox(item) {
      const element = document.querySelector('#main-navigator .main-navigator-content .list-item.editing')
      if (element) {
        element.focus()
        if (document.activeElement !== element) {
          item.isEditing = false
        }
      }
    },
    matches(item) {
      return matchesKeyword(item.name, this.keyword)
    },
    editItem(item) {
      item.isEditing = true

      this.$nextTick(() => {
        const element = document.querySelector(`#list-item-${item.index}`)
        element.focus()
      })
    },
    // 이름 변경을 취소한다. 입력값은 change 때만 이름에 반영되므로(lazy), 입력창을 닫기 전에 원래 값으로 되돌려 둔다.
    cancelEdit(item, event) {
      event.target.value = item.name
      item.isEditing = false
    },
    copyItem(item) {
      // 검색어에 맞지 않으면 새 항목이 목록에서 사라지므로 검색을 푼다.
      this.keyword = ''

      const newItem = copyNavigatorItem(item, this.itemIndex++)

      const foundIndex = this.items.findIndex(x => x === item)
      if (foundIndex !== -1) {
        this.items.splice(foundIndex + 1, 0, newItem)

        this.$nextTick(() => setTimeout(() => this.focusNameBox(newItem)))
      }
    },
    async removeItem(item) {
      if (!(await this.confirmRemove(`Remove "${item.name || '(untitled)'}"?`, this.rowFocus(item)))) {
        return
      }

      this.removeItems([item])
    },
    async removeSelectedItems() {
      if (!(await this.confirmRemove(`Remove ${this.selectedItems.length} selected space(s)?`, MORE_ACTIONS_FOCUS))) {
        return
      }

      this.removeItems(this.selectedItems)
    },
    // 항목을 목록에서 빼고, 열려 있던 항목이 빠지면 에디터를 닫는다.
    removeItems(removed) {
      const { items, openedRemoved } = removeNavigatorItems(this.items, removed, this.openedItem)
      if (openedRemoved) {
        this.openedItem = null
        this.$emit('deselected')
      }
      // 지워진 item의 터미널은 닫는다.
      this.$emit('removed', removed.map(x => x.index))
      this.items = items
    },
    // item의 터미널만 모두 닫고 item은 그대로 둔다 (owner, 2026-10-17: "터미널만 전부 끄는 기능"). 아직 도는 탭이 있으면
    // 먼저 묻는다 (utils/terminal-view.js의 closeTerminalsQuestion). 닫는 일은 패널이 한다 (Layout이 closeOwners를 부른다).
    async closeTerminals(item) {
      const question = closeTerminalsQuestion(item.name, sessionsOf(this.$store.getters.allTerminalSessions, item.index))
      if (question && !(await this.$bvModal.msgBoxConfirm(question, { title: 'Close terminals', okVariant: 'danger', okTitle: 'Close terminals', returnFocus: this.rowFocus(item) }))) {
        return
      }

      this.$emit('close-terminals', [item.index])
    },
    // returnFocus: 저장된 비밀번호를 묻는 질문이 닫히면 키보드가 갈 곳 (줄의 메뉴면 그 줄, More actions면 그 단추)
    async exportItems(items, returnFocus) {
      if (hasSavedPassword(items) && !(await this.$bvModal.msgBoxConfirm(EXPORT_PASSWORD_WARNING, { title: 'Export', okTitle: 'Export', returnFocus }))) {
        return
      }

      try {
        await window.preload.exportProjects(JSON.stringify(toProjectItems(items)), 'export.json')
      } catch (e) {
        console.error(e)
        this.notifyError('Failed to export', e)
      }
    },
    exportSelectedItems() {
      this.exportItems(this.selectedItems, MORE_ACTIONS_FOCUS)
    },
    async importItems() {
      if (!this.isLocked) {
        if (!(await this.confirmUnlockedChangeWillBeLost())) {
          return
        }
      }

      try {
        const projectData = await window.preload.importProjects()
        if (projectData) {
          this.items = this.items.concat(this.toNavigatorItems(JSON.parse(projectData)))
        }
      } catch (e) {
        console.error(e)
        this.notifyError('Failed to import', e)
      }
    },
    toNavigatorItems(items) {
      return items.map(x => createNavigatorItem(x, this.itemIndex++))
    },
    // 저장할 수 있게 부모(Layout)에 항목 목록을 알린다.
    emitUpdated() {
      this.$emit('updated', { items: toProjectItems(this.items), index: this.openedItemIndex })
    },
    updateItemEditorData({ data, index }) {
      // 에디터에 열린 item 정보 업데이트 시 외부에서 호출 후 정보 업데이트
      const updatedItem = this.items[index]
      if (updatedItem) {
        this.items[index].data = data
      }
    },
    updateItemView({ view, index }) {
      // 캔버스의 마지막 위치와 확대 상태를 item에 기억해 둔다.
      const item = this.items[index]
      if (item) {
        this.$set(item, 'view', view)
      }
    },
    onClickOutside() {
      this.items.forEach(x => { x.isSelected = false })
      this.vcoConfig.isActive = false
    },
    // 목록 밖의 이 클릭이 Ctrl로 고른 항목을 푸는가 (v-click-outside의 middleware: false면 onClickOutside를 부르지 않는다).
    // 목록이 묻는 질문(msgBoxConfirm: Remove spaces, Export spaces..., ...)은 body에 그려져서 그 단추도 목록 밖이다: 그 클릭은
    // 고른 것을 풀지 않는다. Cancel 뒤에도 고른 채로 남았다가 다시 물을 수 있다 (Escape로 닫을 때처럼, #282).
    dropsSelection(event) {
      return !event.target?.closest?.('.modal')
    },
    confirmRemove(message, returnFocus) {
      return this.$bvModal.msgBoxConfirm(message, {
        title: 'Remove',
        okVariant: 'danger',
        okTitle: 'Remove',
        returnFocus
      })
    },
    // 줄(item)의 ... 메뉴에서 연 질문이 닫히면 키보드가 갈 곳: 그 줄 (위의 MORE_ACTIONS_FOCUS)
    rowFocus(item) {
      return `#list-item-${item.index}`
    },
    notifyError(title, error) {
      toastError(this, title, error)
    },
    confirmUnlockedChangeWillBeLost() {
      // 제목은 다른 확인 창(Remove, Export)처럼 짧게 두고, 무엇을 잃는지는 본문에서 말한다.
      return this.$bvModal.msgBoxConfirm(`${UNSAVED_TEXT} Continue?`, {
        title: UNSAVED_TITLE,
        okTitle: 'Continue',
        returnFocus: '[id^=list-item-].active'
      })
    }
  }
}
</script>

<style lang="scss" scoped>
// 목록의 한 줄과 Recent의 한 줄이 같이 쓰는 모양
@mixin list-row {
  display: flex;
  justify-content: space-between;
  position: relative;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--js-text);
  font-family: var(--js-font-display);
  font-size: 1.45rem;
  letter-spacing: 0.05em;
  line-height: 1.1;
  text-transform: uppercase;

  &.btn-block + .btn-block {
    margin-top: 0;
  }
}

#main-navigator {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  scrollbar-width: thin;

  .main-navigator {
    &-header {
      display: flex;
      flex-direction: row;
      align-items: center;

      .btn-divider {
        height: 1.5em;
        display: inline-block;
        vertical-align: middle;
        border-left: 1px solid var(--js-border);
      }
    }

    &-content {
      flex-grow: 1;
      overflow-y: auto;

      .list-search {
        width: 100%;
      }

      .list-empty {
        width: 100%;
        margin: 6px 0 0;
        padding: 0 4px;
        color: var(--js-text-muted);
        font-size: 0.85rem;
      }

      // 마지막에 연 다이어그램들: 작은 제목과 줄들, 그 아래에 목록과 가르는 선
      .recent-list {
        width: 100%;
        margin-bottom: 4px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--js-border);
      }

      .recent-title {
        padding: 0 4px;
        color: var(--js-text-muted);
        font-family: var(--js-font-display);
        font-size: 1rem;
        letter-spacing: 0.1em;
        line-height: 1.2;
        text-transform: uppercase;
      }

      .recent-item {
        @include list-row;

        &.btn:hover {
          background-color: var(--js-hover);
        }

        &.btn:focus,
        &.btn:active:focus {
          outline: none;
          box-shadow: none;
        }

        &.btn:focus-visible {
          border: 1px solid var(--js-secondary);
        }
      }

      // 이름과 떠 있는 터미널 수: 목록의 줄에도 Recent의 줄에도 있다
      .list-item-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-align: left;
        text-overflow: ellipsis;
      }

      // 떠 있는 터미널 수: 작은 터미널 그림과 숫자. 색은 줄의 글자색을 따른다 (열린 항목의 분홍 띠 위에서도 읽힌다).
      .list-item-terminals {
        display: flex;
        flex: none;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        font-family: var(--js-font-mono);
        font-size: 0.8rem;
        letter-spacing: 0;

        svg {
          font-size: 0.95rem;
        }
      }

      .list-container {
        width: 100%;

        .list-item {
          @include list-row;

          &:hover:not(.editing),
          &.dropdown-shown {
            .list-item-dropdown {
              display: flex;
            }
          }

          // 메뉴가 열린 항목은 아래 항목들보다 위에 그린다. (항목이 position을 가지므로 메뉴가 뒤로 가려진다)
          &.dropdown-shown {
            z-index: 5;
            border: 1px solid var(--js-secondary);
          }

          &.btn:hover:not(.editing):not(.selected):not(.active) {
            background-color: var(--js-hover);
          }

          // 열려 있는 항목: 분홍 띠, 어두운 글자
          &.active {
            z-index: 0;
            background-color: transparent;
            color: var(--js-on-primary);

            // 열려 있는 항목은 분홍 띠로 이미 구분되므로 메뉴 테두리를 두지 않는다. (띠의 그림자에 걸려 어중간하게 보였다)
            // 테두리 두께는 그대로 두어 글자가 움직이지 않는다.
            &.dropdown-shown {
              z-index: 5;
              border-color: transparent;
            }

            &::before {
              content: '';
              position: absolute;
              inset: 1px 0;
              z-index: -1;
              background: var(--js-primary);
              box-shadow: 3px 3px 0 var(--js-shadow);
            }
          }

          // Ctrl+클릭으로 고른 항목: 옅은 바탕에 왼쪽 막대. 이웃한 선택 항목이 한 덩어리로 보이지 않도록
          // 테두리를 목록 판의 바탕색으로 칠해 1px씩 띄운다.
          // (포커스가 있어도 막대를 지우지 않도록 아래 :focus 규칙보다 구체적으로 쓴다)
          &.selected,
          &.selected.btn:focus {
            border-color: var(--js-bg-raised);
            background-color: var(--js-secondary-soft);
            box-shadow: inset 4px 0 0 var(--js-secondary);
          }

          &.ghost {
            box-shadow: inset 0 0 0 0.2rem rgb(0 123 255 / 25%);
          }

          // 마우스로 누른 뒤에는 테두리를 두지 않고, 키보드로 포커스가 온 항목과 이름 입력창만 표시한다.
          &.btn:focus,
          &.editing:focus,
          &.btn:active:focus {
            outline: none;
            box-shadow: none;
          }

          // 키보드로 포커스가 온 항목의 테두리는 outline이다: 항목이 그리는 모든 것 위에 그려진다 (#282). border였을 때는 열린
          // 항목에서 분홍 띠의 그림자가 그 오른쪽과 아래를 덮었고(띠는 항목 안의 z-index -1이라 항목의 border 위에 그려진다),
          // Ctrl로 고른 항목에서는 위의 바탕색 테두리 규칙이 이겨서 보이지 않았다. border의 자리(-1px)에 그려서 아무것도
          // 움직이지 않고, 키를 누르고 있는 동안(:active)에도 그대로다.
          &.btn:focus-visible,
          &.btn:focus-visible:active {
            outline: 1px solid var(--js-secondary);
            outline-offset: -1px;
          }

          &.editing:focus {
            border: 1px solid var(--js-secondary);
          }

          &.editing {
            border-color: var(--js-border);
            background-color: var(--js-bg);
            color: var(--js-text);
          }

          &-dropdown {
            width: 2em;
            display: none;
            ::v-deep {
              // 이름 줄(25.5px)보다 낮게: 높으면 마우스를 올릴 때마다 항목이 2px 커지고 아래 항목들이 밀렸다.
              button {
                height: 24px;
                padding: 0px;
                margin: 0px;

                svg {
                  vertical-align: text-top;
                }
              }
            }
          }
        }
      }
    }
  }
}

.disable-transition {
  transition: none !important;
}

/* 검색 칸 */
.list-search {
  flex: 1;
  width: auto;

  ::v-deep .input-group-text {
    padding-right: 4px;
    border-color: var(--js-border);
    border-right: 0;
    border-radius: 0;
    background-color: var(--js-bg);
    color: var(--js-text-muted);
  }

  ::v-deep .form-control {
    border-color: var(--js-border);
    border-left: 0;
    border-radius: 0;
    background-color: var(--js-bg);
    color: var(--js-text);

    &:focus {
      box-shadow: none;
    }
  }

  // 키보드로 검색칸에 오면 돋보기 칸과 함께 테두리가 청록으로 바뀐다. (다른 입력칸의 포커스 표시와 같다)
  &:focus-within {
    ::v-deep .input-group-text,
    ::v-deep .form-control {
      border-color: var(--js-secondary);
    }
  }
}
</style>

<template>
  <div
    id="main-navigator"
    v-click-outside="vcoConfig"
    class="shadow"
  >
    <!-- navigator-header -->
    <div class="main-navigator-header p-1 px-2 layout-divider ">
      <b-button
        size="sm"
        variant="light"
        aria-label="Close sidebar"
        @click="$emit('hide')"
      >
        <b-icon
          icon="x"
        />
      </b-button>

      <hr
        class="btn-divider my-0 mx-1 p-0"
      >

      <div class="ml-auto mr-auto" />

      <b-button
        size="sm"
        variant="light"
        aria-label="New item"
        title="New item"
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
          <small>New Item</small>
        </b-dropdown-item>
        <b-dropdown-item
          :disabled="!isSelecting"
          @click="removeSelectedItems"
        >
          <small>Remove Items</small>
        </b-dropdown-item>
        <b-dropdown-divider />
        <b-dropdown-item
          :disabled="isSelecting"
          @click="importItems"
        >
          <small>Import Items...</small>
        </b-dropdown-item>
        <b-dropdown-item
          :disabled="!isSelecting"
          @click="exportSelectedItems"
        >
          <small>Export Items...</small>
        </b-dropdown-item>
      </b-dropdown>
    </div>

    <!-- navigator-tool -->
    <div class="main-navigator-header p-1 px-2 layout-divider">
      <b-input-group
        size="sm"
        class="list-search py-1"
      >
        <b-input-group-prepend is-text>
          <b-icon
            icon="search"
          />
        </b-input-group-prepend>
        <b-form-input
          v-model="keyword"
          aria-label="Search items"
          :debounce="150"
          type="search"
        />
      </b-input-group>
    </div>

    <!-- navigator-content -->
    <div
      class="main-navigator-content layout-divider"
      :class="{dragging: isDrag}"
    >
      <b-button-toolbar
        key-nav
        class="px-2 py-1"
      >
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
              <!--
              <div class="list-item-dropdown ml-auto">
                <b-button

                  v-if="!isSelecting"
                  size="sm"
                  variant="white"
                  class="p-0"
                  @click="removeItem(item)"
                >
                  <b-icon
                    icon="dash"
                  />
                </b-button>
              </div>
              -->
              <div @click.stop>
                <b-dropdown
                  v-if="!isSelecting"
                  size="sm"
                  variant="outline-white"
                  :toggle-attrs="{ 'aria-label': `Menu for ${item.name || '(untitled)'}` }"
                  toggle-class="text-decoration-none"
                  right
                  no-caret
                  class="list-item-dropdown ignore-dragging"
                  @shown="item.isMenuShown = true"
                  @hidden="item.isMenuShown = false"
                >
                  <template #button-content>
                    <b-icon
                      icon="three-dots"
                    />
                  </template>
                  <b-dropdown-item
                    @click="
                      item.isMenuShown = false;
                      editItem(item)
                    "
                  >
                    <small>Edit</small>
                  </b-dropdown-item>
                  <b-dropdown-item
                    @click="
                      item.isMenuShown = false;
                      copyItem(item)
                    "
                  >
                    <small>Copy</small>
                  </b-dropdown-item>
                  <b-dropdown-item
                    @click="
                      item.isMenuShown = false;
                      removeItem(item)
                    "
                  >
                    <small>Remove</small>
                  </b-dropdown-item>
                  <b-dropdown-divider />
                  <b-dropdown-item
                    @click="exportItems([item])"
                  >
                    <small>Export</small>
                  </b-dropdown-item>
                </b-dropdown>
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

    <!-- navigator-footer -->
    <div
      class="main-navigator-footer p-1"
    />
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import cloneDeep from 'lodash/cloneDeep'
import isEmpty from 'lodash/isEmpty'
import { hasSavedPassword, listEmptyText, matchesKeyword, EXPORT_PASSWORD_WARNING } from '@/utils/project'
import { createNavigatorItem, emptyItemData, toProjectItems } from '@/utils/navigator-items'
import { toastError } from '@/utils/notify'

export default {
  name: 'MainNavigator',
  components: {
    draggable
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
    this.items = this.toNavigatorItems(this.projectData)
  },
  methods: {
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
        if (!this.isLocked && !isEmpty(event)) {
          if (!(await this.confirmUnlockedChangeWillBeLost())) {
            return
          }
        }

        this.openedItem = item
        this.$emit('selected', { item, index: this.openedItemIndex, isLocked: !item.isEditing })
      }
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

      const newItem = createNavigatorItem(
        { name: item.name, data: cloneDeep(item.data), view: item.view ? { ...item.view } : undefined },
        this.itemIndex++,
        { isEditing: true }
      )

      const foundIndex = this.items.findIndex(x => x === item)
      if (foundIndex !== -1) {
        this.items.splice(foundIndex + 1, 0, newItem)

        this.$nextTick(() => setTimeout(() => this.focusNameBox(newItem)))
      }
    },
    async removeItem(item) {
      if (!(await this.confirmRemove(`Remove "${item.name || '(untitled)'}"?`))) {
        return
      }

      if (this.openedItem === item) {
        this.openedItem = null
        this.$emit('deselected')
      }

      const foundIndex = this.items.findIndex((x) => x === item)
      if (foundIndex >= 0) {
        this.items.splice(foundIndex, 1)
      }
    },
    async removeSelectedItems() {
      if (!(await this.confirmRemove(`Remove ${this.selectedItems.length} selected item(s)?`))) {
        return
      }

      if (this.selectedItems.includes(this.openedItem)) {
        this.openedItem = null
        this.$emit('deselected')
      }

      this.items = this.items.filter(x => !x.isSelected)
    },
    async exportItems(items) {
      if (hasSavedPassword(items) && !(await this.$bvModal.msgBoxConfirm(EXPORT_PASSWORD_WARNING, { title: 'Export', okTitle: 'Export' }))) {
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
      this.exportItems(this.selectedItems)
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
    confirmRemove(message) {
      return this.$bvModal.msgBoxConfirm(message, {
        title: 'Remove',
        okVariant: 'danger',
        okTitle: 'Remove'
      })
    },
    notifyError(title, error) {
      toastError(this, title, error)
    },
    confirmUnlockedChangeWillBeLost() {
      return this.$bvModal.msgBoxConfirm('All unlocked changes will be lost', {
        title: 'Are you sure you want to continue?',
        okTitle: 'Continue',
        returnFocus: '[id^=list-item-].active'
      })
    }
  }
}
</script>

<style lang="scss" scoped>
#main-navigator {
  flex: 1;
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

      .list-container {
        width: 100%;

        .list-item {
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

            &.dropdown-shown {
              z-index: 5;
            }

            &::before {
              content: '';
              position: absolute;
              inset: 1px 0;
              z-index: -1;
              background: var(--js-primary);
              box-shadow: 3px 3px 0 #000;
            }
          }

          &.selected {
            background-color: var(--js-secondary-soft);
          }

          &.btn-block + .btn-block {
            margin-top: 0;
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

          &.btn:focus-visible,
          &.editing:focus {
            border: 1px solid var(--js-secondary);
          }

          &.editing {
            border-color: var(--js-border);
            background-color: var(--js-bg);
            color: var(--js-text);
          }

          &-name {
            overflow: hidden;
            white-space: nowrap;
            text-align: left;
            width: 90%;
            text-overflow: ellipsis;
          }

          &-dropdown {
            width: 2em;
            display: none;
            ::v-deep {
              button {
                height: 1.5em;
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
}
</style>

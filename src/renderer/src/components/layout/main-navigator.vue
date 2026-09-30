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
          :debounce="150"
          type="search"
        />
      </b-input-group>
    </div>

    <!-- navigator-content -->
    <div
      class="main-navigator-content layout-divider bg-white"
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
              @change="$emit('updated', {items: getProjectDataFromItems(items), index: openedItemIndex})"
            />
          </template>
        </draggable>
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
import { hasSavedPassword, matchesKeyword, EXPORT_PASSWORD_WARNING } from '@/utils/project'
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
      this.$emit('updated', { items: this.getProjectDataFromItems(this.items), index: this.openedItemIndex })
    }
  },
  created() {
    this.items = this.getNavigatorDataFromItems(this.projectData)
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

      const newItem = {
        index: this.itemIndex++,
        name: '',
        data: { id: 'test@0.1.0', nodes: {} },
        isMenuShown: false,
        isSelected: false,
        isEditing: true
      }

      this.items.unshift(newItem)
      this.openItem(newItem)

      this.$nextTick(() => {
        const element = document.querySelector('#main-navigator .main-navigator-content .list-item.editing')
        if (element) {
          element.focus()
          if (document.activeElement !== element) {
            newItem.isEditing = false
          }
        }
      })
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

      const newItem = {
        index: this.itemIndex++,
        name: item.name,
        data: cloneDeep(item.data),
        view: item.view ? { ...item.view } : undefined,
        isMenuShown: false,
        isSelected: false,
        isEditing: true
      }

      const foundIndex = this.items.findIndex(x => x === item)
      if (foundIndex !== -1) {
        this.items.splice(foundIndex + 1, 0, newItem)

        this.$nextTick(() => {
          setTimeout(() => {
            const element = document.querySelector('#main-navigator .main-navigator-content .list-item.editing')
            if (element) {
              element.focus()
              if (document.activeElement !== element) {
                newItem.isEditing = false
              }
            }
          })
        })
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
        await window.preload.exportProjects(JSON.stringify(this.getProjectDataFromItems(items)), 'export.json')
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
          this.items = this.items.concat(this.getNavigatorDataFromItems(JSON.parse(projectData)))
        }
      } catch (e) {
        console.error(e)
        this.notifyError('Failed to import', e)
      }
    },
    getNavigatorDataFromItems(items) {
      return items.map((x) => ({ ...x, isMenuShown: false, isSelected: false, isEditing: false, index: this.itemIndex++ }))
    },
    getProjectDataFromItems(items) {
      return items.map(x => ({ name: x.name, data: x.data, ...(x.view && { view: x.view }) }))
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
        border-left: 1px solid #e9ecef;
      }
    }

    &-content {
      flex-grow: 1;
      overflow-y: auto;

      .list-search {
        width: 100%;
      }

      .list-container {
        width: 100%;

        .list-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border: 1px solid white;

          &:hover:not(.editing),
          &.dropdown-shown {
            .list-item-dropdown {
              display: flex;
            }
          }

          &.dropdown-shown {
            border: 1px solid #80bdff;
          }

          &.active {
            font-weight: bold;
          }

          &.selected {
            background-color: rgb(128, 189, 255, 0.35);
          }

          &.btn-block + .btn-block {
            margin-top: 0;
          }

          &.ghost {
            box-shadow: inset 0 0 0 0.2rem rgb(0 123 255 / 25%);
          }

          &.btn:focus,
          &.editing:focus,
          &.btn:active:focus {
            outline: none;
            box-shadow: none;
            border: 1px solid #80bdff;
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

/* width */
::-webkit-scrollbar {
  width: 10px;
}

/* Track */
::-webkit-scrollbar-track {
  background: #f1f1f1;
}

/* Handle */
::-webkit-scrollbar-thumb {
  background: #888;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>

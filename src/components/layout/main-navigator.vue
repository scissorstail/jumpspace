<template>
  <div
    id="main-navigator"
    class="shadow"
  >
    <!-- navigator-header -->
    <div class="main-navigator-header p-1 px-2 layout-divider ">
      <b-button
        v-show="!isEditing"
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

      <hr
        class="btn-divider my-0 mx-1 p-0 ml-auto"
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
        <b-dropdown-item @click="newItem">
          <small>New Item</small>
        </b-dropdown-item>
        <b-dropdown-divider />
        <b-dropdown-item
          @click="$emit('import-items')"
        >
          <small>Add Item...</small>
        </b-dropdown-item>
      </b-dropdown>

      <!--
      <b-button
        v-show="isEditing"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        title="export items"
        class="mr-auto"
        variant="outline-info"
        :disabled="checkedItems.length === 0"
        @click="exportSelectedItems"
      >
        <v-icon
          height="15"
          name="file-export"
          scale="1"
          width="15"
        />
      </b-button>

      <b-button
        v-show="isEditing"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="shadow-sm mr-1"
        title="import items"
        variant="outline-primary"
        @click="$emit('import-items')"
      >
        <v-icon
          height="15"
          name="file-import"
          scale="1"
          width="15"
        />
      </b-button>

      <b-button
        v-show="isEditing"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="shadow-sm mr-1"
        title="add"
        variant="primary"
        @click="add"
      >
        <v-icon
          height="15"
          name="plus"
          scale="1"
          width="15"
        />
      </b-button>

      <b-button
        v-show="!isEditing"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="shadow-sm mr-1"
        title="open"
        variant="primary"
        @click="$emit('open-project')"
      >
        <v-icon
          height="15"
          name="folder-open"
          scale="1"
          width="15"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        :title="isEditing ? 'save' : 'edit'"
        :variant="isEditing ? 'warning' : 'light'"
        class="shadow-sm flex-grow-9"
        @click="toggleEditing"
      >
        <v-icon
          :name="isEditing ? 'save' : 'edit'"
          height="15"
          scale="1"
          style="width: 16px;"
          width="15"
        />
      </b-button>
      -->
    </div>

    <!-- navigator-tool -->
    <div class="main-navigator-header p-1 px-2 layout-divider">
      <b-input-group
        size="sm"
        class="list-search py-1"
      >
        <b-input-group-prepend is-text>
          <v-icon name="search" />
        </b-input-group-prepend>
        <b-form-input
          v-model="keyword"
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
          :disabled="false"
          filter=".ignore-dragging"
          ghost-class="ghost"
          @start="isDrag = true"
          @end="isDrag = false"
          @unchoose="unchoose"
        >
          <b-button
            v-for="item in items"
            v-show="!keyword || item.name.includes(keyword)"
            :key="`${_uid}-button-${item.index}`"
            size="sm"
            :pressed="item === selectedItem"
            block
            class="list-item disable-transition"
            :class="{'dropdown-shown': item.isMenuShown}"
            variant="white"
            @click="select(item, item.index)"
          >
            <span>{{ item.name + ' ' + item.index || '(untitled)' }}</span>
            <b-dropdown
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
              <b-dropdown-item @click="newItem">
                <small>Remove</small>
              </b-dropdown-item>
              <b-dropdown-item
                @click="exportSelectedItems"
              >
                <small>Export</small>
              </b-dropdown-item>
            </b-dropdown>
          </b-button>
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

export default {
  name: 'MainNavigator',
  components: {
    draggable
  },
  props: {
    projectData: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      isDrag: false,
      isEditing: false,
      keyword: '',
      items: [],
      checkedItems: [],
      selectedItem: null
    }
  },
  watch: {
    projectData() {
      this.selectedItem = null
      this.items = this.projectData.map((x, index) => ({ ...x, isMenuShown: false, isHover: false, index }))
    }
  },
  methods: {
    toggleEditing() {
      this.$emit('deselected')
      this.isEditing = !this.isEditing
      if (this.isEditing) {
        this.checkedItems = []
      } else {
        this.$emit('updated')
      }
    },
    select(item, index) {
      this.selectedItem = item
      this.$emit('selected', { item, index })
    },
    check(item, checked) {
      if (checked) {
        this.checkedItems.push(item)
      } else {
        this.checkedItems = this.checkedItems.filter(x => x !== item)
      }
    },
    unchoose(event) {
      setTimeout(() => {
        const { pageX, pageY } = event.originalEvent
        window.preload.requestWindowMouseMoveEvent({ x: pageX, y: pageY })
        event.item.focus()
      })
    },
    newItem() {
      // Open new item modal...

      // this.items.unshift({
      //   name: '',
      //   data: { id: 'test@0.1.0', nodes: {} }
      // })

      // setTimeout(() => {
      //   const element = document.querySelector('#main-navigator .main-navigator-content')
      //   element.scroll({ top: 0, behavior: 'smooth' })
      // }, 0)
    },
    remove(item) {
      const foundIndex = this.items.findIndex((x) => x === item)
      if (foundIndex >= 0) {
        this.items.splice(foundIndex, 1)
      }
    },
    scrollToTop() {
      setTimeout(() => {
        const element = document.querySelector('#main-navigator .main-navigator-content')
        element.scroll({ top: 0, behavior: 'smooth' })
      }, 0)
    },
    exportSelectedItems() {
      this.$emit('export-items', [...this.checkedItems])
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

          &:hover,
          &.dropdown-shown {
            background-color: #e9ecef;

            .list-item-dropdown {
              display: flex;
            }
          }

          &.active {
            background-color: #e9ecef;
            font-weight: bold;
          }

          &.btn-block + .btn-block {
            margin-top: 0;
          }

          &.ghost {
            background-color: #e9ecef;
            box-shadow: inset 0 0 0 0.2rem rgb(0 123 255 / 25%);
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

          &.btn:focus,
          &.btn:active:focus {
            outline: none;
            box-shadow: none;
            border: 1px solid #80bdff;
          }
        }
      }
    }
  }
}

.main-navigator-content.dragging {
  .sortable-chosen {
    -webkit-user-drag: none;
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

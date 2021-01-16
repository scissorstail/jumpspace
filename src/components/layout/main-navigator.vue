<template>
  <div id="main-navigator">
    <!-- navigator-header -->
    <div class="main-navigator-header p-3 shadow justify-content-end">
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
          height="14"
          name="file-export"
          scale="1"
          width="14"
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
          height="14"
          name="file-import"
          scale="1"
          width="14"
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
          height="14"
          name="plus"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-show="!isEditing"
        class="shadow-sm flex-grow-1 mr-1"
        variant="light"
        @click="$emit('hide')"
      >
        <v-icon
          height="14"
          name="times"
          scale="1"
          width="14"
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
          height="14"
          name="folder-open"
          scale="1"
          width="14"
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
          height="14"
          scale="1"
          style="width: 16px;"
          width="14"
        />
      </b-button>
    </div>

    <!-- navigator-content -->
    <div
      class="p-3 main-navigator-content"
    >
      <!-- 편집 모드 -->
      <draggable
        v-if="isEditing"
        v-model="items"
        v-bind="dragOptions"
        @start="drag = true"
        @end="drag = false"
      >
        <transition-group
          type="transition"
          :name="!drag ? 'flip-list' : null"
        >
          <div
            v-for="(item, index) in items"
            :key="`${_uid}-input-${index}`"
            class="list-item mt-1 editing"
          >
            <b-button
              variant="white"
              class="handle"
            >
              <v-icon
                class="handle-icon text-secondary"
                height="14"
                name="grip-vertical"
                scale="1"
                width="14"
              />
            </b-button>
            <b-form-checkbox
              size="lg"
              class="align-self-center"
              @change="check(item, $event)"
            />
            <b-form-input
              v-model="item.name"
              placeholder="(untitled)"
            />
            <b-button
              class="ml-1"
              variant="danger"
              @click="remove(item)"
            >
              <v-icon
                height="14"
                name="trash"
                scale="1"
                width="14"
              />
            </b-button>
          </div>
        </transition-group>
      </draggable>

      <!-- 기본 모드 -->
      <div v-else>
        <b-input-group
          size="sm"
          class="mb-2"
        >
          <b-input-group-prepend is-text>
            <v-icon name="search" />
          </b-input-group-prepend>
          <b-form-input
            v-model="keyword"
            type="search"
          />
        </b-input-group>

        <template
          v-for="(item, index) in items"
        >
          <b-button
            v-show="!keyword || item.name.includes(keyword)"
            :key="`${_uid}-button-${index}`"
            v-b-toggle="`collapse-${index}`"
            :pressed="item === selectedItem"
            block
            class="list-item mt-1"
            squared
            variant="white"
            @click="select(item, index)"
          >
            {{ item.name || '(untitled)' }}
          </b-button>
        <!--
        <b-collapse :id="`collapse-${index}`" :key="`${_uid}-collapse-${index}`">
          <b-card>I am collapsible content!</b-card>
        </b-collapse>
        -->
        </template>

        <b-button
          v-b-tooltip.hover.v-light.dh0.noninteractive
          class="position-absolute shadow-sm mr-1 opacity-3"
          title="top"
          variant="light"
          style="bottom: 14px; right: 14px"
          @click="scrollToTop"
        >
          <v-icon
            height="14"
            name="arrow-up"
            scale="1"
            width="14"
            color="gray"
          />
        </b-button>
      </div>
    </div>
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
      drag: false,
      isEditing: false,
      keyword: '',
      items: [],
      checkedItems: [],
      selectedItem: null
    }
  },
  computed: {
    dragOptions() {
      return {
        animation: 200,
        group: 'description',
        disabled: false,
        ghostClass: 'ghost',
        handle: '.handle'
      }
    }
  },
  watch: {
    projectData() {
      this.selectedItem = null
      this.items = this.projectData
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
    add() {
      this.items.push({
        name: '',
        data: { id: 'test@0.1.0', nodes: {} }
      })

      setTimeout(() => {
        const element = document.querySelector('#main-navigator .main-navigator-content')
        element.scroll({ top: element.scrollHeight, behavior: 'smooth' })
      }, 0)
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
  overflow-y: hidden;
  scrollbar-width: thin;
  flex: 1;

  .main-navigator {
    &-header {
      height: 70px;
      display: flex;
      flex-direction: row;
      background-color: #1d3557f0;
    }

    &-content {
      height: calc(100% - 70px);
      overflow-y: auto;

      .list-item {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;

        &:hover:not(.editing) {
          background-color: lightgrey;
        }
      }
    }
  }
}

.active {
  background-color: lightgrey;
}

.btn:focus,
.btn:active:focus {
  outline: none;
  box-shadow: none;
}

.sortable-chosen > .handle > .handle-icon {
  color: initial !important;
}

.ghost {
  opacity: 0;
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

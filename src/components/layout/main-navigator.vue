<template>
  <div id="main-navigator">
    <!-- navigator-header -->
    <div class="main-navigator-header p-3 shadow justify-content-end">
      <b-button
        v-show="isEditing"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        title="아이템 내보내기(준비중)"
        class="mr-auto"
        variant="outline-info"
        :disabled="checkedItems.length === 0"
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
        title="아이템 가져오기(준비중)"
        variant="outline-primary"
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

        class="shadow-sm mr-1"
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
        title="열기"
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
        :title="isEditing ? '저장' : '편집'"
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
    <div class="p-3 main-navigator-content">
      <template v-for="(item, index) in items">
        <b-button
          v-if="!isEditing"
          :key="`${_uid}-button-${index}`"
          v-b-toggle="`collapse-${index}`"
          :pressed="item === selectedItem"
          block
          class="list-item mt-1"
          squared
          variant="white"
          @click="select(item, index)"
        >
          {{ item.name || 'untitled' }}
        </b-button>
        <!--
        <b-collapse :id="`collapse-${index}`" :key="`${_uid}-collapse-${index}`">
          <b-card>I am collapsible content!</b-card>
        </b-collapse>
        -->
        <div
          v-else
          :key="`${_uid}-input-${index}`"
          class="list-item mt-1 editing"
        >
          <b-form-checkbox
            size="lg"
            class="align-self-center ml-2"
            @change="check(item, $event)"
          />
          <b-form-input
            v-model="item.name"
            placeholder="untitled"
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
      </template>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MainNavigator',
  props: {
    projectData: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      isEditing: false,
      items: [],
      checkedItems: [],
      selectedItem: null
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
    },
    remove(item) {
      const foundIndex = this.items.findIndex((x) => x === item)
      if (foundIndex >= 0) {
        this.items.splice(foundIndex, 1)
      }
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

<template>
  <div id="main-navigator">
    <!-- navigator-header -->
    <div class="main-navigator-header p-3 shadow">
      <b-button
        variant="light"
        @click="$emit('hide')"
        class="shadow-sm flex-grow-1 mr-1"
        :disabled="isEditing"
      >
        <v-icon name="times" height="14" width="14" scale="1" />
      </b-button>
      <b-button
        class="mr-1"
        variant="outline-info"
        @click="$emit('import-project')"
        :disabled="isEditing"
      >
        <v-icon name="file-export" height="14" width="14" scale="1" />
      </b-button>
      <b-button
        :variant="isEditing ? 'warning' : 'light'"
        @click="$emit('toggle-edit')"
        class="shadow-sm flex-grow-9"
      >
        <v-icon
          :name="isEditing ? 'save' : 'edit'"
          height="14"
          width="14"
          scale="1"
          style="width: 16px;"
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
          block
          variant="white"
          class="list-item mt-1"
          squared
          :pressed="item === selectedItem"
          @click="select(item, index)"
        >{{item.name || 'untitled'}}</b-button>
        <!--
        <b-collapse :id="`collapse-${index}`" :key="`${_uid}-collapse-${index}`">
          <b-card>I am collapsible content!</b-card>
        </b-collapse>
        -->
        <div v-else class="list-item mt-1" :key="`${_uid}-input-${index}`">
          <b-form-input v-model="item.name" placeholder="untitled"></b-form-input>
          <b-button @click="remove(item)" variant="danger" class="ml-1">
            <v-icon name="trash" height="14" width="14" scale="1" />
          </b-button>
        </div>
      </template>
      <b-button
        v-show="isEditing"
        @click="add"
        variant="primary"
        block
        class="shadow-sm flex-grow-1 mt-1"
      >
        <v-icon name="plus" height="14" width="14" scale="1" />
      </b-button>
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
    },
    isEditing: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      items: [],
      selectedItem: null
    }
  },
  watch: {
    projectData () {
      this.selectedItem = null
      this.items = this.projectData
    }
  },
  methods: {
    add () {
      this.items.push(
        {
          name: '',
          data: { id: 'test@0.1.0', nodes: {} }
        }
      )
    },
    select (item, index) {
      this.selectedItem = item
      this.$emit('selected', { item, index })
    },
    remove (item) {
      const foundIndex = this.items.findIndex(x => x === item)
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

          &:hover {
            background-color: lightgrey;
          }
        }
      }
    }
  }

  .active {
    background-color: lightgrey
  }

  .btn:focus, .btn:active:focus {
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

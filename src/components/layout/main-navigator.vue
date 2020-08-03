<template>
  <div id="main-navigator" class="p-3">
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
        @click="select(item)"
      >{{item.name || '제목없음'}}</b-button>
      <!--
      <b-collapse :id="`collapse-${index}`" :key="`${_uid}-collapse-${index}`">
        <b-card>I am collapsible content!</b-card>
      </b-collapse>
      -->
      <div v-else class="list-item mt-1" :key="`${_uid}-input-${index}`">
        <b-form-input v-model="item.name" placeholder="제목"></b-form-input>
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
      this.items = this.projectData
      console.log(this.items)
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
    select (item) {
      this.selectedItem = item
      this.$emit('selected', { ...item })
    },
    remove (item) {
      // if (confirm('remove?')) {
      this.items = this.items.filter(x => x !== item)
      // }
    }
  }
}
</script>

<style lang="scss" scoped>
  #main-navigator {
    overflow-y: auto;
    scrollbar-width: thin;
    flex: 1;
  }

  .active {
    background-color: lightgrey
  }

  .btn:focus, .btn:active:focus {
    outline: none;
    box-shadow: none;
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;

    &:hover {
      background-color: lightgrey;
    }
  }

  .sidebar {
    display: flex;
    flex-direction: column;
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

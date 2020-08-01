<template>
  <div id="main-navigator" class="p-3">
    <template v-for="(item, index) in items">
      <b-button
        :key="`${_uid}-button-${index}`"
        :v-b-toggle="`collapse-${index}`"
        block
        variant="white"
        class="list-item"
        squared
        size="lg"
      >
        {{item.title}}
        <span v-show="isEditing">
          <b-button @click="remove(item)" variant="danger" size="sm">
            <v-icon name="trash" height="14" width="14" scale="1" />
          </b-button>
        </span>
      </b-button>
      <b-collapse :id="`collapse-${index}`" :key="`${_uid}-collapse-${index}`">
        <b-card>I am collapsible content!</b-card>
      </b-collapse>
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
    isEditing: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      items: [
        {
          title: '테스트1'
        }
      ]
    }
  },
  methods: {
    add () {
      this.items.push(
        {
          title: '테스트1'
        }
      )
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
    background-color: #e6f0ff
  }

  .btn:focus, .btn:active:focus {
    outline: none;
    box-shadow: none;
  }

  .btn.list-item {
    display: flex;
    justify-content: space-between;
    height: 50px;
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

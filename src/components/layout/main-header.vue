<template>
  <div id="main-header" class="p-3">
    <slot name="main-navigation-toggle"></slot>

    <div class="align-self-center">
      <!-- left button -->
    </div>

    <div class="ml-auto align-self-center">
      <span class="mr-3">{{headerInfo.name || ''}}</span>

      <b-button class="mr-1" variant="outline-danger" @click="reload">
        <v-icon name="fire-extinguisher" height="14" width="14" scale="1" />
      </b-button>

      <b-button class="mr-1" variant="outline-warning" @click="toggleDevTools">
        <v-icon name="bug" height="14" width="14" scale="1" />
      </b-button>

      <b-button class="mr-1" variant="outline-info" @click="$emit('export')">
        <v-icon name="file-export" height="14" width="14" scale="1" />
      </b-button>

      <b-button class="mr-3" variant="light" @click="$emit('save')">
        <v-icon name="save" height="14" width="14" scale="1" />
      </b-button>

      <b-button class="mr-1" variant="primary" @click="$emit('setting')">
        <v-icon name="cog" height="14" width="14" scale="1" />
      </b-button>

      <b-button class variant="info" @click="$emit('info')">
        <v-icon name="info-circle" height="14" width="14" scale="1" />
      </b-button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MainHeader',
  props: {
    headerInfo: {
      type: Object,
      default: () => ({
        name: null
      })
    }
  },
  methods: {
    reload () {
      window.reloadApp()
    },
    toggleDevTools () {
      window.toggleDevTools()
    }
  }
}
</script>

<style lang="scss" scoped>
  #main-header {
    display: flex;
    background-color: #1d3557;
    padding: 10px;
    color: white;
    font-size: large;
  }
</style>

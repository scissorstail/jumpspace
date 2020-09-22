<template>
  <div
    id="main-header"
    class="p-3"
  >
    <slot name="main-navigation-toggle" />

    <div class="align-self-center">
      <!-- left button -->
    </div>

    <div class="ml-auto align-self-center">
      <span class="mr-3">{{ headerInfo.name || '' }}</span>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="mr-1"
        title="refresh"
        variant="outline-danger"
        @click="reload"
      >
        <v-icon
          height="14"
          name="fire-extinguisher"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="mr-1"
        title="devtools"
        variant="outline-warning"
        @click="toggleDevTools"
      >
        <v-icon
          height="14"
          name="bug"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class
        title="info"
        variant="outline-primary mr-1"
        @click="$emit('info')"
      >
        <v-icon
          height="14"
          name="info-circle"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="mr-1"
        title="export"
        variant="outline-info mr-3"
        @click="$emit('export')"
      >
        <v-icon
          height="14"
          name="archive"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="mr-3"
        title="save"
        variant="light"
        @click="$emit('save')"
      >
        <v-icon
          height="14"
          name="save"
          scale="1"
          width="14"
        />
      </b-button>

      <b-button
        v-b-tooltip.hover.v-light.dh0.noninteractive
        class="mr-1"
        title="setting"
        variant="primary"
        @click="$emit('setting')"
      >
        <v-icon
          height="14"
          name="cog"
          scale="1"
          width="14"
        />
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
    reload() {
      window.reloadApp()
    },
    toggleDevTools() {
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

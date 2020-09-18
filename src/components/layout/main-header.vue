<template>
  <div class="p-3" id="main-header">
    <slot name="main-navigation-toggle"></slot>

    <div class="align-self-center">
      <!-- left button -->
    </div>

    <div class="ml-auto align-self-center">
      <span class="mr-3">{{ headerInfo.name || '' }}</span>

      <b-button
        @click="reload"
        class="mr-1"
        title="새로고침"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        variant="outline-danger"
      >
        <v-icon height="14" name="fire-extinguisher" scale="1" width="14" />
      </b-button>

      <b-button
        @click="toggleDevTools"
        class="mr-1"
        title="디버그 콘솔"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        variant="outline-warning"
      >
        <v-icon height="14" name="bug" scale="1" width="14" />
      </b-button>

      <b-button
        @click="$emit('export')"
        class="mr-1"
        title="내보내기"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        variant="outline-info"
      >
        <v-icon height="14" name="file-export" scale="1" width="14" />
      </b-button>

      <b-button
        @click="$emit('save')"
        class="mr-3"
        title="저장"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        variant="light"
      >
        <v-icon height="14" name="save" scale="1" width="14" />
      </b-button>

      <b-button
        @click="$emit('setting')"
        class="mr-1"
        title="설정"
        v-b-tooltip.hover.v-light.dh0.noninteractive
        variant="primary"
      >
        <v-icon height="14" name="cog" scale="1" width="14" />
      </b-button>

      <b-button @click="$emit('info')" class title="정보" v-b-tooltip.hover.v-light.dh0.noninteractive variant="info">
        <v-icon height="14" name="info-circle" scale="1" width="14" />
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

<template>
  <div id="main-header" class="p-3">
    <slot name="main-navigation-toggle"></slot>
    <div class="ml-auto align-self-center">
      <span class="mr-3">{{headerInfo.name || ''}}</span>

      <b-button class="header-button shadow-sm" variant="light" @click="$emit('save')">
        <v-icon name="save" height="14" width="14" scale="1" />
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

<template>
  <div id="main-header" class="p-3">
    <slot name="main-navigation-toggle"></slot>
  </div>
</template>

<script>
export default {
  name: 'MainHeader'
}
</script>

<style lang="scss" scoped>
#main-header {
  display: flex;
  background-color: #1d3557;
  padding: 10px
}
</style>

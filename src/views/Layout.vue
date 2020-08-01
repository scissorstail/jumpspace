<template>
  <div id="layout">
    <MainHeader id="main-header"></MainHeader>
    <MainNavigator id="main-navigator"></MainNavigator>
    <div id="main-editor">
      <Editor></Editor>
    </div>
    <MainFooter id="main-footer"></MainFooter>
  </div>
</template>

<script>
import MainHeader from '../components/layout/main-header'
import MainNavigator from '../components/layout/main-navigator'
import MainFooter from '../components/layout/main-footer'
import Editor from '../components/editor/index'

export default {
  name: 'Layout',
  components: {
    MainHeader,
    MainNavigator,
    MainFooter,
    Editor
  }
}
</script>

<style lang="scss" scoped>
#layout {
  display: flex;
  width: 100%;
  height: 100%;
  margin: 0;
}
#main-header {
  display: flex;
  flex: 1;
  background-color: red
}
#main-navigator {
  display: flex;
  flex: 1;
  background-color: blue
}
#main-editor {
  display: flex;
  flex: 1;
  background-color: white
}
#main-footer {
  display: flex;
  flex: 1;
  background-color: green
}
</style>

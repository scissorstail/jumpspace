<template>
  <div id="layout">
    <MainHeader>
      <!-- sidebar-navigator toggle button -->
      <template #main-navigation-toggle>
        <b-button class="header-button shadow-sm" v-b-toggle.main-sidebar variant="info">
          <v-icon name="bars" height="14" width="14" scale="1" />
        </b-button>
      </template>
    </MainHeader>
    <div id="main-content">
      <!-- sidebar-navigator -->
      <b-sidebar id="main-sidebar" body-class="main-sidebar-list" shadow no-header>
        <template v-slot:default="{ hide }">
          <div class="main-sidebar-header p-3 shadow">
            <b-button variant="light" @click="hide" class="shadow-sm flex-grow-1 mr-1">
              <v-icon name="times" height="14" width="14" scale="1" />
            </b-button>
            <b-button
              :variant="isEditingItemList ? 'warning' : 'light'"
              @click="removeItem"
              class="shadow-sm flex-grow-9"
            >
              <v-icon
                :name="isEditingItemList ? 'save' : 'edit'"
                height="14"
                width="14"
                scale="1"
                style="width: 16px;"
              />
            </b-button>
          </div>
          <MainNavigator :is-editing="isEditingItemList"></MainNavigator>
        </template>
      </b-sidebar>
      <!--<Editor></Editor>-->
    </div>
    <!--
    <MainFooter id="main-footer"></MainFooter>
    -->
  </div>
</template>

<script>
import MainHeader from '../components/layout/main-header'
import MainNavigator from '../components/layout/main-navigator'
// import MainFooter from '../components/layout/main-footer'
// import Editor from '../components/editor/index'

export default {
  name: 'Layout',
  components: {
    MainHeader,
    MainNavigator
    // MainFooter,
    // Editor
  },
  data () {
    return {
      isEditingItemList: false
    }
  },
  methods: {
    removeItem () {
      this.isEditingItemList = !this.isEditingItemList
    }
  }
}
</script>

<style lang="scss">
#layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  margin: 0;
}
#main-content {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  background-color: #f1faee;

  #main-sidebar {

    .main-sidebar-list {
      display: flex;
      flex-direction: column;
    }

    .main-sidebar-header {
      display: flex;
      flex-direction: row;
    }
  }
}
#main-footer {
  display: flex;
  min-height: 100px;
  background-color: green;
}
</style>

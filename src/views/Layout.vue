<template>
  <div id="layout">
    <MainHeader
      :header-info="headerInfo"
      @save="saveProject"
      @export="exportProject"
      @info="isShowInfoPopup = true"
      @setting="isShowSettingPopup = true"
    >
      <!-- sidebar toggle -->
      <template #main-navigation-toggle>
        <b-button class="header-button shadow-sm" v-b-toggle.main-sidebar variant="info">
          <v-icon name="bars" height="14" width="14" scale="1" />
        </b-button>
      </template>
    </MainHeader>

    <div id="main-content">
      <!-- sidebar -->
      <b-sidebar id="main-sidebar" body-class="main-sidebar-list" shadow no-header>
        <template v-slot:default="{ hide }">
          <MainNavigator
            ref="mainNavigator"
            :project-data="projectData"
            :is-editing="isEditingItemList"
            @hide="hide"
            @selected="loadEditor"
            @toggle-edit="toggleEdit"
            @import-project="importProject"
          ></MainNavigator>
        </template>
      </b-sidebar>

      <!-- editor -->
      <Editor v-show="editorData" ref="editorRef" :editor-data="editorData"></Editor>
    </div>

    <!--
      <MainFooter id="main-footer"></MainFooter>
    -->

    <InfoPopup :show.sync="isShowInfoPopup" />

    <SettingPopup :show.sync="isShowSettingPopup" />
  </div>
</template>

<script>
import MainHeader from '../components/layout/main-header'
import MainNavigator from '../components/layout/main-navigator'
// import MainFooter from '../components/layout/main-footer'
import Editor from '../components/editor'
import InfoPopup from '../components/layout/popup/info-popup'
import SettingPopup from '../components/layout/popup/setting-popup'

export default {
  name: 'Layout',
  components: {
    MainHeader,
    MainNavigator,
    // MainFooter,
    Editor,
    InfoPopup,
    SettingPopup
  },
  data () {
    return {
      isEditingItemList: false,
      isShowInfoPopup: false,
      isShowSettingPopup: false,
      projectData: null,
      editorData: null,
      selectedIndex: null,
      headerInfo: {
        name: null
      }
    }
  },
  mounted () {
    const localSave = window.localStorage.projectSaveData
    if (localSave) {
      this.loadProject(localSave)
    }
  },
  methods: {
    loadEditor ({ item, index }) {
      this.editorData = JSON.stringify(item.data)
      this.selectedIndex = index
      this.headerInfo.name = item.name
    },
    clearEditor () {
      this.editorData = null
      this.selectedIndex = null
      this.headerInfo.name = null
    },
    async toggleEdit () {
      if (this.isEditingItemList) {
        this.projectData = [...this.$refs.mainNavigator.items]
        await this.saveProject()
      } else {
        await this.saveProject()
        this.clearEditor()
      }
      this.isEditingItemList = !this.isEditingItemList
    },
    async loadProject (projectSaveData) {
      if (projectSaveData) {
        this.projectData = JSON.parse(projectSaveData)
      } else {
        this.projectData = []
      }
    },
    async saveProject () {
      if (this.selectedIndex !== null) {
        this.$refs.editorRef.editor.nodes.forEach(x => x.controls.get('connection').save())
        this.projectData[this.selectedIndex] = {
          name: this.headerInfo.name,
          data: await this.$refs.editorRef.compile()
        }
      }
      window.localStorage.projectSaveData = JSON.stringify(this.projectData)
    },
    async exportProject () {
      await this.saveProject()
      window.saveProjectDataAsJSON(window.localStorage.projectSaveData)
    },
    async importProject () {
      const projectData = window.loadProjectDataFromJSON()
      if (projectData) {
        this.clearEditor()
        this.loadProject(projectData)
      }
    }
  }
}
</script>

<style lang="scss">
  @import '../../node_modules/bootstrap/dist/css/bootstrap.css';
  @import '../../node_modules/bootstrap-vue/dist/bootstrap-vue.css';

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
  }

  #main-sidebar {
    opacity: 0.9;

    .main-sidebar-list {
      display: flex;
      flex-direction: column;
    }
  }
</style>

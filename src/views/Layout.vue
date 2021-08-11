<template>
  <div id="layout">
    <MainHeader
      :header-info="headerInfo"
      @export="exportProject"
      @info="isShowInfoPopup = true"
      @save="saveProject"
      @setting="isShowSettingPopup = true"
    >
      <!-- sidebar toggle -->
      <template #main-navigation-toggle>
        <b-button
          v-b-toggle.main-sidebar
          size="sm"
          class=""
          variant="light"
        >
          <b-icon
            icon="list"
          />
        </b-button>
      </template>
    </MainHeader>

    <div id="main-content">
      <!-- sidebar -->
      <b-sidebar
        id="main-sidebar"
        body-class="main-sidebar-list"
        no-header
        shadow
      >
        <template v-slot:default="{ hide }">
          <MainNavigator
            ref="mainNavigator"
            :project-data="projectData"
            @hide="hide"
            @selected="loadEditor"
            @deselected="clearEditor"
            @updated="updateProject"
            @open-project="openProject"
            @export-items="exportItems"
            @import-items="importItems"
          />
        </template>
      </b-sidebar>

      <!-- editor -->
      <Editor
        v-show="editorData"
        ref="editorRef"
        :editor-data="editorData"
      />
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

/*

[구조 요약]

1. project는 여러개의 item을 가질 수 있다.
2. editor는 하나의 item을 표시할 수 있다.
3. item은 여러개의 node를 가질 수 있다.
4. node는 여러개의 control을 가질 수 있다. (현재는 ConnectionControl 1개만 사용)
5. control은 내부에 renderer를 가진다.

*/

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
  data() {
    return {
      isShowInfoPopup: false,
      isShowSettingPopup: false,
      projectData: null,
      editorData: null,
      selectedItemIndex: null,
      headerInfo: {
        name: null
      }
    }
  },
  mounted() {
    const localSave = window.localStorage.projectSaveData
    if (localSave) {
      this.loadProject(localSave)
    }
  },
  methods: {
    loadEditor({ item, index }) {
      this.editorData = JSON.stringify(item.data)
      this.selectedItemIndex = index
      this.headerInfo.name = item.name
    },
    clearEditor() {
      this.editorData = null
      this.selectedItemIndex = null
      this.headerInfo.name = null
    },
    async updateProject() {
      this.projectData = [...this.$refs.mainNavigator.items]
      await this.saveProject()
    },
    async loadProject(projectSaveData) {
      if (projectSaveData) {
        this.projectData = JSON.parse(projectSaveData)
        window.localStorage.projectSaveData = projectSaveData
      } else {
        this.projectData = []
      }
    },
    async saveProject() {
      if (this.selectedItemIndex !== null) {
        // editor가 표시중인 item이 가진 각 node의 control(ConnectionControl)의 내부 renderer가 가진 정보를 node에 저장
        this.$refs.editorRef.editor.nodes.forEach((x) =>
          x.controls.get('connection').save()
        )

        // editor가 표시중인 item이 가진 내용을 project의 해당 item에 저장
        this.projectData[this.selectedItemIndex] = {
          name: this.headerInfo.name,
          data: await this.$refs.editorRef.compile()
        }
      }

      // project를 JSON 형식으로 변환하여 localStorage에 저장
      window.localStorage.projectSaveData = JSON.stringify(this.projectData)
    },
    async exportProject() {
      await this.saveProject()
      window.preload.saveProjectDataAsJSON(window.localStorage.projectSaveData)
    },
    async openProject() {
      const projectData = window.preload.loadProjectDataFromJSON()
      if (projectData) {
        this.clearEditor()
        this.loadProject(projectData)
      }
    },
    exportItems(items) {
      try {
        window.preload.saveProjectDataAsJSON(JSON.stringify(items), '~/export.json')
      } catch (e) {
        console.error(e)
      }
    },
    importItems() {
      try {
        const projectData = JSON.parse(window.preload.loadProjectDataFromJSON())
        if (projectData) {
          this.projectData = this.projectData.concat(projectData)
        }
      } catch (e) {
        console.error(e)
      }
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

  .layout-divider {
    border-bottom: 1px solid #e9ecef;
  }
}

#main-content {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  background-color: #f1faee;
}

#main-sidebar {
  .main-sidebar-list {
    display: flex;
    flex-direction: column;
  }
}
</style>

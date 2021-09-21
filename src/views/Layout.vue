<template>
  <div id="layout">
    <MainHeader
      @export="exportProject"
      @info="isShowInfoPopup = true"
      @save="compileEditor().then(() => saveProject())"
      @setting="isShowSettingPopup = true"
      @lock="isEditorLocked = true"
      @unlock="isEditorLocked = false"
    >
      <!-- sidebar toggle -->
      <template #main-navigator-toggle>
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
      <template
        v-if="editorData"
        #main-navigator-toolbar
      >
        <!-- Editor Lock/Unlock button -->
        <b-button
          v-b-tooltip.hover.v-light.dh0.noninteractive
          size="sm"
          :title="isEditorLocked? 'locked' : 'unlocked'"
          variant="light"
          @click="isEditorLocked = !isEditorLocked"
        >
          <b-icon
            :icon="isEditorLocked? 'lock' : 'unlock'"
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
            v-if="projectData"
            ref="mainNavigator"
            :project-data="projectData"
            :is-locked="isEditorLocked"
            @hide="hide"
            @selected="loadEditor"
            @deselected="clearEditor"
            @updated="updateProject"
          />
        </template>
      </b-sidebar>

      <!-- editor -->
      <Editor
        ref="editorRef"
        :editor-data="editorData"
        :is-locked="isEditorLocked"
        :class="[!editorData && 'layout-inactive']"
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
      isEditorLocked: true,
      projectData: null,
      editorData: null,
      openedItemIndex: null
    }
  },
  watch: {
    async isEditorLocked() {
      this.$refs.editorRef.editor.trigger('readonly', this.isEditorLocked)

      if (this.isEditorLocked) {
        await this.compileEditor()
        this.saveProject()
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
    loadEditor({ item, index, isLocked }) {
      this.isEditorLocked = isLocked
      this.editorData = JSON.stringify(item.data)
      this.openedItemIndex = index

      // default
      this.$refs.editorRef.editor.view.area.zoom(0.85, 0, 0)
      this.$refs.editorRef.editor.view.area.translate(0, 0)

      const selectedItem = this.projectData[this.openedItemIndex]
      if (selectedItem) {
        window.preload.setWindowTitle(selectedItem.name)
      }
    },
    clearEditor() {
      this.isEditorLocked = true
      this.editorData = null
      this.openedItemIndex = null
    },
    async compileEditor() {
      // 현재 editor에 열려있는 item이 있으면
      if (this.openedItemIndex !== null) {
        // editor가 표시중인 item이 가진 각 node의 control(ConnectionControl)의 내부 renderer가 가진 정보를 node에 저장
        this.$refs.editorRef.editor.nodes.forEach((x) =>
          x.controls.get('connection').save()
        )

        // 현재 editor에 열려있는 내용을 projectData에 업데이트
        const selectedItem = this.projectData[this.openedItemIndex]
        if (selectedItem) {
          // editor에서 변경된 item의 내용 가져오기
          selectedItem.data = await this.$refs.editorRef.compile()

          // MainNavigator에 변경된 item의 editorData 전달
          this.$refs.mainNavigator.updateItemEditorData({ data: selectedItem.data, index: this.openedItemIndex })
        }
      }
    },
    updateProject({ items, index }) {
      this.projectData = [...items]
      this.openedItemIndex = index // 열려있는 item의 index 업데이트

      this.saveProject()
    },
    loadProject(projectSaveData) {
      if (projectSaveData) {
        this.projectData = JSON.parse(projectSaveData)
        window.localStorage.projectSaveData = projectSaveData
      } else {
        this.projectData = []
      }
    },
    saveProject() {
      // project를 JSON 형식으로 변환하여 localStorage에 저장
      window.localStorage.projectSaveData = JSON.stringify(this.projectData)
    },
    exportProject() {
      // project를 JSON 형식으로 변환하여 파일로 저장
      window.preload.saveProjectDataAsJSON(JSON.stringify(this.projectData))
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

  .layout-inactive {
    opacity: 0;
    pointer-events: none;
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

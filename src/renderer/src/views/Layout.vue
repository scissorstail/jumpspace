<template>
  <div id="layout">
    <MainHeader
      @export="exportProject"
      @info="isShowInfoPopup = true"
      @setting="isShowSettingPopup = true"
      @lock="isEditorLocked = true"
      @unlock="isEditorLocked = false"
    >
      <!-- sidebar toggle -->
      <template #main-navigator-toggle>
        <b-button
          v-b-toggle.main-sidebar
          size="sm"
          aria-label="Toggle sidebar"
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
          :title="isEditorLocked ? 'Unlock editor' : 'Lock editor'"
          :aria-label="isEditorLocked ? 'Unlock editor' : 'Lock editor'"
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
        <template #default="{ hide }">
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
        @view-change="updateView"
      />

      <!-- 열려 있는 item이 없을 때 -->
      <div
        v-if="!editorData"
        class="layout-empty"
      >
        Select an item in the sidebar, or add a new one.
      </div>
    </div>

    <InfoPopup :show.sync="isShowInfoPopup" />

    <SettingPopup :show.sync="isShowSettingPopup" />
  </div>
</template>

<script>
import MainHeader from '../components/layout/main-header'
import MainNavigator from '../components/layout/main-navigator'
import Editor from '../components/editor'
import InfoPopup from '../components/layout/popup/info-popup'
import SettingPopup from '../components/layout/popup/setting-popup'
import { hasSavedPassword, EXPORT_PASSWORD_WARNING } from '../utils/project'
import { toastError } from '../utils/notify'
import { DEFAULT_VIEW, sanitizeView } from '../utils/view'

/*

[구조 요약]

1. project는 여러개의 item을 가질 수 있다.
2. editor는 하나의 item을 표시할 수 있다.
3. item은 여러개의 node를 가질 수 있다.
4. node는 여러개의 control을 가질 수 있다. (현재는 ConnectionControl 1개만 사용)
5. control은 내부에 renderer를 가진다.

*/

export default {
  name: 'ViewLayout',
  components: {
    MainHeader,
    MainNavigator,
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
      openedItemIndex: null,
      isProjectLoadFailed: false
    }
  },
  computed: {
    // 열려 있는 item의 이름. 창 제목에 쓴다.
    openedItemName() {
      const item = this.openedItemIndex === null ? null : this.projectData?.[this.openedItemIndex]

      return item?.name || ''
    }
  },
  watch: {
    openedItemName(name) {
      window.preload.setWindowTitle(name)
    },
    async isEditorLocked() {
      this.$refs.editorRef.editor.trigger('readonly', this.isEditorLocked)

      if (this.isEditorLocked) {
        await this.compileEditor()
        this.saveProject()
      }
    }
  },
  created() {
    this.isRestoringView = false
    this.saveViewTimer = null
  },
  mounted() {
    this.loadProject()
  },
  beforeDestroy() {
    clearTimeout(this.saveViewTimer)
  },
  methods: {
    loadEditor({ item, index, isLocked }) {
      // If not use timestamp, the editor does not update its content while editorData is exactly same. ex) select copied item
      this.editorData = JSON.stringify({ ...item.data, timestamp: Date.now() })
      this.openedItemIndex = index
      this.isEditorLocked = isLocked // Call after update 'openedItemIndex'

      // 마지막으로 보던 위치와 확대 상태로 열고, 기록이 없으면 기본값을 쓴다.
      const view = sanitizeView(item.view) || DEFAULT_VIEW
      const area = this.$refs.editorRef.editor.view.area
      this.isRestoringView = true // 복원하면서 생기는 변경은 다시 저장하지 않는다
      area.zoom(view.k, 0, 0)
      area.translate(view.x, view.y)
      this.isRestoringView = false
    },
    // 캔버스를 옮기거나 확대/축소했을 때. 열려 있는 item에 기억해 두고, 잠시 뒤에 저장한다.
    updateView(view) {
      const item = this.isRestoringView || this.openedItemIndex === null ? null : this.projectData?.[this.openedItemIndex]
      if (!item) {
        return
      }

      item.view = view
      this.$refs.mainNavigator?.updateItemView({ view, index: this.openedItemIndex })

      clearTimeout(this.saveViewTimer)
      this.saveViewTimer = setTimeout(() => this.saveProject(), 400)
    },
    clearEditor() {
      this.editorData = null
      this.openedItemIndex = null
      this.isEditorLocked = true // Call after update 'openedItemIndex'
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
    async loadProject() {
      let json = null

      try {
        json = await window.preload.loadProjects()

        // 이전 버전은 localStorage에 저장했다. 저장 파일이 아직 없으면 최초 1회 옮겨온다. (localStorage는 지우지 않는다)
        const legacy = window.localStorage.projectSaveData
        if (json === null && legacy) {
          await window.preload.saveProjects(legacy)
          json = legacy
        }
      } catch (e) {
        console.error(e)
        // 읽기에 실패한 상태에서 저장하면 기존 데이터를 빈 목록으로 덮어쓰게 되므로 저장을 막는다.
        this.isProjectLoadFailed = true
        this.notifyError('Failed to load projects. Changes will not be saved.', e)
      }

      this.projectData = JSON.parse(json || '[]')
    },
    async saveProject() {
      if (this.isProjectLoadFailed) {
        return
      }

      // project를 JSON 형식으로 변환하여 파일에 저장
      try {
        await window.preload.saveProjects(JSON.stringify(this.projectData))
      } catch (e) {
        console.error(e)
        this.notifyError('Failed to save projects', e)
      }
    },
    async exportProject() {
      if (hasSavedPassword(this.projectData) && !(await this.$bvModal.msgBoxConfirm(EXPORT_PASSWORD_WARNING, { title: 'Export', okTitle: 'Export' }))) {
        return
      }

      // project를 JSON 형식으로 변환하여 파일로 저장
      try {
        await window.preload.exportProjects(JSON.stringify(this.projectData), 'jumpspace.json')
      } catch (e) {
        console.error(e)
        this.notifyError('Failed to export', e)
      }
    },
    notifyError(title, error) {
      toastError(this, title, error)
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
  position: relative;
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  background-color: #eee;
}

.layout-empty {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #495057;
  pointer-events: none;
}

#main-sidebar {
  .main-sidebar-list {
    display: flex;
    flex-direction: column;
  }
}
</style>

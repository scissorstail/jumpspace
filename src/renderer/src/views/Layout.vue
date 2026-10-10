<template>
  <div id="layout">
    <MainHeader
      :title="openedItemName"
      :is-switcher-open="isSwitcherOpen"
      @switcher="toggleSwitcher"
      @export="exportProject"
      @info="isShowInfoPopup = true"
      @setting="isShowSettingPopup = true"
      @lock="isEditorLocked = true"
      @unlock="isEditorLocked = false"
    >
      <template #main-navigator-toolbar>
        <!-- 숨긴 터미널 패널 다시 열기 -->
        <b-button
          v-if="terminalCount > 0 && !isTerminalPanelOpen"
          size="sm"
          variant="light"
          :aria-label="`Show terminals (${terminalCount})`"
          :title="`Show terminals (${terminalCount})`"
          @click="$store.commit('terminalPanel', true)"
        >
          <b-icon icon="terminal" />
          <b-badge
            variant="primary"
            pill
            class="ml-1"
          >
            {{ terminalCount }}
          </b-badge>
        </b-button>
        <!-- 노드의 접속 정보 숨기기/보이기 (이름은 남는다). 화면을 보여줄 때 쓴다. -->
        <b-button
          v-if="editorData"
          size="sm"
          variant="light"
          :title="hideNodeInfo ? 'Show node details' : 'Mask node details with *** (names stay)'"
          :aria-label="hideNodeInfo ? 'Show node details' : 'Hide node details'"
          :pressed="hideNodeInfo"
          @click="toggleNodeInfo"
        >
          <b-icon :icon="hideNodeInfo ? 'eye-slash' : 'eye'" />
        </b-button>
        <!-- Editor Lock/Unlock button (다른 머리글 단추처럼 기본 title을 쓴다. b-tooltip은 누른 뒤에도 남아 있었다) -->
        <b-button
          v-if="editorData"
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
        <!-- 잠금을 풀었을 때만: 보기 초기화, 노드 정렬 -->
        <template v-if="editorData && !isEditorLocked">
          <b-button
            size="sm"
            title="Reset view"
            aria-label="Reset view"
            variant="light"
            @click="resetView"
          >
            <b-icon icon="arrow-counterclockwise" />
          </b-button>
          <b-button
            size="sm"
            title="Arrange nodes"
            aria-label="Arrange nodes"
            variant="light"
            :disabled="nodeCount === 0"
            @click="arrangeNodes"
          >
            <b-icon icon="diagram-3" />
          </b-button>
        </template>
      </template>
    </MainHeader>

    <div id="main-content">
      <!-- 다이어그램 목록: 헤더의 제목을 누르면 그 아래에 잠깐 열리고, 고르면 닫힌다. 캔버스와 터미널의 자리는 줄지 않는다.
           닫혀 있어도 목록(MainNavigator)은 그대로 있다: item의 상태를 갖고 있기 때문이다. -->
      <div
        v-show="isSwitcherOpen"
        class="diagram-switcher-backdrop"
        @mousedown="closeSwitcher()"
      />
      <div
        v-show="isSwitcherOpen"
        id="diagram-switcher"
        role="dialog"
        aria-label="Diagrams"
        @keydown.esc="closeSwitcher({ returnFocus: true })"
      >
        <MainNavigator
          v-if="projectData"
          ref="mainNavigator"
          :project-data="projectData"
          :is-locked="isEditorLocked"
          @hide="closeSwitcher()"
          @selected="loadEditor"
          @deselected="clearEditor"
          @removed="$refs.terminalPanel.closeOwners($event)"
          @updated="updateProject"
        />
      </div>

      <div id="workspace">
        <div
          id="editor-area"
          :class="[`backdrop-${backdrop}`, nodeBlur > 0 && 'node-glass']"
          :style="{ '--node-blur': `${nodeBlur}px` }"
        >
          <!-- 배경 풍경: 밤하늘, 별, 줄무늬 해, 도시, 네온 격자 바닥 (장식) -->
          <SceneBackdrop :backdrop="backdrop" />

          <!-- editor -->
          <Editor
            ref="editorRef"
            :editor-data="editorData"
            :is-locked="isEditorLocked"
            :class="[!editorData && 'layout-inactive']"
            @view-change="updateView"
            @node-count="nodeCount = $event"
          />

          <!-- 열려 있는 item이 없거나, 열린 item에 노드가 없을 때의 안내 (우클릭은 그대로 캔버스로 간다) -->
          <div
            v-if="emptyHint"
            class="layout-empty"
          >
            <div class="layout-empty-title">
              {{ emptyHint.title }}
            </div>
            <div class="layout-empty-text">
              {{ emptyHint.text }}
            </div>
          </div>
        </div>

        <!-- 앱 안의 터미널 -->
        <TerminalPanel ref="terminalPanel" />
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
import TerminalPanel from '../components/terminal/terminal-panel'
import SceneBackdrop from '../components/layout/scene-backdrop'
import { canvasHint, hasSavedPassword, loadProjectData, EXPORT_PASSWORD_WARNING } from '../utils/project'
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
    SettingPopup,
    TerminalPanel,
    SceneBackdrop
  },
  data() {
    return {
      isShowInfoPopup: false,
      isShowSettingPopup: false,
      isEditorLocked: true,
      projectData: null,
      editorData: null,
      openedItemIndex: null,
      // 열린 다이어그램의 노드 수 (Editor가 알린다). 0이면 노드를 더하는 방법을 안내한다.
      nodeCount: 0,
      isProjectLoadFailed: false,
      // 제목 아래의 다이어그램 목록이 열려 있는지
      isSwitcherOpen: false
    }
  },
  computed: {
    // 배경 풍경의 효과 (설정 > Background)
    backdrop() {
      return this.$store.getters.setting.backdrop
    },
    // 노드 뒤 유리판의 흐림(px), 0이면 없음 (설정 > Node glass)
    hideNodeInfo() {
      return this.$store.getters.setting.hideNodeInfo
    },
    nodeBlur() {
      return this.$store.getters.setting.nodeBlur
    },
    terminalCount() {
      return this.$store.getters.terminalSessions.length
    },
    isTerminalPanelOpen() {
      return this.$store.getters.isTerminalPanelOpen
    },
    emptyHint() {
      return canvasHint({ isOpen: !!this.editorData, nodeCount: this.nodeCount, isLocked: this.isEditorLocked })
    },
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
      // 터미널은 item의 것이다: 이 item이 연 탭만 보이게 한다. (item.index는 목록 항목의 번호)
      this.$store.commit('terminalOwner', item.index)
      // 고르면 목록을 닫는다. 새 항목은 이름을 쓰는 중이므로(isLocked가 false) 열어 둔다.
      if (isLocked) this.closeSwitcher()

      // 마지막으로 보던 위치와 확대 상태로 열고, 기록이 없으면 기본값을 쓴다.
      const view = sanitizeView(item.view) || DEFAULT_VIEW
      this.isRestoringView = true // 복원하면서 생기는 변경은 다시 저장하지 않는다
      this.$refs.editorRef.openView(view)
      this.isRestoringView = false
    },
    toggleNodeInfo() {
      this.$store.dispatch('settingSave', { ...this.$store.getters.setting, hideNodeInfo: !this.hideNodeInfo })
    },
    // 처음 보기(기본 확대, 원점)로 돌린다. 바뀐 보기는 저장된다.
    resetView() {
      this.$refs.editorRef.setView(DEFAULT_VIEW)
    },
    arrangeNodes() {
      this.$refs.editorRef.arrangeNodes()
    },
    toggleSwitcher() {
      if (this.isSwitcherOpen) {
        this.closeSwitcher()
      } else {
        this.openSwitcher()
      }
    },
    openSwitcher() {
      this.isSwitcherOpen = true
      this.$nextTick(() => this.$refs.mainNavigator?.focusSearch())
    },
    // Escape로 닫았을 때는 포커스를 제목 단추로 돌려준다.
    closeSwitcher({ returnFocus = false } = {}) {
      this.isSwitcherOpen = false
      if (returnFocus) document.getElementById('diagram-switcher-toggle')?.focus()
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
      this.$store.commit('terminalOwner', null)
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
      const { items, failed, error } = await loadProjectData({
        load: () => window.preload.loadProjects(),
        save: json => window.preload.saveProjects(json),
        legacy: window.localStorage.projectSaveData
      })

      if (failed) {
        console.error(error)
        // 읽기에 실패한 상태에서 저장하면 기존 데이터를 빈 목록으로 덮어쓰게 되므로 저장을 막는다.
        this.isProjectLoadFailed = true
        this.notifyError('Failed to load projects. Changes will not be saved.', error)
      }

      this.projectData = items
      // 처음에는 열린 다이어그램이 없다. 고를 수 있게 목록부터 보여준다.
      this.openSwitcher()
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
    border-bottom: 1px solid var(--js-border);
  }

  .layout-inactive {
    opacity: 0;
    pointer-events: none;
  }
}

#workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

#editor-area {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--js-bg);

  // 편집기는 풍경 위에 놓는다.
  > #rete,
  > .layout-empty {
    z-index: 1;
  }
}

#main-content {
  position: relative;
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  background-color: var(--js-bg);
}

.layout-empty {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 0 16px;
  color: var(--js-text);
  text-align: center;
  pointer-events: none;

}

.layout-empty-title {
  padding: 2px 20px;
  background: var(--js-bg);
  border: 3px solid var(--js-secondary);
  box-shadow: 6px 6px 0 var(--js-primary);
  color: var(--js-sun);
  font-family: var(--js-font-display);
  font-size: 2.6rem;
  letter-spacing: 0.08em;
  line-height: 1.1;
  text-transform: uppercase;
}

.layout-empty-text {
  margin-top: 18px;
  padding: 0 8px;
  background: var(--js-bg);
  font-family: var(--js-font-display);
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

// 목록 밖을 누르면 닫는다. 보이지 않는 막이 창 전체를 덮는다 (제목 단추도 덮으므로 제목을 다시 눌러도 닫힌다).
.diagram-switcher-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1020;
}

// 제목 아래에 매달린 판. 목록이 길면 판 안에서 넘긴다.
#diagram-switcher {
  position: absolute;
  top: 10px;
  right: 0;
  left: 0;
  z-index: 1021;
  display: flex;
  flex-direction: column;
  width: 380px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 26px);
  margin: 0 auto;
  border: 3px solid var(--js-primary);
  background-color: var(--js-bg-raised);
  box-shadow: 6px 6px 0 #000;
  color: var(--js-text);
}
</style>

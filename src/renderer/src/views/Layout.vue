<template>
  <div id="layout">
    <MainHeader
      :title="openedItemName"
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
        <!-- Editor Lock/Unlock button -->
        <b-button
          v-if="editorData"
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

      <div id="workspace">
        <div
          id="editor-area"
          :class="`backdrop-${backdrop}`"
        >
          <!-- 배경 풍경: 밤하늘, 별, 줄무늬 해, 도시, 네온 격자 바닥 (장식) -->
          <div
            class="scene"
            :class="`scene-${backdrop}`"
            aria-hidden="true"
          >
            <div class="scene-art">
              <div class="scene-stars" />
              <div class="scene-sun" />
              <div class="scene-city" />
              <div class="scene-floor" />
            </div>
            <div class="scene-fx" />
          </div>

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
            <div class="layout-empty-title">
              No diagram open
            </div>
            <div class="layout-empty-text">
              Select an item in the sidebar, or add a new one.
            </div>
          </div>
        </div>

        <!-- 앱 안의 터미널 -->
        <TerminalPanel />
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
    SettingPopup,
    TerminalPanel
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
    // 배경 풍경의 효과 (설정 > Background)
    backdrop() {
      return this.$store.getters.setting.backdrop
    },
    terminalCount() {
      return this.$store.getters.terminalSessions.length
    },
    isTerminalPanelOpen() {
      return this.$store.getters.isTerminalPanelOpen
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

// ---- 배경 풍경 (신스웨이브 밤) ----
// 모두 흐림 없는 단색 면이다. 해는 지평선에서 잘리고, 건물은 해 앞에 선다.
.scene {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  // 지평선: 위는 하늘, 아래는 바닥
  --horizon: 70%;
}

// 풍경 그림 (하늘 띠와 그 위의 별, 해, 도시, 바닥). 배경 효과는 이 층에만 필터를 건다.
.scene-art {
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--js-bg) 0 42%, var(--js-sky-2) 42% var(--horizon), var(--js-bg) var(--horizon));
}

// 그림 위에 덮는 층 (비네트, 안개, 주사선)
.scene-fx {
  position: absolute;
  inset: 0;
}

.scene-stars {
  position: absolute;
  inset: 0 0 calc(100% - var(--horizon)) 0;
  background-image:
    radial-gradient(1.5px 1.5px at 8% 12%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 23% 30%, #fff 98%, transparent),
    radial-gradient(2px 2px at 37% 8%, var(--js-secondary) 98%, transparent),
    radial-gradient(1.5px 1.5px at 52% 22%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 66% 6%, #fff 98%, transparent),
    radial-gradient(2px 2px at 78% 26%, var(--js-primary) 98%, transparent),
    radial-gradient(1.5px 1.5px at 91% 14%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 15% 44%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 84% 46%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 44% 40%, #fff 98%, transparent);
  opacity: 0.8;
}

// 해: 위는 노랑, 아래는 분홍, 아래쪽 절반에 가로 줄이 빠진 원. 지평선 아래(원의 20%)는 잘라낸다.
.scene-sun {
  position: absolute;
  left: 50%;
  bottom: calc(100% - var(--horizon));
  height: min(300px, 48%);
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(var(--js-sun) 0 42%, var(--js-primary) 42%);
  transform: translate(-50%, 20%);
  clip-path: inset(0 0 20% 0);
  -webkit-mask-image: linear-gradient(#000 0 48%, transparent 48% 51%, #000 51% 58%, transparent 58% 62%, #000 62% 67%, transparent 67% 72%, #000 72% 76%, transparent 76%);
  mask-image: linear-gradient(#000 0 48%, transparent 48% 51%, #000 51% 58%, transparent 58% 62%, #000 62% 67%, transparent 67% 72%, #000 72% 76%, transparent 76%);
}

// 도시: 지평선에 붙은 픽셀 건물들
.scene-city {
  position: absolute;
  right: 0;
  bottom: calc(100% - var(--horizon));
  left: 0;
  height: 80px;
  background: var(--js-city);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='80' shape-rendering='crispEdges'%3E%3Crect x='0' y='52' width='22' height='28'/%3E%3Crect x='24' y='60' width='14' height='20'/%3E%3Crect x='42' y='44' width='14' height='36'/%3E%3Crect x='60' y='28' width='14' height='52'/%3E%3Crect x='74' y='60' width='14' height='20'/%3E%3Crect x='90' y='60' width='26' height='20'/%3E%3Crect x='116' y='28' width='14' height='52'/%3E%3Crect x='132' y='8' width='14' height='72'/%3E%3Crect x='150' y='52' width='14' height='28'/%3E%3Crect x='168' y='60' width='30' height='20'/%3E%3Crect x='202' y='36' width='30' height='44'/%3E%3Crect x='232' y='60' width='18' height='20'/%3E%3Crect x='254' y='44' width='18' height='36'/%3E%3Crect x='274' y='28' width='18' height='52'/%3E%3Crect x='292' y='44' width='30' height='36'/%3E%3Crect x='326' y='60' width='18' height='20'/%3E%3Crect x='348' y='20' width='30' height='60'/%3E%3Crect x='378' y='60' width='22' height='20'/%3E%3C/svg%3E") repeat-x left bottom / 400px 80px;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='80' shape-rendering='crispEdges'%3E%3Crect x='0' y='52' width='22' height='28'/%3E%3Crect x='24' y='60' width='14' height='20'/%3E%3Crect x='42' y='44' width='14' height='36'/%3E%3Crect x='60' y='28' width='14' height='52'/%3E%3Crect x='74' y='60' width='14' height='20'/%3E%3Crect x='90' y='60' width='26' height='20'/%3E%3Crect x='116' y='28' width='14' height='52'/%3E%3Crect x='132' y='8' width='14' height='72'/%3E%3Crect x='150' y='52' width='14' height='28'/%3E%3Crect x='168' y='60' width='30' height='20'/%3E%3Crect x='202' y='36' width='30' height='44'/%3E%3Crect x='232' y='60' width='18' height='20'/%3E%3Crect x='254' y='44' width='18' height='36'/%3E%3Crect x='274' y='28' width='18' height='52'/%3E%3Crect x='292' y='44' width='30' height='36'/%3E%3Crect x='326' y='60' width='18' height='20'/%3E%3Crect x='348' y='20' width='30' height='60'/%3E%3Crect x='378' y='60' width='22' height='20'/%3E%3C/svg%3E") repeat-x left bottom / 400px 80px;
}

// 바닥: 원근이 있는 네온 격자
.scene-floor {
  position: absolute;
  top: var(--horizon);
  left: -50%;
  width: 200%;
  height: 120%;
  border-top: 2px solid var(--js-grid);
  background-image:
    linear-gradient(90deg, var(--js-grid) 2px, transparent 2px),
    linear-gradient(var(--js-grid) 2px, transparent 2px);
  background-size: 72px 72px;
  background-position: center top;
  opacity: 0.75;
  transform: perspective(260px) rotateX(64deg);
  transform-origin: top;
}

// ---- 배경 효과 (설정 > Background). 노드와 글자에는 걸지 않고 풍경에만 건다. ----
$vignette: radial-gradient(ellipse 75% 70% at 50% 42%, transparent 45%, rgba(0, 0, 0, 0.6) 100%);

// Vivid: 풍경 그대로
// Soft: 풍경을 바탕색 쪽으로 옅게 하고(밝기를 낮추면 노랑이 탁해진다), 가장자리를 가라앉힌다.
.scene-soft {
  .scene-art {
    opacity: 0.45;
  }

  .scene-fx {
    background: $vignette;
  }
}

// Depth: 먼 풍경처럼 흐리게, 지평선에 옅은 안개. 노드가 앞에 떠 보인다.
.scene-depth {
  .scene-art {
    inset: -12px; // 흐린 가장자리가 비치지 않게 조금 크게
    opacity: 0.6;
    filter: blur(3px);
  }

  .scene-fx {
    background:
      $vignette,
      linear-gradient(transparent 40%, color-mix(in srgb, var(--js-sky-2) 55%, transparent) var(--horizon), transparent 92%);
  }
}

// CRT: 오래된 브라운관처럼 가로 주사선과 천천히 내려가는 밝은 띠, 어두운 모서리
.scene-crt {
  .scene-art {
    opacity: 0.65;
    filter: blur(0.6px);
  }

  .scene-fx {
    background:
      repeating-linear-gradient(rgba(0, 0, 0, 0.5) 0 2px, transparent 2px 4px),
      radial-gradient(ellipse 80% 75% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.75) 100%);

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(transparent, rgba(255, 255, 255, 0.05) 50%, transparent);
      background-size: 100% 30%;
      background-repeat: no-repeat;
      animation: crt-roll 7s linear infinite;
    }
  }
}

// 흐리게 한 풍경에서는 노랑이 탁한 올리브색이 되므로, 해의 위쪽을 분홍 쪽으로 옮긴 주황으로 칠한다.
.scene-soft,
.scene-depth,
.scene-crt {
  .scene-sun {
    background: linear-gradient(color-mix(in srgb, var(--js-sun) 55%, var(--js-primary)) 0 42%, var(--js-primary) 42%);
  }
}

// Off: 풍경 없이 바탕색만
.scene-off {
  display: none;
}

@keyframes crt-roll {
  from {
    background-position: 0 -40%;
  }

  to {
    background-position: 0 140%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-crt .scene-fx::after {
    animation: none;
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
  color: var(--js-text);
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

#main-sidebar {
  .main-sidebar-list {
    display: flex;
    flex-direction: column;
  }
}
</style>

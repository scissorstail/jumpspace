<template>
  <div
    id="rete"
    ref="rete"
    :class="[isLocked && 'locked']"
  />
</template>

<script>
import cloneDeep from 'lodash/cloneDeep'
import Rete from 'rete'
import ConnectionPlugin from 'rete-connection-plugin'
import ConnectionPathPlugin from 'rete-connection-path-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import AreaPlugin from 'rete-area-plugin'
import ReadonlyPlugin from 'rete-readonly-plugin'

import SiteNode from './nodes/site-node'
import { viewOf } from '@/utils/view'

export default {
  name: 'EditorIndex',
  props: {
    editorData: {
      type: String,
      default: null
    },
    isLocked: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {}
  },
  watch: {
    async editorData() {
      if (this.editorData) {
        await this.engine.abort()
        this.load(this.editorData)
      } else {
        await this.engine.abort()
        this.load(JSON.stringify({ id: 'test@0.1.0', nodes: {} }))
      }
    }
  },
  created() {
    this.editor = null
    this.engine = null
    this.lastLockedHintAt = 0
    this.confirmedRemoval = null
  },
  mounted() {
    // Node
    const nodes = [new SiteNode()]

    // Editor
    this.editor = new Rete.NodeEditor(
      'test@0.1.0',
      document.querySelector('#rete')
    )

    // Editor Background
    const background = document.createElement('div')
    background.classList = 'background'

    // Editor Plugins
    this.editor.use(ConnectionPlugin)

    this.editor.use(VueRenderPlugin)

    this.editor.use(ContextMenuPlugin, {
      delay: 250,
      rename: () => 'Add node',
      nodeItems: {
        Duplicate: async (args) => {
          const {
            name,
            position: [x, y],
            ...params
          } = args.node
          const component = this.editor.components.get(name)
          const node = await component.createNode(cloneDeep(params.data))

          node.position[0] = x + 25
          node.position[1] = y + 25

          this.editor.addNode(node)
        },
        Clone: false // or Clone item
      }
    })

    // 잠겨 있으면 우클릭 메뉴를 열지 않고 이유를 알려준다.
    this.editor.on('showcontextmenu', () => {
      if (this.isLocked) {
        this.showLockedHint()
        return false
      }
    })

    // 내용이 있는 노드는 지우기 전에 확인한다. (잠글 때까지 저장되지 않지만, 실수로 지우기 쉽다)
    // 삭제를 일단 취소하고, 확인을 받으면 다시 지운다. 불러오기 중(silent)의 삭제는 막지 않는다.
    this.editor.on('noderemove', node => {
      if (this.editor.silent || this.confirmedRemoval === node || !this.nodeHasContent(node)) {
        return true
      }

      this.confirmRemoval(node)
      return false
    })

    this.editor.use(AreaPlugin, {
      background,
      snap: true,
      scaleExtent: { min: 0.1, max: 2 }
    })

    this.editor.use(ConnectionPathPlugin, {
      type: ConnectionPathPlugin.DEFAULT, // DEFAULT or LINEAR transformer
      // curve: ConnectionPathPlugin.curveStep, // curve identifier
      arrow: { color: '#38bdf8', marker: 'M-5,-7 L-5,7 L14,0 z' }
    })

    this.editor.use(ReadonlyPlugin, { enabled: true })

    // 연결선 위에 흐르는 점선을 한 겹 더 그려서 데이터가 앞 노드에서 다음 노드로 흐르는 것처럼 보이게 한다.
    // (화살표 플러그인이 첫 번째 path를 기준으로 쓰므로 main-path 뒤에 넣는다)
    this.editor.on('renderconnection', ({ el }) => {
      const main = el.querySelector('path.main-path')
      if (!main || el.querySelector('path.flow-path')) return

      const flow = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      flow.classList.add('flow-path')
      flow.setAttribute('d', main.getAttribute('d'))
      main.after(flow)
    })
    this.editor.on('updateconnection', ({ el }) => {
      const main = el.querySelector('path.main-path')
      const flow = el.querySelector('path.flow-path')
      if (main && flow) flow.setAttribute('d', main.getAttribute('d'))
    })

    // 프레임(주석)과 미니맵은 rete-comment-plugin / rete-minimap-plugin으로 만들 수 있다.
    // 쓰지 않아서 의존성에서 뺐다. 필요하면 패키지를 다시 추가한다.

    this.engine = new Rete.Engine('test@0.1.0')

    nodes.forEach((c) => {
      this.editor.register(c)
      this.engine.register(c)
    })

    this.editor.on(
      [
        'connectioncreate',
        'connectionremove',
        'nodecreate',
        'noderemove',
        'process'
      ],
      async () => {
        if (this.editor.silent) return

        await this.compile()
      }
    )

    // 캔버스를 옮기거나 확대/축소할 때마다 알린다. (저장은 Layout이 한다)
    this.editor.on(['translated', 'zoomed'], () => {
      this.$emit('view-change', viewOf(this.editor.view.area.transform))
    })

    this.editor.on(
      [
        'rendernode',
        'readonly'
      ],
      () => {
        // Update Editor Lock status of Components
        const isLocked = this.editor.exist('isreadonly') && this.editor.trigger('isreadonly')

        this.editor.nodes.forEach(x => {
          x.controls.get('connection').vueContext.isLocked = isLocked
        })
      }
    )
  },
  methods: {
    // 연달아 누르면 한 번만 알린다.
    showLockedHint() {
      const now = Date.now()
      if (!this.editorData || now - this.lastLockedHintAt < 4000) {
        return
      }

      this.lastLockedHintAt = now
      this.$bvToast.toast('Unlock the editor (lock icon) to add or delete nodes.', {
        variant: 'secondary',
        solid: true,
        noCloseButton: true,
        autoHideDelay: 2500,
        toaster: 'b-toaster-bottom-center'
      })
    },
    nodeHasContent(node) {
      const view = node.controls.get('connection').vueContext

      return ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec'].some(key => view[key]) || (view.forwards || []).length > 0
    },
    async confirmRemoval(node) {
      const view = node.controls.get('connection').vueContext
      const label = view.name || view.host || '(untitled)'

      if (await this.$bvModal.msgBoxConfirm(`Delete "${label}"?`, { title: 'Delete node', okVariant: 'danger', okTitle: 'Delete' })) {
        this.confirmedRemoval = node
        this.editor.removeNode(node)
        this.confirmedRemoval = null
      }
    },
    async load(editorSaveData) {
      await this.editor.fromJSON(JSON.parse(editorSaveData))
      await this.compile()

      this.editor.view.resize()
    },
    async compile() {
      await this.engine.abort()
      await this.engine.process(this.editor.toJSON())
      await this.engine.abort()

      return this.editor.toJSON()
    }
  }
}
</script>

<style lang="scss">
@import './context-menu.scss';

#rete {
  height: 100%;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;

  // 멈춰 있는 은은한 빛(화면에 고정)과, 캔버스와 함께 움직이는 점 격자를 겹쳐서 깊이감을 준다.
  background-color: var(--js-bg);
  background-image:
    radial-gradient(ellipse 70% 55% at 50% 0%, rgba(56, 189, 248, 0.1), transparent 70%),
    radial-gradient(ellipse 60% 50% at 85% 100%, rgba(129, 140, 248, 0.08), transparent 70%);

  .background {
    z-index: -5;

    background-image: radial-gradient(circle, rgba(148, 163, 184, 0.16) 1px, transparent 1.4px);
    background-size: 22px 22px;
    background-position: 11px 11px;
  }

  // 노드: 유리 질감 카드. 올리면 살짝 떠오르고, 선택하면 하늘색으로 빛난다.
  .node.site {
    border: 1px solid var(--js-border);
    border-radius: 20px;
    padding-bottom: 0;
    min-width: initial;
    background: linear-gradient(160deg, rgba(51, 65, 85, 0.85), rgba(15, 23, 42, 0.9));
    color: var(--js-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 28px rgba(0, 0, 0, 0.45);
    transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s;

    &:hover {
      border-color: rgba(56, 189, 248, 0.55);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(56, 189, 248, 0.25), 0 16px 36px rgba(0, 0, 0, 0.55), 0 0 28px rgba(56, 189, 248, 0.18);
      transform: translateY(-2px);
    }

    &.selected {
      border-color: var(--js-accent);
      background: linear-gradient(160deg, rgba(51, 65, 85, 0.9), rgba(15, 23, 42, 0.95));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 3px rgba(56, 189, 248, 0.35), 0 0 36px rgba(56, 189, 248, 0.35);
    }

    & > .input {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;

      .input-title {
        height: 100%;
        margin: 0;
      }
    }

    & > .output {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;

      .output-title {
        height: 100%;
        margin: 0;
      }
    }

    .title {
      display: none;
    }

    .socket {
      background: var(--js-bg);
      height: 20px;
      width: 20px;
      transform: translateY(0);

      &.input {
        border: 2px dashed var(--js-accent);
        margin-left: -30px;
      }

      &.output {
        border: 2px solid var(--js-accent);
        margin-right: -30px;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
      }
    }

    .control {
      width: 100%;
      height: 100%;
      display: flex;
      padding: 0;
    }
  }

  // 연결선: 흐린 선 위로 밝은 점들이 흐른다.
  .connection {
    .main-path {
      stroke-width: 3px;
      stroke: rgba(56, 189, 248, 0.22);
    }

    .flow-path {
      fill: none;
      stroke: #7dd3fc;
      stroke-width: 2.5px;
      stroke-linecap: round;
      stroke-dasharray: 1 15;
      filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.9));
      pointer-events: none;
      animation: connection-flow 1.1s linear infinite;
    }
  }

  &.locked {
    .node.site .socket {
      &.input {
        border-color: rgba(148, 163, 184, 0.45);
      }

      &.output {
        border-color: rgba(148, 163, 184, 0.45);
        box-shadow: none;
      }
    }
  }
}

@keyframes connection-flow {
  from {
    stroke-dashoffset: 16;
  }

  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  #rete .connection .flow-path {
    animation: none;
  }

  #rete .node.site:hover {
    transform: none;
  }
}
</style>

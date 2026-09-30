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
import { MAX_ZOOM, MIN_ZOOM, viewOf } from '@/utils/view'
import { hopKey, liveRoutes } from '@/utils/terminal-sessions'

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
    // 터미널 세션이 열리거나 끝나면 캔버스의 경로 표시를 바꾼다.
    '$store.getters.terminalSessions': {
      deep: true,
      handler() {
        this.markLiveRoutes()
      }
    },
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
      scaleExtent: { min: MIN_ZOOM, max: MAX_ZOOM }
    })

    this.editor.use(ConnectionPathPlugin, {
      type: ConnectionPathPlugin.DEFAULT, // DEFAULT or LINEAR transformer
      // curve: ConnectionPathPlugin.curveStep, // curve identifier
      arrow: { color: '#ff2e97', marker: 'M-4,-8 L-4,8 L14,0 z' }
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
    // 앱 안의 터미널에서 열려 있는 세션이 지나가는 노드와 연결선에 is-live를 붙인다. (신호가 흐르는 모양은 CSS)
    // 노드와 세션은 user@host:port로 맞춰 본다. 그래서 다른 item의 같은 서버 경로도 함께 표시된다.
    markLiveRoutes() {
      if (!this.editor) return

      const { nodes, links } = liveRoutes(this.$store.getters.terminalSessions)
      const keyOf = node => hopKey(node.controls.get('connection')?.vueContext)

      for (const [node, view] of this.editor.view.nodes) {
        view.el.classList.toggle('is-live', nodes.has(keyOf(node)))
      }
      for (const [connection, view] of this.editor.view.connections) {
        view.el.classList.toggle('is-live', links.has(`${keyOf(connection.output.node)}>${keyOf(connection.input.node)}`))
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
      this.markLiveRoutes()

      return this.editor.toJSON()
    }
  }
}
</script>

<style lang="scss">
@import './context-menu.scss';

// 캔버스는 투명하다. 뒤의 밤하늘 풍경은 Layout(#editor-area)이 그린다.
#rete {
  height: 100%;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;

  // 캔버스와 함께 움직이는 점 격자 (위치를 가늠하는 용도)
  .background {
    z-index: -5;

    background-image: radial-gradient(circle, color-mix(in srgb, var(--js-text-muted) 30%, transparent) 1px, transparent 1.5px);
    background-size: 24px 24px;
  }

  // 노드: 단색 패널, 청록 테두리, 흐리지 않은 검은 그림자. 선택하면 분홍 테두리와 노란 그림자.
  .node.site {
    border: 2px solid var(--js-secondary);
    border-radius: 0;
    padding-bottom: 0;
    min-width: initial;
    background: var(--js-surface);
    color: var(--js-text);
    box-shadow: 6px 6px 0 #000;
    transition: transform 0.1s, box-shadow 0.1s;

    &:hover {
      box-shadow: 8px 8px 0 #000;
      transform: translate(-2px, -2px);
    }

    &.selected {
      border-color: var(--js-primary);
      background: var(--js-surface-2);
      box-shadow: 6px 6px 0 var(--js-sun);
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

    // 소켓: 픽셀 같은 네모. 들어오는 쪽은 비어 있고, 나가는 쪽은 채워져 있다.
    .socket {
      height: 16px;
      width: 16px;
      border-radius: 0;
      background: var(--js-bg);

      &.input {
        border: 3px solid var(--js-secondary);
        margin-left: -28px;
      }

      &.output {
        border: 3px solid var(--js-secondary);
        margin-right: -28px;
        background: var(--js-secondary);
      }
    }

    .control {
      width: 100%;
      height: 100%;
      display: flex;
      padding: 0;
    }
  }

  // 연결선: 쉬는 동안은 단색 청록 선과 분홍 화살표.
  // 그 경로로 앱 안의 터미널 세션이 열려 있으면(.is-live) 분홍 선 위로 네모 신호(--js-signal)가 앞 노드에서 다음 노드로 흐른다.
  .connection {
    .main-path {
      stroke-width: 3px;
      stroke: var(--js-secondary);
      transition: stroke 0.15s;
    }

    .flow-path {
      display: none;
      fill: none;
      stroke: var(--js-signal);
      stroke-width: 7px;
      stroke-linecap: butt;
      stroke-dasharray: 7 17;
      pointer-events: none;
      animation: connection-flow 0.6s linear infinite;
    }

    .marker {
      fill: var(--js-primary);
    }
  }

  .is-live .connection {
    .main-path {
      stroke: var(--js-primary);
      stroke-width: 4px;
    }

    .flow-path {
      display: inline;
    }

    .marker {
      fill: var(--js-signal);
    }
  }

  // 열린 세션이 지나가는 노드: 왼쪽 위에 깜박이는 LIVE 표
  .is-live .node.site::after {
    content: 'LIVE';
    position: absolute;
    top: -12px;
    left: -10px;
    padding: 0 5px;
    background: var(--js-live);
    box-shadow: 2px 2px 0 #000;
    color: #000;
    font-family: var(--js-font-display);
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    line-height: 1.2;
    pointer-events: none;
    animation: live-blink 1.2s steps(1) infinite;
  }

  &.locked {
    .node.site .socket {
      &.input,
      &.output {
        border-color: var(--js-line);
      }

      &.output {
        background: var(--js-line);
      }
    }
  }
}

@keyframes connection-flow {
  from {
    stroke-dashoffset: 24;
  }

  to {
    stroke-dashoffset: 0;
  }
}

@keyframes live-blink {
  50% {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  #rete .connection .flow-path,
  #rete .is-live .node.site::after {
    animation: none;
  }

  #rete .node.site:hover {
    transform: none;
  }
}
</style>

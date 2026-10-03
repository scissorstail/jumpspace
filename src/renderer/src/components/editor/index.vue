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
import { MAX_ZOOM, MIN_ZOOM, fitView, viewOf } from '@/utils/view'
import { arrangeLayout, boxOf } from '@/utils/arrange'
import { hopKey, routeStates } from '@/utils/terminal-sessions'

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

    // 노드 수를 알린다. (빈 캔버스의 안내는 Layout이 보여준다)
    this.editor.on(['nodecreated', 'noderemoved'], () => this.emitNodeCount())

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
    // 앱 안의 터미널 세션이 지나가는 노드와 연결선에 상태를 붙인다: 연결 중(is-connecting), 연결됨(is-live), 실패(is-failed). 모양은 CSS.
    // 노드와 세션은 user@host:port로 맞춰 본다. 그래서 다른 item의 같은 서버 경로도 함께 표시된다.
    markLiveRoutes() {
      if (!this.editor) return

      const { nodes, links } = routeStates(this.$store.getters.terminalSessions)
      const keyOf = node => hopKey(node.controls.get('connection')?.vueContext)
      // 연결됨은 예전 이름 그대로 is-live (흐르는 신호와 초록 점), 연결 중은 is-connecting(노랑), 실패는 is-failed(빨강)
      const mark = (el, phase) => {
        el.classList.toggle('is-live', phase === 'connected')
        el.classList.toggle('is-connecting', phase === 'connecting')
        el.classList.toggle('is-failed', phase === 'failed')
      }

      for (const [node, view] of this.editor.view.nodes) {
        mark(view.el, nodes.get(keyOf(node)))
      }
      for (const [connection, view] of this.editor.view.connections) {
        mark(view.el, links.get(`${keyOf(connection.output.node)}>${keyOf(connection.input.node)}`))
      }
    },
    async load(editorSaveData) {
      await this.editor.fromJSON(JSON.parse(editorSaveData))
      this.emitNodeCount()
      await this.compile()

      this.editor.view.resize()
    },
    // 보기(확대와 위치)를 바꾼다. 바뀐 값은 translated/zoomed로 Layout에 알려진다.
    setView({ k, x, y }) {
      const { area } = this.editor.view
      area.zoom(k, 0, 0)
      area.translate(x, y)
    },
    // 노드 상자에 그 밖으로 나온 부분(아래의 이름과 주소, 양옆 소켓)을 더한 영역. 캔버스 좌표로,
    // dx, dy는 노드 위치(상자의 왼쪽 위)에서 영역의 왼쪽 위까지. 마우스를 올리면 위에 뜨는 메뉴는 줄 간격 안에 들어간다.
    extentOf(node) {
      const el = this.editor.view.nodes.get(node).el
      const { k } = this.editor.view.area.transform
      const base = el.getBoundingClientRect()
      const rects = [base, ...[...el.querySelectorAll('.info-field, .socket')].map(part => part.getBoundingClientRect()).filter(r => r.width && r.height)]
      const left = Math.min(...rects.map(r => r.left))
      const top = Math.min(...rects.map(r => r.top))

      return {
        dx: (left - base.left) / k,
        dy: (top - base.top) / k,
        width: (Math.max(...rects.map(r => r.right)) - left) / k,
        height: (Math.max(...rects.map(r => r.bottom)) - top) / k
      }
    },
    // 모든 노드를 연결 순서대로 정렬해서 보이는 캔버스의 가운데에 모은다. 다 보이지 않으면 그만큼 축소한다.
    // insetLeft: 왼쪽에서 가려진 너비(열린 사이드바). 노드 위치는 끌어서 옮긴 것과 같아서 잠글 때 저장된다.
    arrangeNodes({ insetLeft = 0 } = {}) {
      const { area, container, nodes: views, connections } = this.editor.view
      if (!this.editor.nodes.length) return

      const extents = new Map(this.editor.nodes.map(node => [node, this.extentOf(node)]))
      const items = this.editor.nodes.map(node => ({ id: node.id, x: node.position[0], y: node.position[1], ...extents.get(node) }))
      const links = [...connections.keys()].map(c => [c.output.node.id, c.input.node.id])
      const positions = arrangeLayout(items, links)

      const viewport = { left: insetLeft, top: 0, width: Math.max(1, container.clientWidth - insetLeft), height: container.clientHeight }
      const { k, x, y } = area.transform
      const cx = (viewport.left + viewport.width / 2 - x) / k
      const cy = (viewport.top + viewport.height / 2 - y) / k
      for (const node of this.editor.nodes) {
        const [px, py] = positions.get(node.id)
        const { dx, dy } = extents.get(node)
        views.get(node).translate(cx + px - dx, cy + py - dy)
      }

      // 격자 맞춤(snap)으로 조금 움직였을 수 있으니 실제 위치로 맞춘다.
      const box = boxOf(this.editor.nodes.map(node => {
        const { dx, dy, width, height } = extents.get(node)
        return { x: node.position[0] + dx, y: node.position[1] + dy, width, height }
      }))
      this.setView(fitView(viewport, box, k))
    },
    emitNodeCount() {
      this.$emit('node-count', this.editor.nodes.length)
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
  // 테두리는 border가 아니라 안쪽 outline이다. Rete는 소켓 위치를 offsetLeft/offsetTop으로 더해 구하는데
  // 그 값에는 부모의 border 두께가 빠져서, 연결선 끝이 소켓 중심에서 2px 어긋났다. (padding이 그 두께를 대신한다)
  .node.site {
    border: 0;
    border-radius: 0;
    padding: 2px;
    outline: 2px solid var(--js-secondary);
    outline-offset: -2px;
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
      outline-color: var(--js-primary);
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

      // 입출력 칸이 이제 노드 바깥 가장자리에서 시작하므로(테두리 안쪽이 아니라) 2px 덜 내민다.
      &.input {
        border: 3px solid var(--js-secondary);
        margin-left: -26px;
      }

      &.output {
        border: 3px solid var(--js-secondary);
        margin-right: -26px;
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

  // 연결 중: 노란 선 위로 신호가 천천히 흐른다. (로그인 표시가 오면 is-live로 바뀐다)
  .is-connecting .connection {
    .main-path {
      stroke: var(--js-connecting);
      stroke-width: 4px;
    }

    .flow-path {
      display: inline;
      stroke: var(--js-connecting);
      animation-duration: 1.4s;
    }

    .marker {
      fill: var(--js-connecting);
    }
  }

  // 실패: 빨간 점선, 흐르지 않는다. 탭을 닫거나 다시 연결할 때까지 남는다.
  .is-failed .connection {
    .main-path {
      stroke: var(--js-danger);
      stroke-width: 3px;
      stroke-dasharray: 8 6;
    }

    .marker {
      fill: var(--js-danger);
    }
  }

  // 열린 세션이 지나가는 노드: 안쪽 왼쪽 위에 깜박이는 작은 초록 네모 (터미널 탭의 점과 같은 모양)
  // 노드 위에 뜨는 메뉴 단추와 겹치지 않도록 노드 안에 둔다.
  .is-live .node.site::after,
  .is-connecting .node.site::after,
  .is-failed .node.site::after {
    content: '';
    position: absolute;
    top: 8px;
    left: 8px;
    width: 9px;
    height: 9px;
    background: var(--js-live);
    box-shadow: 1px 1px 0 #000;
    pointer-events: none;
    animation: live-blink 1.2s steps(1) infinite;
  }

  // 연결 중은 노란 점이 빠르게, 실패는 빨간 점이 깜박이지 않고 켜져 있다.
  .is-connecting .node.site::after {
    background: var(--js-connecting);
    animation-duration: 0.6s;
  }

  .is-failed .node.site::after {
    background: var(--js-danger);
    animation: none;
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

// 노드 아래 글자(이름, 주소, 포워딩)를 덮는 반투명 유리판 (설정 > Node glass, 0이면 없음).
// 뒤의 풍경을 밝게 흐려서 글자가 풍경과 구분된다. 노드 상자 쪽은 그대로 둔다.
// 판은 글자 바깥으로만 넓힌다: 안쪽 여백 + 테두리만큼 음수 margin을 주어, 유리판을 켜도 글자가 제자리에 있다.
.node-glass #rete .info-card {
  margin: -5px -9px -7px;
  padding: 4px 8px 6px;
  border: 1px solid color-mix(in srgb, #fff 20%, transparent);
  background: color-mix(in srgb, #fff 7%, transparent);
  -webkit-backdrop-filter: blur(var(--node-blur)) saturate(1.2);
  backdrop-filter: blur(var(--node-blur)) saturate(1.2);
}

// Vivid 배경에서는 풍경이 선명해서 연결선이 묻히므로 어두운 테두리를 두른다.
.backdrop-vivid #rete .connection .main-path {
  filter: drop-shadow(0 0 3px var(--js-bg)) drop-shadow(0 0 8px var(--js-bg)) drop-shadow(0 0 8px var(--js-bg));
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
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  #rete .connection .flow-path,
  #rete .is-live .node.site::after,
  #rete .is-connecting .node.site::after {
    animation: none;
  }

  #rete .node.site:hover {
    transform: none;
  }
}
</style>

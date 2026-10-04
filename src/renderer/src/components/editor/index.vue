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

    // 연결은 클릭 두 번으로만 잇는다: 시작 소켓을 클릭하면 선이 마우스를 따라오고, 도착 소켓을 클릭하면 이어진다.
    // 끌어서 놓는 방식(소켓에서 누르고 다른 소켓에서 놓기)은 Windows에서 선이 이어지지 않고 남는 일이 있어서 쓰지 않는다.
    // 연결 플러그인은 놓는 순간(pointerup)에도 소켓을 고르므로, 그때 고르는 것만 막는다. 놓은 뒤에도 선은 따라오고, 클릭하면 이어진다.
    this.isReleasing = false
    this.onPointerRelease = () => {
      this.isReleasing = true
      setTimeout(() => { this.isReleasing = false })
    }
    window.addEventListener('pointerup', this.onPointerRelease, true)
    this.editor.on('connectionpick', () => !this.isReleasing)

    // Rete는 캔버스 크기를 불러올 때와 창 크기가 바뀔 때만 픽셀로 고정한다. 터미널 패널을 열고 닫거나 높이를 바꾸면
    // 캔버스 영역이 달라지므로 그때도 맞춘다. (패널이 열린 채 다른 item을 열고 패널을 닫으면 캔버스가 잘린 채 남았다)
    this.areaObserver = new ResizeObserver(() => this.editor.view.resize())
    this.areaObserver.observe(this.$el.parentElement)
  },
  beforeDestroy() {
    window.removeEventListener('pointerup', this.onPointerRelease, true)
    this.areaObserver?.disconnect()
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
@import './canvas.scss';
</style>

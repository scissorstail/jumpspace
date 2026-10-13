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
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, fitView, fullCanvasIn, isRealSize, shownView, viewOf } from '@/utils/view'
import { arrangeLayout, boxOf } from '@/utils/arrange'
import { activeTerminalNode, hopKey, routeStates } from '@/utils/terminal-sessions'
import { isCanvasDoubleClick, lockedPress } from '@/utils/locked-press'
import { closesLoop, loopIn, loopText } from '@/utils/link-loop'
import { toastError } from '@/utils/notify'

// 캔버스 아래의 안내가 떠 있는 시간 (ms). 그동안에는 같은 안내를 겹쳐 띄우지 않는다.
const LOOP_HINT_MS = 2500
// 연 다이어그램에 고리가 있다는 알림이 떠 있는 시간 (ms). 읽을 글이 길어서 다른 알림(5초)보다 오래 둔다.
const LOOP_NOTICE_MS = 10000

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
  computed: {
    // 고른 터미널 탭을 연 노드 (user@host:port, 없으면 null)
    activeTerminalNode() {
      const { terminalSessions, activeTerminalKey, isTerminalPanelOpen } = this.$store.getters

      return activeTerminalNode(terminalSessions, activeTerminalKey, isTerminalPanelOpen)
    }
  },
  watch: {
    // 터미널 세션이 열리거나 끝나면 캔버스의 경로 표시를 바꾼다.
    '$store.getters.terminalSessions': {
      deep: true,
      handler() {
        this.markLiveRoutes()
      }
    },
    // 다른 탭을 고르거나 패널을 최소화하면 세션은 그대로여서 위의 watch가 돌지 않는다.
    activeTerminalNode() {
      this.markLiveRoutes()
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
    this.isAdding = false
    this.lastLoopHintAt = 0
    this.justRemovedLink = null
    this.isRestoringLink = false
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
      // 캔버스 메뉴의 둘째 항목: 붙여 넣은 SSH config로 노드를 만든다 (owner, 2026-10). 붙여 넣는 창은 Layout이 띄운다.
      // 노드가 놓일 자리는 Add node와 같다: 항목을 누를 때 마우스가 있는 곳 (캔버스 좌표).
      items: {
        'From SSH config': () => {
          const { x, y } = this.editor.view.area.mouse

          this.$emit('ssh-config', [x, y])
        }
      },
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
        // 여러 노드를 한꺼번에 더하는 동안(addFromConfig)에는 끝에 한 번만 계산한다.
        // 노드마다 계산을 시작하면 서로 겹쳐서, 만든 노드에 값이 채워지지 않은 채 남았다.
        if (this.editor.silent || this.isAdding) return

        await this.compile()
      }
    )

    // 노드 수를 알린다. (빈 캔버스의 안내는 Layout이 보여준다)
    this.editor.on(['nodecreated', 'noderemoved'], () => this.emitNodeCount())

    // 캔버스를 옮기거나 확대/축소할 때마다 알린다. (저장은 Layout이 한다)
    // 사용자가 정한 보기(base)는 그때의 영역 크기와 함께 기억한다. 영역 크기가 바뀌면 base에서 다시 계산하므로
    // (rescaleView) 창을 줄였다 늘리거나 터미널 패널을 열었다 닫아도 처음 보기로 정확히 돌아온다.
    // 확대는 영역의 높이를 따르므로(utils/view.js의 scaleView), 패널을 연 채 정한 보기도 패널을 닫으면 같은 비율로 커진다.
    // 크기에 맞추느라 생긴 변화(isRescaling)는 사용자의 보기가 아니므로 기억하지도 알리지도 않는다.
    this.base = null
    this.isRescaling = false
    this.editor.on(['translated', 'zoomed'], () => {
      if (this.isRescaling) return

      const { k, x, y } = this.editor.view.area.transform
      this.keepView({ k, x, y }, this.areaSize())
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

    // 편집을 끝내면(잠그면) 선택을 푼다. 잠긴 동안에는 노드를 고를 수도, 선택을 풀 수도 없어서 편집 중에 누른 노드가
    // 선택된 모양으로 계속 남았다. 고른 터미널 탭의 노드도 같은 모양이라, 남은 선택이 그 노드처럼 보이기도 했다.
    this.editor.on('readonly', isLocked => {
      if (isLocked) this.clearSelection()
    })

    // 캔버스를 더블클릭하면 Rete는 확대한다. 대신 머리글의 Reset view와 똑같이 처음 보기로 돌아간다 (owner, 2026-10).
    // 어디가 캔버스인지는 utils/locked-press.js의 isCanvasDoubleClick: 빈 곳은 언제나, 노드 위는 잠긴 동안에만.
    this.editor.on('zoom', ({ source }) => source !== 'dblclick')
    this.onDoubleClick = e => {
      if (this.editorData && isCanvasDoubleClick(e, { isLocked: this.isLocked })) this.resetView()
    }
    this.$el.addEventListener('dblclick', this.onDoubleClick)

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

    // 고리를 닫는 연결은 받지 않는다 (refuseLoop). 연결 플러그인은 새 연결을 만들기 전에 도착 소켓에 있던 연결을 먼저 지우므로,
    // 방금(같은 차례에) 지워진 연결을 기억해 둔다: 새 연결을 거절하면 그것을 되돌린다. 불러오는 중에 지워지는 것은 기억하지 않는다.
    this.editor.on('connectionremoved', connection => {
      if (this.editor.silent) return

      this.justRemovedLink = connection
      setTimeout(() => {
        if (this.justRemovedLink === connection) this.justRemovedLink = null
      })
    })
    this.editor.on('connectioncreate', link => this.refuseLoop(link))

    // 잠겨 있는 동안 노드의 그림, 이름, 접속 정보, 소켓은 배경처럼 군다: 그 위에서 끌면 캔버스가 움직인다 (utils/locked-press.js).
    // Rete는 노드 위의 누름을 노드의 것으로 삼고 멈추므로, 노드에 닿기 전에(capture) 멈추고 같은 누름을 캔버스에 다시 보낸다.
    // 다시 보낸 누름은 캔버스 자신이 target이라 여기서 또 걸리지 않고, Rete의 캔버스 끌기가 받는다.
    this.onLockedPress = e => {
      if (lockedPress(e, { isLocked: this.isLocked }) !== 'canvas') return

      e.stopPropagation()
      this.$el.dispatchEvent(new PointerEvent('pointerdown', e))
    }
    this.$el.addEventListener('pointerdown', this.onLockedPress, true)

    // Rete는 캔버스 크기를 불러올 때와 창 크기가 바뀔 때만 픽셀로 고정한다. 터미널 패널을 열고 닫거나 높이를 바꾸면
    // 캔버스 영역이 달라지므로 그때도 맞춘다. (패널이 열린 채 다른 item을 열고 패널을 닫으면 캔버스가 잘린 채 남았다)
    // 영역 크기가 바뀌면 다이어그램도 배경 풍경처럼 같은 비율로 커지고 줄어든다.
    // 영역과 패널이 나눠 쓰는 #workspace도 본다: 크기 없이 기억된 보기(처음 보기)는 그 크기에서의 보기라서, 패널이
    // 캔버스를 가장 낮은 높이까지 밀어 올린 창에서는 창 높이가 바뀌어도 영역은 그대로인데 보여줄 보기는 달라진다.
    // (지금은 패널이 제 높이를 한 박자 늦게 맞추는 동안 영역도 잠깐 바뀌어서 영역만 봐도 맞게 끝난다. 거기에 기대지 않는다)
    this.areaObserver = new ResizeObserver(() => {
      this.editor.view.resize()
      this.rescaleView()
    })
    this.areaObserver.observe(this.$el.parentElement)
    this.areaObserver.observe(this.$el.parentElement.parentElement)
  },
  beforeDestroy() {
    this.$el.removeEventListener('dblclick', this.onDoubleClick)
    this.$el.removeEventListener('pointerdown', this.onLockedPress, true)
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
    // 연결이 고리를 닫으면 받지 않는다 (false를 답하면 Rete가 그 연결을 만들지 않는다; utils/link-loop.js).
    // 고리가 있으면 Rete의 엔진이 다이어그램 전체의 계산을 거부해서, 어느 노드도 제 앞의 노드를 알지 못하게 된다.
    // 불러오는 중(silent)에는 막지 않는다: 저장된 다이어그램은 고리가 있어도 있는 그대로 열린다.
    refuseLoop({ output, input }) {
      if (this.editor.silent || this.isRestoringLink) return true

      const links = [...this.editor.view.connections.keys()].map(c => [c.output.node.id, c.input.node.id])
      if (!closesLoop(links, output.node.id, input.node.id)) return true

      // 플러그인이 이 연결을 만들려고 도착 소켓의 연결을 방금 지웠으면 되돌린다: 거절은 아무것도 바꾸지 않는다.
      // Rete가 이 연결의 이벤트를 돌리는 중이므로 그것이 끝난 바로 다음에 (화면이 다시 그려지기 전에) 잇는다.
      // 되돌리는 연결은 막지 않는다: 파일에서 온 고리의 일부였더라도 있던 그대로 돌아가야 한다.
      const replaced = this.justRemovedLink
      if (replaced && replaced.input === input) {
        this.justRemovedLink = null
        Promise.resolve().then(() => {
          this.isRestoringLink = true
          try {
            this.editor.connect(replaced.output, replaced.input, replaced.data)
          } finally {
            this.isRestoringLink = false
          }
        })
      }

      this.showLoopHint()
      return false
    },
    // 고리를 닫는 연결을 받지 않았다고 알린다 (잠긴 캔버스의 안내와 같은 자리, 같은 모양). 안내가 떠 있는 동안에는 겹쳐 띄우지 않는다.
    showLoopHint() {
      const now = Date.now()
      if (now - this.lastLoopHintAt < LOOP_HINT_MS) {
        return
      }

      this.lastLoopHintAt = now
      this.$bvToast.toast('Not linked: that link would make a loop.', {
        variant: 'secondary',
        solid: true,
        noCloseButton: true,
        autoHideDelay: LOOP_HINT_MS,
        toaster: 'b-toaster-bottom-center'
      })
    },
    // 선택한 노드를 모두 푼다. Rete의 화면(vue-render-plugin)은 노드를 고를 때에만 선택 표시를 다시 그리므로,
    // 풀린 노드를 직접 다시 그리게 한다. (지운 노드가 선택 목록에 남아 있을 수 있어서 지금 있는 노드만 그린다)
    clearSelection() {
      const selected = this.editor.selected.list.filter(node => this.editor.nodes.includes(node))

      this.editor.selected.clear()
      selected.forEach(node => node.update?.())
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
    // 노드와 세션은 user@host:port로 맞춰 본다. 지금 열린 item이 연 세션만 본다 (store의 terminalSessions): 터미널은 그것을 연 item의 것이다.
    // 고른 탭을 연 노드에는 is-active-terminal도 붙인다: 선택한 노드처럼 보이지만 Rete의 선택은 아니다 (Delete나 끌기의 대상이 바뀌면 안 된다).
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

      const active = this.activeTerminalNode

      for (const [node, view] of this.editor.view.nodes) {
        const key = keyOf(node)
        mark(view.el, nodes.get(key))
        view.el.classList.toggle('is-active-terminal', active !== null && key === active)
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
      this.noteLoop()
    },
    // 연 다이어그램의 연결에 고리가 있으면 알린다: 예전 버전에서 그렸거나 파일에서 온 것이다 (지금은 그릴 수 없다, refuseLoop).
    // 고리가 있는 동안에는 Rete의 엔진이 계산을 거부해서 어느 노드도 제 앞의 노드를 모르고, 모두 바로 접속한다.
    // 고리를 이루는 노드의 이름을 연결 순서대로 적는다. 이름만 적는다: 주소는 눈 단추로 가려 둘 수 있는 값이다.
    noteLoop() {
      const links = [...this.editor.view.connections.keys()].map(c => [c.output.node.id, c.input.node.id])
      const loop = loopIn(links)
      if (!loop) return

      const nameOf = id => this.editor.nodes.find(node => node.id === id)?.data.connection?.name || '(untitled)'
      toastError(this, 'Loop in the links', loopText(loop.map(nameOf)), { autoHideDelay: LOOP_NOTICE_MS })
    },
    // 보기(확대와 위치)를 바꾼다. 바뀐 값은 translated/zoomed로 Layout에 알려진다.
    setView({ k, x, y }) {
      const { area } = this.editor.view
      area.zoom(k, 0, 0)
      area.translate(x, y)
    },
    // 캔버스 영역(#editor-area)의 크기
    areaSize() {
      const area = this.$el.parentElement

      return { width: area.clientWidth, height: area.clientHeight }
    },
    // 터미널 패널이 자리를 차지하지 않을 때의 캔버스 영역 크기: 영역과 패널이 나눠 쓰는 #workspace의 크기다.
    fullSize() {
      const room = this.$el.parentElement.parentElement

      return { width: room.clientWidth, height: room.clientHeight }
    },
    // 보기를 그 보기의 영역 크기와 함께 기억하고 Layout에 알린다. (저장은 Layout이 한다)
    // 크기가 없는 보기(처음 보기)는 크기 없이 저장된다: 다시 열어도 한 번도 옮기지 않은 다이어그램과 같다.
    keepView(view, size) {
      this.base = { view, size }
      this.$emit('view-change', { ...viewOf(view), ...(isRealSize(size) && { w: size.width, h: size.height }) })
    },
    // 기억해 둔 보기(base)를 지금 영역 크기에 맞춰 보여준다. base는 그대로 둔다.
    // 크기 없이 기억된 보기는 패널이 없을 때의 캔버스에서의 보기로 친다 (utils/view.js의 shownView).
    rescaleView() {
      if (!this.base) return

      this.isRescaling = true
      try {
        this.setView(shownView(this.base, this.areaSize(), this.fullSize()))
      } finally {
        this.isRescaling = false
      }
    },
    // item을 열 때의 보기. 저장할 때의 영역 크기(w, h)가 있으면 지금 크기에 맞춘다.
    // 없으면 크기를 비워 둔다: 여는 순간의 영역은 머리글이 다시 그려지기 전이라 조금 낮고, 패널이 열려 있을 수도 있다.
    openView({ k, x, y, w, h }) {
      this.base = { view: { k, x, y }, size: w > 0 && h > 0 ? { width: w, height: h } : null }
      this.rescaleView()
    },
    // 처음 보기(기본 확대, 원점)로 돌린다. 머리글의 Reset view 단추와 캔버스의 더블클릭이 함께 쓴다. 바뀐 보기는 저장된다.
    // 처음 보기는 터미널 패널이 없을 때의 캔버스에서의 보기다: 패널이 열려 있으면 다른 보기처럼 줄여서 보여주고,
    // 패널을 닫으면 정확히 처음 보기가 된다. (열린 영역에 그대로 두면 닫을 때 커지면서 왼쪽이 화면 밖으로 나간다)
    // 크기 없이 기억한다, 한 번도 옮기지 않은 다이어그램처럼: 처음 보기는 어느 크기의 창에서나 처음 보기다.
    // (누른 때의 캔버스 크기와 함께 기억했더니, 창 높이를 바꾸면 그 크기에서 줄이거나 키운 보기가 되어서
    // 다시 누를 때마다 다이어그램이 조금씩 옮겨졌다: owner, 2026-10-11 "묘하게 어긋납니다")
    resetView() {
      this.keepView({ ...DEFAULT_VIEW }, null)
      this.rescaleView()
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
    // 노드 위치는 끌어서 옮긴 것과 같아서 잠글 때 저장된다.
    arrangeNodes() {
      const { area, container, nodes: views, connections } = this.editor.view
      if (!this.editor.nodes.length) return

      const extents = new Map(this.editor.nodes.map(node => [node, this.extentOf(node)]))
      const items = this.editor.nodes.map(node => ({ id: node.id, x: node.position[0], y: node.position[1], ...extents.get(node) }))
      const links = [...connections.keys()].map(c => [c.output.node.id, c.input.node.id])
      const positions = arrangeLayout(items, links)

      // 맞출 자리. 터미널 패널이 열려 있으면 영역의 가운데 부분이다 (utils/view.js의 fullCanvasIn):
      // 낮고 넓은 영역의 너비에 맞추면 패널을 닫아 다이어그램이 다시 커질 때 양옆이 잘린다.
      const viewport = fullCanvasIn({ width: container.clientWidth, height: container.clientHeight }, this.fullSize())
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
    // SSH config에서 읽은 노드들을 더하고 잇는다 (utils/config-import.js의 importPlan이 만든 nodes와 links).
    // origin: 놓을 자리 (캔버스 좌표). 하나 더할 때마다 다시 계산하지 않고(isAdding) 끝에 한 번 계산한다.
    async addFromConfig({ nodes, links }, origin) {
      const component = this.editor.components.get('Site')
      const added = []

      this.isAdding = true
      try {
        for (const data of nodes) {
          const node = await component.createNode({ connection: cloneDeep(data) })

          node.position = [...origin]
          this.editor.addNode(node)
          added.push(node)
        }
        for (const [from, to] of links) {
          this.editor.connect(added[from].outputs.get('output1'), added[to].inputs.get('input1'))
        }
      } finally {
        this.isAdding = false
      }

      // 노드 아래의 글자는 계산(worker)이 끝나고 다시 그려져야 다 정해진다 (포워딩 요약은 앞 노드들에 달려 있다). 그 크기로 재서 놓는다.
      await this.compile()
      await this.$nextTick()
      this.placeGroup(added, origin)
    },
    // 방금 더한 노드들을 연결 순서대로 놓는다: Arrange nodes와 같은 규칙을 그 노드들에만 쓴다.
    // 묶음의 왼쪽 위 노드가 origin에 온다 (Add node로 만든 노드처럼 상자의 모서리가 그 자리다).
    placeGroup(nodes, [ox, oy]) {
      if (!nodes.length) return

      const { nodes: views, connections } = this.editor.view
      const extents = new Map(nodes.map(node => [node, this.extentOf(node)]))
      // 첫 열은 글에 나온 순서대로 위에서 아래로 놓인다
      const items = nodes.map((node, index) => ({ id: node.id, x: 0, y: index, ...extents.get(node) }))
      const links = [...connections.keys()].map(c => [c.output.node.id, c.input.node.id])
      const positions = arrangeLayout(items, links)
      const left = Math.min(...nodes.map(node => positions.get(node.id)[0]))
      const top = Math.min(...nodes.map(node => positions.get(node.id)[1]))
      const first = nodes.find(node => positions.get(node.id)[0] === left && positions.get(node.id)[1] === top) || nodes[0]
      const corner = extents.get(first)

      for (const node of nodes) {
        const [px, py] = positions.get(node.id)
        const { dx, dy } = extents.get(node)
        views.get(node).translate(ox + px - left - dx + corner.dx, oy + py - top - dy + corner.dy)
      }
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

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
      arrow: { color: '#ff8a00', marker: 'M-4,-8 L-4,8 L14,0 z' }
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

  // 화면에 고정된 층: 위쪽 주황 빛, 아래쪽 붉은 빛, 옅은 주사선
  background-color: var(--js-bg);
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse 60% 45% at 50% 0%, rgba(255, 138, 0, 0.1), transparent 70%),
    radial-gradient(ellipse 55% 45% at 0% 100%, rgba(229, 23, 31, 0.12), transparent 70%);

  // 캔버스와 함께 움직이는 층: 계기판 격자 (굵은 칸 120px, 가는 칸 24px)
  .background {
    z-index: -5;

    background-image:
      linear-gradient(rgba(255, 138, 0, 0.09) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 138, 0, 0.09) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
    background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
  }

  // 노드: 각진 검은 패널에 짙은 그림자. 올리거나 고르면 네 모서리에 조준선이 뜬다.
  .node.site {
    --bracket: var(--js-accent);

    border: 1px solid rgba(255, 138, 0, 0.55);
    border-radius: 0;
    padding-bottom: 0;
    min-width: initial;
    background: linear-gradient(135deg, #1a1a20 0%, #0a0a0c 70%);
    color: var(--js-text);
    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.85);
    transition: border-color 0.12s, box-shadow 0.12s;

    // 조준선 (모서리 네 개의 ㄱ자)
    &::before {
      content: '';
      position: absolute;
      inset: -8px;
      pointer-events: none;
      opacity: 0;
      background:
        linear-gradient(var(--bracket), var(--bracket)) top left / 14px 2px,
        linear-gradient(var(--bracket), var(--bracket)) top left / 2px 14px,
        linear-gradient(var(--bracket), var(--bracket)) top right / 14px 2px,
        linear-gradient(var(--bracket), var(--bracket)) top right / 2px 14px,
        linear-gradient(var(--bracket), var(--bracket)) bottom left / 14px 2px,
        linear-gradient(var(--bracket), var(--bracket)) bottom left / 2px 14px,
        linear-gradient(var(--bracket), var(--bracket)) bottom right / 14px 2px,
        linear-gradient(var(--bracket), var(--bracket)) bottom right / 2px 14px;
      background-repeat: no-repeat;
      transition: opacity 0.12s, inset 0.12s;
    }

    &:hover {
      border-color: var(--js-accent);
      box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.85), 0 0 24px rgba(255, 138, 0, 0.35);

      &::before {
        inset: -6px;
        opacity: 1;
      }
    }

    &.selected {
      --bracket: var(--js-red);

      border-color: var(--js-red);
      background: linear-gradient(135deg, #2a1012 0%, #0a0a0c 70%);
      box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.85), 0 0 30px rgba(229, 23, 31, 0.5);

      &::before {
        inset: -6px;
        opacity: 1;
      }
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

    // 소켓: 마름모. 들어오는 쪽은 비어 있고, 나가는 쪽은 채워져 있다.
    .socket {
      height: 16px;
      width: 16px;
      border-radius: 0;
      background: var(--js-bg);
      transform: rotate(45deg);

      &.input {
        border: 2px solid var(--js-accent);
        margin-left: -28px;
      }

      &.output {
        border: 2px solid var(--js-accent);
        margin-right: -28px;
        background: var(--js-accent);
        box-shadow: 0 0 10px rgba(255, 138, 0, 0.7);
      }
    }

    .control {
      width: 100%;
      height: 100%;
      display: flex;
      padding: 0;
    }
  }

  // 연결선: 굵은 주황 선 위로 짧은 신호가 흐른다.
  .connection {
    .main-path {
      stroke-width: 4px;
      stroke: rgba(255, 138, 0, 0.28);
    }

    .flow-path {
      fill: none;
      stroke: #ffb347;
      stroke-width: 2.5px;
      stroke-linecap: butt;
      stroke-dasharray: 6 10;
      filter: drop-shadow(0 0 3px rgba(255, 138, 0, 0.9));
      pointer-events: none;
      animation: connection-flow 1.1s linear infinite;
    }
  }

  &.locked {
    .node.site .socket {
      &.input {
        border-color: #4a4a52;
      }

      &.output {
        border-color: #4a4a52;
        background: #4a4a52;
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

  #rete .node.site::before {
    transition: none;
  }
}
</style>

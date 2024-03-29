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
// import CommentPlugin from 'rete-comment-plugin'
// import MinimapPlugin from 'rete-minimap-plugin'

import SiteNode from './nodes/site-node'

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

    this.editor.use(AreaPlugin, {
      background,
      snap: true,
      scaleExtent: { min: 0.1, max: 2 },
      translateExtent: { width: 1024, height: 1024 }
    })

    this.editor.use(ConnectionPathPlugin, {
      type: ConnectionPathPlugin.DEFAULT, // DEFAULT or LINEAR transformer
      // curve: ConnectionPathPlugin.curveStep, // curve identifier
      arrow: { color: 'black', marker: 'M-5,-10 L-5,10 L20,0 z' }
    })

    this.editor.use(ReadonlyPlugin, { enabled: true })

    // this.editor.use(CommentPlugin, {
    //   margin: 20 // indent for new frame comments by default 30 (px)
    // })

    // this.editor.use(MinimapPlugin)

    // this.editor.trigger('addcomment', ({ type, text, nodes, position }) => {
    //  TODO: CommentPlugin 기본 추가동작 오버라이드
    // })

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
#rete {
  height: 100%;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;

  .background {
    z-index: -5;

    background-position: 0px 0px, 10px 10px;
    background-size: 20px 20px;
    background-image: linear-gradient(
        45deg,
        #eee 25%,
        transparent 25%,
        transparent 75%,
        #eee 75%,
        #eee 100%
      ),
      linear-gradient(
        45deg,
        #eee 25%,
        white 25%,
        white 75%,
        #eee 75%,
        #eee 100%
      );
  }

  .node.site {
    background-color: white;
    border: 3px solid black;
    border-radius: 24px;
    padding-bottom: 0;
    min-width: initial;
    color: black;

    &.selected {
      background-color: white;
      border: 3px solid black;
      box-shadow: inset 0px 0px 400px 110px rgb(0 0 0 / 10%);
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
      background: white;
      height: 24px;
      width: 24px;
      transform: translateY(-2px);

      &.input {
        border: 3px dashed black;
        margin-left: -32px;
      }

      &.output {
        border: 3px solid black;
        margin-right: -32px;
      }
    }

    .control {
      width: 100%;
      height: 100%;
      display: flex;
      padding: 0;
    }
  }

  .connection {
    .main-path {
      stroke-width: 3px;
      stroke: black;
    }
  }

  &.locked {
    .node.site .socket {
      &.input {
        border: 3px dashed lightgray;
      }

      &.output {
        border: 3px solid lightgray;
      }
    }
  }
}
</style>

<template>
  <div id="rete" ref="rete"></div>
</template>

<script>
import _ from 'lodash'
import Rete from 'rete'
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import AreaPlugin from 'rete-area-plugin'
import ConnectionPathPlugin from 'rete-connection-path-plugin'
import CommentPlugin from 'rete-comment-plugin'
// import AlightRenderPlugin from 'rete-alight-render-plugin'
// import TaskPlugin from 'rete-task-plugin'

import SiteNode from './nodes/site-node'

export default {
  props: {
    editorData: null
  },
  data () {
    return {}
  },
  created () {
    this.editor = null
    this.engine = null
  },
  mounted () {
    // Node
    const nodes = [new SiteNode()]

    const background = document.createElement('div')
    background.classList = 'background'

    // Editor
    this.editor = new Rete.NodeEditor(
      'test@0.1.0',
      document.querySelector('#rete')
    )
    this.editor.use(ConnectionPlugin)
    this.editor.use(VueRenderPlugin)
    this.editor.use(ContextMenuPlugin, {
      nodeItems: {
        Copy: async (args) => {
          const { name, position: [x, y], ...params } = args.node
          const component = this.editor.components.get(name)
          const node = await component.createNode(_.cloneDeep(params.data))

          node.position[0] = x + 25
          node.position[1] = y + 25

          this.editor.addNode(node)
        },
        Clone: false // or Clone item
      }
    })
    this.editor.use(AreaPlugin, { background })
    this.editor.use(ConnectionPathPlugin, {
      type: ConnectionPathPlugin.DEFAULT, // DEFAULT or LINEAR transformer
      // curve: ConnectionPathPlugin.curveStep, // curve identifier
      arrow: { color: 'steelblue', marker: 'M-5,-10 L-5,10 L20,0 z' }
    })
    this.editor.use(CommentPlugin, {
      margin: 20 // indent for new frame comments by default 30 (px)
    })
    // editor.use(AlightRenderPlugin) // VueRenderPlugin과 같이 사용하면 오작동함
    // editor.use(TaskPlugin)

    this.engine = new Rete.Engine('test@0.1.0')

    nodes.map((c) => {
      this.editor.register(c)
      this.engine.register(c)
    })

    this.editor.on(
      ['connectioncreate', 'connectionremove', 'nodecreate', 'noderemove', 'process'],
      async () => {
        if (this.editor.silent) return

        await this.compile()
      }
    )

    this.editor.view.area.zoom(0.85, 0, 0)
  },
  watch: {
    async editorData () {
      if (this.editorData) {
        this.load(this.editorData)
      } else {
        await this.engine.abort()
        this.load(JSON.stringify({ id: 'test@0.1.0', nodes: {} }))
      }
    }
  },
  methods: {
    async compile () {
      await this.engine.abort()
      await this.engine.process(this.editor.toJSON())

      return this.editor.toJSON()
    },
    load (editorSaveData) {
      this.editor.fromJSON(JSON.parse(editorSaveData)).then(() => {
        this.editor.view.resize()

        this.compile()
      })
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
    height: 210px;
    width: 200px;
    background-color: #4682b42b;
    border: 2px dashed #4682b4;
    padding-bottom: initial;

    .title {
      display: none;
    }

    &.selected {
      background-color: #e3c0002b;
      border: 2px dashed #e3c000;
    }

    .socket {
      background: white;
      height: 24px;
      width: 24px;

      &.input {
        border: 2px dashed gray;
        margin-left: -32px;
      }

      &.output {
        border: 2px dashed green;
        margin-right: -32px;
      }
    }

    .input .input-title {
      color: black;
    }

    .output .output-title {
      color: black;
    }

    .control {
      padding: 2px 20px;
    }
  }

  .connection .main-path {
    stroke-width: 3px;
  }
}
</style>

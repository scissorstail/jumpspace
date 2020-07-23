<template>
  <div id="rete" ref="rete"></div>
</template>

<script>
import Rete from 'rete'
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import AreaPlugin from 'rete-area-plugin'
import ConnectionPathPlugin from 'rete-connection-path-plugin'
// import AlightRenderPlugin from 'rete-alight-render-plugin'
// import TaskPlugin from 'rete-task-plugin'

import TestNode from './nodes/TestNode'

export default {
  data () {
    return {}
  },
  mounted () {
    // Node
    const nodes = [
      new TestNode()
    ]

    const background = document.createElement('div')
    background.classList = 'background'

    // Editor
    const editor = new Rete.NodeEditor('test@0.1.0', document.querySelector('#rete'))
    editor.use(ConnectionPlugin)
    editor.use(VueRenderPlugin)
    editor.use(ContextMenuPlugin)
    editor.use(AreaPlugin, { background })
    editor.use(ConnectionPathPlugin, {
      type: ConnectionPathPlugin.DEFAULT, // DEFAULT or LINEAR transformer
      curve: ConnectionPathPlugin.curveStep, // curve identifier
      arrow: { color: 'steelblue', marker: 'M-5,-10 L-5,10 L20,0 z' }
    })
    // editor.use(AlightRenderPlugin)
    // editor.use(TaskPlugin)

    const engine = new Rete.Engine('test@0.1.0')

    nodes.map(c => {
      editor.register(c)
      engine.register(c)
    })

    async function compile () {
      await engine.abort()
      console.log(editor.toJSON())
      await engine.process(editor.toJSON())
    }

    editor.on('connectioncreate connectionremove nodecreate noderemove process', () => {
      if (editor.silent) { return }

      compile()
    })

    /*
    editor.fromJSON().then(() => {
      editor.view.resize()

      compile()
    })
    */
  }
}
</script>

<style>
#rete {
  height: 100%;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;
}

.tooltip {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 6px;
  color: white;
  z-index: 10000;
}

#rete .node.site {
  min-width: 180px;
  background-color: #4682b42b;
  border: 2px dashed #4682b4;
}

#rete .node.site .title {
  display: none;
}

#rete .node.site.selected {
  background-color: #e3c0002b;
  border: 2px dashed #e3c000;
}

#rete .node.site .socket {
  background: white;
  height: 24px;
  width: 24px;
}

#rete .node.site .socket.input {
  border: 2px dashed green;
  margin-left: -32px;
}

#rete .node.site .input .input-title {
  color: black;
}

#rete .node.site .socket.output {
  border: 2px dashed grey;
  margin-right: -32px;
}

#rete .node.site .output .output-title {
  color: black;
}

#rete .connection .main-path {
  stroke-width: 3px;
}

#rete {
}

#rete .background {
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
    linear-gradient(45deg, #eee 25%, white 25%, white 75%, #eee 75%, #eee 100%);
}
</style>

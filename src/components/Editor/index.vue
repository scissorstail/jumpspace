<template>
  <div id="rete" ref="rete"></div>
</template>

<script>
import Rete from 'rete'
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import AreaPlugin from 'rete-area-plugin'
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

    // Editor
    const editor = new Rete.NodeEditor('test@0.1.0', document.querySelector('#rete'))
    editor.use(ConnectionPlugin)
    editor.use(VueRenderPlugin)
    editor.use(ContextMenuPlugin)
    editor.use(AreaPlugin)
    // editor.use(AlightRenderPlugin)
    // editor.use(TaskPlugin)

    const engine = new Rete.Engine('test@0.1.0')

    nodes.map(c => {
      editor.register(c)
      engine.register(c)
    })

    async function compile () {
      await engine.abort()
      await engine.process(editor.toJSON())
    }

    editor.on('connectioncreate connectionremove nodecreate noderemove', () => {
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

#rete .node {
  min-width: 150px;
  min-height: 150px;
  background-color: transparent;
  border: 2px dashed black;
}

#rete .node.selected {
  background-color: transparent;
  border: 2px dashed #e3c000;
}

#rete .socket {
  border: 2px dashed lightgrey;
  background: white;
  height: 24px;
  width: 24px;
  border-radius: initial;
}

#rete .socket.input {
  margin-left: -32px;
}

#rete .socket.output {
  margin-right: -32px;
}
</style>

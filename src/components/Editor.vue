<template>
  <div id="rete" ref="rete"></div>
</template>

<script>
import Rete from 'rete'
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import AreaPlugin from 'rete-area-plugin'
import AlightRenderPlugin from 'rete-alight-render-plugin'
import TaskPlugin from 'rete-task-plugin'

export default {
  data () {
    return {}
  },
  mounted () {

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
</style>

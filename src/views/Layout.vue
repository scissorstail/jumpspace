<template>
    <Rete></Rete>
</template>

<script>
import Rete from '../components/Rete'

export default {
  name: 'Layout',
  components: {
    Rete
  }
}
</script>

<style>
.tooltip {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 6px;
  color: white;
  z-index: 10000;
}
</style>

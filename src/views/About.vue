<template>
  <div>
    <Rete></Rete>
  </div>
</template>

<script>
import Rete from "../components/Rete";

export default {
  name: "About",
  components: {
    Rete
  }
};
</script>

<style scoped>
#app {
  width: 100%;
  height: 100%;
}

.help-button {
  position: absolute;
  left: 5px;
  bottom: 5px;
  z-index: 6;
}
</style>

<style>
.tooltip {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 6px;
  color: white;
  z-index: 10000;
}
</style>

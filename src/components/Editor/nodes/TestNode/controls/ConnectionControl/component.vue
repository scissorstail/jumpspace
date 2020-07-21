<template>
  <div>
    <v-popover offset="50%" style="text-align: right" placement="top">
      <button class="info-edit">편집</button>

      <template slot="popover">
        <div class="info-list">
          <div class="info-item">
            <div>Name:</div>
            <input type="text" v-model.trim="name" />
          </div>
          <div class="info-item">
            <div>Host:</div>
            <input type="text" v-model.trim="host" />
          </div>
          <div class="info-item">
            <div>Port:</div>
            <input type="number" v-model.number="port" />
          </div>
          <div class="info-item">
            <button v-close-popover>닫기</button>
          </div>
        </div>
      </template>
    </v-popover>
    <div>
      <div class="info-block"></div>
      <div class="info-block">
        <div>{{ name || "noname" }}</div>
        <div>{{ host || "localhost" }}:{{ port || "80" }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    data: {
      type: Object,
      default: () => ({})
    }
  },
  mounted () {
    this.name = this.data.name || null
  },
  data () {
    return {
      name: null,
      host: null,
      port: null
    }
  }
}
</script>

<style lang="scss">
.info-block {
  font-size: 14px;
  font-weight: bold;
}

.info-item {
  display: flex;
  justify-content: space-between;
  text-align: right;
  padding: 3px;
  font-size: 12px;

  & > input {
    margin-left: 5px;
  }
}

.tooltip {
  &.popover {
    $color: #f9f9f9;

    .popover-inner {
      background: $color;
      color: black;
      padding: 24px;
      border-radius: 5px;
      box-shadow: 0 5px 30px rgba(black, 0.1);
    }

    .popover-arrow {
      border-color: $color;
    }
  }
}
</style>

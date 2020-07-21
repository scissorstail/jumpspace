<template>
  <div>
    <v-popover offset="50%" style="text-align: right" placement="top">
      <a class="info-edit">
        <v-icon name="cog" scale="1.5" />
      </a>

      <template slot="popover">
        <div class="info-list">
          <div class="info-item">
            <button @click="loadPrevDiagram">이전</button>
            <input type="text" v-model.trim="selectedDiagramFilename" style="margin: 0 3px;"/>
            <button @click="loadNextDiagram">다음</button>
          </div>
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
      <div class="info-block">
        <img
          class="info-diagram"
          width="50%"
          height="50%"
          :src="`/img/diagram/AWS/Compute/${selectedDiagramFilename}`"
        />
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
  data () {
    return {
      name: null,
      host: null,
      port: null,
      diagramFilenames: [],
      selectedDiagramFilename: 'Amazon-Application-Auto-Scaling.svg'
    }
  },
  watch: {
    diagramFilenames () {
      console.log(this.diagramFilenames)
    }
  },
  mounted () {
    this.name = this.data.name || null

    window.readDiagramDir('/AWS/Compute', (err, files) => {
      if (err) {
        console.error(err)
        return
      }

      this.diagramFilenames = files.filter(x => x.endsWith('.svg'))
      console.log(this.diagramFilenames)
    })
  },
  methods: {
    loadPrevDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(x => x === this.selectedDiagramFilename)
      if (foundIndex !== -1) {
        const index = (foundIndex - 1 > 0) ? foundIndex - 1 : (this.diagramFilenames.length - 1)
        this.selectedDiagramFilename = this.diagramFilenames[index]
      } else {
        this.selectedDiagramFilename = 'Amazon-Application-Auto-Scaling.svg'
      }
    },
    loadNextDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(x => x === this.selectedDiagramFilename)
      if (foundIndex !== -1) {
        const index = (foundIndex + 1) > (this.diagramFilenames.length - 1) ? 0 : (foundIndex + 1)
        this.selectedDiagramFilename = this.diagramFilenames[index]
      } else {
        this.selectedDiagramFilename = 'Amazon-Application-Auto-Scaling.svg'
      }
    }
  }
}
</script>

<style lang="scss">
.info-block {
  font-size: 14px;
  font-weight: bold;
}

.info-diagram {
  min-width: 75px;
  min-height: 75px;
  max-width: 75px;
  max-height: 75px;
}

.info-edit {
  margin-bottom: 5px;
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

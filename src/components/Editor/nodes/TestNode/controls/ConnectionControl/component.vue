<template>
  <div>
    <v-popover offset="50%" style="text-align: right; margin-bottom: 5px" placement="top">
      <a class="info-edit">
        <v-icon name="cog" scale="1.5" />
      </a>

      <template slot="popover">
        <div class="info-list">
          <div class="info-item">
            <button @click="loadPrevDiagram">
              <v-icon name="angle-left" scale="1" />
            </button>
            <input type="text" v-model.trim="diagram" style="margin: 0 3px;" />
            <button @click="loadNextDiagram">
              <v-icon name="angle-right" scale="1" />
            </button>
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
          <div class="info-action">
            <button v-close-popover @click="save">
              <v-icon v-close-popover name="save" scale="1" />
            </button>
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
          :src="diagram ? `/img/diagram/AWS/Compute/${diagram}` : null"
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
    emitter: {
      type: Object,
      default: () => ({})
    },
    setValue: {
      type: Function,
      default: () => {}
    },
    info: {
      type: Object,
      default: () => ({})
    }
  },
  data () {
    return {
      name: null,
      host: null,
      port: null,
      diagram: null,
      diagramFilenames: []
    }
  },
  mounted () {
    window.readDiagramDir('/AWS/Compute', (err, files) => {
      if (err) {
        console.error(err)
        return
      }

      this.name = this.info.name || null
      this.host = this.info.host || null
      this.port = this.info.port || null
      this.diagram = this.info.diagram || null
      this.diagramFilenames = files.filter(x => x.endsWith('.svg'))
    })
  },
  methods: {
    loadPrevDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(
        x => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex - 1 > 0
            ? foundIndex - 1
            : this.diagramFilenames.length - 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = 'Amazon-EC2.svg'
      }
    },
    loadNextDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(
        x => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex + 1 > this.diagramFilenames.length - 1
            ? 0
            : foundIndex + 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = 'Amazon-EC2.svg'
      }
    },
    save () {
      this.setValue({
        name: this.name,
        host: this.host,
        port: this.port,
        diagram: this.diagram
      })
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
  padding-bottom: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 3px;
  font-size: 12px;

  & > input {
    margin-left: 5px;
  }
}

.info-action {
  display: flex;
  justify-content: flex-end;
  padding: 3px;

  & > button {
    margin-left: 3px;
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

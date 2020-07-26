<template>
  <div>
    <div class="header-menu">
      <a class="info-edit">
        <v-popover ref="popover" offset="50%" placement="top">
          <v-icon name="cog" height="24" width="24" scale="1.5" class="info-edit-item" />
          <template slot="popover">
            <div class="info-list">
              <div class="info-item">
                <button @click="loadPrevDiagram">
                  <v-icon name="angle-left" height="14" width="14" scale="1" />
                </button>
                <input type="text" v-model.trim="diagram" style="margin: 0 3px;" />
                <button @click="loadNextDiagram">
                  <v-icon name="angle-right" height="14" width="14" scale="1" />
                </button>
              </div>
              <div class="info-item">
                <div>Name:</div>
                <input type="text" v-model.trim="name" />
              </div>
              <div class="info-item">
                <div>User:</div>
                <input type="text" v-model.trim="user" />
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
                <div>Password:</div>
                <input type="password" v-model.trim="password" />
              </div>
              <div class="info-item">
                <div>Key:</div>
                <button @click="$refs.file.click()">
                  <v-icon name="folder-open" height="14" width="14" scale="1" />
                  <input ref="file" type="file" @change="change" style="display:none" />
                </button>
                <input type="text" v-model.trim="keyPath" />
              </div>
              <div class="info-action">
                <button v-close-popover @click="save">
                  <v-icon v-close-popover name="save" scale="1" />
                </button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
      <!--
      <a class="info-edit">
        <v-icon name="cog" height="24" width="24" scale="1.5" class="info-edit-item" />
      </a>
      -->
    </div>
    <div class="info-block" :class="{blur: isBlur}">
      <img
        class="info-diagram"
        width="50%"
        height="50%"
        :src="diagram ? `/img/diagram/AWS/Compute/${diagram}` : null"
      />
      <div class="info-text">{{ name || "noname" }}</div>
      <div class="info-text">{{ host || "localhost" }}</div>
      <div class="info-text">{{ port || "80" }}</div>
    </div>
    <div class="footer-menu">
      <a class="info-edit">
        <v-icon
          name="plug"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="connect"
        />
      </a>
      <a class="info-edit">
        <v-icon
          name="eye-slash"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="blur"
        />
      </a>
    </div>
  </div>
</template>

<script>
import * as upath from 'upath'
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
      isBlur: false,
      name: null,
      user: null,
      host: null,
      port: null,
      diagram: null,
      password: null,
      keyPath: null,
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
      this.user = this.info.user || null
      this.host = this.info.host || null
      this.port = this.info.port || null
      this.diagram = this.info.diagram || null
      this.password = this.info.password || null
      this.keyPath = this.info.keyPath || null
      this.diagramFilenames = files.filter((x) => x.endsWith('.svg'))
    })
  },
  methods: {
    loadPrevDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(
        (x) => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex - 1 > 0 ? foundIndex - 1 : this.diagramFilenames.length - 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = 'Amazon-EC2.svg'
      }
    },
    loadNextDiagram () {
      const foundIndex = this.diagramFilenames.findIndex(
        (x) => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex + 1 > this.diagramFilenames.length - 1 ? 0 : foundIndex + 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = 'Amazon-EC2.svg'
      }
    },
    save () {
      this.setValue({
        name: this.name,
        user: this.user,
        host: this.host,
        port: this.port,
        diagram: this.diagram,
        password: this.password,
        keyPath: this.keyPath
      })

      this.emitter.trigger('process')
    },
    connect () {
      // const command = `-ssh ${this.host} ${this.port} -pw ${this.password}`
      // const command = `ssh -i "~/.ssh/id_rsa.pem" pi@nameeo.gonetis.com -p 4522`
      // const command = `"%ProgramFiles%\\PuTTY\\putty.exe" -ssh "${this.host}" -pw "${this.password}" -P "${this.port}"`
      const command = `"%ProgramFiles%\\Git\\git-bash.exe" -c "ssh -i "${upath.toUnix(this.keyPath)}" "${this.user ? this.user + '@' : ''}${this.host}" -p "${this.port}""`
      console.log(command)
      window.executeCommand(command)
    },
    blur () {
      this.isBlur = !this.isBlur
    },
    change (e) {
      if (this.$refs.file?.files?.[0].path) {
        this.keyPath = this.$refs.file.files[0].path
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

.info-text {
  text-overflow: ellipsis;
  overflow: hidden;
}

.info-item {
  display: flex;
  justify-content: flex-end;
  padding: 3px;
  font-size: 12px;

  & > input {
    margin-left: 5px;
  }

  div:nth-child(1) {
    margin-right: auto;
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

.header-menu {
  display: flex;
  flex-direction: row-reverse;
  position: absolute;
  top: 0px;
  right: 0px;
  padding: 10px;

  .info-edit {
    &-item {
      margin-left: 4px;
    }
  }
}

.footer-menu {
  display: flex;
  flex-direction: row-reverse;
  position: absolute;
  bottom: 0px;
  right: 0px;
  padding: 10px;

  .info-edit {
    &-item {
      margin-left: 4px;
    }
  }
}

.blur {
  filter: blur(4px);
}
</style>

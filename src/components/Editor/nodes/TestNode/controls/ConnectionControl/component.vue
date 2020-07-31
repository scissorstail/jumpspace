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
                <div>Key:</div>
                <button @click="$refs.file.click()">
                  <v-icon name="folder-open" height="14" width="14" scale="1" />
                  <input ref="file" type="file" @change="change" style="display:none" />
                </button>
                <input type="text" v-model.trim="keyPath" />
              </div>
              <div class="info-action">
                <button v-close-popover @click="save" style="margin-left: auto">
                  <v-icon v-close-popover name="save" scale="1" />
                </button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
      <a class="info-edit left">
        <v-popover ref="popover2" offset="50%" placement="top">
          <v-icon name="link" height="24" width="24" scale="1.5" class="info-edit-item" />
          <template slot="popover">
            <div class="info-list">
              <div v-for="(forward, index) in forwards" :key="index" class="info-item">
                <input type="checkbox" class="middle" v-model="forward.checked" />
                <input type="text" class="short" maxlength="5" v-model.trim="forward.from" />
                <span class="middle">
                  <v-icon name="forward" height="14" width="14" scale="1" />
                </span>
                <input type="text" class="short" maxlength="5" v-model.trim="forward.to" />
              </div>
              <div class="info-action">
                <button @click="addForward">
                  <v-icon name="plus" height="14" width="14" scale="1" />
                </button>
                <button @click="removeForward">
                  <v-icon name="minus" height="14" width="14" scale="1" />
                </button>
                <button @click="save" style="margin-left: auto">
                  <v-icon v-close-popover name="save" scale="1" />
                </button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
    </div>
    <div class="info-block" :class="{ blur: isBlur }">
      <img
        class="info-diagram"
        width="50%"
        height="50%"
        :src="diagram ? `/img/diagram/AWS/Compute/${diagram}` : null"
      />
      <div class="info-text">{{ name || 'noname' }}</div>
      <div class="info-text">{{ host || 'localhost' }}</div>
      <div class="info-text">{{ port || '80' }}</div>
    </div>
    <div class="footer-menu">
      <a class="info-edit">
        <v-icon
          v-if="isProxyJump"
          name="bolt"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="jump"
        />
        <v-icon
          v-else
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
      <a class="info-edit left">
        <v-icon
          v-show="isFowardable"
          name="forward"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="forward"
        />
      </a>
    </div>
  </div>
</template>

<script>
import * as upath from 'upath'
import _ from 'lodash'

export default {
  props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
  data () {
    return {
      isBlur: false,
      name: null,
      user: null,
      host: null,
      port: null,
      diagram: null,
      keyPath: null,
      forwards: [],
      diagramFilenames: [],
      prevNodeDataList: []
    }
  },
  created () {
    window.readDiagramDir('/AWS/Compute', (err, files) => {
      if (err) {
        console.error(err)
        return
      }

      this.diagramFilenames = files.filter((x) => x.endsWith('.svg'))
    })
  },
  computed: {
    isFowardable () {
      const prevNodeData = _.last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      // console.log(prevNodeData.host, prevNodeData.user, prevNodeData.port, prevNodeData.keyPath)

      if (prevNodeData.host && prevNodeData.user && prevNodeData.port && prevNodeData.keyPath) {
        return true
      }

      return false
    },
    isProxyJump () {
      return this.isFowardable
    }
  },
  methods: {
    update () {
      const data = this.getData(this.ikey)
      for (const key in data) {
        if (key in this.$data) {
          this[key] = data[key]
        }
      }

      this.prevNodeDataList = this.getData('prevNodeDataList')
    },
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
    connect () {
      const command = `"%ProgramFiles%\\Git\\git-bash.exe" -c "ssh -i "${upath.toUnix(
        this.keyPath
      )}" "${this.user ? this.user + '@' : ''}${this.host}" -p "${this.port}""`
      window.executeCommand(command)
    },
    save () {
      const data = _.pick(this.$data, [
        'isBlur',
        'name',
        'user',
        'host',
        'port',
        'diagram',
        'keyPath',
        'forwards'
      ])
      if (this.ikey) { this.putData(this.ikey, { ...data }) }
      this.emitter.trigger('process')
    },
    blur () {
      this.isBlur = !this.isBlur
    },
    change (e) {
      if (this.$refs.file?.files?.[0].path) {
        this.keyPath = this.$refs.file.files[0].path
      }
    },
    addForward () {
      this.forwards.push({
        checked: false,
        from: null,
        to: null
      })
    },
    removeForward () {
      this.forwards = this.forwards.filter(x => !x.checked)
    },
    forward () {
      const prevNodeData = _.last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      const ctlPathFile = `[${this.name}]L-${prevNodeData.user}@${prevNodeData.host}_${prevNodeData.port}.ctl`
      const fowardList = this.forwards.filter(x => x.checked).map(x => `-L "localhost:${x.from}:${this.host}:${x.to}"`).join(' ')
      if (fowardList === '') {
        return
      }

      const command = `"%ProgramFiles%\\Git\\git-bash.exe" -c "echo "${ctlPathFile}" && ssh -i "${upath.toUnix(prevNodeData.keyPath)}" "${prevNodeData.user}@${prevNodeData.host}" -p "${prevNodeData.port}" -N -M -S "${ctlPathFile}" ${fowardList}"`
      /*
      const command = `"%ProgramFiles%\\Git\\git-bash.exe" -c "ssh -i "${upath.toUnix(
        this.keyPath
      )}" "${this.user ? this.user + '@' : ''}${this.host}" -p "${this.port}""`
      */
      window.executeCommand(command)
    },
    jump () {
      const nodes = this.prevNodeDataList.concat({ ...this.$data })
      const jumpHosts = []

      let str = ''
      for (let i = 0; i < nodes.length; i += 1) {
        const { host, user, port, keyPath } = nodes[i]

        const hostHash = window.md5(host + user + port)
        jumpHosts.push(hostHash)

        str += `Host ${hostHash}\r\n`
        str += `HostName ${host}\r\n`
        str += `User ${user}\r\n`
        str += `Port ${port}\r\n`
        str += `Identityfile ${upath.toUnix(keyPath)}\r\n`
        str += '\r\n'
      }

      const configTempFilename = `${window.md5(str)}.jmp`

      window.writeFileSync(configTempFilename, str)

      const destHost = jumpHosts.pop()
      const command = `"%ProgramFiles%\\Git\\git-bash.exe" -c "echo "${configTempFilename}" && ssh -F "${configTempFilename}" -J ${jumpHosts.join(',')} ${destHost}"`

      window.executeCommand(command, (output) => {
        setTimeout(() => window.unlinkFile(configTempFilename), 3000)
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

    &.short {
      width: 40px;
    }
  }

  .middle {
    line-height: 18px;
    margin-left: 5px;
  }

  div:nth-child(1) {
    margin-right: auto;
  }
}

.info-action {
  display: flex;
  justify-content: flex-start;
  padding: 3px;
  min-width: 140px;

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
  left: 0px;
  right: 0px;
  padding: 10px;

  .info-edit {
    &.left {
      margin-right: auto;
    }

    &.right {
      margin-left: auto;
    }

    &-item {
      margin-left: 4px;
    }

    &-text {
      vertical-align: top;
      line-height: 24px;
      margin-left: 4px;
    }
  }
}

.footer-menu {
  display: flex;
  flex-direction: row-reverse;
  position: absolute;
  bottom: 0px;
  left: 0px;
  right: 0px;
  padding: 10px;

  .info-edit {
    &.left {
      margin-right: auto;
    }

    &.right {
      margin-left: auto;
    }

    &-item {
      margin-left: 4px;
    }

    &-text {
      vertical-align: top;
      line-height: 24px;
    }
  }
}

.blur {
  filter: blur(4px);
}
</style>

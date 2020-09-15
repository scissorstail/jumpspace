<template>
  <div class="component">
    <div class="header-menu">
      <a class="info-edit">
        <!-- setting popover -->
        <v-popover ref="popover" placement="auto-end" @hide="save">
          <v-icon name="cog" height="24" width="24" scale="1.5" class="info-edit-item" />
          <template slot="popover">
            <div class="p-3">
              <div class="info-list" style="width: 280px;">
                <div class="info-item mb-3">
                  <b-button size="sm" @click="loadPrevDiagram">
                    <v-icon name="angle-left" height="14" width="14" scale="1" />
                  </b-button>
                  <b-form-input size="sm" v-model.trim="diagram" style="margin: 0 3px;" />
                  <b-button size="sm" @click="loadNextDiagram">
                    <v-icon name="angle-right" height="14" width="14" scale="1" />
                  </b-button>
                </div>
                <b-form-group label-cols-sm="3" label="Name" label-align="left" class="mb-0">
                  <b-form-input size="sm" v-model.trim="name" />
                </b-form-group>
                <b-form-group label-cols-sm="3" label="User" label-align="left" class="mb-0">
                  <b-form-input size="sm" v-model.trim="user" />
                </b-form-group>
                <b-form-group label-cols-sm="3" label="Host" label-align="left" class="mb-0">
                  <b-form-input size="sm" v-model.trim="host" />
                </b-form-group>
                <b-form-group label-cols-sm="3" label="Port" label-align="left" class="mb-0">
                  <b-form-input size="sm" v-model.trim="port" />
                </b-form-group>
                <b-form-group label="Key" label-cols-sm="3" label-align="left" class="mb-0">
                  <b-input-group size="sm">
                    <template v-slot:append>
                      <b-button v-if="keyPath" size="sm" @click="keyPath = ''">
                        <v-icon name="trash-alt" height="14" width="14" scale="1" />
                      </b-button>
                      <b-button v-else size="sm" @click="$refs.file.click()">
                        <v-icon name="folder-open" height="14" width="14" scale="1" />
                      </b-button>
                    </template>
                    <b-form-input size="sm" :value="keyPath" readonly />
                    <input ref="file" type="file" @change="change" style="display:none" />
                  </b-input-group>
                </b-form-group>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
      <a class="info-edit left">
        <!-- forward popover-->
        <v-popover ref="popover2" placement="auto-end" @hide="save">
          <v-icon name="link" height="24" width="24" scale="1.5" class="info-edit-item" />
          <template slot="popover">
            <div class="p-3">
              <div class="info-list" style="width: 225px;">
                <div v-for="(forward, index) in forwards" :key="index" class="info-item mb-1">
                  <b-form-checkbox size="lg" class="middle" v-model="forward.checked" />
                  <b-form-input size="sm" class="mr-2" maxlength="5" v-model.trim="forward.from" />
                  <span class="middle" :style="{opacity:forward.checked ? 1.0 : 0.1}">
                    <v-icon name="forward" height="14" width="14" scale="1" />
                  </span>
                  <b-form-input size="sm" class="ml-2" maxlength="5" v-model.trim="forward.to" />
                  <b-button class="ml-2" size="sm" @click="removeForward(forward)">
                    <v-icon name="minus" height="14" width="14" scale="1" />
                  </b-button>
                </div>
              </div>
              <div class="info-action" :class="[forwards.length > 0 ? 'mt-2' : '']">
                <b-button size="sm" @click="addForward" class="mr-1">
                  <v-icon name="plus" height="14" width="14" scale="1" />
                </b-button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
    </div>

    <div class="info-block" :class="{ blur: isBlur }">
      <img
        class="info-diagram mb-1"
        width="40%"
        height="40%"
        :src="diagram ? `/img/diagram/servers/${diagram}` : null"
      />
      <div class="info-text">{{ name || 'noname' }}</div>
      <div class="info-text">{{ host || '---' }}</div>
      <div class="info-text">{{ port || '---' }}</div>
    </div>

    <div class="footer-menu">
      <a class="info-edit">
        <v-icon
          v-if="isProxyJumpReady"
          name="bolt"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="proxyJump"
        />
        <v-icon
          v-if="isConnectable && !isProxyJumpReady"
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
          :style="{opacity: isFowardable && forwards.some(x => x.checked) ? 1.0 : 0.5}"
          v-show="isFowardable"
          name="forward"
          height="24"
          width="24"
          scale="1.5"
          class="info-edit-item"
          @click="isFowardable && forwards.some(x => x.checked) ? forward() : ''"
        />
      </a>
    </div>
  </div>
</template>

<script>
import * as upath from 'upath'
import _ from 'lodash'
import store from '../../../../../../store'
import mixin from '../../../../../../mixin'

export default {
  props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
  store,
  mixins: [mixin],
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
    this.diagramFilenames = this.$store.getters.diagram
  },
  computed: {
    isConnectable () {
      return this.user && this.host && this.port && this.keyPath
    },
    isFowardable () {
      const prevNodeData = _.last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      if (prevNodeData.host && prevNodeData.user && prevNodeData.port && prevNodeData.keyPath) {
        return true
      }

      return false
    },
    isProxyJumpReady () {
      return this.isConnectable && this.isFowardable
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
        this.diagram = _.head(this.diagramFilenames)
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
        this.diagram = _.head(this.diagramFilenames)
      }
    },
    connect () {
      const command = `"${this.setting.gitBashPath}" -c "ssh -i "${upath.toUnix(
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
      if (e.target.files?.[0].path) {
        this.keyPath = e.target.files[0].path
        this.$refs.file.value = ''
      }
    },
    addForward () {
      this.forwards.push({
        checked: false,
        from: null,
        to: null
      })
    },
    removeForward (forward) {
      this.forwards = this.forwards.filter(x => x !== forward)
    },
    forward () {
      const prevNodeData = _.last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      const ctlPathFile = `[${this.name}]L-${prevNodeData.user}@${prevNodeData.host}_${prevNodeData.port}.ctl`
      const forwardList = this.forwards.filter(x => x.checked && x.from && x.to)
      if (forwardList.length === 0) {
        return
      }

      const command = `"${this.setting.gitBashPath}" -c "echo 'Foward...' && ${forwardList.map((x, i) => `echo 'localhost:${x.from} >> [${prevNodeData.name}]${prevNodeData.host}:${prevNodeData.port} >> [${this.name}]${this.host}:${x.to}'`).join('&&')} && ssh -i "${upath.toUnix(prevNodeData.keyPath)}" "${prevNodeData.user}@${prevNodeData.host}" -p "${prevNodeData.port}" -N -M -S "${ctlPathFile}" ${forwardList.map(x => `-L "localhost:${x.from}:${this.host}:${x.to}"`).join(' ')}"`

      window.executeCommand(command)
    },
    proxyJump () {
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
      const command = `"${this.setting.gitBashPath}" -c "echo 'ProxyJump...' && ${nodes.map((x, i) => `echo '>>> [${x.name}]${x.host}:${x.port}'`).join('&&')} && ssh -F "${configTempFilename}" -J ${jumpHosts.join(',')} ${destHost}"`

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
  min-width: 68px;
  min-height: 68px;
  max-width: 68px;
  max-height: 68px;
}

.info-text {
  text-overflow: ellipsis;
  overflow: hidden;
}

.info-item {
  display: flex;
  align-items: center;
}

.info-action {
  display: flex;
  justify-content: flex-start;
  min-width: 140px;
}

.vt-popover {
  z-index: 10000;

  &:focus {
    outline: 1px dashed #e3c000;
  }

  &[aria-hidden='true'] {
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.15s, visibility 0.15s;
  }

  &[aria-hidden='false'] {
    visibility: visible;
    opacity: 0.9;
    transition: opacity 0.15s;
  }

  &-inner {
    background: #f9f9f9;
    color: black;
    border-radius: 5px;
    box-shadow: 0 5px 30px rgba(black, 0.1);
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

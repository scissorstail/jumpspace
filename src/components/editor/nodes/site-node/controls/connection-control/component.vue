<template>
  <div class="component">
    <div class="header-menu">
      <a class="menu-item">
        <b-icon
          v-if="isProxyJumpReady"
          title="ProxyJump"
          class="menu-item-icon"
          icon="terminal"
          font-scale="2"
          @click="proxyJump"
        />
        <b-icon
          v-else-if="isConnectable && !isProxyJumpReady"
          title="Connect"
          class="menu-item-icon"
          icon="terminal"
          font-scale="2"
          @click="connect"
        />
      </a>
      <a
        v-show="isForwardable"
        class="menu-item"
      >
        <b-icon
          :style="{opacity: isForwardable && forwards.some(x => x.checked) ? 1.0 : 0.5}"
          title="Forward"
          class="menu-item-icon"
          icon="arrow-left-right"
          font-scale="2"
          @click="isForwardable && forwards.some(x => x.checked) ? openForward() : ''"
        />
      </a>
      <a class="menu-item">
        <!-- forward popover-->
        <v-popover
          ref="popover2"
          placement="auto-end"
          @hide="save"
        >
          <b-icon
            title="Forward list"
            class="menu-item-icon"
            icon="link45deg"
            font-scale="2"
          />
          <template slot="popover">
            <div class="p-3">
              <div
                class="info-list"
                style="width: 225px;"
              >
                <div
                  v-for="(forward, index) in forwards"
                  :key="index"
                  class="info-item mb-1"
                >
                  <b-form-checkbox
                    v-model="forward.checked"
                    class="middle"
                    size="lg"
                    :disabled="isLocked"
                  />
                  <b-form-input
                    v-model.trim="forward.from"
                    class="mr-2"
                    maxlength="5"
                    size="sm"
                    :disabled="isLocked"
                  />
                  <span
                    :style="{ opacity: forward.checked ? 1.0 : 0.1 }"
                    class="middle"
                  >
                    <b-icon
                      icon="arrow-left-right"
                      font-scale="1"
                    />
                  </span>
                  <b-form-input
                    v-model.trim="forward.to"
                    class="ml-2"
                    maxlength="5"
                    size="sm"
                    :disabled="isLocked"
                  />
                  <b-button
                    class="ml-2"
                    size="sm"
                    title="Remove Forward"
                    :disabled="isLocked"
                    @click="removeForward(forward)"
                  >
                    <b-icon
                      icon="dash"
                    />
                  </b-button>
                </div>
              </div>
              <div
                class="info-action"
              >
                <b-button
                  class="mr-1 mt-2"
                  size="sm"
                  title="Add Forward"
                  :disabled="isLocked"
                  @click="addForward"
                >
                  <b-icon
                    icon="plus"
                  />
                </b-button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
      <a class="menu-item">
        <!-- setting popover -->
        <v-popover
          ref="popover"
          placement="auto-end"
          @hide="save"
        >
          <b-icon
            title="Setting"
            class="menu-item-icon"
            icon="gear"
            font-scale="2"
          />
          <template slot="popover">
            <div class="p-3">
              <div
                class="info-list"
                style="width: 280px;"
              >
                <div class="info-item mb-3">
                  <b-button
                    size="sm"
                    :disabled="isLocked"
                    @click="loadPrevDiagram"
                  >
                    <b-icon
                      class="menu-item-icon"
                      icon="arrow-left-short"
                    />
                  </b-button>
                  <b-form-input
                    v-model.trim="diagram"
                    size="sm"
                    style="margin: 0 3px;"
                    :disabled="isLocked"
                  />
                  <b-button
                    size="sm"
                    :disabled="isLocked"
                    @click="loadNextDiagram"
                  >
                    <b-icon
                      class="menu-item-icon"
                      icon="arrow-right-short"
                    />
                  </b-button>
                </div>
                <b-form-group
                  class="mb-0"
                  label="Name"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-form-input
                    v-model.trim="name"
                    size="sm"
                    :disabled="isLocked"
                  />
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="User"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-form-input
                    v-model.trim="user"
                    size="sm"
                    :disabled="isLocked"
                  />
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="Host"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-form-input
                    v-model.trim="host"
                    size="sm"
                    :disabled="isLocked"
                  />
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="Port"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-form-input
                    v-model.trim="port"
                    placeholder="(To blank when Forwarding)"
                    size="sm"
                    :disabled="isLocked"
                  />
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="Key"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-input-group size="sm">
                    <template #append>
                      <b-button
                        size="sm"
                        :disabled="isLocked"
                        @click="$refs.file.click()"
                      >
                        <b-icon
                          class="menu-item-icon"
                          icon="key-fill"
                        />
                      </b-button>
                    </template>
                    <b-form-input
                      v-model.trim="keyPath"
                      size="sm"
                      :disabled="isLocked"
                    />
                    <input
                      ref="file"
                      style="display:none"
                      type="file"
                      @change="change"
                    >
                  </b-input-group>
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="Exec"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-form-input
                    v-model.trim="exec"
                    size="sm"
                    :disabled="isLocked"
                  />
                </b-form-group>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
    </div>

    <div
      class="info-block"
    >
      <img
        :src="diagram ? `/img/diagram/servers/${diagram}` : null"
        class="info-diagram mb-1"
        height="40%"
        width="40%"
      >
      <div class="info-field">
        <div
          class="info-text"
          :title="name || '(untitled)'"
        >
          {{ name || '(untitled)' }}
        </div>
        <div
          class="info-text"
          :title="user || ''"
        >
          {{ user || '' }}
        </div>
        <div
          class="info-text"
          :title="host || ''"
        >
          {{ host || '' }}
        </div>
        <div
          class="info-text"
          :title="port || ''"
        >
          {{ port || '' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import * as upath from 'upath'
import head from 'lodash/head'
import last from 'lodash/last'
import pick from 'lodash/pick'
import store from '../../../../../../store'
import mixin from '../../../../../../mixin'

export default {
  mixins: [mixin],
  props: {
    readonly: {
      // for connections and nodes, not for controls
      type: Boolean,
      default: false
    },
    emitter: {
      type: Object,
      default: () => {}
    },
    ikey: {
      type: String,
      default: ''
    },
    getData: {
      type: Function,
      default: () => {}
    },
    putData: {
      type: Function,
      default: () => {}
    }
  },
  store,
  data() {
    return {
      isLocked: false,
      name: null,
      user: null,
      host: null,
      port: null,
      exec: null,
      diagram: null,
      keyPath: null,
      forwards: [],
      diagramFilenames: [],
      prevNodeDataList: []
    }
  },
  computed: {
    isConnectable() {
      return this.user && this.host && this.port
    },
    isForwardable() {
      const prevNodeData = last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      if (
        prevNodeData.host &&
        prevNodeData.user &&
        prevNodeData.port &&
        prevNodeData.keyPath
      ) {
        return true
      }

      return false
    },
    isProxyJumpReady() {
      return this.isConnectable && this.isForwardable
    }
  },
  created() {
    this.diagramFilenames = this.$store.getters.diagram
  },
  methods: {
    loadPrevDiagram() {
      const foundIndex = this.diagramFilenames.findIndex(
        (x) => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex - 1 > 0 ? foundIndex - 1 : this.diagramFilenames.length - 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = head(this.diagramFilenames)
      }
    },
    loadNextDiagram() {
      const foundIndex = this.diagramFilenames.findIndex(
        (x) => x === this.diagram
      )
      if (foundIndex !== -1) {
        const index =
          foundIndex + 1 > this.diagramFilenames.length - 1 ? 0 : foundIndex + 1
        this.diagram = this.diagramFilenames[index]
      } else {
        this.diagram = head(this.diagramFilenames)
      }
    },
    connect() {
      const keyPathCommand = this.keyPath ? `-i '${upath.toUnix(this.keyPath)}'` : ''
      const destHost = `${this.user ? this.user + '@' : ''}${this.host}`
      const echoCommands = [`echo 'Connect... ${destHost}:${this.port} (${this.name})'`, "echo ''"].join(' && ')
      const execCommand = this.exec ? `-tt '${this.exec}; exec $SHELL'` : ''

      const command = `"${this.setting.gitBashPath}" -c " ${echoCommands} && ssh -o 'StrictHostKeyChecking=accept-new' ${keyPathCommand} -p '${this.port}' '${destHost}' ${execCommand}"`

      console.log(command)

      window.preload.executeCommand(command, (output) => {
        console.log('Connect output:', output)
      })
    },
    openForward() {
      const prevNodeData = last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      const forwardList = this.forwards.filter(
        (x) => x.checked && x.from && x.to
      )

      if (forwardList.length === 0) {
        return
      }

      const keyPathToUnix = upath.toUnix(prevNodeData.keyPath)
      const remoteHost = `${prevNodeData.user}@${prevNodeData.host}`
      const remotePort = prevNodeData.port
      const destHost = `${this.user}@${this.host}`
      const echoCommands = [
        "echo 'Forward...'",
        `echo 'localhost -> ${remoteHost}:${remotePort} (${prevNodeData.name}) -> ${destHost} (${this.name})'`,
        ...forwardList.map(x => `echo 'localhost:${x.from} <-> ${prevNodeData.name} <-> ${this.name}:${x.to}'`),
        "echo ''"
      ].join(' && ')
      const ctlPathTempFilename = `${window.preload.md5(`${remoteHost}:${remotePort}` + Date.now())}.ctl`
      const forwardCommand = forwardList.map((x) => `-L 'localhost:${x.from}:${this.host}:${x.to}'`).join(' ')

      const command = `"${this.setting.gitBashPath}" -c "${echoCommands} && ssh -o 'StrictHostKeyChecking=accept-new' -i '${keyPathToUnix}' -p '${remotePort}' -N -M -S '${ctlPathTempFilename}' ${forwardCommand} '${remoteHost}'"`

      console.log(command)

      window.preload.executeCommand(command, (output) => {
        console.log('Forward output:', output)
      })
    },
    addForward() {
      this.forwards.push({
        checked: false,
        from: null,
        to: null
      })
    },
    removeForward(forward) {
      this.forwards = this.forwards.filter((x) => x !== forward)
    },
    proxyJump() {
      const nodes = this.prevNodeDataList.concat({ ...this.$data })
      const jumpHosts = []

      let str = ''
      for (let i = 0; i < nodes.length; i += 1) {
        const { host, user, port, keyPath } = nodes[i]

        const pathHash = window.preload.md5(jumpHosts.join(''))
        const hostHash = window.preload.md5(pathHash + host + user + port)
        jumpHosts.push(hostHash)

        str += `Host ${hostHash}\r\n`
        str += `HostName ${host}\r\n`
        str += `HostKeyAlias ${hostHash}\r\n`
        str += 'StrictHostKeyChecking=accept-new\r\n'
        str += `User ${user}\r\n`
        str += `Port ${port}\r\n`
        str += `Identityfile ${upath.toUnix(keyPath)}\r\n`
        str += '\r\n'
      }

      const echoCommands = ["echo 'ProxyJump...'", ...nodes.map(x => `echo '>>> ${x.host}:${x.port} (${x.name})'`), "echo ''"].join(' && ')
      const configTempFilename = `${window.preload.md5(str + Date.now())}.jmp`
      const destHost = jumpHosts.pop()
      const jumpPath = jumpHosts.join(',')
      const execCommand = this.exec ? `-tt '${this.exec}; exec $SHELL'` : ''

      const command = `"${this.setting.gitBashPath}" -c "${echoCommands} && ssh -o 'StrictHostKeyChecking=accept-new' -F '${configTempFilename}' -J '${jumpPath}' '${destHost}' ${execCommand}"`

      console.log(command)

      window.preload.writeFileSync(configTempFilename, str)
      window.preload.executeCommand(command, (output) => {
        console.log('ProxyJump output:', output)
        setTimeout(() => window.preload.unlinkFile(configTempFilename), 3000)
      })
    },
    update() {
      const data = this.getData(this.ikey)
      for (const key in data) {
        if (key in this.$data) {
          this[key] = data[key]
        }
      }

      this.prevNodeDataList = this.getData('prevNodeDataList')
    },
    change(e) {
      if (e.target.files?.[0].path) {
        this.keyPath = e.target.files[0].path
        this.$refs.file.value = ''
      }
    },
    save() {
      const data = pick(this.$data, [
        'name',
        'user',
        'host',
        'port',
        'diagram',
        'keyPath',
        'forwards',
        'exec'
      ])
      if (this.ikey) {
        this.putData(this.ikey, { ...data })
      }
    }
  }
}
</script>

<style lang="scss">
.component {
  padding: 16px;
  z-index: 1;

  &:hover {
    .header-menu {
      opacity: 1;
    }
  }
}

.header-menu {
  width: calc(100% * 2);
  display: flex;
  justify-content: center;
  position: absolute;
  top: -45px;
  left: -50px;
  right: 0px;
  padding-bottom: 10px;
  opacity: 0;
  transition: all 0.3s;
}

.menu-item {
  background-color: transparent;
  border: 1px solid transparent;
  margin: 1px;
}

.info {
  &-list {
    .form-row {
      align-items: center;
    }
  }

  &-block {
    font-weight: bold;
    text-align: center;
    color: black;
  }

  &-diagram {
    min-width: 68px;
    min-height: 68px;
    max-width: 68px;
    max-height: 68px;
  }

  &-field {
    position: absolute;
    left: -50px;
    right: 0px;
    top: 100%;
    width: calc(100% * 2);
    padding-top: 10px;
  }

  &-text {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  &-item {
    display: flex;
    align-items: center;
  }

  &-action {
    display: flex;
    justify-content: flex-start;
    min-width: 140px;
  }
}

.vt-popover {
  z-index: 10000;

  &:focus {
    outline: 1px dashed #80bdff;
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
</style>

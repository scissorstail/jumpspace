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
                  />
                  <b-form-input
                    v-model.trim="forward.from"
                    class="mr-2"
                    maxlength="5"
                    size="sm"
                  />
                  <span
                    :style="{ opacity: forward.checked ? 1.0 : 0.1 }"
                    class="middle"
                  >
                    <v-icon
                      height="15"
                      name="forward"
                      scale="1"
                      width="15"
                    />
                  </span>
                  <b-form-input
                    v-model.trim="forward.to"
                    class="ml-2"
                    maxlength="5"
                    size="sm"
                  />
                  <b-button
                    class="ml-2"
                    size="sm"
                    title="Remove Forward"
                    @click="removeForward(forward)"
                  >
                    <v-icon
                      height="15"
                      name="minus"
                      scale="1"
                      width="15"
                    />
                  </b-button>
                </div>
              </div>
              <div
                :class="[forwards.length > 0 ? 'mt-2' : '']"
                class="info-action"
              >
                <b-button
                  class="mr-1"
                  size="sm"
                  title="Add Forward"
                  @click="addForward"
                >
                  <v-icon
                    height="15"
                    name="plus"
                    scale="1"
                    width="15"
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
                    @click="loadPrevDiagram"
                  >
                    <v-icon
                      height="15"
                      name="angle-left"
                      scale="1"
                      width="15"
                    />
                  </b-button>
                  <b-form-input
                    v-model.trim="diagram"
                    size="sm"
                    style="margin: 0 3px;"
                  />
                  <b-button
                    size="sm"
                    @click="loadNextDiagram"
                  >
                    <v-icon
                      height="15"
                      name="angle-right"
                      scale="1"
                      width="15"
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
                        v-if="keyPath"
                        size="sm"
                        @click="keyPath = ''"
                      >
                        <v-icon
                          height="15"
                          name="trash-alt"
                          scale="1"
                          width="15"
                        />
                      </b-button>
                      <b-button
                        v-else
                        size="sm"
                        @click="$refs.file.click()"
                      >
                        <v-icon
                          height="15"
                          name="folder-open"
                          scale="1"
                          width="15"
                        />
                      </b-button>
                    </template>
                    <b-form-input
                      v-model.trim="keyPath"
                      size="sm"
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
      const command = `"${this.setting.gitBashPath}" -c "ssh -o 'StrictHostKeyChecking=accept-new' ${
        this.keyPath
          ? `-i '${upath.toUnix(this.keyPath)}' `
          : ''
      }${this.user ? this.user + '@' : ''}${this.host} -p '${this.port}' ${
        this.exec
        ? `-tt '${this.exec}; exec $SHELL'`
        : ''
      }"`

      console.log(command)

      window.preload.executeCommand(command)
    },
    openForward() {
      const prevNodeData = last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      const ctlPathTempFilename = `${window.preload.md5(`${prevNodeData.user}${prevNodeData.host}${prevNodeData.port}` + Date.now())}.ctl`
      const forwardList = this.forwards.filter(
        (x) => x.checked && x.from && x.to
      )
      if (forwardList.length === 0) {
        return
      }

      const command = `"${
        this.setting.gitBashPath
      }" -c "echo 'Forward...' && ${
        forwardList
          .map((x, i) => `echo ':${x.from} >> [${prevNodeData.host}]:${prevNodeData.port} -> :${x.to}'`)
          .join('&&')
      } && ssh -o 'StrictHostKeyChecking=accept-new' -i "${upath.toUnix(prevNodeData.keyPath)}" "${prevNodeData.user}@${prevNodeData.host}" -p "${prevNodeData.port}" -N -M -S "${ctlPathTempFilename}" ${
        forwardList
          .map((x) => `-L "localhost:${x.from}:${this.host}:${x.to}"`)
          .join(' ')
      }"`

      console.log(command)

      window.preload.executeCommand(command)
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

        const hostHash = window.preload.md5(host + user + port)
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

      const configTempFilename = `${window.preload.md5(str + Date.now())}.jmp`

      window.preload.writeFileSync(configTempFilename, str)

      const destHost = jumpHosts.pop()
      const command = `"${
        this.setting.gitBashPath
      }" -c "echo 'ProxyJump...' && ${
        nodes
          .map((x, i) => `echo '>>> [${x.host}]:${x.port}'`)
          .join('&&')
      } && ssh -o 'StrictHostKeyChecking=accept-new' -F "${configTempFilename}" -J ${jumpHosts.join(',')} ${destHost} ${
        this.exec
        ? `-tt '${this.exec}; exec $SHELL'`
        : ''
      }"`

      console.log(command)

      window.preload.executeCommand(command, (output) => {
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
      this.emitter.trigger('process')
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

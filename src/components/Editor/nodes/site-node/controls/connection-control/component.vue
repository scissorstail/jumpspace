<template>
  <div class="component">
    <div class="header-menu">
      <a class="info-edit">
        <!-- setting popover -->
        <v-popover @hide="save" placement="auto-end" ref="popover">
          <v-icon class="info-edit-item" height="24" name="cog" scale="1.5" width="24" />
          <template slot="popover">
            <div class="p-3">
              <div class="info-list" style="width: 280px;">
                <div class="info-item mb-3">
                  <b-button @click="loadPrevDiagram" size="sm">
                    <v-icon height="14" name="angle-left" scale="1" width="14" />
                  </b-button>
                  <b-form-input size="sm" style="margin: 0 3px;" v-model.trim="diagram" />
                  <b-button @click="loadNextDiagram" size="sm">
                    <v-icon height="14" name="angle-right" scale="1" width="14" />
                  </b-button>
                </div>
                <b-form-group class="mb-0" label="Name" label-align="left" label-cols-sm="3">
                  <b-form-input size="sm" v-model.trim="name" />
                </b-form-group>
                <b-form-group class="mb-0" label="User" label-align="left" label-cols-sm="3">
                  <b-form-input size="sm" v-model.trim="user" />
                </b-form-group>
                <b-form-group class="mb-0" label="Host" label-align="left" label-cols-sm="3">
                  <b-form-input size="sm" v-model.trim="host" />
                </b-form-group>
                <b-form-group class="mb-0" label="Port" label-align="left" label-cols-sm="3">
                  <b-form-input size="sm" v-model.trim="port" />
                </b-form-group>
                <b-form-group class="mb-0" label="Key" label-align="left" label-cols-sm="3">
                  <b-input-group size="sm">
                    <template v-slot:append>
                      <b-button @click="keyPath = ''" size="sm" v-if="keyPath">
                        <v-icon height="14" name="trash-alt" scale="1" width="14" />
                      </b-button>
                      <b-button @click="$refs.file.click()" size="sm" v-else>
                        <v-icon height="14" name="folder-open" scale="1" width="14" />
                      </b-button>
                    </template>
                    <b-form-input :value="keyPath" readonly size="sm" />
                    <input @change="change" ref="file" style="display:none" type="file" />
                  </b-input-group>
                </b-form-group>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
      <a class="info-edit left">
        <!-- forward popover-->
        <v-popover @hide="save" placement="auto-end" ref="popover2">
          <v-icon class="info-edit-item" height="24" name="link" scale="1.5" width="24" />
          <template slot="popover">
            <div class="p-3">
              <div class="info-list" style="width: 225px;">
                <div :key="index" class="info-item mb-1" v-for="(forward, index) in forwards">
                  <b-form-checkbox class="middle" size="lg" v-model="forward.checked" />
                  <b-form-input class="mr-2" maxlength="5" size="sm" v-model.trim="forward.from" />
                  <span :style="{ opacity: forward.checked ? 1.0 : 0.1 }" class="middle">
                    <v-icon height="14" name="forward" scale="1" width="14" />
                  </span>
                  <b-form-input class="ml-2" maxlength="5" size="sm" v-model.trim="forward.to" />
                  <b-button @click="removeForward(forward)" class="ml-2" size="sm">
                    <v-icon height="14" name="minus" scale="1" width="14" />
                  </b-button>
                </div>
              </div>
              <div :class="[forwards.length > 0 ? 'mt-2' : '']" class="info-action">
                <b-button @click="addForward" class="mr-1" size="sm">
                  <v-icon height="14" name="plus" scale="1" width="14" />
                </b-button>
              </div>
            </div>
          </template>
        </v-popover>
      </a>
    </div>

    <div :class="{ blur: isBlur }" class="info-block">
      <img :src="diagram ? `/img/diagram/servers/${diagram}` : null" class="info-diagram mb-1" height="40%" width="40%" />
      <div class="info-text">{{ name || 'noname' }}</div>
      <div class="info-text">{{ host || '---' }}</div>
      <div class="info-text">{{ port || '---' }}</div>
    </div>

    <div class="footer-menu">
      <a class="info-edit">
        <v-icon
          @click="proxyJump"
          class="info-edit-item"
          height="24"
          name="bolt"
          scale="1.5"
          v-if="isProxyJumpReady"
          width="24"
        />
        <v-icon
          @click="connect"
          class="info-edit-item"
          height="24"
          name="plug"
          scale="1.5"
          v-if="isConnectable && !isProxyJumpReady"
          width="24"
        />
      </a>
      <a class="info-edit">
        <v-icon @click="blur" class="info-edit-item" height="24" name="eye-slash" scale="1.5" width="24" />
      </a>
      <a class="info-edit left">
        <v-icon
          :style="{
            opacity: isFowardable && forwards.some(x => x.checked) ? 1.0 : 0.5
          }"
          @click="
            isFowardable && forwards.some(x => x.checked) ? forward() : ''
          "
          class="info-edit-item"
          height="24"
          name="forward"
          scale="1.5"
          v-show="isFowardable"
          width="24"
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
      const command = `"${this.setting.gitBashPath}" -c "ssh -i '${upath.toUnix(
        this.keyPath
      )}' '${this.user ? this.user + '@' : ''}${this.host}' -p '${
        this.port
      }'; read -n 1 -s -r -p 'Press any key to continue'"`
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
      if (this.ikey) {
        this.putData(this.ikey, { ...data })
      }
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
      this.forwards = this.forwards.filter((x) => x !== forward)
    },
    forward () {
      const prevNodeData = _.last(this.prevNodeDataList)
      if (!prevNodeData) {
        return false
      }

      const ctlPathFile = `[${this.name}]L-${prevNodeData.user}@${prevNodeData.host}_${prevNodeData.port}.ctl`
      const forwardList = this.forwards.filter(
        (x) => x.checked && x.from && x.to
      )
      if (forwardList.length === 0) {
        return
      }

      const command = `"${
        this.setting.gitBashPath
      }" -c "echo 'Foward...' && ${forwardList
        .map(
          (x, i) =>
            `echo ':${x.from} >> [${prevNodeData.host}]:${prevNodeData.port} -> :${x.to}'`
        )
        .join('&&')} && ssh -i "${upath.toUnix(prevNodeData.keyPath)}" "${
        prevNodeData.user
      }@${prevNodeData.host}" -p "${
        prevNodeData.port
      }" -N -M -S "${ctlPathFile}" ${forwardList
        .map((x) => `-L "localhost:${x.from}:${this.host}:${x.to}"`)
        .join(' ')}; read -n 1 -s -r -p 'Press any key to continue'"`

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
      const command = `"${
        this.setting.gitBashPath
      }" -c "echo 'ProxyJump...' && ${nodes
        .map((x, i) => `echo '>>> [${x.host}]:${x.port}'`)
        .join('&&')} && ssh -F "${configTempFilename}" -J ${jumpHosts.join(
        ','
      )} ${destHost}; read -n 1 -s -r -p 'Press any key to continue'"`

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

  &[aria-hidden="true"] {
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.15s, visibility 0.15s;
  }

  &[aria-hidden="false"] {
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

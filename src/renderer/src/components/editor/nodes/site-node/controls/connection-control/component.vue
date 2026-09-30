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
      <ForwardMenu
        v-model="forwards"
        :disabled="isLocked"
        :plan="forwardPlan"
        :hint="forwardHint"
        @start="openForward"
        @hide="save"
      />
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
                    :state="portState(port)"
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
                        @click="selectKeyFile"
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
                  </b-input-group>
                </b-form-group>
                <b-form-group
                  class="mb-0"
                  label="Password"
                  label-align="left"
                  label-cols-sm="3"
                >
                  <b-input-group size="sm">
                    <b-form-input
                      v-model="password"
                      :type="isPasswordVisible ? 'text' : 'password'"
                      autocomplete="off"
                      placeholder="(optional)"
                      title="Saved as plain text. It is also included when you export the item."
                      size="sm"
                      :disabled="isLocked"
                    />
                    <template #append>
                      <b-button
                        size="sm"
                        title="Show/hide password"
                        @click="isPasswordVisible = !isPasswordVisible"
                      >
                        <b-icon
                          class="menu-item-icon"
                          :icon="isPasswordVisible ? 'eye-slash' : 'eye'"
                        />
                      </b-button>
                    </template>
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
                <div class="info-action mt-2">
                  <b-button
                    size="sm"
                    title="Copy as SSH config (includes previous nodes as ProxyJump)"
                    @click="copyConfig"
                  >
                    <b-icon
                      :icon="isCopied ? 'clipboard-check' : 'clipboard'"
                      class="mr-1"
                    />
                    {{ isCopied ? 'Copied!' : 'Copy SSH config' }}
                  </b-button>
                </div>
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
        :src="diagram ? `${baseUrl}img/diagram/servers/${diagram}` : null"
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
        <div
          v-if="forwardSummaryText"
          class="info-text info-forward"
          :title="forwardSummaryText.title"
        >
          <b-icon
            icon="arrow-left-right"
            font-scale="0.85"
            class="mr-1"
          />{{ forwardSummaryText.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import head from 'lodash/head'
import pick from 'lodash/pick'
import store from '../../../../../../store'
import mixin from '../../../../../../mixin'
import {
  configRequest,
  forwardEntries,
  forwardHint,
  forwardPlan,
  forwardSummary,
  isRoutable,
  normalizeForward,
  portState
} from '../../../../../../utils/forward'
import ForwardMenu from './forward-menu'

export default {
  components: { ForwardMenu },
  mixins: [mixin],
  props: {
    readonly: {
      // for connections and nodes, not for controls
      type: Boolean,
      default: false
    },
    emitter: {
      type: Object,
      default: () => ({})
    },
    ikey: {
      type: String,
      default: ''
    },
    getData: {
      type: Function,
      default: () => ({})
    },
    putData: {
      type: Function,
      default: () => ({})
    }
  },
  store,
  data() {
    return {
      baseUrl: import.meta.env.BASE_URL,
      isLocked: false,
      isCopied: false,
      isPasswordVisible: false,
      name: null,
      user: null,
      host: null,
      port: null,
      exec: null,
      diagram: null,
      keyPath: null,
      password: null,
      forwards: [],
      diagramFilenames: [],
      prevNodeDataList: []
    }
  },
  computed: {
    isConnectable() {
      return isRoutable(this)
    },
    // 앞에 노드가 있고, 그 경로의 모든 노드가 접속에 필요한 정보(user/host/port)를 가지고 있어야 한다.
    // 키/비밀번호는 노드마다 다를 수 있고, 둘 다 없으면 ssh-agent나 기본 키, 터미널 입력으로 진행한다.
    isChained() {
      const prevNodeDataList = this.prevNodeDataList || []

      return prevNodeDataList.length > 0 && prevNodeDataList.every(isRoutable)
    },
    isProxyJumpReady() {
      return this.isConnectable && this.isChained
    },
    // 이 노드의 포트포워딩을 어떻게 열 수 있는지 (utils/forward.js)
    forwardPlan() {
      return forwardPlan(this.connectionOf(this.$data), this.prevNodeDataList)
    },
    forwardHint() {
      return forwardHint(this.forwardPlan, this.connectionOf(this.$data))
    },
    forwardSummaryText() {
      return forwardSummary(this.forwards, this.forwardPlan)
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
          foundIndex - 1 >= 0 ? foundIndex - 1 : this.diagramFilenames.length - 1
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
    portState,
    // ssh 실행 요청에 넘길 수 있는 순수한 값만 추린다. (실제 명령어는 main 프로세스에서 검증 후 만든다)
    connectionOf(data) {
      return pick(data, ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec'])
    },
    async run(request) {
      try {
        const result = await request()
        if (!result.ok) {
          this.$bvModal.msgBoxOk(result.error, { title: 'Failed to start SSH' })
        }
      } catch (e) {
        console.error(e)
        this.$bvModal.msgBoxOk(String(e.message || e), { title: 'Failed to start SSH' })
      }
    },
    connect() {
      return this.run(() => window.preload.ssh.connect(this.connectionOf(this.$data)))
    },
    openForward() {
      const plan = this.forwardPlan
      if (!plan.mode) {
        return
      }

      // plan.via의 마지막 노드에 접속하고(앞 노드들은 각자의 인증으로 거친다), 그 서버에서 바라본 host:port로 포워딩한다.
      return this.run(() => window.preload.ssh.forward({
        via: plan.via.map(x => this.connectionOf(x)),
        forwards: forwardEntries(this.forwards, plan)
      }))
    },
    proxyJump() {
      const nodes = (this.prevNodeDataList || []).concat(this.$data).map(x => this.connectionOf(x))

      return this.run(() => window.preload.ssh.proxyJump(nodes))
    },
    async copyConfig() {
      const request = configRequest(this.connectionOf(this.$data), this.prevNodeDataList, this.forwards, this.forwardPlan)
      const result = await window.preload.ssh.copyConfig({
        nodes: request.nodes.map(x => this.connectionOf(x)),
        forwards: request.forwards
      })

      if (!result.ok) {
        this.$bvModal.msgBoxOk(result.error, { title: 'Failed to copy' })
        return
      }

      this.isCopied = true
      clearTimeout(this.copiedTimer)
      this.copiedTimer = setTimeout(() => { this.isCopied = false }, 1500)
    },
    async selectKeyFile() {
      const path = await window.preload.selectKeyFile()
      if (path) {
        this.keyPath = path
      }
    },
    // prevNodeDataList: 이 노드 앞에 연결된 노드들의 접속 정보. (연결 순서대로)
    update(prevNodeDataList = []) {
      const data = this.getData(this.ikey)
      for (const key in data) {
        if (key in this.$data) {
          this[key] = data[key]
        }
      }

      // 이전 버전에서 저장한 항목에는 대상 host가 없다.
      this.forwards = (this.forwards || []).map(normalizeForward)
      this.prevNodeDataList = prevNodeDataList
    },
    save() {
      const data = pick(this.$data, [
        'name',
        'user',
        'host',
        'port',
        'diagram',
        'keyPath',
        'password',
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

  &-forward {
    font-size: 0.8rem;
    font-weight: normal;
    color: #6c757d;
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
    // 뒤에 있는 노드가 비쳐서 글자를 읽기 어려우므로 불투명하게 둔다.
    opacity: 1;
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

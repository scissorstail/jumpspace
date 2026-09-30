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
      <ConnectionSettings
        :value="connectionFields"
        :disabled="isLocked"
        :diagrams="diagramFilenames"
        :copied="isCopied"
        @input="applyConnectionFields"
        @copy="copyConfig"
        @hide="save"
      />
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
import pick from 'lodash/pick'
import store from '@/store'
import { errorMessage } from '@/utils/notify'
import {
  configRequest,
  forwardEntries,
  forwardHint,
  forwardPlan,
  forwardSummary,
  isRoutable,
  normalizeForward
} from '@/utils/forward'
import ConnectionSettings from './connection-settings'
import ForwardMenu from './forward-menu'

// ssh 접속에 쓰는 값. main 프로세스에 넘기는 요청에는 이 값만 담는다.
const CONNECTION_FIELDS = ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec']
// 설정 팝오버(connection-settings.vue)에서 편집하는 값: 접속 값 + 이미지
const EDITABLE_FIELDS = [...CONNECTION_FIELDS, 'diagram']
// 저장하는 값: 편집하는 값 + 포워딩 목록
const SAVED_FIELDS = [...EDITABLE_FIELDS, 'forwards']

export default {
  components: { ConnectionSettings, ForwardMenu },
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
    },
    // 설정 팝오버에서 편집하는 값
    connectionFields() {
      return pick(this, EDITABLE_FIELDS)
    }
  },
  created() {
    this.diagramFilenames = this.$store.getters.diagram
  },
  methods: {
    applyConnectionFields(fields) {
      Object.assign(this, pick(fields, EDITABLE_FIELDS))
    },
    // ssh 실행 요청에 넘길 수 있는 순수한 값만 추린다. (실제 명령어는 main 프로세스에서 검증 후 만든다)
    connectionOf(data) {
      return pick(data, CONNECTION_FIELDS)
    },
    async run(request) {
      try {
        const result = await request()
        if (!result.ok) {
          this.$bvModal.msgBoxOk(result.error, { title: 'Failed to start SSH' })
        }
      } catch (e) {
        console.error(e)
        this.$bvModal.msgBoxOk(errorMessage(e), { title: 'Failed to start SSH' })
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
      if (this.ikey) {
        this.putData(this.ikey, pick(this.$data, SAVED_FIELDS))
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

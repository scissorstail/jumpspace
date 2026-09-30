<template>
  <div class="component">
    <div class="header-menu">
      <span
        v-if="isConnectable"
        class="menu-item"
      >
        <button
          type="button"
          class="menu-button"
          :aria-label="connectLabel"
          :title="connectLabel"
          @click="isProxyJumpReady ? proxyJump() : connect()"
        >
          <b-icon
            icon="terminal"
            font-scale="1.3"
            aria-hidden="true"
          />
        </button>
      </span>
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
        :diagram-base="diagramBase"
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
        v-if="diagram"
        :src="`${diagramBase}${diagram}`"
        alt=""
        class="info-diagram mb-1"
        height="40%"
        width="40%"
      >
      <div
        v-else
        class="info-diagram info-diagram-empty mb-1"
      >
        <b-icon
          icon="hdd-network"
          font-scale="2.6"
          aria-hidden="true"
        />
      </div>
      <div class="info-field">
        <div
          class="info-name"
          :title="name || '(untitled)'"
        >
          <span>{{ name || '(untitled)' }}</span>
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
import { terminalTitle } from '@/utils/terminal-sessions'
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
    diagramBase() {
      return `${this.baseUrl}img/diagram/servers/`
    },
    // 접속 버튼의 이름. 아이콘만 있는 버튼이라 스크린 리더와 툴팁에 쓴다.
    connectLabel() {
      const target = this.name || this.host || 'this node'

      return this.isProxyJumpReady ? `Connect to ${target} through the previous nodes (ProxyJump)` : `Connect to ${target}`
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
    // 설정에 따라 앱 안의 터미널 또는 Git Bash 창에서 연다.
    launch(kind, payload, hops = 0) {
      if (this.$store.getters.setting.openIn === 'window') {
        return this.run(() => window.preload.ssh[kind](payload))
      }

      this.$store.dispatch('terminalOpen', { kind, payload, title: terminalTitle(kind, this.$data, hops) })
    },
    connect() {
      return this.launch('connect', this.connectionOf(this.$data))
    },
    openForward() {
      const plan = this.forwardPlan
      if (!plan.mode) {
        return
      }

      // plan.via의 마지막 노드에 접속하고(앞 노드들은 각자의 인증으로 거친다), 그 서버에서 바라본 host:port로 포워딩한다.
      return this.launch('forward', {
        via: plan.via.map(x => this.connectionOf(x)),
        forwards: forwardEntries(this.forwards, plan)
      })
    },
    proxyJump() {
      const nodes = (this.prevNodeDataList || []).concat(this.$data).map(x => this.connectionOf(x))

      return this.launch('proxyJump', nodes, nodes.length - 1)
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

  // 키보드로 메뉴 버튼에 포커스가 가도 메뉴가 보이게 한다.
  &:hover,
  &:focus-within {
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
  margin: 1px 3px;
}

// 노드 위에 뜨는 아이콘 버튼: 네모난 단색 칩, 올리면 분홍. 키보드로도 누를 수 있고 포커스가 보인다.
.menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 32px;
  padding: 0;
  border: 2px solid var(--js-secondary);
  background: var(--js-bg);
  box-shadow: 3px 3px 0 #000;
  color: var(--js-secondary);
  line-height: 1;
  cursor: pointer;
  transition: color 0.08s, background-color 0.08s, border-color 0.08s;

  &:hover {
    border-color: var(--js-primary);
    background: var(--js-primary);
    color: var(--js-on-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--js-sun);
    outline-offset: 2px;
  }

  &.menu-button-off {
    opacity: 0.4;
  }
}

.info {
  &-list {
    .form-row {
      align-items: center;
    }

    // 입력칸(sm)보다 라벨이 커 보이지 않게 한다.
    legend,
    label {
      color: var(--js-text-muted);
      font-family: var(--js-font-display);
      font-size: 1.15rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
  }

  &-block {
    text-align: center;
    color: var(--js-text);
  }

  // 이름: 분홍 이름표 위의 어두운 픽셀 글자
  &-name {
    display: inline-block;
    max-width: 100%;
    margin-bottom: 4px;
    padding: 0 10px;
    background: var(--js-primary);
    box-shadow: 3px 3px 0 #000;
    color: var(--js-on-primary);
    font-family: var(--js-font-display);
    font-size: 1.45rem;
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-transform: uppercase;

    > span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  // 아이콘 파일은 검은 선 그림이라 어두운 카드 위에서는 밝게 뒤집는다.
  &-diagram {
    filter: invert(1) brightness(0.92);
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

  // user / host / port: 고정폭 청록 글자. 배경 풍경 위에서도 읽히도록 어두운 바탕을 깐다.
  &-text {
    width: fit-content;
    max-width: 100%;
    margin: 0 auto;
    padding: 0 5px;
    overflow: hidden;
    background: var(--js-bg);
    color: var(--js-secondary);
    font-family: var(--js-font-mono);
    font-size: 0.74rem;
    line-height: 1.5;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 이미지를 고르지 않은 노드의 자리
  &-diagram-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    margin-right: auto;
    color: var(--js-text-muted);
    opacity: 0.55;
    filter: none;
  }

  &-forward {
    color: var(--js-sun);
    font-size: 0.72rem;
    font-weight: normal;
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
    outline: 1px dashed var(--js-secondary);
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

  // 단색 패널, 위에 세 가지 색 띠
  &-inner {
    border: 2px solid var(--js-secondary);
    border-top: 0;
    background: var(--js-surface);
    color: var(--js-text);
    box-shadow: 8px 8px 0 #000;

    &::before {
      content: '';
      display: block;
      height: 6px;
      margin: 0 -2px;
      background: var(--js-bands);
    }
  }
}
</style>

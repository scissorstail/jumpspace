<template>
  <b-overlay
    :show="show"
    :blur="null"
    bg-color="var(--js-bg)"
    no-wrap
    opacity="0.82"
    z-index="1050"
  >
    <template #overlay>
      <b-card
        v-if="show"
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="From SSH config"
        header="From SSH config"
        class="config-popup text-left"
        style="width: 90vw; max-width: 640px"
      >
        <b-form-textarea
          v-model="text"
          class="config-text"
          rows="9"
          no-resize
          wrap="off"
          spellcheck="false"
          aria-label="SSH config"
          :placeholder="example"
        />
        <p class="config-help small mb-0 mt-2">
          Paste one or more Host blocks. Each becomes a node with only the values written there; the rest stays empty, and the port is 22 when none is written. A ProxyJump to another Host of the text becomes a connection.
        </p>

        <!-- 만들기 전에 무엇이 생기는지 보여준다 (utils/config-import.js의 importPlan) -->
        <div
          v-if="plan.nodes.length"
          class="config-result mt-3"
          aria-live="polite"
        >
          <div class="config-count">
            {{ count }}
          </div>
          <ul class="config-rows mb-0">
            <li
              v-for="row in plan.rows"
              :key="row.name"
            >
              <span class="config-name">{{ row.name }}</span>
              <span class="config-target">{{ row.target }}</span>
              <span
                v-if="detailOf(row)"
                class="config-detail"
              >{{ detailOf(row) }}</span>
              <span
                v-if="row.problem"
                class="config-problem"
              >{{ row.problem }}</span>
            </li>
          </ul>
        </div>
        <p
          v-else-if="text.trim()"
          class="config-empty small mb-0 mt-3"
        >
          No Host with a name in this text.
        </p>

        <ul
          v-if="plan.notes.length"
          class="config-notes small mb-0 mt-2"
        >
          <li
            v-for="note in plan.notes"
            :key="note"
          >
            {{ note }}
          </li>
        </ul>

        <template #footer>
          <div class="d-flex">
            <b-button
              class="ml-auto"
              @click="$emit('update:show', false)"
            >
              Cancel
            </b-button>

            <b-button
              class="ml-2"
              variant="primary"
              :disabled="!plan.nodes.length"
              @click="create"
            >
              Create
            </b-button>
          </div>
        </template>
      </b-card>
    </template>
  </b-overlay>
</template>

<script>
import { dismissOnEscape } from '@/utils/dismiss'
import { importCount, importPlan, rowDetail } from '@/utils/config-import'
import { parseSshConfig } from '../../../../../shared/ssh-config-parse.js'

// 캔버스 메뉴의 "From SSH config": SSH config를 붙여 넣으면 거기 적힌 값만 가진 노드를 만든다 (owner, 2026-10).
// 여기서는 글을 읽어 보여주기만 하고, 노드는 Layout이 편집기에 만들게 한다 (create 이벤트).
export default {
  name: 'ConfigPopup',
  mixins: [dismissOnEscape],
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      text: '',
      example: 'Host web\n    HostName 192.0.2.10\n    User root\n    IdentityFile ~/.ssh/id_ed25519'
    }
  },
  computed: {
    plan() {
      return importPlan(parseSshConfig(this.text))
    },
    count() {
      return importCount(this.plan)
    }
  },
  watch: {
    // 붙여 넣은 글은 창을 닫으면 버린다: 다시 열면 비어 있다.
    show() {
      this.text = ''
    }
  },
  methods: {
    detailOf: rowDetail,
    create() {
      if (!this.plan.nodes.length) return

      this.$emit('create', { nodes: this.plan.nodes, links: this.plan.links })
      this.$emit('update:show', false)
    }
  }
}
</script>

<style lang="scss" scoped>
// 붙여 넣는 칸과 결과는 config처럼 고정폭으로, 줄을 접지 않고 보여준다.
.config-text,
.config-rows {
  font-family: var(--js-font-mono);
  font-size: 0.78rem;
  // JetBrains Mono의 합자(->, *** 등)는 주소와 경로를 다르게 보이게 한다
  font-variant-ligatures: none;
  line-height: 1.5;
}

.config-text {
  white-space: pre;
}

.config-help,
.config-empty,
.config-notes {
  color: var(--js-text-muted);
}

.config-count {
  color: var(--js-sun);
  font-family: var(--js-font-display);
  font-size: 1.15rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.config-rows {
  max-height: 9.5rem;
  padding: 0;
  overflow-y: auto;
  list-style: none;

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 14px;
    padding: 2px 0;
    border-top: 1px solid var(--js-line);
  }
}

.config-name {
  color: var(--js-text);
  font-weight: bold;
}

.config-target {
  color: var(--js-secondary);
}

.config-detail {
  color: var(--js-text-muted);
}

// 접속할 때 거절될 값: 줄 아래에 따로 쓴다
.config-problem {
  flex-basis: 100%;
  color: var(--js-danger);
}

.config-notes {
  max-height: 6rem;
  padding-left: 1.2em;
  overflow-y: auto;
}
</style>

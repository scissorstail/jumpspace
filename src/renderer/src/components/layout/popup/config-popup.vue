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

        <!-- 지나쳐 보이면 Create를 한 번 멈추고 이유를 보여준다 (utils/config-import.js의 importConcerns) -->
        <div
          v-if="isAsking"
          ref="ask"
          class="config-ask mt-3"
          role="alert"
        >
          <div class="config-ask-title">
            Create {{ count }} anyway?
          </div>
          <ul class="config-ask-reasons small mb-0">
            <li
              v-for="reason in concerns"
              :key="reason"
            >
              {{ reason }}
            </li>
          </ul>
        </div>

        <template #footer>
          <div class="d-flex">
            <b-button
              ref="back"
              class="ml-auto"
              @click="isAsking ? (isAsking = false) : $emit('update:show', false)"
            >
              {{ isAsking ? 'Back' : 'Cancel' }}
            </b-button>

            <b-button
              class="ml-2"
              variant="primary"
              :disabled="!plan.nodes.length"
              @click="create"
            >
              {{ isAsking ? 'Create anyway' : 'Create' }}
            </b-button>
          </div>
        </template>
      </b-card>
    </template>
  </b-overlay>
</template>

<script>
import { dismissOnEscape } from '@/utils/dismiss'
import { importConcerns, importCount, importPlan, rowDetail } from '@/utils/config-import'
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
    },
    // 이 다이어그램에 이미 있는 노드들의 user@host:port (창을 열 때 Layout이 편집기에서 읽는다)
    existing: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      text: '',
      example: 'Host web\n    HostName 192.0.2.10\n    User root\n    IdentityFile ~/.ssh/id_ed25519',
      // Create를 한 번 누르고 이유를 보여주는 중인가
      isAsking: false
    }
  },
  computed: {
    parsed() {
      return parseSshConfig(this.text)
    },
    plan() {
      return importPlan(this.parsed)
    },
    count() {
      return importCount(this.plan)
    },
    concerns() {
      return importConcerns(this.plan, this.parsed, this.existing)
    }
  },
  watch: {
    // 붙여 넣은 글은 창을 닫으면 버린다: 다시 열면 비어 있다.
    show() {
      this.text = ''
    },
    // 글이 바뀌면 물은 것은 없던 일이 된다: 새 글의 이유는 다시 Create를 눌러야 보인다.
    // 창을 닫을 때도 그렇다: 물을 수 있는 것은 노드가 나오는 글뿐이라서, 위에서 글을 비우면 이리로 온다.
    text() {
      this.isAsking = false
    }
  },
  methods: {
    detailOf: rowDetail,
    // 지나쳐 보이면(concerns) 첫 누름은 이유를 보여주고 묻기만 한다. 두 번째(Create anyway)에 만든다.
    // 이유는 본문의 끝에 붙는다. 낮은 창에서는 본문이 스크롤되므로(theme.scss) 이유가 보이게 굴린다.
    // 물을 때는 Back에 포커스를 둔다: Enter로 이어서 누르면 만들지 않고 돌아간다.
    create() {
      if (!this.plan.nodes.length) return

      if (this.concerns.length && !this.isAsking) {
        this.isAsking = true
        this.$nextTick(() => {
          this.$refs.ask?.scrollIntoView({ block: 'nearest' })
          this.$refs.back?.focus()
        })
        return
      }

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

// 만들기 전에 묻는 이유들: 결과와 섞이지 않게 해의 색으로 두른다
.config-ask {
  padding: 6px 10px 8px;
  border: 2px solid var(--js-sun);
}

.config-ask-title {
  color: var(--js-sun);
  font-family: var(--js-font-display);
  font-size: 1.15rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.config-ask-reasons {
  padding-left: 1.2em;
  color: var(--js-text);
}
</style>

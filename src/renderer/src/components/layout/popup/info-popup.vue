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
        aria-label="Info"
        header="Info"
        header-class="text-left"
        class="text-center"
      >
        <b-card-text class="mb-2">
          <b-row class="mb-2">
            <b-col>
              <b-img
                alt="jumpspace icon"
                rounded
                src="/img/icons/256x256.png"
                width="96"
                height="96"
              />
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <h5 class="text-center">
                {{ `jumpspace v${appVersion}` }}
              </h5>
            </b-col>
          </b-row>
        </b-card-text>

        <!-- 앱 안의 터미널의 키 (utils/terminal-keys.js): README에만 있던 것 -->
        <section
          class="info-keys"
          aria-label="Terminal keys"
        >
          <h6 class="info-keys-title">
            Terminal keys
          </h6>
          <dl class="info-keys-list">
            <template v-for="row in terminalKeys">
              <dt :key="`keys-${row.keys[0]}`">
                <kbd
                  v-for="key in row.keys"
                  :key="key"
                >{{ key }}</kbd>
              </dt>
              <dd :key="`does-${row.keys[0]}`">
                {{ row.does }}
              </dd>
            </template>
          </dl>
        </section>

        <b-card-text class="mb-1">
          <div>
            Icons made by
            <a
              href="https://www.flaticon.com/authors/pixel-perfect"
              target="_blank"
              title="Pixel perfect"
            >Pixel perfect</a>
            from
            <a
              href="https://www.flaticon.com/"
              target="_blank"
              title="Flaticon"
            >www.flaticon.com</a>
          </div>
        </b-card-text>

        <b-card-text class="mb-1">
          <div>
            Editor made by
            <a
              href="https://rete.js.org/"
              target="_blank"
              title="Rete.js"
            >Rete.js</a>
          </div>
        </b-card-text>

        <b-card-text>
          <div>
            Built with
            <a
              href="https://electron-vite.org/"
              target="_blank"
              title="electron-vite"
            >electron-vite</a>
            and
            <a
              href="https://www.electron.build/"
              target="_blank"
              title="electron-builder"
            >electron-builder</a>
          </div>
        </b-card-text>

        <template #footer>
          <b-button
            block
            class="flex-grow-1"
            @click="$emit('update:show', false)"
          >
            Close
          </b-button>
        </template>
      </b-card>
    </template>
  </b-overlay>
</template>

<script>
import { dismissOnEscape } from '@/utils/dismiss'
import { TERMINAL_KEYS } from '@/utils/terminal-keys'

export default {
  name: 'InfoPopup',
  mixins: [dismissOnEscape],
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      appVersion: __APP_VERSION__,
      terminalKeys: TERMINAL_KEYS
    }
  }
}
</script>

<style lang="scss" scoped>
// 키 목록: 왼쪽에 키, 오른쪽에 하는 일. 창의 나머지는 가운데 정렬이다.
.info-keys {
  width: 38rem;
  max-width: 100%;
  margin: 0 auto 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--js-line);
  text-align: left;
}

.info-keys-title {
  margin-bottom: 0.5rem;
  color: var(--js-text-muted);
  font-family: var(--js-font-display);
  text-align: center;
  text-transform: uppercase;
}

.info-keys-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.3rem 0.9rem;
  margin: 0;
  font-size: 0.85rem;

  dt {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-content: flex-start;
    font-weight: normal;
  }

  dd {
    margin: 0;
    color: var(--js-text);
  }

  kbd {
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--js-line);
    border-radius: 0;
    background: var(--js-surface-2);
    color: var(--js-text);
    font-family: var(--js-font-mono);
    font-size: 0.75rem;
    box-shadow: none;
    white-space: nowrap;
  }
}
</style>

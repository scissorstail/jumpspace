<template>
  <b-overlay
    :show="show"
    blur="3px"
    no-wrap
    opacity="0.6"
    rounded="sm"
    variant="dark"
    z-index="1050"
  >
    <template #overlay>
      <b-card
        v-if="show"
        header="Info"
        bg-variant="light"
        class="text-center"
      >
        <b-card-text class="mb-3">
          <b-row class="mb-3">
            <b-col>
              <b-img
                alt="jumpspace icon"
                rounded
                src="/img/icons/256x256.png"
                width="150"
                height="150"
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

        <b-card-text>
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

        <b-card-text>
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
      appVersion: __APP_VERSION__
    }
  }
}
</script>

<style lang="scss" scoped>
// 팝업 카드: 둥근 모서리, 흰 바탕, 굵은 제목
::v-deep {
  .card {
    overflow: hidden;
    border: 0;
    border-radius: 12px;
    background-color: white !important;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  }

  .card-header {
    background-color: white;
    font-weight: 600;
  }

  .card-footer {
    background-color: #f8f9fa;
  }
}
</style>

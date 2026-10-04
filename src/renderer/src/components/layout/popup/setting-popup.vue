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
        aria-label="Settings"
        header="Settings"
        style="width: 90vw; max-width: 600px"
      >
        <b-card-text>
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Git Bash path"
                label-for="setting-git-bash"
                label-align="left"
                label-cols-sm="4"
              >
                <b-form-input
                  id="setting-git-bash"
                  v-model="gitBashPath"
                  size="sm"
                />
              </b-form-group>
            </b-col>
          </b-row>
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Open SSH in"
                label-align="left"
                label-cols-sm="4"
              >
                <b-form-radio-group
                  v-model="openIn"
                  :options="openInOptions"
                  buttons
                  button-variant="outline-primary"
                  size="sm"
                />
              </b-form-group>
            </b-col>
          </b-row>
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Theme"
                label-align="left"
                label-cols-sm="4"
              >
                <b-form-radio-group
                  v-model="theme"
                  :options="themeOptions"
                  buttons
                  button-variant="outline-primary"
                  size="sm"
                />
              </b-form-group>
            </b-col>
          </b-row>
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Background"
                label-align="left"
                label-cols-sm="4"
                description="Only the scenery behind the canvas. Depth blurs it, CRT adds scan lines."
              >
                <b-form-radio-group
                  v-model="backdrop"
                  :options="backdropOptions"
                  buttons
                  button-variant="outline-primary"
                  size="sm"
                />
              </b-form-group>
            </b-col>
          </b-row>
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Node glass"
                label-for="setting-node-blur"
                label-align="left"
                label-cols-sm="4"
                description="A frosted panel behind each node that blurs the scenery. 0 turns it off."
              >
                <div class="d-flex align-items-center">
                  <b-form-input
                    id="setting-node-blur"
                    v-model.number="nodeBlur"
                    type="range"
                    min="0"
                    :max="nodeBlurMax"
                    step="1"
                  />
                  <span class="setting-value ml-3">{{ nodeBlur > 0 ? `${nodeBlur}px` : 'Off' }}</span>
                </div>
              </b-form-group>
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <b-form-group
                label-align="left"
                class="mb-0 text-left"
                label="Close to tray"
                label-for="setting-close-to-tray"
                label-cols-sm="4"
                description="Closing the window keeps jumpspace running in the system tray."
              >
                <b-form-checkbox
                  id="setting-close-to-tray"
                  v-model="isHideToTrayOnClose"
                  switch
                />
              </b-form-group>
            </b-col>
          </b-row>
        </b-card-text>

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
              @click="saveSetting"
            >
              Save
            </b-button>
          </div>
        </template>
      </b-card>
    </template>
  </b-overlay>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import { dismissOnEscape } from '@/utils/dismiss'
import { NODE_BLUR_MAX } from '../../../../../shared/setting.js'

export default {
  name: 'SettingPopup',
  mixins: [dismissOnEscape],
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      gitBashPath: null,
      isHideToTrayOnClose: false,
      openIn: null,
      theme: null,
      themeOptions: [
        { text: 'Neon night', value: 'neon-night' },
        { text: 'Sunset drive', value: 'sunset-drive' },
        { text: 'Vapor blue', value: 'vapor-blue' }
      ],
      backdrop: null,
      nodeBlur: 0,
      nodeBlurMax: NODE_BLUR_MAX,
      backdropOptions: [
        { text: 'Vivid', value: 'vivid' },
        { text: 'Soft', value: 'soft' },
        { text: 'Depth', value: 'depth' },
        { text: 'CRT', value: 'crt' },
        { text: 'Off', value: 'off' }
      ],
      openInOptions: [
        { text: 'This app', value: 'app' },
        { text: 'Git Bash window', value: 'window' }
      ]
    }
  },
  computed: {
    ...mapGetters(['setting'])
  },
  watch: {
    show(shown) {
      if (shown) {
        this.init()
      }
    }
  },
  methods: {
    ...mapActions(['settingSave']),
    init() {
      this.gitBashPath = this.setting.gitBashPath
      this.isHideToTrayOnClose = this.setting.isHideToTrayOnClose
      this.openIn = this.setting.openIn
      this.theme = this.setting.theme
      this.backdrop = this.setting.backdrop
      this.nodeBlur = this.setting.nodeBlur
    },
    async saveSetting() {
      // 이 창에 없는 설정(노드 정보 숨기기 등)은 지금 값을 그대로 둔다.
      await this.settingSave({
        ...this.setting,
        gitBashPath: this.gitBashPath,
        isHideToTrayOnClose: this.isHideToTrayOnClose,
        openIn: this.openIn,
        theme: this.theme,
        backdrop: this.backdrop,
        nodeBlur: this.nodeBlur
      })
      this.$emit('update:show', false)
    }
  }
}
</script>

<style lang="scss" scoped>
// 라벨은 컨트롤의 첫 줄과 같은 높이에 둔다. 가운데 정렬이면 도움말이 붙은 줄(Background, Node glass,
// Close to tray)에서 라벨이 컨트롤과 도움말 전체의 가운데로 내려가 버렸다.
// 첫 줄의 높이는 버튼 묶음 높이이고, 더 낮은 컨트롤(입력칸, 스위치, 슬라이더)은 그 줄의 가운데에 놓인다.
$setting-line: 33px;

::v-deep {
  // label-for가 있으면 form-group 자신이 form-row가 된다. 두 모양 모두 맞춘다.
  .form-row {
    align-items: flex-start;
  }

  .form-row > .col-form-label {
    display: flex;
    align-items: center;
    min-height: $setting-line;
    padding-top: 0;
    padding-bottom: 0;
  }

  .form-row > div {
    display: grid;
    grid-template-rows: $setting-line;
    grid-auto-rows: auto;
    align-items: center;
    justify-items: start;

    > .form-control,
    > .d-flex {
      justify-self: stretch;
    }
  }
}

.setting-value {
  min-width: 3.5em;
  color: var(--js-sun);
  font-family: var(--js-font-display);
  font-size: 1.15rem;
  text-transform: uppercase;
}
</style>

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
        header="Settings"
        style="width: 90vw; max-width: 600px"
      >
        <b-card-text class="mb-3">
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Git Bash path"
                label-align="left"
                label-cols-sm="4"
              >
                <b-form-input
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
          <b-row>
            <b-col>
              <b-form-group
                label-align="left"
                class="text-left"
                label="Close to system tray"
                label-cols-sm="4"
              >
                <b-form-checkbox
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
    },
    async saveSetting() {
      await this.settingSave({
        gitBashPath: this.gitBashPath,
        isHideToTrayOnClose: this.isHideToTrayOnClose,
        openIn: this.openIn,
        theme: this.theme,
        backdrop: this.backdrop
      })
      this.$emit('update:show', false)
    }
  }
}
</script>

<style lang="scss" scoped>
::v-deep {
  .form-group .form-row {
    align-items: center;
  }
}
</style>

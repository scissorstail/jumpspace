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
        header="Settings"
        bg-variant="light"
        style="width: 90vw"
      >
        <b-card-text class="mb-3">
          <b-row class="mb-3">
            <b-col>
              <b-form-group
                class="mb-0"
                label="Git Bash path"
                label-align="left"
                label-cols-sm="3"
              >
                <b-form-input
                  v-model="gitBashPath"
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
                label-cols-sm="3"
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
export default {
  name: 'SettingPopup',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      gitBashPath: null,
      isHideToTrayOnClose: false
    }
  },
  watch: {
    show() {
      this.init()
    }
  },
  methods: {
    init() {
      this.gitBashPath = this.setting.gitBashPath
      this.isHideToTrayOnClose = this.setting.isHideToTrayOnClose
    },
    async saveSetting() {
      await this.settingSave({
        gitBashPath: this.gitBashPath,
        isHideToTrayOnClose: this.isHideToTrayOnClose
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

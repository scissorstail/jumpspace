<template>
  <b-overlay
    :show="show"
    no-wrap
    rounded="sm"
    opacity="0.6"
    variant="dark"
    blur="3px"
    z-index="1050"
  >
    <template v-slot:overlay>
      <b-card
        bg-variant="light"
        :header="`testnet settings`"
        class="text-center"
        style="width: 90vw"
      >
        <b-card-body>
          <b-card-text class="mb-3">
            <b-row class="mb-3">
              <b-col>
                <div>
                  <b-form-group
                    label-cols-sm="3"
                    label="Git Bash Path: "
                    label-align="left"
                    class="mb-0"
                  >
                    <b-form-input size="sm" v-model="gitBashPath" />
                  </b-form-group>
                </div>
              </b-col>
            </b-row>
          </b-card-text>
        </b-card-body>

        <template v-slot:footer>
          <div class="d-flex">
            <b-button
              block
              variant="light"
              @click="$emit('update:show', false)"
              class="shadow-sm mr-1"
            >
              <v-icon name="times" height="14" width="14" scale="1" />
            </b-button>
            <b-button
              variant="light"
              @click="saveSetting"
              class="shadow-sm"
              v-b-tooltip.hover.v-light.dh0.noninteractive
              title="저장"
            >
              <v-icon name="save" height="14" width="14" scale="1" />
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
  data () {
    return {
      gitBashPath: null
    }
  },
  watch: {
    show () {
      this.init()
    }
  },
  methods: {
    init () {
      this.gitBashPath = this.setting.gitBashPath
    },
    saveSetting () {
      this.settingUpdate({
        gitBashPath: this.gitBashPath
      })
      this.$emit('update:show', false)
    }
  }
}
</script>

<style lang="scss" scoped>
</style>

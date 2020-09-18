<template>
  <b-overlay :show="show" blur="3px" no-wrap opacity="0.6" rounded="sm" variant="dark" z-index="1050">
    <template v-slot:overlay>
      <b-card :header="`Settings`" bg-variant="light" class="text-center" style="width: 90vw">
        <b-card-body>
          <b-card-text class="mb-3">
            <b-row class="mb-3">
              <b-col>
                <div>
                  <b-form-group class="mb-0" label="Git Bash Path: " label-align="left" label-cols-sm="3">
                    <b-form-input size="sm" v-model="gitBashPath" />
                  </b-form-group>
                </div>
              </b-col>
            </b-row>
          </b-card-text>
        </b-card-body>

        <template v-slot:footer>
          <div class="d-flex">
            <b-button @click="$emit('update:show', false)" block class="shadow-sm mr-1" variant="light">
              <v-icon height="14" name="times" scale="1" width="14" />
            </b-button>
            <b-button
              @click="saveSetting"
              class="shadow-sm"
              title="저장"
              v-b-tooltip.hover.v-light.dh0.noninteractive
              variant="light"
            >
              <v-icon height="14" name="save" scale="1" width="14" />
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
      gitBashPath: null
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
    },
    saveSetting() {
      this.settingUpdate({
        gitBashPath: this.gitBashPath
      })
      this.$emit('update:show', false)
    }
  }
}
</script>

<style lang="scss" scoped></style>

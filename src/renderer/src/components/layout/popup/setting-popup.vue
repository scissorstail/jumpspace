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
        style="width: 90vw; max-width: 520px"
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
      isHideToTrayOnClose: false
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

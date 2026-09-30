<template>
  <span class="menu-item">
    <v-popover
      ref="popover"
      placement="auto-end"
      @apply-show="onPopoverShow(); $nextTick(() => $refs.picker && $refs.picker.scrollToSelected())"
      @hide="onPopoverHide(); $emit('hide')"
    >
      <button
        type="button"
        class="menu-button"
        aria-label="Node settings"
        title="Node settings"
        aria-haspopup="dialog"
        @click="onTriggerClick"
      >
        <b-icon
          icon="gear"
          font-scale="1.3"
          aria-hidden="true"
        />
      </button>
      <template slot="popover">
        <div class="p-3">
          <div
            class="info-list"
            style="width: 310px;"
          >
            <IconPicker
              ref="picker"
              class="mb-3"
              :value="value.diagram"
              :icons="diagrams"
              :base="diagramBase"
              :disabled="disabled"
              @input="set('diagram', $event)"
            />
            <b-form-group
              class="mb-0"
              label="Name"
              label-align="left"
              label-cols-sm="3"
            >
              <b-form-input
                :value="value.name"
                trim
                size="sm"
                :disabled="disabled"
                @update="set('name', $event)"
              />
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="User"
              label-align="left"
              label-cols-sm="3"
            >
              <b-form-input
                :value="value.user"
                trim
                size="sm"
                :disabled="disabled"
                @update="set('user', $event)"
              />
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="Host"
              label-align="left"
              label-cols-sm="3"
            >
              <b-form-input
                :value="value.host"
                trim
                size="sm"
                :disabled="disabled"
                @update="set('host', $event)"
              />
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="Port"
              label-align="left"
              label-cols-sm="3"
            >
              <b-form-input
                :value="value.port"
                trim
                :state="portState(value.port)"
                size="sm"
                :disabled="disabled"
                @update="set('port', $event)"
              />
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="Key"
              label-align="left"
              label-cols-sm="3"
            >
              <b-input-group size="sm">
                <template #append>
                  <b-button
                    size="sm"
                    aria-label="Choose a key file"
                    title="Choose a key file"
                    :disabled="disabled"
                    @click="selectKeyFile"
                  >
                    <b-icon
                      icon="key-fill"
                    />
                  </b-button>
                </template>
                <b-form-input
                  :value="value.keyPath"
                  trim
                  size="sm"
                  :disabled="disabled"
                  @update="set('keyPath', $event)"
                />
              </b-input-group>
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="Password"
              label-align="left"
              label-cols-sm="3"
            >
              <b-input-group size="sm">
                <!-- 비밀번호는 앞뒤 공백도 그대로 저장한다 (trim하지 않는다) -->
                <b-form-input
                  :value="value.password"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="(optional)"
                  title="Saved as plain text. It is also included when you export the item."
                  size="sm"
                  :disabled="disabled"
                  @update="set('password', $event)"
                />
                <template #append>
                  <b-button
                    size="sm"
                    :aria-label="isPasswordVisible ? 'Hide password' : 'Show password'"
                    :title="isPasswordVisible ? 'Hide password' : 'Show password'"
                    @click="isPasswordVisible = !isPasswordVisible"
                  >
                    <b-icon
                      :icon="isPasswordVisible ? 'eye-slash' : 'eye'"
                    />
                  </b-button>
                </template>
              </b-input-group>
            </b-form-group>
            <b-form-group
              class="mb-0"
              label="Exec"
              label-align="left"
              label-cols-sm="3"
            >
              <b-form-input
                :value="value.exec"
                trim
                size="sm"
                :disabled="disabled"
                @update="set('exec', $event)"
              />
            </b-form-group>
            <div class="info-action mt-2">
              <b-button
                size="sm"
                variant="outline-secondary"
                title="Copy as SSH config (previous nodes become ProxyJump, enabled forwards become LocalForward)"
                @click="$emit('copy')"
              >
                <b-icon
                  :icon="copied ? 'clipboard-check' : 'clipboard'"
                  class="mr-1"
                />
                {{ copied ? 'Copied!' : 'Copy SSH config' }}
              </b-button>
            </div>
          </div>
        </div>
      </template>
    </v-popover>
  </span>
</template>

<script>
import { closePopoverOnEscape } from '@/utils/dismiss'
import { portState } from '@/utils/forward'
import IconPicker from './icon-picker'

// 노드의 접속 정보 입력(이름, user, host, port, 키, 비밀번호, exec, 이미지). 값은 v-model로 주고받고, 항상 새 객체로 돌려준다.
export default {
  name: 'ConnectionSettings',
  components: { IconPicker },
  mixins: [closePopoverOnEscape],
  props: {
    // { diagram, name, user, host, port, keyPath, password, exec }
    value: {
      type: Object,
      required: true
    },
    // 수정할 수 없는 상태(에디터 잠금)
    disabled: {
      type: Boolean,
      default: false
    },
    // 고를 수 있는 이미지 파일 이름들과, 그 파일이 있는 주소
    diagrams: {
      type: Array,
      default: () => []
    },
    diagramBase: {
      type: String,
      default: ''
    },
    // 방금 SSH config를 복사했는지 (버튼 표시용)
    copied: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      isPasswordVisible: false
    }
  },
  methods: {
    portState,
    set(key, value) {
      this.$emit('input', { ...this.value, [key]: value })
    },
    async selectKeyFile() {
      const path = await window.preload.selectKeyFile()
      if (path) {
        this.set('keyPath', path)
      }
    }
  }
}
</script>

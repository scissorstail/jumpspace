<template>
  <a class="menu-item">
    <v-popover
      placement="auto-end"
      @hide="$emit('hide')"
    >
      <b-icon
        title="Setting"
        class="menu-item-icon"
        icon="gear"
        font-scale="2"
      />
      <template slot="popover">
        <div class="p-3">
          <div
            class="info-list"
            style="width: 280px;"
          >
            <div class="info-item mb-3">
              <b-button
                size="sm"
                :disabled="disabled"
                @click="changeDiagram(-1)"
              >
                <b-icon
                  class="menu-item-icon"
                  icon="arrow-left-short"
                />
              </b-button>
              <b-form-input
                :value="value.diagram"
                trim
                size="sm"
                style="margin: 0 3px;"
                :disabled="disabled"
                @update="set('diagram', $event)"
              />
              <b-button
                size="sm"
                :disabled="disabled"
                @click="changeDiagram(1)"
              >
                <b-icon
                  class="menu-item-icon"
                  icon="arrow-right-short"
                />
              </b-button>
            </div>
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
                    :disabled="disabled"
                    @click="selectKeyFile"
                  >
                    <b-icon
                      class="menu-item-icon"
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
                    title="Show/hide password"
                    @click="isPasswordVisible = !isPasswordVisible"
                  >
                    <b-icon
                      class="menu-item-icon"
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
  </a>
</template>

<script>
import { cycle } from '@/utils/cycle'
import { portState } from '@/utils/forward'

// 노드의 접속 정보 입력(이름, user, host, port, 키, 비밀번호, exec, 이미지). 값은 v-model로 주고받고, 항상 새 객체로 돌려준다.
export default {
  name: 'ConnectionSettings',
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
    // 고를 수 있는 이미지 파일 이름들
    diagrams: {
      type: Array,
      default: () => []
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
    changeDiagram(step) {
      this.set('diagram', cycle(this.diagrams, this.value.diagram, step))
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

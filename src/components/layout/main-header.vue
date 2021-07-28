<template>
  <div
    id="main-header"
    class="bg-light p-1 pl-2 pr-2"
  >
    <slot name="main-navigation-toggle" />

    <div class="align-self-center">
      <!-- left button -->
    </div>

    <div class="ml-auto align-self-center">
      <template v-if="false">
        <b-button
          v-b-tooltip.hover.v-light.dh0.noninteractive
          size="sm"
          class="border-transparent"
          :title="isToggle? 'locked' : 'unlocked'"
          variant="light"
          @click="isToggle = !isToggle; $emit('save')"
        >
          <b-icon
            :icon="isToggle? 'lock' : 'unlock'"
          />
        </b-button>
      </template>

      <hr
        class="header-btn-divider my-0 mx-1 p-0"
      >

      <b-dropdown
        size="sm"
        variant="light"
        toggle-class="text-decoration-none"
        no-caret
        right
      >
        <template #button-content>
          <b-icon
            icon="gear"
          />
        </template>
        <b-dropdown-item
          @click="$emit('setting')"
        >
          <small>Settings</small>
        </b-dropdown-item>
        <b-dropdown-divider />
        <b-dropdown-item @click="reload">
          <small>Refresh Window</small>
        </b-dropdown-item>
        <b-dropdown-item
          @click="toggleDevTools"
        >
          <small>Toggle Devtools</small>
        </b-dropdown-item>
        <b-dropdown-item
          @click="$emit('info')"
        >
          <small>Show Info</small>
        </b-dropdown-item>
        <b-dropdown-divider />
        <b-dropdown-item @click="$emit('save')">
          <small>Save Space</small>
        </b-dropdown-item>
        <b-dropdown-item
          @click="$emit('export')"
        >
          <small>Export Space</small>
        </b-dropdown-item>
      </b-dropdown>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MainHeader',
  props: {
    headerInfo: {
      type: Object,
      default: () => ({
        name: null
      })
    }
  },
  data() {
    return {
      isToggle: true
    }
  },
  watch: {
    'headerInfo.name': function () {
      window.preload.setWindowTitle(this.headerInfo.name)
    }
  },
  methods: {
    reload() {
      window.preload.reloadApp()
    },
    toggleDevTools() {
      window.preload.toggleDevTools()
    }
  }
}
</script>

<style lang="scss" scoped>
#main-header {
  display: flex;
  font-size: large;

  .header-btn-divider {
    height: 1.5em;
    display: inline-block;
    vertical-align: middle;
    border-left: 1px solid #e9ecef;
  }
}
</style>

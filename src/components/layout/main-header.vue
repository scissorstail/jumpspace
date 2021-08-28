<template>
  <div
    id="main-header"
    class="layout-divider bg-light p-1 pl-2 pr-2"
  >
    <slot name="main-navigator-toggle" />

    <div class="align-self-center">
      <!-- left button -->
    </div>

    <div class="ml-auto align-self-center">
      <slot name="main-navigator-toolbar" />

      <hr
        class="btn-divider my-0 mx-1 p-0"
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
      isLocked: true
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

  .btn-divider {
    height: 1.5em;
    display: inline-block;
    vertical-align: middle;
    border-left: 1px solid #e9ecef;
  }
}
</style>

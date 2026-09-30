<template>
  <div
    id="main-header"
    class="layout-divider p-1 pl-2 pr-2"
  >
    <slot name="main-navigator-toggle" />

    <!-- 열려 있는 item의 이름 -->
    <div
      class="header-title"
      :title="title"
    >
      {{ title }}
    </div>

    <div class="ml-auto align-self-center">
      <slot name="main-navigator-toolbar" />

      <hr
        class="btn-divider my-0 mx-1 p-0"
      >

      <b-dropdown
        size="sm"
        variant="light"
        :toggle-attrs="{ 'aria-label': 'Menu' }"
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
    title: {
      type: String,
      default: ''
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
  background-color: var(--js-bg-raised);

  .header-title {
    flex: 1;
    min-width: 0;
    padding: 0 12px;
    align-self: center;
    overflow: hidden;
    color: var(--js-text);
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-divider {
    height: 1.5em;
    display: inline-block;
    vertical-align: middle;
    border-left: 1px solid var(--js-border);
  }
}
</style>

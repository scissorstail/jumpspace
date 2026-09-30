<template>
  <div
    id="main-header"
    class="layout-divider p-1 pl-2 pr-2"
  >
    <slot name="main-navigator-toggle" />

    <!-- 열려 있는 item의 이름 -->
    <div class="header-title">
      <span
        v-if="title"
        class="header-title-tag"
        :title="title"
      ><span>{{ title }}</span></span>
      <span
        v-else
        class="header-brand"
      >jumpspace</span>
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
  position: relative;
  display: flex;
  font-size: large;
  background-color: var(--js-bg-raised);

  // 아래 가장자리의 세 가지 색 줄
  &::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 4px;
    background: var(--js-bands);
    z-index: 2;
    pointer-events: none;
  }

  .header-title {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0 12px;
    font-family: var(--js-font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  // 열린 다이어그램 이름: 분홍 이름표
  .header-title-tag {
    max-width: 60%;
    padding: 0 16px;
    background: var(--js-primary);
    box-shadow: 3px 3px 0 #000;
    color: var(--js-on-primary);
    font-size: 1.6rem;
    line-height: 1.2;

    > span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .header-brand {
    color: var(--js-secondary);
    font-size: 1.7rem;
    letter-spacing: 0.35em;
  }

  .btn-divider {
    height: 1.5em;
    display: inline-block;
    vertical-align: middle;
    border-left: 1px solid var(--js-border);
  }
}
</style>

<template>
  <div
    id="main-header"
    class="layout-divider p-1 pl-2 pr-2"
  >
    <!-- 가운데에 제목이 오도록 왼쪽을 비워 둔다 -->
    <div />

    <!-- 열려 있는 item의 이름. 누르면 그 아래로 다이어그램 목록이 열린다 (views/Layout.vue의 #diagram-switcher) -->
    <div class="header-title">
      <button
        id="diagram-switcher-toggle"
        type="button"
        class="header-title-button"
        aria-haspopup="dialog"
        :aria-expanded="isSwitcherOpen ? 'true' : 'false'"
        :aria-label="title ? `Diagrams (open: ${title})` : 'Diagrams'"
        :title="title ? `${title}: switch diagram` : 'Choose a diagram'"
        @click="$emit('switcher')"
      >
        <span
          v-if="title"
          class="header-title-tag"
        >
          <span>{{ title }}</span>
          <b-icon
            icon="chevron-down"
            class="header-title-caret"
            aria-hidden="true"
          />
        </span>
        <span
          v-else
          class="header-brand"
        >
          jumpspace
          <b-icon
            icon="chevron-down"
            class="header-title-caret"
            aria-hidden="true"
          />
        </span>
      </button>
    </div>

    <div class="header-tools">
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
    },
    isSwitcherOpen: {
      type: Boolean,
      default: false
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
  // 제목은 창의 가운데에 둔다: 양쪽 칸이 같은 너비로 늘어나고, 좁아지면 빈 왼쪽 칸부터 줄어든다.
  display: grid;
  grid-template-columns: 1fr minmax(0, auto) 1fr;
  align-items: center;
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
    justify-content: center;
    min-width: 0;
    padding: 0 12px;
  }

  .header-tools {
    justify-self: end;
    white-space: nowrap;
  }

  // 제목은 다이어그램 목록을 여는 단추이다.
  .header-title-button {
    display: flex;
    min-width: 0;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-family: var(--js-font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;

    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: 2px solid var(--js-secondary);
      outline-offset: 3px;
    }
  }

  .header-title-caret {
    flex: none;
    margin-left: 10px;
    font-size: 0.9rem;
  }

  // 열린 다이어그램 이름: 분홍 이름표
  .header-title-tag {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 12px 0 16px;
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

  .header-title-button:hover .header-title-tag,
  .header-title-button[aria-expanded='true'] .header-title-tag {
    box-shadow: 3px 3px 0 var(--js-secondary);
  }

  .header-brand {
    display: flex;
    align-items: center;
    color: var(--js-secondary);
    font-size: 1.7rem;
    letter-spacing: 0.35em;
    white-space: nowrap;

    .header-title-caret {
      margin-left: 0;
    }
  }

  .header-title-button:hover .header-brand,
  .header-title-button[aria-expanded='true'] .header-brand {
    color: var(--js-sun);
  }

  .btn-divider {
    height: 1.5em;
    display: inline-block;
    vertical-align: middle;
    border-left: 1px solid var(--js-border);
  }
}
</style>

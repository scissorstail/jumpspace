<template>
  <b-dropdown
    size="sm"
    variant="outline-white"
    :toggle-attrs="{ 'aria-label': `Menu for ${name || '(untitled)'}` }"
    toggle-class="text-decoration-none"
    right
    no-caret
    class="list-item-dropdown ignore-dragging"
    @shown="$emit('shown')"
    @hidden="$emit('hidden')"
  >
    <template #button-content>
      <b-icon
        icon="three-dots"
      />
    </template>
    <b-dropdown-item @click="$emit('edit')">
      <small>Edit</small>
    </b-dropdown-item>
    <b-dropdown-item @click="$emit('copy')">
      <small>Copy</small>
    </b-dropdown-item>
    <b-dropdown-item @click="$emit('remove')">
      <small>Remove</small>
    </b-dropdown-item>
    <b-dropdown-divider />
    <b-dropdown-item @click="$emit('export')">
      <small>Export</small>
    </b-dropdown-item>
  </b-dropdown>
</template>

<script>
// 다이어그램 목록의 항목 하나의 ... 메뉴 (Edit, Copy, Remove, Export). 동작은 부모(main-navigator)가 한다.
// 모양은 부모의 .list-item-dropdown 규칙이 정한다. (Vue 2에서 자식의 루트 요소는 부모의 scoped 속성도 받는다)
export default {
  name: 'NavigatorItemMenu',
  props: {
    // 항목 이름 (메뉴 단추의 aria-label)
    name: {
      type: String,
      default: ''
    }
  }
}
</script>

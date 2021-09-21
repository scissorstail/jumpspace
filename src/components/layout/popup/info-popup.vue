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
    <template v-slot:overlay>
      <b-card
        v-if="show"
        header="Info"
        bg-variant="light"
        class="text-center"
      >
        <b-card-text class="mb-3">
          <b-row class="mb-3">
            <b-col>
              <b-img
                alt="jumpspace icon"
                rounded
                src="/img/icons/256x256.png"
                width="150"
                height="150"
              />
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <h5 class="text-center">
                {{ `jumpspace v${appVersion}` }}
              </h5>
            </b-col>
          </b-row>
        </b-card-text>

        <b-card-text>
          <div>
            Icons made by
            <a
              href="https://www.flaticon.com/authors/pixel-perfect"
              target="_blank"
              title="Pixel perfect"
            >Pixel perfect</a>
            from
            <a
              href="https://www.flaticon.com/"
              target="_blank"
              title="Flaticon"
            >www.flaticon.com</a>
          </div>
        </b-card-text>

        <b-card-text>
          <div>
            Editor made by
            <a
              href="https://rete.js.org/"
              target="_blank"
              title="Rete.js"
            >Rete.js</a>
          </div>
        </b-card-text>

        <b-card-text>
          <div>
            Electron Build made by
            <a
              href="https://nklayman.github.io/vue-cli-plugin-electron-builder/"
              target="_blank"
              title="Vue CLI Plugin Electron Builder"
            >Vue CLI Plugin Electron Builder</a>
          </div>
        </b-card-text>

        <template v-slot:footer>
          <b-button
            size="sm"
            block
            class="flex-grow-1"
            @click="$emit('update:show', false)"
          >
            Close
          </b-button>
        </template>
      </b-card>
    </template>
  </b-overlay>
</template>

<script>
export default {
  name: 'InfoPopup',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style lang="scss" scoped></style>

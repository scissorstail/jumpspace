<template>
  <b-overlay
    :show="show"
    no-wrap
    rounded="sm"
    opacity="0.6"
    variant="dark"
    blur="3px"
    z-index="1050"
  >
    <template v-slot:overlay>
      <b-card bg-variant="light" :header="`testnet v${appVersion}`" class="text-center">
        <b-card-body>
          <b-card-text class="mb-3">
            <b-row class="mb-3">
              <b-col>
                <b-img
                  fluid
                  rounded
                  src="/img/icons/256px-Electron_Software_Framework_Logo.svg.png"
                  alt="Image 1"
                  width="150"
                  :block="false"
                ></b-img>
                <b-img
                  fluid
                  rounded
                  src="/img/icons/msapplication-icon-144x144.png"
                  alt="Image 1"
                  width="150"
                ></b-img>
              </b-col>
            </b-row>
            <b-row>
              <b-col>
                <b>테스트 버전</b>
              </b-col>
            </b-row>
          </b-card-text>

          <b-card-text>
            <div>
              Icons made by
              <a
                href="https://www.flaticon.com/authors/pixel-perfect"
                title="Pixel perfect"
                target="_blank"
              >Pixel perfect</a> from
              <a
                href="https://www.flaticon.com/"
                title="Flaticon"
                target="_blank"
              >www.flaticon.com</a>
            </div>
          </b-card-text>

          <b-card-text>
            <div>
              Font Awesome Free 5.14.0 by @fontawesome -
              <a
                href="https://fontawesome.com"
                title="fontawesome"
                target="_blank"
              >https://fontawesome.com</a>
            </div>
          </b-card-text>
        </b-card-body>

        <template v-slot:footer>
          <b-button
            block
            variant="light"
            @click="$emit('update:show', false)"
            class="shadow-sm flex-grow-1 mr-1"
          >
            <v-icon name="times" height="14" width="14" scale="1" />
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

<style lang="scss" scoped>

</style>

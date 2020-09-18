<template>
  <b-overlay :show="show" blur="3px" no-wrap opacity="0.6" rounded="sm" variant="dark" z-index="1050">
    <template v-slot:overlay>
      <b-card :header="`testnet v${appVersion}`" bg-variant="light" class="text-center">
        <b-card-body>
          <b-card-text class="mb-3">
            <b-row class="mb-3">
              <b-col>
                <b-img
                  :block="false"
                  alt="Image 1"
                  fluid
                  rounded
                  src="/img/icons/256px-Electron_Software_Framework_Logo.svg.png"
                  width="150"
                ></b-img>
                <b-img alt="Image 1" fluid rounded src="/img/icons/msapplication-icon-144x144.png" width="150"></b-img>
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
                target="_blank"
                title="Pixel perfect"
              >Pixel perfect</a>
              from
              <a href="https://www.flaticon.com/" target="_blank" title="Flaticon">www.flaticon.com</a>
            </div>
          </b-card-text>

          <b-card-text>
            <div>
              Font Awesome Free 5.14.0 by @fontawesome -
              <a
                href="https://fontawesome.com"
                target="_blank"
                title="fontawesome"
              >https://fontawesome.com</a>
            </div>
          </b-card-text>
        </b-card-body>

        <template v-slot:footer>
          <b-button @click="$emit('update:show', false)" block class="shadow-sm flex-grow-1 mr-1" variant="light">
            <v-icon height="14" name="times" scale="1" width="14" />
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

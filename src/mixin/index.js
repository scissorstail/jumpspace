import Vue from 'vue'

const mixin = {
  created () {
    this.appVersion = process.env.VUE_APP_VERSION
  }
}

Vue.mixin(mixin)

export default mixin

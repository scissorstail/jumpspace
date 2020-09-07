import Vue from 'vue'
import { mapGetters, mapMutations } from 'vuex'

const mixin = {
  created () {
    this.appVersion = process.env.VUE_APP_VERSION
  },
  computed: {
    ...mapGetters([
      'setting'
    ])
  },
  methods: {
    ...mapMutations([
      'settingUpdate'
    ])
  }
}

Vue.mixin(mixin)

export default mixin

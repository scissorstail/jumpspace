import Vue from 'vue'
import { mapGetters, mapActions } from 'vuex'

const mixin = {
  created() {
    this.appVersion = __APP_VERSION__
  },
  computed: {
    ...mapGetters(['setting'])
  },
  methods: {
    ...mapActions(['settingSave'])
  }
}

Vue.mixin(mixin)

export default mixin

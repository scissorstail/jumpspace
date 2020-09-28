import Vue from 'vue'
import { mapGetters, mapActions } from 'vuex'

const mixin = {
  created() {
    this.appVersion = process.env.VUE_APP_VERSION
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

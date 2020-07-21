import Rete from 'rete'
import component from './component'

export default class ConnectionControl extends Rete.Control {
  constructor (key, data) {
    super(key)
    this.render = 'vue'
    this.component = component
    this.props = { data }
  }

  setValue (val) {
    // this.vueContext.value = val
  }
}

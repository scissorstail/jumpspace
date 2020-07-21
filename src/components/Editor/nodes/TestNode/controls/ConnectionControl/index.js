import Rete from 'rete'
import component from './component'

export default class ConnectionControl extends Rete.Control {
  constructor (emitter, key, readonly) {
    super(key)
    this.render = 'vue'
    this.component = component
    this.props = { }
  }

  setValue (val) {
    // this.vueContext.value = val
  }
}

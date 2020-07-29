import Rete from 'rete'
import component from './component'

export default class ConnectionControl extends Rete.Control {
  constructor (emitter, key, node, readonly = false) {
    super(key)
    this.emitter = emitter
    this.key = key
    this.readonly = readonly
    this.render = 'vue'
    this.component = component
    this.props = { emitter, ikey: key, readonly }
  }

  setValue (val) {
    this.vueContext.inputs = val
  }
}

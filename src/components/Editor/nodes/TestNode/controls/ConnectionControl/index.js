import Rete from 'rete'
import component from './component'

export default class ConnectionControl extends Rete.Control {
  constructor (emitter, key, node, readonly = false) {
    super(key)
    this.emitter = emitter
    this.key = key
    this.node = node
    this.readonly = readonly
    this.render = 'vue'
    this.component = component
    this.props = {
      emitter,
      setValue: (val) => this.setValue(val),
      info: node.data[key]
    }
  }

  setValue (val) {
    console.log(this)
    this.node.data[this.key] = val
  }
}

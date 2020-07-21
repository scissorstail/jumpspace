import Rete from 'rete'
import ConnectionSocket from '../../sockets/ConnectionSocket'
// import ConnectionControl from './controls/ConnectionControl'

export default class TestNode extends Rete.Component {
  constructor () {
    super('Link') // name
    /*
    this.task = {
      outputs: {}
    }
    */
  }

  builder (node) {
    /// modify the node
    node.addOutput(new Rete.Output('out', 'Forward', ConnectionSocket, true))
    node.addInput(new Rete.Input('in', 'Remote', ConnectionSocket, false))
  }

  worker (node, inputs, outputs) {
    console.log(node)
    console.log(inputs)
    console.log(outputs)
    /// process data
    outputs.out = { a: 1 }
  }
}

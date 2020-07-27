import Rete from 'rete'
import ConnectionSocket from '../../sockets/ConnectionSocket'
import ConnectionControl from './controls/ConnectionControl'

export default class TestNode extends Rete.Component {
  constructor () {
    super('Site') // name
    /*
    this.task = {
      outputs: {}
    }
    */
  }

  builder (node) {
    /// modify the node
    this.control1 = new ConnectionControl(this.editor, 'connection', node)
    this.input1 = new Rete.Input('input1', '', ConnectionSocket, false)
    this.output1 = new Rete.Output('output1', '', ConnectionSocket, true)

    node
      .addControl(this.control1)
      .addInput(this.input1)
      .addOutput(this.output1)
  }

  worker (node, inputs, outputs) {
    console.log(node, inputs, outputs)
    // console.log(node.data)
    // console.log(node)

    this.control1.setValue(inputs)

    /// process data
    outputs.output1 = {
      connection: { ...node.data.connection }
    }
  }
}

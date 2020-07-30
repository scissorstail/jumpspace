import Rete from 'rete'
import ConnectionSocket from '../../sockets/ConnectionSocket'
import ConnectionControl from './controls/ConnectionControl'
import _ from 'lodash'

export default class TestNode extends Rete.Component {
  constructor () {
    super('Site') // name
    /*
    this.task = {
      outputs: {}
    }
    */

    this.getControl = (node) => this.editor.nodes.find(n => n.id === node.id).controls
  }

  builder (node) {
    /// modify the node
    const control1 = new ConnectionControl(this.editor, 'connection')
    const input1 = new Rete.Input('input1', '', ConnectionSocket, false)
    const output1 = new Rete.Output('output1', '', ConnectionSocket, true)

    node
      .addControl(control1)
      .addInput(input1)
      .addOutput(output1)
  }

  worker (node, inputs, outputs) {
    // console.log(node, inputs, outputs)
    // console.log(node)

    const prevNodeDataList = _.first(inputs.input1)?.connection || []
    const nextNodeDataList = prevNodeDataList.concat([node.data.connection])

    node.data.prevNodeDataList = prevNodeDataList
    this.getControl(node).get('connection').vueContext.update()

    /// process data
    outputs.output1 = {
      connection: nextNodeDataList
    }
  }
}

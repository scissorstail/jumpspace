import Rete from 'rete'
import ConnectionSocket from '@/components/editor/sockets/connection-socket'
import ConnectionControl from './controls/connection-control'
import head from 'lodash/head'

export default class SiteNode extends Rete.Component {
  constructor() {
    super('Site') // 컨텍스트 메뉴에 표시되는 이름 설정

    this.getControl = node => this.editor.nodes.find(n => n.id === node.id)?.controls || null
  }

  builder(node) {
    /// modify the node
    const control1 = new ConnectionControl(this.editor, 'connection')
    const input1 = new Rete.Input('input1', '', ConnectionSocket, false)
    const output1 = new Rete.Output('output1', '', ConnectionSocket, true)

    node
      .addControl(control1)
      .addInput(input1)
      .addOutput(output1)
  }

  worker(node, inputs, outputs) {
    const prevNodeDataList = head(inputs.input1)?.connection || []
    const nextNodeDataList = prevNodeDataList.concat([node.data.connection])

    // 앞선 노드들의 정보는 계산해서 얻는 값이라 node.data에 넣지 않는다. (저장 파일에 앞 노드의 비밀번호 등이 중복으로 남는다)
    this.getControl(node)?.get('connection').vueContext.update(prevNodeDataList)

    /// process data
    outputs.output1 = {
      connection: nextNodeDataList
    }
  }
}

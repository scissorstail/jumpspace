import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseForESLint } from 'vue-eslint-parser'
import { describe, expect, it } from 'vitest'

// 사용자가 읽는 글은 다이어그램을 *space*라고 부른다 (owner, 2026-10-15: "다이어그램 대신 스페이스(Space)로 통일").
// 코드의 이름은 그대로다: 노드 그림의 diagram 필드, utils/diagram-data.js, #diagram-switcher, img/diagram, projects.json.
// 소스에 글로 적힌 것만 본다: 스크립트의 문자열, 템플릿의 글과 속성 값. 주석은 보지 않는다.
const WORD = /(?<![\w\-/.#&$])diagrams?(?![\w\-/])/i
// 소문자 낱말 하나뿐인 'diagram'은 필드의 이름이다 (set('diagram', ...), EDITABLE_FIELDS)
const FIELD = /^diagrams?$/

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(js|vue)$/.test(entry.name) && !entry.name.endsWith('.test.js') ? [path] : []
  })
}

// 글이 든 마디를 모두: 문자열, 템플릿 문자열의 조각, 템플릿의 글(VText)과 속성 값(VLiteral). parent와 변수의 참조는 되돌아오므로
// 한 번 본 마디는 다시 보지 않는다.
function texts(node, found = [], seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return found
  seen.add(node)
  if (node.type === 'Literal' && typeof node.value === 'string') found.push([node.value, node.loc])
  if (node.type === 'TemplateElement') found.push([node.value.cooked ?? node.value.raw, node.loc])
  if (node.type === 'VText' || node.type === 'VLiteral') found.push([node.value, node.loc])
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'parent' && key !== 'tokens' && key !== 'comments') texts(value, found, seen)
  }
  return found
}

// 한 파일의 글: { line, text }, 파일의 순서대로
function textsOf(code, filePath) {
  const { ast } = parseForESLint(code, { filePath, ecmaVersion: 'latest', sourceType: 'module' })
  return texts(ast)
    .sort(([, a], [, b]) => a.start.line - b.start.line || a.start.column - b.start.column)
    .map(([text, loc]) => ({ line: loc.start.line, text: text.trim() }))
}

const saysDiagram = ({ text }) => WORD.test(text) && !FIELD.test(text)

// 한 파일에서 diagram이라고 하는 글: "줄: 글"
const diagramWords = (code, filePath) => textsOf(code, filePath).filter(saysDiagram).map(({ line, text }) => `${line}: ${text}`)

describe('the words a user reads', () => {
  it('are found in texts, and names, paths and comments are left alone', () => {
    const vue = [
      '<template>',
      '  <div id="diagram-switcher" class="info-diagram" aria-label="Diagrams">',
      '    <!-- the diagram list -->',
      '    <b-button :title="open ? \'show the diagram\' : \'\'" @click="set(\'diagram\', $event)">New diagram</b-button>',
      '    <img v-if="diagram" :src="diagramBase + diagram">',
      '  </div>',
      '</template>',
      '<script>',
      "import diagram from './modules/diagram'",
      "import { diagramProblem } from '@/utils/diagram-data'",
      '// Its data is not a diagram of this app.',
      "export default { data: () => ({ diagram: null, icon: 'diagram-3', key: '__DIAGRAMS__' }), methods: { ask(n) { return `Remove ` + n + ` selected diagram(s)?` } } }",
      '</script>'
    ].join('\n')
    expect(diagramWords(vue, 'made-up.vue')).toEqual(['2: Diagrams', '4: show the diagram', '4: New diagram', '12: selected diagram(s)?'])
  })

  it('call a diagram a space: no text in the source says diagram', () => {
    const found = sources(__dirname).flatMap(file =>
      textsOf(readFileSync(file, 'utf8'), file).map(({ line, text }) => ({ text, where: `${relative(__dirname, file)}:${line}` })))
    // 읽은 것이 화면의 글이다: 템플릿의 글, 속성 안의 문자열, 화면과 main의 스크립트의 문자열
    expect(found.map(x => x.text)).toEqual(expect.arrayContaining(['Export All Spaces', 'Lower terminals (show the space)', 'No space open', 'does not hold a list of spaces']))
    expect(found.filter(saysDiagram).map(x => `${x.where}: ${x.text}`)).toEqual([])
  })
})

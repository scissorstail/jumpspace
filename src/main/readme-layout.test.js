import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// README의 "project layout"은 src/main과 src/shared의 모듈을 하나씩 적는다. 새 모듈이 빠지거나 없어진 모듈이 남으면
// 실패한다 (#224: #220과 #221이 만든 shared의 terminal-input.js와 clipboard.js가 빠져 있었다).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n')
const layout = readme.match(/\n### project layout\n\n```\n([\s\S]*?)\n```\n/)?.[1] ?? ''

// 목록에서 폴더의 줄("src/main/ ...") 아래에 두 칸 들여 적은 파일들. 설명이 다음 줄로 이어지는 줄은 더 들여 쓴다.
function listed(folder) {
  const block = layout.split(/\n(?=\S)/).find(x => x.startsWith(`${folder}/`)) ?? ''
  return block.split('\n').slice(1).map(line => line.match(/^ {2}([\w.-]+\.js)(?:\s|$)/)?.[1]).filter(Boolean)
}

const modules = folder => readdirSync(join(root, folder)).filter(x => x.endsWith('.js') && !x.endsWith('.test.js'))

describe('the project layout of the README', () => {
  it.each(['src/main', 'src/shared'])('names every module of %s and nothing else', folder => {
    expect(listed(folder).sort()).toEqual(modules(folder).sort())
  })
})

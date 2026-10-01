import { validateExec, validateHost, validateKeyPath, validatePort, validateUser } from '../../../shared/validate.js'

// 노드 설정 입력칸을 main과 같은 규칙(src/shared/validate.js)으로 바로 확인한다.
// 칸마다 [검사 함수, 고치는 방법] 이다. 오류 문구에 값을 그대로 넣지 않고 무엇이 허용되는지 알려준다.
const CHECKS = {
  user: [validateUser, 'Letters, digits and . _ @ \\ - only (not - first), no spaces.'],
  host: [validateHost, 'Letters, digits and . _ : % [ ] - only (not - first), no spaces.'],
  port: [validatePort, 'A number between 1 and 65535.'],
  keyPath: [validateKeyPath, 'No " or control characters, at most 1024 characters.'],
  exec: [validateExec, 'At most 4096 characters.']
}

// 고쳐야 할 때 그 설명을, 괜찮거나 아직 비어 있으면 null을 돌려준다. (빈 칸은 접속할 때 따로 알려준다)
export function fieldError(key, value) {
  const check = CHECKS[key]
  if (!check || value === undefined || value === null || !String(value).trim()) return null
  try {
    check[0](value)
    return null
  } catch {
    return check[1]
  }
}

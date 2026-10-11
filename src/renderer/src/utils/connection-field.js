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

// 노드 설정(connection-settings.vue)의 칸, 보이는 순서대로
export const SETTING_FIELDS = ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec']

// 값이 들어 있는 칸인가. 비밀번호는 앞뒤 공백도 그대로 저장하므로 공백만 있어도 값이다.
function isFilled(key, value) {
  if (value === undefined || value === null) return false

  return key === 'password' ? String(value) !== '' : String(value).trim() !== ''
}

// 노드 설정에 보여줄 칸. 편집 중이 아니면(잠근 동안) 값이 들어 있는 칸만 남긴다 (owner, 2026-10):
// 고칠 수 없는 빈 칸은 자리만 차지하고, 무엇이 들어 있는지 한눈에 보이지 않게 한다.
export function shownFields(value, isLocked) {
  return SETTING_FIELDS.filter(key => !isLocked || isFilled(key, value?.[key]))
}

// 노드 정보 숨기기(머리글의 눈 단추)를 켠 동안 user, host, port 대신 보여줄 글자.
// 글자 수가 드러나지 않게 값마다 같은 길이로 가리고, 점으로 나뉜 값(주소, 도메인)은 조각마다 가린다: 10.0.0.12 -> ***.***.***.***
export const MASK = '***'

export function maskText(value) {
  const text = String(value ?? '')

  return text === '' ? '' : text.split('.').map(() => MASK).join('.')
}

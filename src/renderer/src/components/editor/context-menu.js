import { Menu } from 'rete-context-menu-plugin'
import { menuPlace } from '../../utils/menu-place'

// 캔버스와 노드의 오른쪽 클릭 메뉴: 플러그인의 메뉴(Menu.vue)에 두 가지를 더한 것 (플러그인의 vueComponent, #267).
// - 자리는 utils/menu-place.js가 정한다: 왼쪽 위 모서리를 포인터에 두고, 자리가 없는 쪽으로는 반대로 연다. 플러그인은 메뉴를 포인터의
//   가운데 위쪽에 두고(여백 -60px, -20px: context-menu.scss가 지운다) 창 밖으로 나간 만큼 밀어 넣기만 해서(fitViewport), 첫 항목이
//   포인터 아래에 왔다. 메뉴가 열리는 영역은 캔버스(#rete, 메뉴는 그 안에 생긴다): 터미널 패널은 메뉴 위에 그려진다.
// - 메뉴 밖을 누르면 닫는다. 플러그인은 메뉴에 들어왔던 마우스가 나갈 때와 빈 캔버스를 누를 때만 닫는다 (Rete의 click은 #rete 자신을
//   누를 때만 온다). 포인터가 메뉴 밖에서 시작하니, 그것만으로는 들어가지 않은 메뉴가 닫히지 않고 남는다.
// 플러그인은 오른쪽 클릭마다 메뉴를 새로 만들고, 닫힌 메뉴는 버리지 않는다: 문서에 단 리스너는 닫을 때 뗀다.
export default {
  extends: Menu,
  methods: {
    show(x, y, args) {
      this.pointer = [x, y]
      Menu.methods.show.call(this, x, y, args)
      document.addEventListener('pointerdown', this.pressed, true)
    },
    // 닫는 길은 모두 이것이다: 항목을 누를 때, 마우스가 나간 뒤(플러그인의 timeoutHide), 캔버스의 click과 contextmenu, 밖을 누를 때
    hide() {
      Menu.methods.hide.call(this)
      document.removeEventListener('pointerdown', this.pressed, true)
    },
    pressed(event) {
      if (!this.$refs.menu?.contains(event.target)) this.hide()
    }
  },
  // 플러그인의 updated()가 먼저 돌아 메뉴를 창 안으로 밀어 넣는다. 그 뒤에 포인터에서 자리를 다시 정하고, 플러그인과 같은 규칙으로
  // 한 번 더 잘라 둔다: 그래야 다음 updated()에서 둘이 같은 자리를 낸다 (캔버스는 창 안에 있어서 보통은 아무것도 잘리지 않는다).
  updated() {
    const menu = this.$refs.menu
    if (!menu || !this.pointer) return

    const { width, height } = menu.getBoundingClientRect()
    const [x, y] = menuPlace(this.pointer, [width, height], menu.parentElement.getBoundingClientRect())
    this.x = Math.min(x, window.innerWidth - menu.clientWidth)
    this.y = Math.min(y, window.innerHeight - menu.clientHeight)
  }
}

<template>
  <!-- 배경 풍경: 밤하늘, 별, 줄무늬 해, 도시, 네온 격자 바닥. 장식이라 화면 읽기 프로그램에는 숨긴다. -->
  <div
    class="scene"
    :class="`scene-${backdrop}`"
    aria-hidden="true"
  >
    <div class="scene-art">
      <div class="scene-stars" />
      <div class="scene-sun" />
      <div class="scene-city" />
      <div class="scene-floor" />
    </div>
    <div class="scene-fx" />
  </div>
</template>

<script>
import { DEFAULT_SETTING } from '../../../../shared/setting.js'

// 편집기 뒤의 신스웨이브 풍경. backdrop(설정 > Background)에 따라 효과가 바뀐다. (src/shared/setting.js의 BACKDROPS)
export default {
  name: 'SceneBackdrop',
  props: {
    backdrop: {
      type: String,
      default: DEFAULT_SETTING.backdrop
    }
  }
}
</script>

<style lang="scss">
// ---- 배경 풍경 (신스웨이브 밤) ----
// 모두 흐림 없는 단색 면이다. 해는 지평선에서 잘리고, 건물은 해 앞에 선다.
.scene {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;

  // 지평선: 위는 하늘, 아래는 바닥
  --horizon: 70%;
}

// 풍경 그림 (하늘 띠와 그 위의 별, 해, 도시, 바닥). 배경 효과는 이 층에만 필터를 건다.
.scene-art {
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--js-bg) 0 42%, var(--js-sky-2) 42% var(--horizon), var(--js-bg) var(--horizon));
}

// 그림 위에 덮는 층 (비네트, 안개, 주사선)
.scene-fx {
  position: absolute;
  inset: 0;
}

.scene-stars {
  position: absolute;
  inset: 0 0 calc(100% - var(--horizon)) 0;
  background-image:
    radial-gradient(1.5px 1.5px at 8% 12%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 23% 30%, #fff 98%, transparent),
    radial-gradient(2px 2px at 37% 8%, var(--js-secondary) 98%, transparent),
    radial-gradient(1.5px 1.5px at 52% 22%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 66% 6%, #fff 98%, transparent),
    radial-gradient(2px 2px at 78% 26%, var(--js-primary) 98%, transparent),
    radial-gradient(1.5px 1.5px at 91% 14%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 15% 44%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 84% 46%, #fff 98%, transparent),
    radial-gradient(1.5px 1.5px at 44% 40%, #fff 98%, transparent);
  opacity: 0.8;
}

// 해: 위는 노랑, 아래는 분홍, 아래쪽 절반에 가로 줄이 빠진 원. 지평선 아래(원의 20%)는 잘라낸다.
.scene-sun {
  position: absolute;
  left: 50%;
  bottom: calc(100% - var(--horizon));
  height: min(300px, 48%);
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(var(--js-sun) 0 42%, var(--js-primary) 42%);
  transform: translate(-50%, 20%);
  clip-path: inset(0 0 20% 0);
  -webkit-mask-image: linear-gradient(#000 0 48%, transparent 48% 51%, #000 51% 58%, transparent 58% 62%, #000 62% 67%, transparent 67% 72%, #000 72% 76%, transparent 76%);
  mask-image: linear-gradient(#000 0 48%, transparent 48% 51%, #000 51% 58%, transparent 58% 62%, #000 62% 67%, transparent 67% 72%, #000 72% 76%, transparent 76%);
}

// 도시: 지평선에 붙은 픽셀 건물들
.scene-city {
  position: absolute;
  right: 0;
  bottom: calc(100% - var(--horizon));
  left: 0;
  height: 80px;
  background: var(--js-city);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='80' shape-rendering='crispEdges'%3E%3Crect x='0' y='52' width='22' height='28'/%3E%3Crect x='24' y='60' width='14' height='20'/%3E%3Crect x='42' y='44' width='14' height='36'/%3E%3Crect x='60' y='28' width='14' height='52'/%3E%3Crect x='74' y='60' width='14' height='20'/%3E%3Crect x='90' y='60' width='26' height='20'/%3E%3Crect x='116' y='28' width='14' height='52'/%3E%3Crect x='132' y='8' width='14' height='72'/%3E%3Crect x='150' y='52' width='14' height='28'/%3E%3Crect x='168' y='60' width='30' height='20'/%3E%3Crect x='202' y='36' width='30' height='44'/%3E%3Crect x='232' y='60' width='18' height='20'/%3E%3Crect x='254' y='44' width='18' height='36'/%3E%3Crect x='274' y='28' width='18' height='52'/%3E%3Crect x='292' y='44' width='30' height='36'/%3E%3Crect x='326' y='60' width='18' height='20'/%3E%3Crect x='348' y='20' width='30' height='60'/%3E%3Crect x='378' y='60' width='22' height='20'/%3E%3C/svg%3E") repeat-x left bottom / 400px 80px;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='80' shape-rendering='crispEdges'%3E%3Crect x='0' y='52' width='22' height='28'/%3E%3Crect x='24' y='60' width='14' height='20'/%3E%3Crect x='42' y='44' width='14' height='36'/%3E%3Crect x='60' y='28' width='14' height='52'/%3E%3Crect x='74' y='60' width='14' height='20'/%3E%3Crect x='90' y='60' width='26' height='20'/%3E%3Crect x='116' y='28' width='14' height='52'/%3E%3Crect x='132' y='8' width='14' height='72'/%3E%3Crect x='150' y='52' width='14' height='28'/%3E%3Crect x='168' y='60' width='30' height='20'/%3E%3Crect x='202' y='36' width='30' height='44'/%3E%3Crect x='232' y='60' width='18' height='20'/%3E%3Crect x='254' y='44' width='18' height='36'/%3E%3Crect x='274' y='28' width='18' height='52'/%3E%3Crect x='292' y='44' width='30' height='36'/%3E%3Crect x='326' y='60' width='18' height='20'/%3E%3Crect x='348' y='20' width='30' height='60'/%3E%3Crect x='378' y='60' width='22' height='20'/%3E%3C/svg%3E") repeat-x left bottom / 400px 80px;
}

// 바닥: 원근이 있는 네온 격자
.scene-floor {
  position: absolute;
  top: var(--horizon);
  left: -50%;
  width: 200%;
  height: 120%;
  border-top: 2px solid var(--js-grid);
  background-image:
    linear-gradient(90deg, var(--js-grid) 2px, transparent 2px),
    linear-gradient(var(--js-grid) 2px, transparent 2px);
  background-size: 72px 72px;
  background-position: center top;
  opacity: 0.75;
  transform: perspective(260px) rotateX(64deg);
  transform-origin: top;
}

// ---- 배경 효과 (설정 > Background). 노드와 글자에는 걸지 않고 풍경에만 건다. ----
$vignette: radial-gradient(ellipse 75% 70% at 50% 42%, transparent 45%, rgba(0, 0, 0, 0.6) 100%);

// Vivid: 풍경 그대로
// Soft: 풍경을 바탕색 쪽으로 옅게 하고(밝기를 낮추면 노랑이 탁해진다), 가장자리를 가라앉힌다.
.scene-soft {
  .scene-art {
    opacity: 0.45;
  }

  .scene-fx {
    background: $vignette;
  }
}

// Depth: 먼 풍경처럼 흐리게, 지평선에 옅은 안개. 노드가 앞에 떠 보인다.
.scene-depth {
  .scene-art {
    inset: -12px; // 흐린 가장자리가 비치지 않게 조금 크게
    opacity: 0.6;
    filter: blur(3px);
  }

  .scene-fx {
    background:
      $vignette,
      linear-gradient(transparent 40%, color-mix(in srgb, var(--js-sky-2) 55%, transparent) var(--horizon), transparent 92%);
  }
}

// CRT: 오래된 브라운관처럼 가로 주사선과 천천히 내려가는 밝은 띠, 어두운 모서리
.scene-crt {
  .scene-art {
    opacity: 0.65;
    filter: blur(0.6px);
  }

  .scene-fx {
    background:
      repeating-linear-gradient(rgba(0, 0, 0, 0.5) 0 2px, transparent 2px 4px),
      radial-gradient(ellipse 80% 75% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.75) 100%);

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(transparent, rgba(255, 255, 255, 0.05) 50%, transparent);
      background-size: 100% 30%;
      background-repeat: no-repeat;
      animation: crt-roll 7s linear infinite;
    }
  }
}

// 흐리게 한 풍경에서는 노랑이 탁한 올리브색이 되므로, 해의 위쪽을 분홍 쪽으로 옮긴 주황으로 칠한다.
.scene-soft,
.scene-depth,
.scene-crt {
  .scene-sun {
    background: linear-gradient(color-mix(in srgb, var(--js-sun) 55%, var(--js-primary)) 0 42%, var(--js-primary) 42%);
  }
}

// Off: 풍경 없이 바탕색만
.scene-off {
  display: none;
}

@keyframes crt-roll {
  from {
    background-position: 0 -40%;
  }

  to {
    background-position: 0 140%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-crt .scene-fx::after {
    animation: none;
  }
}
</style>

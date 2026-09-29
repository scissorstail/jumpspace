import { readFileSync, readdirSync } from 'node:fs'
import { defineConfig } from 'electron-vite'
import vue2 from '@vitejs/plugin-vue2'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// public/img/diagram/servers 아래의 파일 목록을 빌드 시점에 확정한다. (렌더러에서 fs를 쓰지 않기 위함)
const diagrams = readdirSync(
  new URL('./src/renderer/public/img/diagram/servers/', import.meta.url)
).sort()

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DIAGRAMS__: JSON.stringify(diagrams)
    },
    plugins: [vue2()],
    resolve: {
      extensions: ['.mjs', '.js', '.json', '.vue']
    },
    css: {
      preprocessorOptions: {
        scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin'] }
      }
    }
  }
})

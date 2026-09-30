import { contextBridge, ipcRenderer } from 'electron'

// 렌더러에는 필요한 동작만 노출한다. (파일 시스템/프로세스 접근은 main 프로세스에서 처리)
// https://www.electronjs.org/docs/tutorial/context-isolation#context-isolation
contextBridge.exposeInMainWorld('preload', {
  setWindowTitle: data => ipcRenderer.send('window:setTitle', data),
  requestWindowMouseMoveEvent: data => ipcRenderer.send('window:mouseMove', data),
  toggleDevTools: () => ipcRenderer.send('window:toggleDevTools'),
  reloadApp: () => ipcRenderer.send('window:reload'),

  getSetting: () => ipcRenderer.invoke('setting:get'),
  setSetting: data => ipcRenderer.invoke('setting:set', data),

  loadProjects: () => ipcRenderer.invoke('projects:load'),
  saveProjects: json => ipcRenderer.invoke('projects:save', json),
  exportProjects: (json, defaultName) => ipcRenderer.invoke('projects:export', json, defaultName),
  importProjects: () => ipcRenderer.invoke('projects:import'),
  selectKeyFile: () => ipcRenderer.invoke('dialog:selectKeyFile'),

  ssh: {
    connect: node => ipcRenderer.invoke('ssh:connect', node),
    forward: data => ipcRenderer.invoke('ssh:forward', data),
    proxyJump: nodes => ipcRenderer.invoke('ssh:proxyJump', nodes),
    copyConfig: request => ipcRenderer.invoke('ssh:copyConfig', request)
  },

  // 터미널의 복사/붙여넣기
  clipboard: {
    writeText: text => ipcRenderer.invoke('clipboard:writeText', text),
    readText: () => ipcRenderer.invoke('clipboard:readText')
  },

  // 앱 안의 터미널. kind는 'connect' | 'forward' | 'proxyJump', payload는 ssh.*와 같다.
  terminal: {
    open: (kind, payload, size) => ipcRenderer.invoke('terminal:open', kind, payload, size),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    close: id => ipcRenderer.send('terminal:close', id),
    // 받은 출력/종료를 알려준다. 돌려주는 함수를 부르면 그만 받는다.
    onData: listener => subscribe('terminal:data', listener),
    onExit: listener => subscribe('terminal:exit', listener)
  }
})

function subscribe(channel, listener) {
  const wrapped = (event, ...args) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

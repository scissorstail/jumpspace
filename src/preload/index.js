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
    proxyJump: nodes => ipcRenderer.invoke('ssh:proxyJump', nodes)
  }
})

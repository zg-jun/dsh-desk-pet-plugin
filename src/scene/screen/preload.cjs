const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('deskPet', {
  dragStart: (dx, dy) => ipcRenderer.send('drag-start', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  menu: () => ipcRenderer.send('menu'),
  settings: () => ipcRenderer.send('settings'),
  hidePet: () => ipcRenderer.send('hide-pet'),
  openSession: (id) => ipcRenderer.send('open-session', id),
  focusApp: () => ipcRenderer.send('focus-app'),
  quitPet: () => ipcRenderer.send('quit-pet'),
  setInteractive: (on) => ipcRenderer.send('set-interactive', !!on),
  hitRegion: (rect) => ipcRenderer.send('hit-region', rect),
  petAnswer: (sessionId, kind, answer) => ipcRenderer.send('pet-answer', { sessionId, kind, answer }),
  fitContent: (w, h) => ipcRenderer.send('fit-content', w, h),
  onHintBeforeHide: (cb) => ipcRenderer.on('hint-before-hide', () => cb()),
  onStatus: (cb) => ipcRenderer.on('status', (_e, status) => cb(status)),
});

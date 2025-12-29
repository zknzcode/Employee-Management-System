const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  sendMail: (payload) => ipcRenderer.invoke('mail:send', payload),
})


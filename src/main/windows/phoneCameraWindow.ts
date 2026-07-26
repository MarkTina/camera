import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let phoneCameraWindow: BrowserWindow | null = null

function loadRenderer(window: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', 'phone-camera')
    window.loadURL(url.toString())
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { mode: 'phone-camera' }
  })
}

export function showPhoneCameraWindow(): void {
  if (phoneCameraWindow && !phoneCameraWindow.isDestroyed()) {
    phoneCameraWindow.show()
    phoneCameraWindow.focus()
    return
  }

  phoneCameraWindow = new BrowserWindow({
    width: 420,
    height: 760,
    minWidth: 420,
    minHeight: 720,
    resizable: true,
    show: false,
    title: '手机摄像头',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  phoneCameraWindow.once('ready-to-show', () => phoneCameraWindow?.show())
  phoneCameraWindow.on('closed', () => {
    phoneCameraWindow = null
  })
  loadRenderer(phoneCameraWindow)
}

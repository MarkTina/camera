import { app, globalShortcut } from 'electron'
import {
  createFloatingCameraWindow,
  resizeFloatingCameraWindowFromWheel,
  toggleFloatingCameraAlwaysOnTop,
  toggleFloatingCameraWindow
} from '../windows/floatingCameraWindow'
import {
  clearAnnotation,
  closeAnnotation,
  toggleAnnotationDrawingMode
} from '../windows/annotationWindows'

function registerShortcut(accelerator: string, callback: () => void): void {
  const registered = globalShortcut.register(accelerator, callback)

  if (!registered) {
    console.warn(`Global shortcut registration failed: ${accelerator}`)
  }
}

export function registerGlobalShortcuts(): void {
  registerShortcut('CommandOrControl+Shift+C', () => {
    toggleFloatingCameraWindow()
  })

  registerShortcut('CommandOrControl+Shift+T', () => {
    toggleFloatingCameraAlwaysOnTop()
  })

  registerShortcut('CommandOrControl+Shift+M', () => {
    createFloatingCameraWindow().webContents.send('camera-window:toggle-mirror')
  })

  registerShortcut('CommandOrControl+Shift+Plus', () => {
    resizeFloatingCameraWindowFromWheel(-1)
  })

  registerShortcut('CommandOrControl+Shift+-', () => {
    resizeFloatingCameraWindowFromWheel(1)
  })

  registerShortcut('CommandOrControl+Shift+A', () => {
    toggleAnnotationDrawingMode()
  })

  registerShortcut('CommandOrControl+Shift+X', () => {
    clearAnnotation()
  })

  registerShortcut('CommandOrControl+Alt+X', () => {
    closeAnnotation()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}

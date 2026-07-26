import { app, screen } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerWindowControlHandlers } from './ipc/windowControl'
import { registerPhoneCameraControlHandlers } from './ipc/phoneCameraControl'
import { registerAnnotationControlHandlers } from './ipc/annotationControl'
import { createFloatingCameraWindow } from './windows/floatingCameraWindow'
import { repositionAnnotationWindows } from './windows/annotationWindows'
import { registerAppMenu } from './tray/appMenu'
import { registerGlobalShortcuts } from './shortcuts/globalShortcuts'

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowControlHandlers()
  registerPhoneCameraControlHandlers()
  registerAnnotationControlHandlers()

  createFloatingCameraWindow()
  registerAppMenu()
  registerGlobalShortcuts()

  screen.on('display-metrics-changed', repositionAnnotationWindows)
  screen.on('display-removed', repositionAnnotationWindows)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

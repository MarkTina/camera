import { BrowserWindow, ipcMain } from 'electron'
import {
  connectPhoneCameraDesktop,
  disconnectPhoneCameraDesktop,
  getPhoneCameraState,
  onPhoneCameraStateChange,
  reportPhoneCameraStreaming,
  selectPhoneCameraAddress,
  sendPhoneCameraSignal,
  startPhoneCameraService,
  stopPhoneCameraService
} from '../phoneCamera/phoneCameraServer'
import { showPhoneCameraWindow } from '../windows/phoneCameraWindow'

const CHANNELS = {
  openDialog: 'phone-camera:open-dialog',
  startService: 'phone-camera:start-service',
  stopService: 'phone-camera:stop-service',
  getState: 'phone-camera:get-state',
  reportStreaming: 'phone-camera:report-streaming',
  selectAddress: 'phone-camera:select-address',
  connectDesktop: 'phone-camera:connect-desktop',
  disconnectDesktop: 'phone-camera:disconnect-desktop',
  sendSignal: 'phone-camera:send-signal'
} as const

export function registerPhoneCameraControlHandlers(): void {
  const desktopSignalListeners = new Map<number, (message: string) => void>()

  ipcMain.handle(CHANNELS.openDialog, () => showPhoneCameraWindow())
  ipcMain.handle(CHANNELS.startService, () => startPhoneCameraService())
  ipcMain.handle(CHANNELS.stopService, () => stopPhoneCameraService())
  ipcMain.handle(CHANNELS.getState, () => getPhoneCameraState())
  ipcMain.handle(CHANNELS.selectAddress, (_event, address: string) =>
    selectPhoneCameraAddress(address)
  )
  ipcMain.handle(CHANNELS.connectDesktop, (event) => {
    const listener = (message: string): void => {
      if (!event.sender.isDestroyed()) event.sender.send('phone-camera:signal', message)
    }
    desktopSignalListeners.set(event.sender.id, listener)
    return connectPhoneCameraDesktop(listener)
  })
  ipcMain.on(CHANNELS.disconnectDesktop, (event) => {
    const listener = desktopSignalListeners.get(event.sender.id)
    if (!listener) return
    disconnectPhoneCameraDesktop(listener)
    desktopSignalListeners.delete(event.sender.id)
  })
  ipcMain.on(CHANNELS.sendSignal, (_event, message: string) => sendPhoneCameraSignal(message))
  ipcMain.on(CHANNELS.reportStreaming, () => reportPhoneCameraStreaming())

  onPhoneCameraStateChange((state) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send('phone-camera:state', state)
    })
  })
}

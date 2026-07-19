import { BrowserWindow, ipcMain } from 'electron'
import {
  beginFloatingCameraWindowDrag,
  dragFloatingCameraWindow,
  endFloatingCameraWindowDrag,
  getFloatingCameraWindow,
  getFloatingCameraWindowSizeState,
  resizeFloatingCameraWindowFromWheel,
  setCameraToolbarHovered,
  hideFloatingCameraWindow,
  setFloatingCameraWindowSize,
  setFloatingCameraAlwaysOnTop
} from '../windows/floatingCameraWindow'

const CHANNELS = {
  close: 'camera-window:close',
  setAlwaysOnTop: 'camera-window:set-always-on-top',
  getAlwaysOnTop: 'camera-window:get-always-on-top',
  resizeFromWheel: 'camera-window:resize-from-wheel',
  getSizeState: 'camera-window:get-size-state',
  setSize: 'camera-window:set-size',
  setToolbarHovered: 'camera-window:set-toolbar-hovered',
  beginDrag: 'camera-window:begin-drag',
  dragTo: 'camera-window:drag-to',
  endDrag: 'camera-window:end-drag'
} as const

interface WindowPoint {
  x: number
  y: number
}

function getSenderWindow(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowControlHandlers(): void {
  ipcMain.handle(CHANNELS.close, (event) => {
    if (getSenderWindow(event)) hideFloatingCameraWindow()
  })

  ipcMain.handle(CHANNELS.setAlwaysOnTop, (event, enabled: boolean) => {
    const window = getSenderWindow(event)

    if (!window) {
      return false
    }

    return setFloatingCameraAlwaysOnTop(enabled)
  })

  ipcMain.handle(CHANNELS.getAlwaysOnTop, (event) => {
    return getSenderWindow(event) ? (getFloatingCameraWindow()?.isAlwaysOnTop() ?? false) : false
  })

  ipcMain.handle(CHANNELS.resizeFromWheel, (_event, deltaY: number) => {
    return resizeFloatingCameraWindowFromWheel(deltaY)
  })

  ipcMain.handle(CHANNELS.getSizeState, () => getFloatingCameraWindowSizeState())

  ipcMain.handle(CHANNELS.setSize, (_event, size: number) => {
    return setFloatingCameraWindowSize(size)
  })

  ipcMain.on(CHANNELS.setToolbarHovered, (event, isHovered: boolean) => {
    if (getSenderWindow(event)) setCameraToolbarHovered(Boolean(isHovered))
  })

  ipcMain.on(CHANNELS.beginDrag, (event, point: WindowPoint) => {
    if (!getSenderWindow(event)) {
      return
    }

    beginFloatingCameraWindowDrag(point)
  })

  ipcMain.on(CHANNELS.dragTo, (event, point: WindowPoint) => {
    if (!getSenderWindow(event)) {
      return
    }

    dragFloatingCameraWindow(point)
  })

  ipcMain.on(CHANNELS.endDrag, () => {
    endFloatingCameraWindowDrag()
  })
}

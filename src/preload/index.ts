import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const cameraWindow = {
  close: (): Promise<void> => ipcRenderer.invoke('camera-window:close'),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('camera-window:set-always-on-top', enabled),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('camera-window:get-always-on-top'),
  resizeFromWheel: (deltaY: number): Promise<number> =>
    ipcRenderer.invoke('camera-window:resize-from-wheel', deltaY),
  getSizeState: (): Promise<{ size: number; min: number; max: number }> =>
    ipcRenderer.invoke('camera-window:get-size-state'),
  setSize: (size: number): Promise<{ size: number; min: number; max: number }> =>
    ipcRenderer.invoke('camera-window:set-size', size),
  setToolbarHovered: (isHovered: boolean): void =>
    ipcRenderer.send('camera-window:set-toolbar-hovered', isHovered),
  onSizeState: (
    callback: (state: { size: number; min: number; max: number }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { size: number; min: number; max: number }
    ): void => callback(state)
    ipcRenderer.on('camera-window:size-state', listener)
    return () => ipcRenderer.removeListener('camera-window:size-state', listener)
  },
  beginDrag: (point: { x: number; y: number }): void =>
    ipcRenderer.send('camera-window:begin-drag', point),
  dragTo: (point: { x: number; y: number }): void =>
    ipcRenderer.send('camera-window:drag-to', point),
  endDrag: (): void => ipcRenderer.send('camera-window:end-drag'),
  onToggleMirror: (callback: () => void): (() => void) => {
    const listener = (): void => callback()

    ipcRenderer.on('camera-window:toggle-mirror', listener)
    return () => ipcRenderer.removeListener('camera-window:toggle-mirror', listener)
  }
}

const annotation = {
  getSessionOpen: (): Promise<boolean> => ipcRenderer.invoke('annotation:get-session-open'),
  toggleSession: (): Promise<boolean> => ipcRenderer.invoke('annotation:toggle-session'),
  getDisplays: (): Promise<
    Array<{
      id: number
      label: string
      bounds: { x: number; y: number; width: number; height: number }
      scaleFactor: number
      isPrimary: boolean
      thumbnailDataUrl: string
    }>
  > => ipcRenderer.invoke('annotation:get-displays'),
  selectDisplay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke('annotation:select-display', displayId),
  cancelDisplayPicker: (): void => ipcRenderer.send('annotation:cancel-display-picker'),
  sendToolbarAction: (action: string, payload?: unknown): void =>
    ipcRenderer.send('annotation:toolbar-action', action, payload),
  setDrawingMode: (isDrawing: boolean): void =>
    ipcRenderer.send('annotation:set-drawing-mode', isDrawing),
  setLayerVisible: (isLayerVisible: boolean): void =>
    ipcRenderer.send('annotation:set-layer-visible', isLayerVisible),
  close: (): void => ipcRenderer.send('annotation:close'),
  reportState: (state: { canUndo: boolean; canRedo: boolean; isDrawing: boolean }): void =>
    ipcRenderer.send('annotation:report-state', state),
  getState: (): Promise<{
    canUndo: boolean
    canRedo: boolean
    isDrawing: boolean
    isLayerVisible: boolean
  }> => ipcRenderer.invoke('annotation:get-state'),
  onAction: (callback: (action: string, payload?: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string, payload?: unknown): void =>
      callback(action, payload)
    ipcRenderer.on('annotation:action', listener)
    return () => ipcRenderer.removeListener('annotation:action', listener)
  },
  onState: (
    callback: (state: {
      canUndo: boolean
      canRedo: boolean
      isDrawing: boolean
      isLayerVisible: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { canUndo: boolean; canRedo: boolean; isDrawing: boolean; isLayerVisible: boolean }
    ): void => callback(state)
    ipcRenderer.on('annotation:state', listener)
    return () => ipcRenderer.removeListener('annotation:state', listener)
  },
  onSessionOpen: (callback: (isOpen: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isOpen: boolean): void =>
      callback(Boolean(isOpen))
    ipcRenderer.on('annotation:session-open', listener)
    return () => ipcRenderer.removeListener('annotation:session-open', listener)
  }
}

const phoneCamera = {
  openDialog: (): Promise<void> => ipcRenderer.invoke('phone-camera:open-dialog'),
  startService: (): Promise<PhoneCameraState> => ipcRenderer.invoke('phone-camera:start-service'),
  stopService: (): Promise<void> => ipcRenderer.invoke('phone-camera:stop-service'),
  getState: (): Promise<PhoneCameraState> => ipcRenderer.invoke('phone-camera:get-state'),
  selectAddress: (address: string): Promise<PhoneCameraState> =>
    ipcRenderer.invoke('phone-camera:select-address', address),
  connectDesktop: (): Promise<boolean> => ipcRenderer.invoke('phone-camera:connect-desktop'),
  disconnectDesktop: (): void => ipcRenderer.send('phone-camera:disconnect-desktop'),
  sendSignal: (message: string): void => ipcRenderer.send('phone-camera:send-signal', message),
  reportStreaming: (): void => ipcRenderer.send('phone-camera:report-streaming'),
  onSignal: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void =>
      callback(message)
    ipcRenderer.on('phone-camera:signal', listener)
    return () => ipcRenderer.removeListener('phone-camera:signal', listener)
  },
  onState: (callback: (state: PhoneCameraState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PhoneCameraState): void =>
      callback(state)
    ipcRenderer.on('phone-camera:state', listener)
    return () => ipcRenderer.removeListener('phone-camera:state', listener)
  }
}

interface PhoneCameraState {
  status: 'idle' | 'ready' | 'phone-connected' | 'streaming' | 'error'
  url: string
  qrCodeDataUrl: string
  message: string
  availableAddresses: string[]
  selectedAddress: string
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('cameraWindow', cameraWindow)
    contextBridge.exposeInMainWorld('annotation', annotation)
    contextBridge.exposeInMainWorld('phoneCamera', phoneCamera)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.cameraWindow = cameraWindow
  // @ts-ignore (define in dts)
  window.annotation = annotation
  // @ts-ignore (define in dts)
  window.phoneCamera = phoneCamera
}

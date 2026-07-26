import { ElectronAPI } from '@electron-toolkit/preload'

interface CameraWindowAPI {
  close: () => Promise<void>
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
  resizeFromWheel: (deltaY: number) => Promise<number>
  getSizeState: () => Promise<{ size: number; min: number; max: number }>
  setSize: (size: number) => Promise<{ size: number; min: number; max: number }>
  setToolbarHovered: (isHovered: boolean) => void
  onSizeState: (callback: (state: { size: number; min: number; max: number }) => void) => () => void
  beginDrag: (point: { x: number; y: number }) => void
  dragTo: (point: { x: number; y: number }) => void
  endDrag: () => void
  onToggleMirror: (callback: () => void) => () => void
}

interface DisplayPreview {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
  thumbnailDataUrl: string
}

interface AnnotationState {
  canUndo: boolean
  canRedo: boolean
  isDrawing: boolean
  isLayerVisible: boolean
}

interface AnnotationAPI {
  getSessionOpen: () => Promise<boolean>
  toggleSession: () => Promise<boolean>
  getDisplays: () => Promise<DisplayPreview[]>
  selectDisplay: (displayId: number) => Promise<boolean>
  cancelDisplayPicker: () => void
  sendToolbarAction: (action: string, payload?: unknown) => void
  setDrawingMode: (isDrawing: boolean) => void
  setLayerVisible: (isLayerVisible: boolean) => void
  close: () => void
  reportState: (state: Pick<AnnotationState, 'canUndo' | 'canRedo' | 'isDrawing'>) => void
  getState: () => Promise<AnnotationState>
  onAction: (callback: (action: string, payload?: unknown) => void) => () => void
  onState: (callback: (state: AnnotationState) => void) => () => void
  onSessionOpen: (callback: (isOpen: boolean) => void) => () => void
}

interface PhoneCameraState {
  status: 'idle' | 'ready' | 'phone-connected' | 'streaming' | 'error'
  url: string
  qrCodeDataUrl: string
  message: string
  availableAddresses: string[]
  selectedAddress: string
}

interface PhoneCameraAPI {
  openDialog: () => Promise<void>
  startService: () => Promise<PhoneCameraState>
  stopService: () => Promise<void>
  getState: () => Promise<PhoneCameraState>
  selectAddress: (address: string) => Promise<PhoneCameraState>
  connectDesktop: () => Promise<boolean>
  disconnectDesktop: () => void
  sendSignal: (message: string) => void
  reportStreaming: () => void
  onSignal: (callback: (message: string) => void) => () => void
  onState: (callback: (state: PhoneCameraState) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    cameraWindow: CameraWindowAPI
    annotation: AnnotationAPI
    phoneCamera: PhoneCameraAPI
  }
}

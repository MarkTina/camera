import { BrowserWindow, app, screen, shell, session, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { getAppSettings, updateAppSettings } from '../settings/appSettings'

const DEFAULT_WINDOW_SIZE = 320
const MIN_WINDOW_SIZE = 180
const ZOOM_STEP = 32
const CAMERA_TOOLBAR_WIDTH = 440
const CAMERA_TOOLBAR_HEIGHT = 82
const CAMERA_TOOLBAR_GAP = 8
const CAMERA_TOOLBAR_HIDE_DELAY = 300
const CAMERA_WINDOW_LEVEL: Parameters<BrowserWindow['setAlwaysOnTop']>[1] = 'pop-up-menu'

export interface CameraWindowSizeState {
  size: number
  min: number
  max: number
}

let floatingCameraWindow: BrowserWindow | null = null
let cameraToolbarWindow: BrowserWindow | null = null
let isQuitting = false
let dragState: { startPoint: { x: number; y: number }; startBounds: Rectangle } | null = null
let cameraToolbarHideTimer: NodeJS.Timeout | null = null

function loadRenderer(window: BrowserWindow, mode = 'camera'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (mode !== 'camera') url.searchParams.set('mode', mode)
    window.loadURL(url.toString())
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: mode === 'camera' ? undefined : { mode }
  })
}

function getCameraToolbarBounds(cameraBounds: Rectangle): Rectangle {
  const display = screen.getDisplayMatching(cameraBounds)
  const workArea = display.workArea
  const width = Math.min(CAMERA_TOOLBAR_WIDTH, workArea.width - 24)
  const unclampedX = Math.round(cameraBounds.x + (cameraBounds.width - width) / 2)
  const x = Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, unclampedX))
  const belowY = cameraBounds.y + cameraBounds.height + CAMERA_TOOLBAR_GAP
  const aboveY = cameraBounds.y - CAMERA_TOOLBAR_HEIGHT - CAMERA_TOOLBAR_GAP
  const y =
    belowY + CAMERA_TOOLBAR_HEIGHT <= workArea.y + workArea.height
      ? belowY
      : Math.max(workArea.y, aboveY)

  return { x, y, width, height: CAMERA_TOOLBAR_HEIGHT }
}

function positionCameraToolbar(): void {
  if (!floatingCameraWindow || !cameraToolbarWindow || cameraToolbarWindow.isDestroyed()) return
  cameraToolbarWindow.setBounds(getCameraToolbarBounds(floatingCameraWindow.getBounds()))
}

function containsPoint(bounds: Rectangle, point: Electron.Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  )
}

function clearCameraToolbarHideTimer(): void {
  if (cameraToolbarHideTimer) clearTimeout(cameraToolbarHideTimer)
  cameraToolbarHideTimer = null
}

function showCameraToolbar(): void {
  clearCameraToolbarHideTimer()
  if (
    !floatingCameraWindow?.isVisible() ||
    !cameraToolbarWindow ||
    cameraToolbarWindow.isDestroyed() ||
    cameraToolbarWindow.webContents.isLoadingMainFrame()
  ) {
    return
  }
  positionCameraToolbar()
  cameraToolbarWindow.showInactive()
  cameraToolbarWindow.moveTop()
}

export function setCameraToolbarHovered(isHovered: boolean): void {
  clearCameraToolbarHideTimer()
  if (isHovered) {
    showCameraToolbar()
    return
  }

  cameraToolbarHideTimer = setTimeout(() => {
    cameraToolbarHideTimer = null
    if (!floatingCameraWindow || !cameraToolbarWindow) return
    const point = screen.getCursorScreenPoint()
    const overCamera = containsPoint(floatingCameraWindow.getBounds(), point)
    const overToolbar = containsPoint(cameraToolbarWindow.getBounds(), point)
    if (!overCamera && !overToolbar) cameraToolbarWindow.hide()
  }, CAMERA_TOOLBAR_HIDE_DELAY)
}

function notifyCameraSizeState(): void {
  if (!cameraToolbarWindow || cameraToolbarWindow.isDestroyed() || !floatingCameraWindow) return
  cameraToolbarWindow.webContents.send(
    'camera-window:size-state',
    getFloatingCameraWindowSizeState()
  )
}

function createCameraToolbarWindow(isAlwaysOnTop: boolean): BrowserWindow {
  if (cameraToolbarWindow && !cameraToolbarWindow.isDestroyed()) return cameraToolbarWindow

  const bounds = getCameraToolbarBounds(
    floatingCameraWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds
  )
  const window = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: 'Camera Float 工具栏',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  cameraToolbarWindow = window
  window.setAlwaysOnTop(isAlwaysOnTop, CAMERA_WINDOW_LEVEL)
  window.on('ready-to-show', () => {
    if (!floatingCameraWindow?.isVisible()) return
    const point = screen.getCursorScreenPoint()
    if (containsPoint(floatingCameraWindow.getBounds(), point)) showCameraToolbar()
  })
  window.on('closed', () => {
    if (cameraToolbarWindow === window) cameraToolbarWindow = null
  })
  loadRenderer(window, 'camera-toolbar')
  return window
}

function allowCameraPermission(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
}

function getInitialWindowBounds(): Partial<Rectangle> {
  const bounds = getAppSettings().windowBounds

  if (!bounds) {
    return {
      width: DEFAULT_WINDOW_SIZE,
      height: DEFAULT_WINDOW_SIZE
    }
  }

  return bounds
}

function saveFloatingCameraWindowBounds(): void {
  if (!floatingCameraWindow || floatingCameraWindow.isDestroyed()) {
    return
  }

  updateAppSettings({
    windowBounds: floatingCameraWindow.getBounds()
  })
}

export function createFloatingCameraWindow(): BrowserWindow {
  if (floatingCameraWindow && !floatingCameraWindow.isDestroyed()) {
    createCameraToolbarWindow(floatingCameraWindow.isAlwaysOnTop())
    return floatingCameraWindow
  }

  allowCameraPermission()

  const initialBounds = getInitialWindowBounds()
  const isAlwaysOnTop = getAppSettings().isAlwaysOnTop ?? true

  floatingCameraWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: MIN_WINDOW_SIZE,
    minHeight: MIN_WINDOW_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: isAlwaysOnTop,
    autoHideMenuBar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'Camera Float',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  floatingCameraWindow.setAlwaysOnTop(isAlwaysOnTop, CAMERA_WINDOW_LEVEL)
  createCameraToolbarWindow(isAlwaysOnTop)

  floatingCameraWindow.on('ready-to-show', () => {
    floatingCameraWindow?.show()
    positionCameraToolbar()
  })

  floatingCameraWindow.on('close', (event) => {
    saveFloatingCameraWindowBounds()

    if (isQuitting) {
      return
    }

    event.preventDefault()
    floatingCameraWindow?.hide()
    cameraToolbarWindow?.hide()
  })

  floatingCameraWindow.on('closed', () => {
    clearCameraToolbarHideTimer()
    floatingCameraWindow = null
    if (cameraToolbarWindow && !cameraToolbarWindow.isDestroyed()) cameraToolbarWindow.destroy()
    cameraToolbarWindow = null
  })

  floatingCameraWindow.on('moved', () => {
    saveFloatingCameraWindowBounds()
    positionCameraToolbar()
  })
  floatingCameraWindow.on('resized', () => {
    if (floatingCameraWindow && dragState) {
      const bounds = floatingCameraWindow.getBounds()

      if (
        bounds.width !== dragState.startBounds.width ||
        bounds.height !== dragState.startBounds.height
      ) {
        floatingCameraWindow.setBounds({
          x: bounds.x,
          y: bounds.y,
          width: dragState.startBounds.width,
          height: dragState.startBounds.height
        })
        return
      }
    }

    saveFloatingCameraWindowBounds()
    positionCameraToolbar()
    notifyCameraSizeState()
  })

  floatingCameraWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(floatingCameraWindow)

  return floatingCameraWindow
}

export function getFloatingCameraWindow(): BrowserWindow | null {
  return floatingCameraWindow
}

export function raiseFloatingCameraWindowsOnWindows(): void {
  if (process.platform !== 'win32') return

  if (floatingCameraWindow?.isVisible()) floatingCameraWindow.moveTop()
  if (cameraToolbarWindow?.isVisible()) cameraToolbarWindow.moveTop()
}

export function showFloatingCameraWindow(): void {
  const window = createFloatingCameraWindow()

  window.show()
  window.focus()
  positionCameraToolbar()
}

export function hideFloatingCameraWindow(): void {
  clearCameraToolbarHideTimer()
  floatingCameraWindow?.hide()
  cameraToolbarWindow?.hide()
}

export function toggleFloatingCameraWindow(): boolean {
  const window = createFloatingCameraWindow()

  if (window.isVisible()) {
    hideFloatingCameraWindow()
    return false
  }

  showFloatingCameraWindow()
  return true
}

export function isFloatingCameraWindowVisible(): boolean {
  return floatingCameraWindow?.isVisible() ?? false
}

export function resetFloatingCameraWindowSize(): void {
  const window = createFloatingCameraWindow()
  const bounds = window.getBounds()
  const x = Math.round(bounds.x + bounds.width / 2 - DEFAULT_WINDOW_SIZE / 2)
  const y = Math.round(bounds.y + bounds.height / 2 - DEFAULT_WINDOW_SIZE / 2)

  window.setBounds({
    x,
    y,
    width: DEFAULT_WINDOW_SIZE,
    height: DEFAULT_WINDOW_SIZE
  })
  saveFloatingCameraWindowBounds()
}

export function getFloatingCameraWindowSizeState(): CameraWindowSizeState {
  const window = createFloatingCameraWindow()
  const bounds = window.getBounds()
  const display = screen.getDisplayMatching(bounds)

  return {
    size: bounds.height,
    min: MIN_WINDOW_SIZE,
    max: Math.max(MIN_WINDOW_SIZE, Math.floor(display.workArea.height / 2))
  }
}

export function setFloatingCameraWindowSize(size: number): CameraWindowSizeState {
  const window = createFloatingCameraWindow()
  const bounds = window.getBounds()
  const range = getFloatingCameraWindowSizeState()
  const requestedSize = Number.isFinite(size) ? size : range.size
  const nextSize = Math.min(range.max, Math.max(range.min, Math.round(requestedSize)))

  if (nextSize !== bounds.height || bounds.width !== nextSize) {
    window.setBounds({
      x: Math.round(bounds.x + bounds.width / 2 - nextSize / 2),
      y: Math.round(bounds.y + bounds.height / 2 - nextSize / 2),
      width: nextSize,
      height: nextSize
    })
    saveFloatingCameraWindowBounds()
    positionCameraToolbar()
    notifyCameraSizeState()
  }

  return { ...range, size: nextSize }
}

export function resizeFloatingCameraWindowFromWheel(deltaY: number): number {
  const range = getFloatingCameraWindowSizeState()
  if (dragState) return range.size

  const direction = deltaY < 0 ? 1 : -1
  return setFloatingCameraWindowSize(range.size + direction * ZOOM_STEP).size
}

function getCameraDragPoint(point: { x: number; y: number }): { x: number; y: number } {
  return process.platform === 'win32' ? screen.getCursorScreenPoint() : point
}

export function beginFloatingCameraWindowDrag(point: { x: number; y: number }): void {
  const window = getFloatingCameraWindow()

  if (!window || !window.isVisible()) {
    return
  }

  dragState = {
    startPoint: getCameraDragPoint(point),
    startBounds: window.getBounds()
  }
}

export function dragFloatingCameraWindow(point: { x: number; y: number }): void {
  const window = getFloatingCameraWindow()

  if (!window || !dragState) {
    return
  }

  const dragPoint = getCameraDragPoint(point)

  window.setBounds({
    x: Math.round(dragState.startBounds.x + dragPoint.x - dragState.startPoint.x),
    y: Math.round(dragState.startBounds.y + dragPoint.y - dragState.startPoint.y),
    width: dragState.startBounds.width,
    height: dragState.startBounds.height
  })
  saveFloatingCameraWindowBounds()
  positionCameraToolbar()
}

export function endFloatingCameraWindowDrag(): void {
  const window = getFloatingCameraWindow()

  if (window && dragState) {
    const bounds = window.getBounds()

    window.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: dragState.startBounds.width,
      height: dragState.startBounds.height
    })
    saveFloatingCameraWindowBounds()
    positionCameraToolbar()
  }

  dragState = null
}

export function setFloatingCameraAlwaysOnTop(enabled: boolean): boolean {
  const window = createFloatingCameraWindow()

  window.setAlwaysOnTop(enabled, CAMERA_WINDOW_LEVEL)
  cameraToolbarWindow?.setAlwaysOnTop(enabled, CAMERA_WINDOW_LEVEL)
  updateAppSettings({ isAlwaysOnTop: window.isAlwaysOnTop() })
  return window.isAlwaysOnTop()
}

export function toggleFloatingCameraAlwaysOnTop(): boolean {
  const window = createFloatingCameraWindow()

  return setFloatingCameraAlwaysOnTop(!window.isAlwaysOnTop())
}

export function quitApplication(): void {
  isQuitting = true
  app.quit()
}

import { BrowserWindow, desktopCapturer, screen, type Display } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { raiseFloatingCameraWindowsOnWindows } from './floatingCameraWindow'

export interface DisplayPreview {
  id: number
  label: string
  bounds: Electron.Rectangle
  scaleFactor: number
  isPrimary: boolean
  thumbnailDataUrl: string
}

export interface AnnotationState {
  canUndo: boolean
  canRedo: boolean
  isDrawing: boolean
  isLayerVisible: boolean
}

const TOOLBAR_HEIGHT = 92
const TOOLBAR_MAX_WIDTH = 980
const OVERLAY_WINDOW_LEVEL: Parameters<BrowserWindow['setAlwaysOnTop']>[1] = 'floating'
const TOOLBAR_WINDOW_LEVEL: Parameters<BrowserWindow['setAlwaysOnTop']>[1] = 'screen-saver'

let displayPickerWindow: BrowserWindow | null = null
let annotationWindow: BrowserWindow | null = null
let annotationToolbarWindow: BrowserWindow | null = null
let selectedDisplayId: number | null = null
let annotationState: AnnotationState = {
  canUndo: false,
  canRedo: false,
  isDrawing: true,
  isLayerVisible: true
}

function broadcastAnnotationSessionOpen(isOpen: boolean): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('annotation:session-open', isOpen)
    }
  })
}

function loadRenderer(window: BrowserWindow, mode: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', mode)
    window.loadURL(url.toString())
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { mode }
  })
}

function getWindowPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

function keepAboveDesktop(
  window: BrowserWindow,
  level: Parameters<BrowserWindow['setAlwaysOnTop']>[1]
): void {
  window.setAlwaysOnTop(true, level)
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

function getDisplayLabel(display: Display, index: number): string {
  const internal = display.internal ? '内置屏幕' : '外接屏幕'
  return `${internal} ${index + 1}`
}

export async function getDisplayPreviews(): Promise<DisplayPreview[]> {
  const displays = screen.getAllDisplays()
  const primaryDisplayId = screen.getPrimaryDisplay().id
  let sources: Awaited<ReturnType<typeof desktopCapturer.getSources>> = []

  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: false
    })
  } catch (error) {
    console.warn('Unable to capture display thumbnails:', error)
  }

  return displays.map((display, index) => {
    const source =
      sources.find((candidate) => Number(candidate.display_id) === display.id) ?? sources[index]

    return {
      id: display.id,
      label: source?.name || getDisplayLabel(display, index),
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      isPrimary: display.id === primaryDisplayId,
      thumbnailDataUrl: source && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : ''
    }
  })
}

function closeDisplayPicker(): void {
  const window = displayPickerWindow
  displayPickerWindow = null
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}

function closeAnnotationWindows(): void {
  const toolbarWindow = annotationToolbarWindow
  const overlayWindow = annotationWindow
  annotationToolbarWindow = null
  annotationWindow = null

  if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.destroy()
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
}

function createDisplayPickerWindow(): BrowserWindow {
  closeDisplayPicker()

  const window = new BrowserWindow({
    width: 820,
    height: 580,
    minWidth: 620,
    minHeight: 440,
    show: false,
    title: '选择要标注的屏幕',
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f7',
    webPreferences: getWindowPreferences()
  })
  displayPickerWindow = window

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (displayPickerWindow === window) {
      displayPickerWindow = null
      broadcastAnnotationSessionOpen(false)
    }
  })
  loadRenderer(window, 'display-picker')
  broadcastAnnotationSessionOpen(true)
  return window
}

function getSelectedDisplay(): Display | null {
  if (selectedDisplayId === null) {
    return null
  }
  return screen.getAllDisplays().find((display) => display.id === selectedDisplayId) ?? null
}

function createAnnotationWindow(display: Display): BrowserWindow {
  const window = new BrowserWindow({
    ...display.bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: true,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: '桌面标注层',
    webPreferences: getWindowPreferences()
  })
  annotationWindow = window

  keepAboveDesktop(window, OVERLAY_WINDOW_LEVEL)
  window.on('ready-to-show', () => {
    window.showInactive()
    setAnnotationDrawingMode(true)
  })
  window.on('closed', () => {
    if (annotationWindow === window) annotationWindow = null
  })
  loadRenderer(window, 'annotation')
  return window
}

function createAnnotationToolbarWindow(display: Display): BrowserWindow {
  const width = Math.min(TOOLBAR_MAX_WIDTH, display.workArea.width - 24)
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + display.workArea.height - TOOLBAR_HEIGHT - 18)

  const window = new BrowserWindow({
    x,
    y,
    width,
    height: TOOLBAR_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: '标注工具栏',
    webPreferences: getWindowPreferences()
  })
  annotationToolbarWindow = window

  keepAboveDesktop(window, TOOLBAR_WINDOW_LEVEL)
  window.on('ready-to-show', () => {
    window.showInactive()
    window.moveTop()
  })
  window.on('closed', () => {
    if (annotationToolbarWindow === window) annotationToolbarWindow = null
  })
  loadRenderer(window, 'annotation-toolbar')
  return window
}

export async function beginAnnotation(): Promise<void> {
  if (annotationWindow && !annotationWindow.isDestroyed()) {
    setAnnotationDrawingMode(true)
    annotationToolbarWindow?.show()
    broadcastAnnotationSessionOpen(true)
    return
  }

  const displays = screen.getAllDisplays()
  if (displays.length === 1) {
    startAnnotationOnDisplay(displays[0].id)
    return
  }

  createDisplayPickerWindow()
}

export function startAnnotationOnDisplay(displayId: number): boolean {
  const display = screen.getAllDisplays().find((candidate) => candidate.id === displayId)
  if (!display) {
    return false
  }

  const pickerWindow = displayPickerWindow
  displayPickerWindow = null
  pickerWindow?.hide()
  closeAnnotationWindows()
  selectedDisplayId = display.id
  annotationState = { canUndo: false, canRedo: false, isDrawing: true, isLayerVisible: true }
  createAnnotationWindow(display)
  createAnnotationToolbarWindow(display)
  broadcastAnnotationSessionOpen(true)
  setImmediate(() => {
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.destroy()
  })
  return true
}

export function cancelDisplaySelection(): void {
  closeDisplayPicker()
  broadcastAnnotationSessionOpen(false)
}

export function setAnnotationDrawingMode(isDrawing: boolean): void {
  if (!annotationWindow || annotationWindow.isDestroyed()) {
    return
  }

  annotationWindow.setIgnoreMouseEvents(!isDrawing, { forward: true })
  annotationWindow.setFocusable(isDrawing)
  if (isDrawing && annotationState.isLayerVisible) {
    annotationWindow.show()
    annotationWindow.focus()
    raiseFloatingCameraWindowsOnWindows()
    if (annotationToolbarWindow && !annotationToolbarWindow.isDestroyed()) {
      keepAboveDesktop(annotationToolbarWindow, TOOLBAR_WINDOW_LEVEL)
      annotationToolbarWindow.showInactive()
      annotationToolbarWindow.moveTop()
    }
  }

  annotationState = { ...annotationState, isDrawing }
  annotationWindow.webContents.send('annotation:state', annotationState)
  annotationToolbarWindow?.webContents.send('annotation:state', annotationState)
}

export function toggleAnnotationDrawingMode(): void {
  if (!annotationWindow || annotationWindow.isDestroyed()) {
    void beginAnnotation()
    return
  }
  setAnnotationDrawingMode(!annotationState.isDrawing)
}

export function setAnnotationLayerVisible(isLayerVisible: boolean): void {
  if (!annotationWindow || annotationWindow.isDestroyed()) return

  annotationState = { ...annotationState, isLayerVisible }
  if (isLayerVisible) {
    annotationWindow.setIgnoreMouseEvents(!annotationState.isDrawing, { forward: true })
    annotationWindow.setFocusable(annotationState.isDrawing)
    if (annotationState.isDrawing) {
      annotationWindow.show()
      annotationWindow.focus()
    } else {
      annotationWindow.showInactive()
    }
    raiseFloatingCameraWindowsOnWindows()
    annotationToolbarWindow?.moveTop()
  } else {
    annotationWindow.hide()
  }

  annotationWindow.webContents.send('annotation:state', annotationState)
  annotationToolbarWindow?.webContents.send('annotation:state', annotationState)
}

export function forwardAnnotationAction(action: string, payload?: unknown): void {
  annotationWindow?.webContents.send('annotation:action', action, payload)
}

export function updateAnnotationState(
  state: Pick<AnnotationState, 'canUndo' | 'canRedo' | 'isDrawing'>
): void {
  annotationState = { ...annotationState, ...state }
  annotationToolbarWindow?.webContents.send('annotation:state', annotationState)
}

export function getAnnotationState(): AnnotationState {
  return annotationState
}

export function isAnnotationActive(): boolean {
  return Boolean(annotationWindow && !annotationWindow.isDestroyed())
}

export function isAnnotationSessionOpen(): boolean {
  return Boolean(
    (displayPickerWindow && !displayPickerWindow.isDestroyed()) ||
    (annotationWindow && !annotationWindow.isDestroyed())
  )
}

export async function toggleAnnotationSession(): Promise<boolean> {
  if (isAnnotationSessionOpen()) {
    closeAnnotation()
    return false
  }

  await beginAnnotation()
  return isAnnotationSessionOpen()
}

export function clearAnnotation(): void {
  forwardAnnotationAction('clear')
}

export function closeAnnotation(): void {
  closeDisplayPicker()
  closeAnnotationWindows()
  selectedDisplayId = null
  annotationState = { canUndo: false, canRedo: false, isDrawing: true, isLayerVisible: true }
  broadcastAnnotationSessionOpen(false)
}

export function repositionAnnotationWindows(): void {
  const display = getSelectedDisplay()
  if (!display && selectedDisplayId !== null) {
    closeAnnotation()
    return
  }
  if (!display || !annotationWindow || !annotationToolbarWindow) {
    return
  }

  annotationWindow.setBounds(display.bounds)
  const width = Math.min(TOOLBAR_MAX_WIDTH, display.workArea.width - 24)
  annotationToolbarWindow.setBounds({
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + display.workArea.height - TOOLBAR_HEIGHT - 18),
    width,
    height: TOOLBAR_HEIGHT
  })
}

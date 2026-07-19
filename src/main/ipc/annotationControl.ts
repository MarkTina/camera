import { ipcMain } from 'electron'
import {
  cancelDisplaySelection,
  closeAnnotation,
  forwardAnnotationAction,
  getAnnotationState,
  getDisplayPreviews,
  isAnnotationSessionOpen,
  setAnnotationDrawingMode,
  setAnnotationLayerVisible,
  startAnnotationOnDisplay,
  toggleAnnotationSession,
  updateAnnotationState,
  type AnnotationState
} from '../windows/annotationWindows'

const ALLOWED_ACTIONS = new Set(['set-tool', 'set-color', 'set-width', 'undo', 'redo', 'clear'])

export function registerAnnotationControlHandlers(): void {
  ipcMain.handle('annotation:get-displays', () => getDisplayPreviews())
  ipcMain.handle('annotation:get-session-open', isAnnotationSessionOpen)
  ipcMain.handle('annotation:toggle-session', toggleAnnotationSession)
  ipcMain.handle('annotation:select-display', (_event, displayId: number) =>
    startAnnotationOnDisplay(displayId)
  )
  ipcMain.on('annotation:cancel-display-picker', cancelDisplaySelection)
  ipcMain.on('annotation:toolbar-action', (_event, action: string, payload?: unknown) => {
    if (ALLOWED_ACTIONS.has(action)) {
      forwardAnnotationAction(action, payload)
    }
  })
  ipcMain.on('annotation:set-drawing-mode', (_event, isDrawing: boolean) => {
    setAnnotationDrawingMode(Boolean(isDrawing))
  })
  ipcMain.on('annotation:set-layer-visible', (_event, isLayerVisible: boolean) => {
    setAnnotationLayerVisible(Boolean(isLayerVisible))
  })
  ipcMain.on('annotation:close', closeAnnotation)
  ipcMain.on('annotation:report-state', (_event, state: AnnotationState) => {
    updateAnnotationState({
      canUndo: Boolean(state.canUndo),
      canRedo: Boolean(state.canRedo),
      isDrawing: Boolean(state.isDrawing)
    })
  })
  ipcMain.handle('annotation:get-state', getAnnotationState)
}

import { Menu, Tray, app, nativeImage } from 'electron'
import icon from '../../../resources/icon.png?asset'
import {
  createFloatingCameraWindow,
  getFloatingCameraWindow,
  hideFloatingCameraWindow,
  isFloatingCameraWindowVisible,
  quitApplication,
  resetFloatingCameraWindowSize,
  setFloatingCameraAlwaysOnTop,
  showFloatingCameraWindow,
  toggleFloatingCameraWindow
} from '../windows/floatingCameraWindow'
import {
  beginAnnotation,
  clearAnnotation,
  closeAnnotation,
  getAnnotationState,
  isAnnotationActive,
  toggleAnnotationDrawingMode
} from '../windows/annotationWindows'

let tray: Tray | null = null

function getWindowState(): { isVisible: boolean; isAlwaysOnTop: boolean } {
  const window = getFloatingCameraWindow()

  return {
    isVisible: window?.isVisible() ?? false,
    isAlwaysOnTop: window?.isAlwaysOnTop() ?? true
  }
}

function createMenu(): Menu {
  const { isVisible, isAlwaysOnTop } = getWindowState()
  const annotationActive = isAnnotationActive()
  const annotationDrawing = getAnnotationState().isDrawing

  return Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏摄像头窗口' : '显示摄像头窗口',
      click: () => {
        if (isFloatingCameraWindowVisible()) {
          hideFloatingCameraWindow()
        } else {
          showFloatingCameraWindow()
        }
        refreshAppMenu()
      }
    },
    {
      label: isAlwaysOnTop ? '取消置顶' : '窗口置顶',
      click: () => {
        setFloatingCameraAlwaysOnTop(!getWindowState().isAlwaysOnTop)
        refreshAppMenu()
      }
    },
    {
      label: '重置窗口大小',
      click: () => {
        resetFloatingCameraWindowSize()
        showFloatingCameraWindow()
      }
    },
    { type: 'separator' },
    {
      label: annotationActive
        ? annotationDrawing
          ? '切换标注为鼠标穿透'
          : '继续桌面标注'
        : '开始桌面标注',
      accelerator: 'CommandOrControl+Shift+A',
      click: () => {
        if (annotationActive) {
          toggleAnnotationDrawingMode()
        } else {
          void beginAnnotation()
        }
        refreshAppMenu()
      }
    },
    {
      label: '清空桌面标注',
      accelerator: 'CommandOrControl+Shift+X',
      enabled: annotationActive,
      click: clearAnnotation
    },
    {
      label: '关闭桌面标注',
      accelerator: 'CommandOrControl+Alt+X',
      enabled: annotationActive,
      click: () => {
        closeAnnotation()
        refreshAppMenu()
      }
    },
    { type: 'separator' },
    {
      label: '退出 Camera Float',
      click: () => {
        quitApplication()
      }
    }
  ])
}

function refreshAppMenu(): void {
  const menu = createMenu()

  if (process.platform === 'darwin') {
    app.dock?.setMenu(menu)
    return
  }

  tray?.setContextMenu(menu)
}

function createTrayIcon(): Tray {
  const image = nativeImage.createFromPath(icon).resize({ width: 18, height: 18 })
  const nextTray = new Tray(image)

  nextTray.setToolTip('Camera Float')
  nextTray.on('click', () => {
    toggleFloatingCameraWindow()
    refreshAppMenu()
  })
  nextTray.on('right-click', () => {
    refreshAppMenu()
    nextTray.popUpContextMenu()
  })

  return nextTray
}

export function registerAppMenu(): void {
  createFloatingCameraWindow()

  if (process.platform === 'darwin') {
    app.dock?.show()
    refreshAppMenu()

    app.on('activate', () => {
      toggleFloatingCameraWindow()
      refreshAppMenu()
    })

    return
  }

  tray = createTrayIcon()
  refreshAppMenu()
}

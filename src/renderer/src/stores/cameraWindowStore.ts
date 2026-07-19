import { defineStore } from 'pinia'

export type CameraShape = 'circle' | 'square' | 'rounded'

interface CameraWindowSettings {
  shape: CameraShape
  isMirrored: boolean
  selectedDeviceId: string
  opacity: number
  hasBorder: boolean
  hasShadow: boolean
}

const STORAGE_KEY = 'camera-window-settings'
const SETTINGS_CHANNEL = 'camera-window-settings-sync'
const DEFAULT_SETTINGS: CameraWindowSettings = {
  shape: 'circle',
  isMirrored: true,
  selectedDeviceId: '',
  opacity: 100,
  hasBorder: true,
  hasShadow: false
}

function readStoredSettings(): Partial<CameraWindowSettings> {
  try {
    return JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '{}'
    ) as Partial<CameraWindowSettings>
  } catch {
    return {}
  }
}

function broadcastSettingsChange(): void {
  const channel = new BroadcastChannel(SETTINGS_CHANNEL)
  channel.postMessage(null)
  channel.close()
}

export function onCameraWindowSettingsChange(callback: () => void): () => void {
  const channel = new BroadcastChannel(SETTINGS_CHANNEL)
  channel.addEventListener('message', callback)
  return () => channel.close()
}

export const useCameraWindowStore = defineStore('cameraWindow', {
  state: () => ({
    ...DEFAULT_SETTINGS,
    isAlwaysOnTop: true
  }),
  actions: {
    initializeSettings(): void {
      const settings = readStoredSettings()

      this.shape = settings.shape ?? DEFAULT_SETTINGS.shape
      this.isMirrored = settings.isMirrored ?? DEFAULT_SETTINGS.isMirrored
      this.selectedDeviceId = settings.selectedDeviceId ?? DEFAULT_SETTINGS.selectedDeviceId
      this.opacity = settings.opacity ?? DEFAULT_SETTINGS.opacity
      this.hasBorder = settings.hasBorder ?? DEFAULT_SETTINGS.hasBorder
      this.hasShadow = settings.hasShadow ?? DEFAULT_SETTINGS.hasShadow
    },
    persistSettings(): void {
      const settings: CameraWindowSettings = {
        shape: this.shape,
        isMirrored: this.isMirrored,
        selectedDeviceId: this.selectedDeviceId,
        opacity: this.opacity,
        hasBorder: this.hasBorder,
        hasShadow: this.hasShadow
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      broadcastSettingsChange()
    },
    setShape(shape: CameraShape): void {
      this.shape = shape
      this.persistSettings()
    },
    toggleMirror(): void {
      this.isMirrored = !this.isMirrored
      this.persistSettings()
    },
    setAlwaysOnTop(enabled: boolean): void {
      this.isAlwaysOnTop = enabled
    },
    setSelectedDeviceId(deviceId: string): void {
      this.selectedDeviceId = deviceId
      this.persistSettings()
    },
    setOpacity(opacity: number): void {
      this.opacity = Math.min(100, Math.max(35, opacity))
      this.persistSettings()
    },
    toggleBorder(): void {
      this.hasBorder = !this.hasBorder
      this.persistSettings()
    },
    toggleShadow(): void {
      this.hasShadow = !this.hasShadow
      this.persistSettings()
    }
  }
})

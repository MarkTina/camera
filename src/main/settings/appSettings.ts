import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface AppSettings {
  windowBounds?: WindowBounds
  isAlwaysOnTop?: boolean
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'camera-settings.json')
}

function readSettings(): AppSettings {
  const settingsPath = getSettingsPath()

  if (!existsSync(settingsPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

function writeSettings(settings: AppSettings): void {
  const settingsPath = getSettingsPath()

  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

export function getAppSettings(): AppSettings {
  return readSettings()
}

export function updateAppSettings(nextSettings: Partial<AppSettings>): AppSettings {
  const settings = {
    ...readSettings(),
    ...nextSettings
  }

  writeSettings(settings)
  return settings
}

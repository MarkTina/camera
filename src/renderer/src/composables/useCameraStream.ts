import { onBeforeUnmount, shallowRef, ref, type Ref, type ShallowRef } from 'vue'

function getCameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return '摄像头启动失败。'
  }

  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return '摄像头权限被拒绝，请在系统或应用权限中允许访问摄像头。'
  }

  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return '未检测到可用摄像头。'
  }

  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return '摄像头可能正被其他应用占用。'
  }

  return '摄像头启动失败，请稍后重试。'
}

interface CameraStreamState {
  stream: ShallowRef<MediaStream | null>
  videoDevices: Ref<MediaDeviceInfo[]>
  errorMessage: Ref<string>
  isLoading: Ref<boolean>
  startCamera: (deviceId?: string) => Promise<MediaStream | null>
  refreshVideoDevices: () => Promise<void>
  stopCamera: () => void
}

const stream = shallowRef<MediaStream | null>(null)
const activeDeviceId = ref('')
const videoDevices = ref<MediaDeviceInfo[]>([])
const errorMessage = ref('')
const isLoading = ref(false)

export function useCameraStream(): CameraStreamState {
  async function refreshVideoDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      videoDevices.value = []
      return
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    videoDevices.value = devices.filter((device) => device.kind === 'videoinput')
  }

  async function startCamera(deviceId = ''): Promise<MediaStream | null> {
    if (stream.value && activeDeviceId.value === deviceId) {
      return stream.value
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      errorMessage.value = '当前环境不支持摄像头访问。'
      return null
    }

    isLoading.value = true
    errorMessage.value = ''
    stopCamera()

    try {
      const video: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
        ...(deviceId
          ? {
              deviceId: {
                exact: deviceId
              }
            }
          : {})
      }

      stream.value = await navigator.mediaDevices.getUserMedia({
        video,
        audio: false
      })
      activeDeviceId.value = deviceId
      await refreshVideoDevices()
      return stream.value
    } catch (error) {
      errorMessage.value = getCameraErrorMessage(error)
      return null
    } finally {
      isLoading.value = false
    }
  }

  function stopCamera(): void {
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
  }

  navigator.mediaDevices?.addEventListener?.('devicechange', refreshVideoDevices)

  onBeforeUnmount(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', refreshVideoDevices)
    stopCamera()
  })

  return {
    stream,
    videoDevices,
    errorMessage,
    isLoading,
    startCamera,
    refreshVideoDevices,
    stopCamera
  }
}

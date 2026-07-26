<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStream } from '../composables/useCameraStream'
import { PHONE_CAMERA_DEVICE_ID, usePhoneCameraStream } from '../composables/usePhoneCameraStream'
import { useWindowControls } from '../composables/useWindowControls'
import { useCameraWindowStore } from '../stores/cameraWindowStore'

const videoElement = ref<HTMLVideoElement | null>(null)
const isDragging = ref(false)
const phoneErrorMessage = ref('')
const cameraStore = useCameraWindowStore()
const {
  shape,
  isMirrored,
  selectedDeviceId,
  opacity,
  hasBorder,
  hasShadow,
  cropZoom,
  cropOffsetX,
  cropOffsetY,
  rotation
} =
  storeToRefs(cameraStore)
const { errorMessage, isLoading, startCamera, stopCamera } = useCameraStream()
const { stream: phoneStream, connect: connectPhoneCamera, disconnect: disconnectPhoneCamera } =
  usePhoneCameraStream()
const { beginDrag, dragTo, endDrag, resizeFromWheel, setToolbarHovered } = useWindowControls()
let removePhoneCameraStateListener: (() => void) | null = null
let isPhoneCameraActive = false
let hasReportedPhoneFrame = false

const frameClasses = computed(() => [
  `shape-${shape.value}`,
  {
    'has-border': hasBorder.value,
    'has-shadow': hasShadow.value
  }
])
const frameStyle = computed(() => ({
  opacity: String(opacity.value / 100)
}))
const videoClasses = computed(() => ({
  'is-mirrored': isMirrored.value
}))
const videoStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg) ${isMirrored.value ? 'scaleX(-1) ' : ''}translate(${cropOffsetX.value}%, ${cropOffsetY.value}%) scale(${cropZoom.value})`
}))
const activeErrorMessage = computed(() => phoneErrorMessage.value || errorMessage.value)

async function attachCamera(): Promise<void> {
  isPhoneCameraActive = false
  phoneErrorMessage.value = ''
  disconnectPhoneCamera()
  const stream = await startCamera(selectedDeviceId.value)

  if (!stream || !videoElement.value) {
    return
  }

  videoElement.value.srcObject = stream
  await videoElement.value.play()
}

async function attachPhoneCamera(): Promise<void> {
  if (isPhoneCameraActive) {
    return
  }

  isPhoneCameraActive = true
  phoneErrorMessage.value = ''
  stopCamera()
  const isConnected = await connectPhoneCamera()

  if (!isConnected) {
    isPhoneCameraActive = false
    phoneErrorMessage.value = '无法建立手机视频连接，请确认手机仍停留在摄像头页面后重试。'
    return
  }

  if (!videoElement.value || !phoneStream.value) {
    phoneErrorMessage.value = '手机视频轨道未就绪，请重试。'
    return
  }
  videoElement.value.srcObject = phoneStream.value
  await videoElement.value.play()
}

async function attachPhoneStream(stream: MediaStream | null): Promise<void> {
  if (!stream || !videoElement.value) return

  videoElement.value.srcObject = stream
  await videoElement.value.play()
}

function handleVideoLoadedData(): void {
  if (
    hasReportedPhoneFrame ||
    selectedDeviceId.value !== PHONE_CAMERA_DEVICE_ID ||
    videoElement.value?.srcObject !== phoneStream.value
  ) {
    return
  }

  hasReportedPhoneFrame = true
  window.phoneCamera.reportStreaming()
}

function retryCurrentCamera(): void {
  if (selectedDeviceId.value === PHONE_CAMERA_DEVICE_ID) {
    void attachPhoneCamera()
    return
  }
  void attachCamera()
}

async function handleWheel(event: WheelEvent): Promise<void> {
  event.preventDefault()
  if (isDragging.value) {
    return
  }
  await resizeFromWheel(event.deltaY)
}

function getPointerPoint(event: PointerEvent): { x: number; y: number } {
  return {
    x: event.screenX,
    y: event.screenY
  }
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button'))
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || isControlTarget(event.target)) {
    return
  }

  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  beginDrag(getPointerPoint(event))
}

function handlePointerMove(event: PointerEvent): void {
  if (!isDragging.value) {
    return
  }

  event.preventDefault()
  dragTo(getPointerPoint(event))
}

function handlePointerEnd(event: PointerEvent): void {
  if (!isDragging.value) {
    return
  }

  isDragging.value = false
  const target = event.currentTarget as HTMLElement

  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }

  endDrag()
}

onMounted(() => {
  if (selectedDeviceId.value === PHONE_CAMERA_DEVICE_ID) {
    void attachPhoneCamera()
  } else {
    void attachCamera()
  }
  removePhoneCameraStateListener = window.phoneCamera.onState((state) => {
    if (state.status === 'ready' && selectedDeviceId.value === PHONE_CAMERA_DEVICE_ID) {
      cameraStore.setSelectedDeviceId('')
    }
  })
})

watch(selectedDeviceId, (deviceId) => {
  if (deviceId === PHONE_CAMERA_DEVICE_ID) {
    hasReportedPhoneFrame = false
    void attachPhoneCamera()
    return
  }
  void attachCamera()
})

watch(phoneStream, (stream) => {
  void attachPhoneStream(stream)
})

onBeforeUnmount(() => {
  removePhoneCameraStateListener?.()
  disconnectPhoneCamera()
})
</script>

<template>
  <main
    class="camera-stage"
    :class="{ dragging: isDragging }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @lostpointercapture="handlePointerEnd"
    @pointerenter="setToolbarHovered(true)"
    @pointerleave="setToolbarHovered(false)"
  >
    <section
      class="camera-frame"
      :class="frameClasses"
      :style="frameStyle"
      aria-label="摄像头预览"
      @wheel="handleWheel"
    >
      <video
        ref="videoElement"
        class="camera-video"
        :class="videoClasses"
        :style="videoStyle"
        autoplay
        muted
        playsinline
        @loadeddata="handleVideoLoadedData"
      />
      <div v-if="isLoading || activeErrorMessage" class="camera-status">
        <span v-if="isLoading">正在启动摄像头</span>
        <template v-else>
          <span>{{ activeErrorMessage }}</span>
          <button type="button" @click="retryCurrentCamera">重试</button>
        </template>
      </div>
    </section>
  </main>
</template>

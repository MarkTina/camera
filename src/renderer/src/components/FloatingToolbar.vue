<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStream } from '../composables/useCameraStream'
import { useWindowControls } from '../composables/useWindowControls'
import { useCameraWindowStore, type CameraShape } from '../stores/cameraWindowStore'

const cameraStore = useCameraWindowStore()
const {
  shape,
  isMirrored,
  isAlwaysOnTop,
  selectedDeviceId,
  opacity,
  hasBorder,
  hasShadow,
  cropZoom,
  cropOffsetX,
  cropOffsetY
} = storeToRefs(cameraStore)
const { closeWindow, getAlwaysOnTop, getSizeState, setAlwaysOnTop, setSize, setToolbarHovered } =
  useWindowControls()
const { videoDevices, refreshVideoDevices } = useCameraStream()
const cameraSize = ref(320)
const minCameraSize = ref(180)
const maxCameraSize = ref(540)
const annotationSessionOpen = ref(false)
const isCropEditing = ref(false)
let removeAnnotationSessionListener: (() => void) | null = null
let removeSizeStateListener: (() => void) | null = null

const shapeOptions: Array<{ value: CameraShape; label: string }> = [
  { value: 'circle', label: '圆' },
  { value: 'square', label: '方' },
  { value: 'rounded', label: '角' }
]

function getDeviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label || `摄像头 ${index + 1}`
}

function handleDeviceChange(event: Event): void {
  cameraStore.setSelectedDeviceId((event.target as HTMLSelectElement).value)
}

function handleOpacityInput(event: Event): void {
  cameraStore.setOpacity(Number((event.target as HTMLInputElement).value))
}

function handleCropZoomInput(event: Event): void {
  cameraStore.setCropZoom(Number((event.target as HTMLInputElement).value))
}

function handleCropOffsetInput(axis: 'x' | 'y', event: Event): void {
  cameraStore.setCropOffset(axis, Number((event.target as HTMLInputElement).value))
}

const cropOffsetLimit = computed(() => (cropZoom.value - 1) * 50)

async function syncCameraSize(): Promise<void> {
  const state = await getSizeState()
  cameraSize.value = state.size
  minCameraSize.value = state.min
  maxCameraSize.value = state.max
}

function applyCameraSizeState(state: { size: number; min: number; max: number }): void {
  cameraSize.value = state.size
  minCameraSize.value = state.min
  maxCameraSize.value = state.max
}

async function handleSizeInput(event: Event): Promise<void> {
  const state = await setSize(Number((event.target as HTMLInputElement).value))
  cameraSize.value = state.size
  minCameraSize.value = state.min
  maxCameraSize.value = state.max
}

async function toggleAnnotationSession(): Promise<void> {
  annotationSessionOpen.value = await window.annotation.toggleSession()
}

async function toggleAlwaysOnTop(): Promise<void> {
  const enabled = await setAlwaysOnTop(!isAlwaysOnTop.value)
  cameraStore.setAlwaysOnTop(enabled)
}

onMounted(async () => {
  cameraStore.setAlwaysOnTop(await getAlwaysOnTop())
  await syncCameraSize()
  removeSizeStateListener = window.cameraWindow.onSizeState(applyCameraSizeState)
  annotationSessionOpen.value = await window.annotation.getSessionOpen()
  removeAnnotationSessionListener = window.annotation.onSessionOpen((isOpen) => {
    annotationSessionOpen.value = isOpen
  })
  await refreshVideoDevices()
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshVideoDevices)
})

onBeforeUnmount(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', refreshVideoDevices)
  removeAnnotationSessionListener?.()
  removeSizeStateListener?.()
})
</script>

<template>
  <nav
    class="floating-toolbar"
    aria-label="摄像头窗口控制"
    @pointerenter="setToolbarHovered(true)"
    @pointerleave="setToolbarHovered(false)"
  >
    <div class="camera-toolbar-row">
      <select
        class="toolbar-select"
        :value="selectedDeviceId"
        title="选择摄像头"
        aria-label="选择摄像头"
        @change="handleDeviceChange"
        @pointerdown.stop
      >
        <option value="">默认摄像头</option>
        <option
          v-for="(device, index) in videoDevices"
          :key="device.deviceId"
          :value="device.deviceId"
        >
          {{ getDeviceLabel(device, index) }}
        </option>
      </select>

      <div class="toolbar-group" aria-label="窗口形态">
        <button
          v-for="option in shapeOptions"
          :key="option.value"
          type="button"
          :class="{ active: shape === option.value }"
          :title="`${option.label}形窗口`"
          @click="cameraStore.setShape(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <button
        type="button"
        :class="{ active: isMirrored }"
        :title="isMirrored ? '关闭水平镜像' : '开启水平镜像'"
        @click="cameraStore.toggleMirror"
      >
        镜
      </button>

      <button
        type="button"
        :class="{ active: isAlwaysOnTop }"
        :title="isAlwaysOnTop ? '取消置顶' : '窗口置顶'"
        @click="toggleAlwaysOnTop"
      >
        顶
      </button>

      <button
        type="button"
        :class="{ active: isCropEditing }"
        :title="isCropEditing ? '完成画面裁剪' : '调整画面裁剪'"
        :aria-pressed="isCropEditing"
        @click="isCropEditing = !isCropEditing"
      >
        裁
      </button>
    </div>

    <div v-if="!isCropEditing" class="camera-toolbar-row">
      <label class="toolbar-range" title="窗口透明度">
        <span>透</span>
        <input
          type="range"
          min="35"
          max="100"
          step="5"
          :value="opacity"
          aria-label="窗口透明度"
          @input="handleOpacityInput"
          @pointerdown.stop
        />
      </label>

      <label class="toolbar-range" title="摄像头窗口大小">
        <span>大</span>
        <input
          type="range"
          :min="minCameraSize"
          :max="maxCameraSize"
          step="1"
          :value="cameraSize"
          aria-label="摄像头窗口大小"
          @input="handleSizeInput"
          @pointerdown.stop
        />
      </label>

      <button
        type="button"
        class="annotation-launcher"
        :class="{ active: annotationSessionOpen }"
        :title="annotationSessionOpen ? '关闭标注工具' : '打开标注工具'"
        :aria-pressed="annotationSessionOpen"
        @click="toggleAnnotationSession"
      >
        标注
      </button>

      <button
        type="button"
        :class="{ active: hasBorder }"
        :title="hasBorder ? '隐藏边框' : '显示边框'"
        @click="cameraStore.toggleBorder"
      >
        边
      </button>

      <button
        type="button"
        :class="{ active: hasShadow }"
        :title="hasShadow ? '隐藏阴影' : '显示阴影'"
        @click="cameraStore.toggleShadow"
      >
        影
      </button>

      <button type="button" class="danger" title="关闭窗口" @click="closeWindow">关</button>
    </div>

    <div v-else class="camera-toolbar-row">
      <label class="toolbar-range" title="放大画面以裁去黑边">
        <span>放</span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          :value="cropZoom"
          aria-label="裁剪缩放"
          @input="handleCropZoomInput"
          @pointerdown.stop
        />
      </label>

      <label class="toolbar-range" title="水平移动裁剪区域">
        <span>横</span>
        <input
          type="range"
          :min="-cropOffsetLimit"
          :max="cropOffsetLimit"
          step="0.5"
          :value="cropOffsetX"
          aria-label="水平移动裁剪区域"
          :disabled="cropZoom === 1"
          @input="handleCropOffsetInput('x', $event)"
          @pointerdown.stop
        />
      </label>

      <label class="toolbar-range" title="垂直移动裁剪区域">
        <span>竖</span>
        <input
          type="range"
          :min="-cropOffsetLimit"
          :max="cropOffsetLimit"
          step="0.5"
          :value="cropOffsetY"
          aria-label="垂直移动裁剪区域"
          :disabled="cropZoom === 1"
          @input="handleCropOffsetInput('y', $event)"
          @pointerdown.stop
        />
      </label>

      <button type="button" title="恢复完整画面" @click="cameraStore.resetCrop">复</button>
    </div>
  </nav>
</template>

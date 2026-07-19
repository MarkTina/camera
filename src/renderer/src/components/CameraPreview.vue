<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStream } from '../composables/useCameraStream'
import { useWindowControls } from '../composables/useWindowControls'
import { useCameraWindowStore } from '../stores/cameraWindowStore'

const videoElement = ref<HTMLVideoElement | null>(null)
const isDragging = ref(false)
const cameraStore = useCameraWindowStore()
const { shape, isMirrored, selectedDeviceId, opacity, hasBorder, hasShadow } =
  storeToRefs(cameraStore)
const { errorMessage, isLoading, startCamera } = useCameraStream()
const { beginDrag, dragTo, endDrag, resizeFromWheel, setToolbarHovered } = useWindowControls()

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

async function attachCamera(): Promise<void> {
  const stream = await startCamera(selectedDeviceId.value)

  if (!stream || !videoElement.value) {
    return
  }

  videoElement.value.srcObject = stream
  await videoElement.value.play()
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
  attachCamera()
})

watch(selectedDeviceId, () => {
  attachCamera()
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
        autoplay
        muted
        playsinline
      />

      <div v-if="isLoading || errorMessage" class="camera-status">
        <span v-if="isLoading">正在启动摄像头</span>
        <template v-else>
          <span>{{ errorMessage }}</span>
          <button type="button" @click="attachCamera">重试</button>
        </template>
      </div>
    </section>
  </main>
</template>

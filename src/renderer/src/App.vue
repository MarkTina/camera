<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import CameraPreview from './components/CameraPreview.vue'
import FloatingToolbar from './components/FloatingToolbar.vue'
import DisplayPicker from './components/DisplayPicker.vue'
import AnnotationCanvas from './components/AnnotationCanvas.vue'
import AnnotationToolbar from './components/AnnotationToolbar.vue'
import { onCameraWindowSettingsChange, useCameraWindowStore } from './stores/cameraWindowStore'

const cameraStore = useCameraWindowStore()
const mode = new URLSearchParams(window.location.search).get('mode') ?? 'camera'
let removeToggleMirrorListener: (() => void) | null = null
let removeSettingsListener: (() => void) | null = null

if (mode === 'camera' || mode === 'camera-toolbar') {
  cameraStore.initializeSettings()
}

onMounted(() => {
  if (mode !== 'camera' && mode !== 'camera-toolbar') {
    return
  }
  removeSettingsListener = onCameraWindowSettingsChange(() => cameraStore.initializeSettings())
  if (mode === 'camera') {
    removeToggleMirrorListener = window.cameraWindow.onToggleMirror(() => {
      cameraStore.toggleMirror()
    })
  }
})

onBeforeUnmount(() => {
  removeToggleMirrorListener?.()
  removeSettingsListener?.()
})
</script>

<template>
  <div v-if="mode === 'camera'" class="floating-window">
    <CameraPreview />
  </div>
  <div v-else-if="mode === 'camera-toolbar'" class="camera-toolbar-window">
    <FloatingToolbar />
  </div>
  <DisplayPicker v-else-if="mode === 'display-picker'" />
  <AnnotationCanvas v-else-if="mode === 'annotation'" />
  <AnnotationToolbar v-else-if="mode === 'annotation-toolbar'" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface DisplayPreview {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
  thumbnailDataUrl: string
}

const displays = ref<DisplayPreview[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  try {
    displays.value = await window.annotation.getDisplays()
    if (displays.value.length === 0) {
      errorMessage.value = '未检测到可用屏幕。'
    }
  } catch {
    errorMessage.value = '无法读取屏幕信息。'
  } finally {
    isLoading.value = false
  }
})

async function chooseDisplay(displayId: number): Promise<void> {
  const started = await window.annotation.selectDisplay(displayId)
  if (!started) {
    errorMessage.value = '所选屏幕已不可用，请重新选择。'
  }
}

function cancel(): void {
  window.annotation.cancelDisplayPicker()
}
</script>

<template>
  <main class="display-picker-page">
    <header class="display-picker-header">
      <div>
        <h1>选择标注屏幕</h1>
        <p>选择后将在该屏幕上显示透明标注层</p>
      </div>
      <button type="button" class="picker-close" title="取消" @click="cancel">×</button>
    </header>

    <div v-if="isLoading" class="picker-status">正在读取屏幕</div>
    <div v-else-if="errorMessage" class="picker-status error">{{ errorMessage }}</div>
    <section v-else class="display-grid" aria-label="可用屏幕">
      <button
        v-for="display in displays"
        :key="display.id"
        type="button"
        class="display-option"
        @click="chooseDisplay(display.id)"
      >
        <div class="display-thumbnail">
          <img
            v-if="display.thumbnailDataUrl"
            :src="display.thumbnailDataUrl"
            :alt="`${display.label} 缩略图`"
          />
          <span v-else>无可用缩略图</span>
        </div>
        <div class="display-details">
          <strong>{{ display.label }}</strong>
          <span>{{ display.bounds.width }} × {{ display.bounds.height }}</span>
          <span>{{ Math.round(display.scaleFactor * 100) }}% 缩放</span>
          <span v-if="display.isPrimary" class="primary-badge">主屏幕</span>
        </div>
      </button>
    </section>
  </main>
</template>

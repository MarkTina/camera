<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type Tool = 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'eraser'

interface AnnotationState {
  canUndo: boolean
  canRedo: boolean
  isDrawing: boolean
  isLayerVisible: boolean
}

const tools: Array<{ value: Tool; label: string; title: string }> = [
  { value: 'pen', label: '笔', title: '画笔' },
  { value: 'highlighter', label: '荧', title: '荧光笔' },
  { value: 'line', label: '线', title: '直线' },
  { value: 'arrow', label: '箭', title: '箭头' },
  { value: 'rectangle', label: '矩', title: '矩形' },
  { value: 'ellipse', label: '椭', title: '椭圆' },
  { value: 'text', label: '字', title: '文字' },
  { value: 'eraser', label: '擦', title: '橡皮擦' }
]
const colors = ['#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6', '#ffffff', '#111827']
const activeTool = ref<Tool>('pen')
const activeColor = ref(colors[0])
const width = ref(5)
const state = ref<AnnotationState>({
  canUndo: false,
  canRedo: false,
  isDrawing: true,
  isLayerVisible: true
})
let removeStateListener: (() => void) | null = null

function selectTool(tool: Tool): void {
  activeTool.value = tool
  window.annotation.sendToolbarAction('set-tool', tool)
  window.annotation.setDrawingMode(true)
}

function selectColor(color: string): void {
  activeColor.value = color
  window.annotation.sendToolbarAction('set-color', color)
}

function setWidth(event: Event): void {
  width.value = Number((event.target as HTMLInputElement).value)
  window.annotation.sendToolbarAction('set-width', width.value)
}

function toggleDrawingMode(): void {
  window.annotation.setDrawingMode(!state.value.isDrawing)
}

function toggleLayerVisible(): void {
  window.annotation.setLayerVisible(!state.value.isLayerVisible)
}

function sendCommand(command: 'undo' | 'redo' | 'clear'): void {
  window.annotation.sendToolbarAction(command)
}

function closeAnnotation(): void {
  window.annotation.close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    window.annotation.setDrawingMode(false)
    return
  }

  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    sendCommand(event.shiftKey ? 'redo' : 'undo')
  } else if (key === 'y') {
    event.preventDefault()
    sendCommand('redo')
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  state.value = await window.annotation.getState()
  removeStateListener = window.annotation.onState((nextState) => {
    state.value = nextState
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  removeStateListener?.()
})
</script>

<template>
  <nav class="annotation-toolbar" aria-label="桌面标注工具">
    <div class="annotation-tool-group" aria-label="标注工具">
      <button
        v-for="tool in tools"
        :key="tool.value"
        type="button"
        :class="{ active: activeTool === tool.value }"
        :title="tool.title"
        @click="selectTool(tool.value)"
      >
        {{ tool.label }}
      </button>
    </div>

    <div class="annotation-color-group" aria-label="颜色">
      <button
        v-for="color in colors"
        :key="color"
        type="button"
        class="color-swatch"
        :class="{ active: activeColor === color }"
        :style="{ '--swatch-color': color }"
        :title="`颜色 ${color}`"
        :aria-pressed="activeColor === color"
        @click="selectColor(color)"
      />
    </div>

    <label class="annotation-width" title="线条粗细">
      <span>粗</span>
      <input type="range" min="1" max="20" :value="width" aria-label="线条粗细" @input="setWidth" />
    </label>

    <div class="annotation-history-group" aria-label="历史操作">
      <button
        type="button"
        title="撤销 (Command/Ctrl+Z)"
        :disabled="!state.canUndo"
        @click="sendCommand('undo')"
      >
        ↶
      </button>
      <button
        type="button"
        title="重做 (Command/Ctrl+Shift+Z)"
        :disabled="!state.canRedo"
        @click="sendCommand('redo')"
      >
        ↷
      </button>
    </div>

    <div class="annotation-command-group" aria-label="标注操作">
      <button
        type="button"
        :class="{ active: !state.isLayerVisible }"
        :title="state.isLayerVisible ? '隐藏绘制层并保留标注' : '显示绘制层'"
        @click="toggleLayerVisible"
      >
        {{ state.isLayerVisible ? '隐' : '显' }}
      </button>
      <button
        type="button"
        title="清空全部标注 (Command/Ctrl+Shift+X)"
        @click="sendCommand('clear')"
      >
        清
      </button>
      <button
        type="button"
        :class="{ active: !state.isDrawing }"
        :title="state.isDrawing ? '保留标注并操作桌面 (Esc)' : '继续标注 (Command/Ctrl+Shift+A)'"
        @click="toggleDrawingMode"
      >
        {{ state.isDrawing ? '透' : '绘' }}
      </button>
      <button
        type="button"
        class="danger"
        title="关闭本次标注 (Command/Ctrl+Alt+X)"
        @click="closeAnnotation"
      >
        关
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

type Tool = 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'eraser'

interface Point {
  x: number
  y: number
}

interface StrokeElement {
  kind: 'stroke'
  tool: 'pen' | 'highlighter' | 'eraser'
  points: Point[]
  color: string
  width: number
}

interface ShapeElement {
  kind: 'shape'
  tool: 'line' | 'arrow' | 'rectangle' | 'ellipse'
  start: Point
  end: Point
  color: string
  width: number
}

interface TextElement {
  kind: 'text'
  point: Point
  text: string
  color: string
  fontSize: number
}

type DrawElement = StrokeElement | ShapeElement | TextElement
type HistoryEntry =
  { kind: 'add'; element: DrawElement } | { kind: 'clear'; elements: DrawElement[] }

const canvas = ref<HTMLCanvasElement | null>(null)
const textEditor = ref<HTMLInputElement | null>(null)
const editorPoint = ref<Point | null>(null)
const editorValue = ref('')
const settings = reactive({
  tool: 'pen' as Tool,
  color: '#ef4444',
  width: 5,
  isDrawing: true
})

let context: CanvasRenderingContext2D | null = null
let elements: DrawElement[] = []
let history: HistoryEntry[] = []
let redoHistory: HistoryEntry[] = []
let currentElement: DrawElement | null = null
let activePointerId: number | null = null
let removeActionListener: (() => void) | null = null
let removeStateListener: (() => void) | null = null

function pointFromEvent(event: PointerEvent): Point {
  const bounds = canvas.value?.getBoundingClientRect()
  return {
    x: event.clientX - (bounds?.left ?? 0),
    y: event.clientY - (bounds?.top ?? 0)
  }
}

function configureLine(element: DrawElement): void {
  if (!context) return
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = element.kind === 'text' ? 1 : element.width
  context.strokeStyle = element.color
  context.fillStyle = element.color
  context.globalAlpha = element.kind === 'stroke' && element.tool === 'highlighter' ? 0.3 : 1
  context.globalCompositeOperation =
    element.kind === 'stroke' && element.tool === 'eraser' ? 'destination-out' : 'source-over'
}

function drawStroke(element: StrokeElement): void {
  if (!context || element.points.length === 0) return
  context.beginPath()
  context.moveTo(element.points[0].x, element.points[0].y)
  for (const point of element.points.slice(1)) {
    context.lineTo(point.x, point.y)
  }
  if (element.points.length === 1) {
    context.lineTo(element.points[0].x + 0.01, element.points[0].y + 0.01)
  }
  context.stroke()
}

function drawArrowHead(start: Point, end: Point, width: number): void {
  if (!context) return
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const length = Math.max(14, width * 4)
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(angle - Math.PI / 6),
    end.y - length * Math.sin(angle - Math.PI / 6)
  )
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(angle + Math.PI / 6),
    end.y - length * Math.sin(angle + Math.PI / 6)
  )
  context.stroke()
}

function drawShape(element: ShapeElement): void {
  if (!context) return
  const { start, end } = element
  context.beginPath()
  if (element.tool === 'line' || element.tool === 'arrow') {
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
    if (element.tool === 'arrow') drawArrowHead(start, end, element.width)
    return
  }

  const width = end.x - start.x
  const height = end.y - start.y
  if (element.tool === 'rectangle') {
    context.strokeRect(start.x, start.y, width, height)
    return
  }

  context.ellipse(
    start.x + width / 2,
    start.y + height / 2,
    Math.abs(width / 2),
    Math.abs(height / 2),
    0,
    0,
    Math.PI * 2
  )
  context.stroke()
}

function drawElement(element: DrawElement): void {
  if (!context) return
  context.save()
  configureLine(element)
  if (element.kind === 'stroke') drawStroke(element)
  if (element.kind === 'shape') drawShape(element)
  if (element.kind === 'text') {
    context.font = `600 ${element.fontSize}px sans-serif`
    context.textBaseline = 'top'
    const lines = element.text.split('\n')
    lines.forEach((line, index) =>
      context?.fillText(line, element.point.x, element.point.y + index * element.fontSize * 1.25)
    )
  }
  context.restore()
}

function redraw(): void {
  if (!canvas.value || !context) return
  context.clearRect(0, 0, canvas.value.width, canvas.value.height)
  context.save()
  context.scale(window.devicePixelRatio, window.devicePixelRatio)
  elements.forEach(drawElement)
  if (currentElement) drawElement(currentElement)
  context.restore()
}

function resizeCanvas(): void {
  if (!canvas.value) return
  const ratio = window.devicePixelRatio
  canvas.value.width = Math.round(window.innerWidth * ratio)
  canvas.value.height = Math.round(window.innerHeight * ratio)
  canvas.value.style.width = `${window.innerWidth}px`
  canvas.value.style.height = `${window.innerHeight}px`
  context = canvas.value.getContext('2d')
  redraw()
}

function reportState(): void {
  window.annotation.reportState({
    canUndo: history.length > 0,
    canRedo: redoHistory.length > 0,
    isDrawing: settings.isDrawing
  })
}

function commitElement(element: DrawElement): void {
  elements.push(element)
  history.push({ kind: 'add', element })
  redoHistory = []
  currentElement = null
  redraw()
  reportState()
}

function beginText(point: Point): void {
  window.focus()
  editorPoint.value = {
    x: Math.max(8, Math.min(point.x, window.innerWidth - 332)),
    y: Math.max(8, Math.min(point.y, window.innerHeight - 52))
  }
  editorValue.value = ''
  nextTick(() => {
    window.setTimeout(() => {
      if (!editorPoint.value) return
      textEditor.value?.focus({ preventScroll: true })
      textEditor.value?.select()
    }, 0)
  })
}

function commitText(): void {
  const text = editorValue.value.trim()
  if (text && editorPoint.value) {
    commitElement({
      kind: 'text',
      point: editorPoint.value,
      text,
      color: settings.color,
      fontSize: Math.max(18, settings.width * 4)
    })
  }
  editorPoint.value = null
  editorValue.value = ''
}

function cancelText(): void {
  editorPoint.value = null
  editorValue.value = ''
}

function handlePointerDown(event: PointerEvent): void {
  if (!canvas.value || event.button !== 0 || !settings.isDrawing) return
  const point = pointFromEvent(event)
  if (settings.tool === 'text') {
    beginText(point)
    return
  }

  activePointerId = event.pointerId
  canvas.value.setPointerCapture(event.pointerId)
  currentElement = ['pen', 'highlighter', 'eraser'].includes(settings.tool)
    ? {
        kind: 'stroke',
        tool: settings.tool as StrokeElement['tool'],
        points: [point],
        color: settings.color,
        width: settings.tool === 'eraser' ? settings.width * 4 : settings.width
      }
    : {
        kind: 'shape',
        tool: settings.tool as ShapeElement['tool'],
        start: point,
        end: point,
        color: settings.color,
        width: settings.width
      }
}

function handlePointerMove(event: PointerEvent): void {
  if (activePointerId !== event.pointerId || !currentElement) return
  const point = pointFromEvent(event)
  if (currentElement.kind === 'stroke') currentElement.points.push(point)
  if (currentElement.kind === 'shape') currentElement.end = point
  redraw()
}

function handlePointerUp(event: PointerEvent): void {
  if (activePointerId !== event.pointerId || !currentElement) return
  if (canvas.value?.hasPointerCapture(event.pointerId))
    canvas.value.releasePointerCapture(event.pointerId)
  activePointerId = null
  commitElement(currentElement)
}

function undo(): void {
  const entry = history.pop()
  if (!entry) return
  if (entry.kind === 'add') elements.pop()
  if (entry.kind === 'clear') elements = [...entry.elements]
  redoHistory.push(entry)
  redraw()
  reportState()
}

function redo(): void {
  const entry = redoHistory.pop()
  if (!entry) return
  if (entry.kind === 'add') elements.push(entry.element)
  if (entry.kind === 'clear') elements = []
  history.push(entry)
  redraw()
  reportState()
}

function clear(): void {
  if (elements.length === 0) return
  history.push({ kind: 'clear', elements: [...elements] })
  elements = []
  redoHistory = []
  redraw()
  reportState()
}

function handleAction(action: string, payload?: unknown): void {
  if (action === 'set-tool' && typeof payload === 'string') settings.tool = payload as Tool
  if (action === 'set-color' && typeof payload === 'string') settings.color = payload
  if (action === 'set-width' && typeof payload === 'number')
    settings.width = Math.min(20, Math.max(1, payload))
  if (action === 'undo') undo()
  if (action === 'redo') redo()
  if (action === 'clear') clear()
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    window.annotation.setDrawingMode(false)
    return
  }

  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if (key === 'y') {
    event.preventDefault()
    redo()
  }
}

onMounted(async () => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('keydown', handleKeydown)
  removeActionListener = window.annotation.onAction(handleAction)
  removeStateListener = window.annotation.onState((state) => {
    settings.isDrawing = state.isDrawing
    reportState()
  })
  const state = await window.annotation.getState()
  settings.isDrawing = state.isDrawing
  reportState()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('keydown', handleKeydown)
  removeActionListener?.()
  removeStateListener?.()
})
</script>

<template>
  <main class="annotation-surface" :class="{ passthrough: !settings.isDrawing }">
    <canvas
      ref="canvas"
      class="annotation-canvas"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    />
    <input
      v-if="editorPoint"
      ref="textEditor"
      v-model="editorValue"
      type="text"
      class="annotation-text-editor"
      :style="{ left: `${editorPoint.x}px`, top: `${editorPoint.y}px`, color: settings.color }"
      aria-label="输入标注文字"
      @keydown.enter.stop.prevent="commitText"
      @keydown.esc.stop.prevent="cancelText"
      @blur="commitText"
    />
  </main>
</template>

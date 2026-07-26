<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface PhoneCameraState {
  status: 'idle' | 'ready' | 'phone-connected' | 'streaming' | 'error'
  url: string
  qrCodeDataUrl: string
  message: string
  availableAddresses: string[]
  selectedAddress: string
}

const state = ref<PhoneCameraState>({
  status: 'idle',
  url: '',
  qrCodeDataUrl: '',
  message: '',
  availableAddresses: [],
  selectedAddress: ''
})
const isStarting = ref(false)
let removeStateListener: (() => void) | null = null

const isServiceRunning = computed(() => state.value.status !== 'idle' && state.value.status !== 'error')
const primaryLabel = computed(() => (isServiceRunning.value ? '服务运行中' : '启动局域网服务'))
const connectionLabel = computed(() => {
  if (state.value.status === 'streaming') return '视频传输中'
  if (state.value.status === 'phone-connected') return '手机已连接'
  if (state.value.status === 'ready') return '等待手机连接'
  if (state.value.status === 'error') return '服务异常'
  return '服务未启动'
})

async function startService(): Promise<void> {
  if (isServiceRunning.value) return

  isStarting.value = true
  try {
    state.value = await window.phoneCamera.startService()
  } finally {
    isStarting.value = false
  }
}

async function stopService(): Promise<void> {
  await window.phoneCamera.stopService()
}

async function copyAddress(): Promise<void> {
  if (!state.value.url) return
  await navigator.clipboard.writeText(state.value.url)
}

async function selectAddress(event: Event): Promise<void> {
  state.value = await window.phoneCamera.selectAddress(
    (event.target as HTMLSelectElement).value
  )
}

onMounted(async () => {
  state.value = await window.phoneCamera.getState()
  removeStateListener = window.phoneCamera.onState((nextState) => {
    state.value = nextState
  })
})

onBeforeUnmount(() => {
  removeStateListener?.()
})
</script>

<template>
  <main class="phone-camera-dialog">
    <header>
      <div>
        <p class="eyebrow">LOCAL NETWORK</p>
        <h1>手机摄像头</h1>
      </div>
      <div class="header-status" :class="`is-${state.status}`" :title="state.message">
        <div class="status-line">
          <span class="state-indicator" />
          <span>{{ connectionLabel }}</span>
        </div>
        <p v-if="state.message" class="header-message">{{ state.message }}</p>
      </div>
    </header>

    <section v-if="!isServiceRunning" class="startup-panel">
      <div class="phone-mark" aria-hidden="true">手机</div>
      <h2>通过局域网连接手机</h2>
      <p>启动后会生成一次性二维码。手机需与此电脑连接同一网络。</p>
      <button type="button" :disabled="isStarting" @click="startService">
        {{ isStarting ? '正在启动' : primaryLabel }}
      </button>
    </section>

    <section v-else class="pairing-panel">
      <label v-if="state.availableAddresses.length > 1" class="address-picker">
        <span>局域网地址</span>
        <select :value="state.selectedAddress" @change="selectAddress">
          <option v-for="address in state.availableAddresses" :key="address" :value="address">
            {{ address }}
          </option>
        </select>
      </label>
      <div class="qr-frame">
        <img :src="state.qrCodeDataUrl" alt="手机摄像头配对二维码" />
      </div>
      <h2>{{ state.status === 'streaming' ? '手机摄像头已连接' : '扫描二维码连接手机' }}</h2>
      <div v-if="state.status === 'phone-connected'" class="connection-notice">
        手机已授权。请回到悬浮工具栏，在摄像头列表中选择“手机摄像头”。
      </div>
      <div v-else-if="state.status === 'streaming'" class="connection-notice is-streaming">
        已成功接入悬浮摄像头窗口，正在实时传输画面。
      </div>
      <ol>
        <li>手机扫描二维码并在浏览器中继续访问。</li>
        <li>接受本机证书提示后，允许摄像头权限。</li>
        <li>在手机页面可随时翻转前后摄像头。</li>
      </ol>
      <div class="dialog-actions">
        <button type="button" class="secondary" @click="copyAddress">复制地址</button>
        <button type="button" class="danger" @click="stopService">停止服务</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.phone-camera-dialog {
  min-height: 100vh;
  padding: 28px;
  color: #e7eef4;
  background: #17212b;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.eyebrow {
  margin: 0 0 5px;
  color: #78c9e8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.2px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 26px;
  font-weight: 680;
}

h2 {
  font-size: 18px;
  font-weight: 650;
}

.header-status {
  display: grid;
  justify-items: end;
  max-width: 180px;
  margin-top: 3px;
  color: #aab7c2;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  text-align: right;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.header-message {
  margin-top: 3px;
  color: #8fa1af;
  font-size: 11px;
  font-weight: 500;
}

.state-indicator {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #70808d;
}

.header-status.is-ready,
.header-status.is-phone-connected {
  color: #ffe58a;
}

.header-status.is-ready .state-indicator,
.header-status.is-phone-connected .state-indicator {
  background: #edc85d;
}

.header-status.is-streaming {
  color: #b9f6d0;
}

.header-status.is-streaming .state-indicator {
  background: #5fd08c;
  box-shadow: 0 0 0 4px rgba(95, 208, 140, 0.14);
}

.header-status.is-error {
  color: #ffb5b1;
}

.header-status.is-error .state-indicator {
  background: #e66c67;
}

.startup-panel,
.pairing-panel {
  display: grid;
  justify-items: center;
  margin-top: 44px;
  text-align: center;
}

.connection-notice {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(237, 200, 93, 0.65);
  border-radius: 6px;
  color: #fff1ba;
  background: rgba(114, 87, 19, 0.34);
  font-size: 13px;
  line-height: 1.5;
}

.connection-notice.is-streaming {
  border-color: rgba(95, 208, 140, 0.7);
  color: #cff7df;
  background: rgba(32, 105, 62, 0.35);
}

.address-picker {
  display: grid;
  width: 244px;
  gap: 6px;
  color: #aebbc6;
  text-align: left;
  font-size: 12px;
}

.address-picker select {
  width: 100%;
  height: 34px;
  border: 1px solid #486171;
  border-radius: 6px;
  padding: 0 8px;
  color: #eef7fb;
  background: #263845;
  font: inherit;
}

.startup-panel {
  gap: 16px;
}

.startup-panel p,
.pairing-panel > p {
  max-width: 300px;
  color: #aebbc6;
  font-size: 14px;
  line-height: 1.6;
}

.phone-mark {
  display: grid;
  width: 92px;
  height: 92px;
  place-items: center;
  border: 1px solid #457285;
  border-radius: 24px;
  color: #9de2f8;
  background: #20313d;
  font-size: 18px;
  font-weight: 700;
}

.qr-frame {
  width: 244px;
  height: 244px;
  padding: 10px;
  border-radius: 8px;
  background: #ffffff;
}

.qr-frame img {
  display: block;
  width: 100%;
  height: 100%;
}

.pairing-panel {
  gap: 12px;
  margin-top: 26px;
}

ol {
  width: 100%;
  margin: 4px 0 2px;
  padding-left: 24px;
  color: #c1ccd5;
  text-align: left;
  font-size: 13px;
  line-height: 1.65;
}

button {
  min-width: 148px;
  height: 38px;
  border: 0;
  border-radius: 6px;
  color: #10212a;
  background: #93dcf4;
  font: inherit;
  font-size: 14px;
  font-weight: 680;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.56;
}

.dialog-actions {
  display: flex;
  gap: 10px;
}

.dialog-actions button {
  min-width: 112px;
}

button.secondary {
  color: #d7e6ee;
  background: #334553;
}

button.danger {
  color: #ffd9d7;
  background: #663a3b;
}
</style>

import { createServer, type Server as HttpServer } from 'https'
import { randomBytes } from 'crypto'
import { type AddressInfo } from 'net'
import { networkInterfaces } from 'os'
import QRCode from 'qrcode'
import * as selfsigned from 'selfsigned'
import { WebSocket, WebSocketServer } from 'ws'

export type PhoneCameraStatus = 'idle' | 'ready' | 'phone-connected' | 'streaming' | 'error'

export interface PhoneCameraState {
  status: PhoneCameraStatus
  url: string
  qrCodeDataUrl: string
  message: string
  availableAddresses: string[]
  selectedAddress: string
}

interface SocketPeer {
  socket: WebSocket
}

const initialState: PhoneCameraState = {
  status: 'idle',
  url: '',
  qrCodeDataUrl: '',
  message: '',
  availableAddresses: [],
  selectedAddress: ''
}

let state: PhoneCameraState = { ...initialState }
let server: HttpServer | null = null
let webSocketServer: WebSocketServer | null = null
let pairToken = ''
let phonePeer: SocketPeer | null = null
let desktopSignalListener: ((message: string) => void) | null = null
const stateListeners = new Set<(nextState: PhoneCameraState) => void>()

function setState(nextState: Partial<PhoneCameraState>): void {
  state = { ...state, ...nextState }
  stateListeners.forEach((listener) => listener(state))
}

function getLanAddresses(): string[] {
  const interfaces = networkInterfaces()
  const addresses = new Set<string>()

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.add(entry.address)
      }
    }
  }

  return [...addresses].sort((left, right) => getAddressPriority(left) - getAddressPriority(right))
}

function getAddressPriority(address: string): number {
  if (address.startsWith('192.168.')) return 0
  if (address.startsWith('10.')) return 1
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 2
  return 3
}

async function createPairingCode(address: string): Promise<Pick<PhoneCameraState, 'url' | 'qrCodeDataUrl'>> {
  if (!server) {
    throw new Error('手机摄像头服务尚未启动')
  }

  const port = (server.address() as AddressInfo).port
  const url = `https://${address}:${port}/?token=${pairToken}`
  const qrCodeDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 })
  return { url, qrCodeDataUrl }
}

function sendToPeer(peer: SocketPeer | null, message: string): void {
  if (peer?.socket.readyState === WebSocket.OPEN) {
    peer.socket.send(message)
  }
}

function renderPhonePage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Camera Float 手机摄像头</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #101418; color: #f5f7fa; }
    main { min-height: 100dvh; display: grid; grid-template-rows: minmax(280px, 52dvh) auto; align-content: start; gap: 14px; padding: 14px 20px max(20px, env(safe-area-inset-bottom)); }
    .preview { position: relative; min-height: 0; overflow: hidden; border-radius: 18px; background: #050709; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .placeholder { position: absolute; inset: 0; display: grid; place-content: center; gap: 10px; text-align: center; color: #aab4bf; padding: 24px; }
    .placeholder[hidden] { display: none; }
    .placeholder strong { color: #ffffff; font-size: 18px; }
    .controls { display: grid; gap: 10px; }
    button { min-height: 48px; border: 0; border-radius: 10px; padding: 0 16px; font: inherit; font-weight: 650; color: #101418; background: #e5f4ff; }
    button.secondary { color: #e5f4ff; background: #26323d; }
    button:disabled { opacity: .45; }
    #status { min-height: 20px; color: #aab4bf; text-align: center; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <section class="preview">
      <video id="preview" autoplay muted playsinline></video>
      <div id="placeholder" class="placeholder">
        <strong>手机摄像头</strong>
        <span>点击下方按钮并允许浏览器访问摄像头</span>
      </div>
    </section>
    <section class="controls">
      <div id="status">等待启动</div>
      <button id="start" type="button">启动摄像头</button>
      <button id="flip" class="secondary" type="button" disabled>翻转前后摄像头</button>
    </section>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const preview = document.getElementById('preview');
    const placeholder = document.getElementById('placeholder');
    const status = document.getElementById('status');
    const startButton = document.getElementById('start');
    const flipButton = document.getElementById('flip');
    let facingMode = 'environment';
    let stream = null;
    let socket = null;
    let peerConnection = null;
    let pendingCandidates = [];

    function setStatus(message) { status.textContent = message; }
    function send(message) {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }

    async function openCamera() {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      preview.srcObject = stream;
      placeholder.hidden = true;
      flipButton.disabled = false;
      const videoTrack = stream.getVideoTracks()[0];
      const sender = peerConnection?.getSenders().find((item) => item.track?.kind === 'video');
      if (videoTrack && sender) await sender.replaceTrack(videoTrack);
    }

    async function flushPendingCandidates() {
      if (!peerConnection || !peerConnection.remoteDescription) return;
      while (pendingCandidates.length) {
        await peerConnection.addIceCandidate(pendingCandidates.shift());
      }
    }

    async function startPeerConnection() {
      if (!stream || !socket || socket.readyState !== WebSocket.OPEN || peerConnection) return;

      peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        iceCandidatePoolSize: 1
      });
      stream.getVideoTracks().forEach((track) => peerConnection.addTrack(track, stream));
      peerConnection.addEventListener('icecandidate', (event) => {
        if (event.candidate) send({ type: 'candidate', candidate: event.candidate.toJSON() });
      });
      peerConnection.addEventListener('connectionstatechange', () => {
        if (peerConnection?.connectionState === 'connected') setStatus('已连接到桌面端');
        if (peerConnection?.connectionState === 'failed') setStatus('视频连接失败，请回到桌面端重试');
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      send({ type: 'offer', sdp: peerConnection.localDescription });
      setStatus('正在建立低延迟视频连接');
    }

    async function handleDesktopSignal(message) {
      try {
        const signal = JSON.parse(message.data);
        if (signal.type === 'desktop-ready') {
          await startPeerConnection();
          return;
        }
        if (!peerConnection) return;
        if (signal.type === 'answer' && signal.sdp) {
          await peerConnection.setRemoteDescription(signal.sdp);
          await flushPendingCandidates();
          return;
        }
        if (signal.type === 'candidate' && signal.candidate) {
          if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(signal.candidate);
          } else {
            pendingCandidates.push(signal.candidate);
          }
        }
      } catch {
        setStatus('视频协商失败，请回到桌面端重试');
      }
    }

    function connect() {
      const socketUrl = 'wss://' + location.host + '/signal?token=' + encodeURIComponent(token) + '&role=phone';
      socket = new WebSocket(socketUrl);
      socket.addEventListener('open', () => {
        setStatus('等待桌面端选择此摄像头');
      });
      socket.addEventListener('message', handleDesktopSignal);
      socket.addEventListener('close', () => {
        peerConnection?.close();
        peerConnection = null;
        pendingCandidates = [];
        setStatus('与桌面端的连接已断开');
      });
    }

    startButton.addEventListener('click', async () => {
      try {
        startButton.disabled = true;
        setStatus('正在请求摄像头权限');
        await openCamera();
        connect();
        startButton.hidden = true;
      } catch (error) {
        setStatus('无法打开摄像头，请检查浏览器权限或证书信任状态');
        startButton.disabled = false;
      }
    });
    flipButton.addEventListener('click', async () => {
      try {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        await openCamera();
      } catch (error) {
        setStatus('无法切换摄像头');
      }
    });
    window.addEventListener('beforeunload', () => {
      peerConnection?.close();
      if (stream) stream.getTracks().forEach((track) => track.stop());
    });
  </script>
</body>
</html>`
}

function handleRequest(request: import('http').IncomingMessage, response: import('http').ServerResponse): void {
  const requestUrl = new URL(request.url ?? '/', 'https://localhost')

  if (requestUrl.pathname !== '/' || requestUrl.searchParams.get('token') !== pairToken) {
    response.writeHead(404)
    response.end()
    return
  }

  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(renderPhonePage())
}

function registerWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const socketServer = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', 'https://localhost')
    const token = requestUrl.searchParams.get('token')
    const role = requestUrl.searchParams.get('role')

    if (requestUrl.pathname !== '/signal' || token !== pairToken || role !== 'phone') {
      socket.destroy()
      return
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      socketServer.emit('connection', webSocket, request)
    })
  })

  socketServer.on('connection', (socket: WebSocket) => {
    const peer: SocketPeer = { socket }

    phonePeer?.socket.close()
    phonePeer = peer
    setState({ status: 'phone-connected', message: '手机已连接，等待选择输入源' })

    socket.on('message', (message, isBinary) => {
      if (!isBinary && desktopSignalListener) desktopSignalListener(message.toString())
    })
    socket.on('close', () => {
      if (phonePeer === peer) {
        phonePeer = null
        setState({ status: 'ready', message: '手机已断开，可重新扫码连接' })
      }
    })
  })

  return socketServer
}

export function getPhoneCameraState(): PhoneCameraState {
  return state
}

export function onPhoneCameraStateChange(listener: (nextState: PhoneCameraState) => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

export async function startPhoneCameraService(): Promise<PhoneCameraState> {
  if (server) return state

  const availableAddresses = getLanAddresses()
  const selectedAddress = availableAddresses[0]
  if (!selectedAddress) {
    setState({ status: 'error', message: '未检测到可用的局域网 IPv4 地址' })
    return state
  }

  pairToken = randomBytes(24).toString('hex')
  const certificate = await selfsigned.generate(
    [{ name: 'commonName', value: selectedAddress }],
    {
      algorithm: 'sha256',
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            ...availableAddresses.map((address) => ({ type: 7 as const, ip: address })),
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' }
          ]
        }
      ]
    }
  )

  const nextServer = createServer({ key: certificate.private, cert: certificate.cert }, handleRequest)
  webSocketServer = registerWebSocketServer(nextServer)

  await new Promise<void>((resolve, reject) => {
    nextServer.once('error', reject)
    nextServer.listen(0, '0.0.0.0', () => {
      nextServer.off('error', reject)
      resolve()
    })
  })

  server = nextServer
  const pairingCode = await createPairingCode(selectedAddress)
  setState({
    status: 'ready',
    ...pairingCode,
    selectedAddress,
    availableAddresses,
    message: '请用手机扫码并在浏览器中启动摄像头'
  })
  return state
}

export async function selectPhoneCameraAddress(address: string): Promise<PhoneCameraState> {
  if (!server || !state.availableAddresses.includes(address)) {
    return state
  }

  const pairingCode = await createPairingCode(address)
  setState({ ...pairingCode, selectedAddress: address })
  return state
}

export function connectPhoneCameraDesktop(listener: (message: string) => void): boolean {
  desktopSignalListener = listener
  return Boolean(phonePeer)
}

export function disconnectPhoneCameraDesktop(listener: (message: string) => void): void {
  if (desktopSignalListener === listener) {
    desktopSignalListener = null
  }
}

export function sendPhoneCameraSignal(message: string): void {
  sendToPeer(phonePeer, message)
}

export function reportPhoneCameraStreaming(): void {
  if (phonePeer) {
    setState({ status: 'streaming', message: '手机摄像头正在传输' })
  }
}

export function stopPhoneCameraService(): void {
  phonePeer?.socket.close()
  phonePeer = null
  desktopSignalListener = null
  webSocketServer?.close()
  webSocketServer = null
  server?.close()
  server = null
  pairToken = ''
  setState({ ...initialState })
}

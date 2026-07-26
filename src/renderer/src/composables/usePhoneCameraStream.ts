import { shallowRef, type ShallowRef } from 'vue'

export const PHONE_CAMERA_DEVICE_ID = 'phone-camera'

interface PhoneCameraStreamState {
  stream: ShallowRef<MediaStream | null>
  connect: () => Promise<boolean>
  disconnect: () => void
}

const stream = shallowRef<MediaStream | null>(null)
let removeSignalListener: (() => void) | null = null
let peerConnection: RTCPeerConnection | null = null
let pendingCandidates: RTCIceCandidateInit[] = []
const peerConnectionConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceCandidatePoolSize: 1
}

function clearStream(): void {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
  pendingCandidates = []
}

function closeConnection(): void {
  removeSignalListener?.()
  removeSignalListener = null
  window.phoneCamera.disconnectDesktop()
  peerConnection?.close()
  peerConnection = null
  clearStream()
}

async function handlePhoneSignal(
  payload: string,
  resolveConnection: (connected: boolean) => void
): Promise<void> {
  if (!peerConnection) return

  try {
    const signal = JSON.parse(payload) as {
      type?: string
      sdp?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
    }

    if (signal.type === 'offer' && signal.sdp) {
      await peerConnection.setRemoteDescription(signal.sdp)
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      window.phoneCamera.sendSignal(
        JSON.stringify({ type: 'answer', sdp: peerConnection.localDescription })
      )
      while (pendingCandidates.length) {
        await peerConnection.addIceCandidate(pendingCandidates.shift()!)
      }
      return
    }

    if (signal.type === 'candidate' && signal.candidate) {
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(signal.candidate)
      } else {
        pendingCandidates.push(signal.candidate)
      }
    }
  } catch {
    resolveConnection(false)
  }
}

export function usePhoneCameraStream(): PhoneCameraStreamState {
  async function connect(): Promise<boolean> {
    closeConnection()
    if (!(await window.phoneCamera.connectDesktop())) {
      return false
    }

    return new Promise<boolean>((resolve) => {
      let isResolved = false
      const resolveConnection = (connected: boolean): void => {
        if (isResolved) return
        isResolved = true
        window.clearTimeout(timeout)
        resolve(connected)
      }
      const timeout = window.setTimeout(() => resolveConnection(false), 12_000)

      peerConnection = new RTCPeerConnection(peerConnectionConfig)
      peerConnection.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          window.phoneCamera.sendSignal(
            JSON.stringify({ type: 'candidate', candidate: event.candidate.toJSON() })
          )
        }
      })
      peerConnection.addEventListener('track', (event) => {
        stream.value = event.streams[0] ?? new MediaStream([event.track])
      })
      peerConnection.addEventListener('connectionstatechange', () => {
        if (peerConnection?.connectionState === 'connected') resolveConnection(true)
        if (
          peerConnection?.connectionState === 'failed' ||
          peerConnection?.connectionState === 'closed'
        ) {
          resolveConnection(false)
        }
      })
      peerConnection.addEventListener('iceconnectionstatechange', () => {
        if (peerConnection?.iceConnectionState === 'failed') resolveConnection(false)
      })

      removeSignalListener = window.phoneCamera.onSignal((payload) => {
        void handlePhoneSignal(payload, resolveConnection)
      })
      window.phoneCamera.sendSignal(JSON.stringify({ type: 'desktop-ready' }))
    })
  }

  function disconnect(): void {
    closeConnection()
  }

  return { stream, connect, disconnect }
}

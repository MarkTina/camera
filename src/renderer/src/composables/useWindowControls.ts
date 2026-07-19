interface WindowControls {
  closeWindow: () => Promise<void>
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
  resizeFromWheel: (deltaY: number) => Promise<number>
  getSizeState: () => Promise<{ size: number; min: number; max: number }>
  setSize: (size: number) => Promise<{ size: number; min: number; max: number }>
  setToolbarHovered: (isHovered: boolean) => void
  beginDrag: (point: { x: number; y: number }) => void
  dragTo: (point: { x: number; y: number }) => void
  endDrag: () => void
}

export function useWindowControls(): WindowControls {
  async function closeWindow(): Promise<void> {
    await window.cameraWindow.close()
  }

  async function setAlwaysOnTop(enabled: boolean): Promise<boolean> {
    return window.cameraWindow.setAlwaysOnTop(enabled)
  }

  async function getAlwaysOnTop(): Promise<boolean> {
    return window.cameraWindow.getAlwaysOnTop()
  }

  async function resizeFromWheel(deltaY: number): Promise<number> {
    return window.cameraWindow.resizeFromWheel(deltaY)
  }

  async function getSizeState(): Promise<{ size: number; min: number; max: number }> {
    return window.cameraWindow.getSizeState()
  }

  async function setSize(size: number): Promise<{ size: number; min: number; max: number }> {
    return window.cameraWindow.setSize(size)
  }

  function setToolbarHovered(isHovered: boolean): void {
    window.cameraWindow.setToolbarHovered(isHovered)
  }

  function beginDrag(point: { x: number; y: number }): void {
    window.cameraWindow.beginDrag(point)
  }

  function dragTo(point: { x: number; y: number }): void {
    window.cameraWindow.dragTo(point)
  }

  function endDrag(): void {
    window.cameraWindow.endDrag()
  }

  return {
    closeWindow,
    setAlwaysOnTop,
    getAlwaysOnTop,
    resizeFromWheel,
    getSizeState,
    setSize,
    setToolbarHovered,
    beginDrag,
    dragTo,
    endDrag
  }
}

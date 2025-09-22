export const useDeviceHash = async (): Promise<string> => {
  try {
    // Collect device fingerprint components
    const components = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      navigator.hardwareConcurrency?.toString() || 'unknown',
      navigator.maxTouchPoints?.toString() || '0',
      screen.width + 'x' + screen.height,
      screen.colorDepth?.toString() || 'unknown',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      new Date().getTimezoneOffset().toString()
    ]

    // Add canvas fingerprint
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.textBaseline = 'top'
        ctx.font = '14px \'Arial\''
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = '#f60'
        ctx.fillRect(125, 1, 62, 20)
        ctx.fillStyle = '#069'
        ctx.fillText('Browser fingerprint', 2, 15)
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
        ctx.fillText('Browser fingerprint', 4, 17)

        const dataUrl = canvas.toDataURL()
        components.push(dataUrl.slice(-50))
      }
    } catch (e) {
      components.push('canvas-failed')
    }

    // Add WebGL fingerprint
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl && 'getParameter' in gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown')
          components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown')
        }
      }
    } catch (e) {
      components.push('webgl-failed')
    }

    // Create hash from components
    const fingerprintString = components.join('|')
    const msgUint8 = new TextEncoder().encode(fingerprintString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    return hashHex
  } catch (error) {
    console.error('Error generating device hash:', error)
    // Return a fallback hash based on basic info
    const fallback = navigator.userAgent + navigator.platform + new Date().getTimezoneOffset()
    const msgUint8 = new TextEncoder().encode(fallback)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}
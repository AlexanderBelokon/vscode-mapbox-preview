// @ts-nocheck
addEventListener('load', function () {
    const vscode = acquireVsCodeApi()

    const state = {
        projection: 'globe',
        ...vscode.getState(),
        style: window.styleUri,
        container: 'map',
        dirty: true,
    }

    const report = e => {
        console.error('caught:', e)
        vscode.postMessage({ error: e.message, stack: e.stack })
    }
    window.addEventListener('error', report)
    window.addEventListener('unhandledrejection', report)

    vscode.postMessage({ text: 'Starting Mapbox GL JS' })

    const map = new mapboxgl.Map(state)

    const hasher = showCoordinates && new HashControl()
    if (hasher) map.addControl(hasher)

    map.on('drag', () => (state.dirty = true))
    map.on('move', () => (state.dirty = true))
    map.on('zoom', () => (state.dirty = true))
    map.on('rotate', () => (state.dirty = true))
    map.on('pitch', () => (state.dirty = true))
    map.on('error', ({ error }) => report(error))

    setInterval(() => {
        if (!state.dirty) return
        state.dirty = false

        const center = map.getCenter()
        const zoom = map.getZoom()
        const bearing = map.getBearing()
        const pitch = map.getPitch()
        const position = { center, zoom, bearing, pitch }
        vscode.setState(position)
        if (hasher) hasher.set(position)
    }, 100)

    window.addEventListener('message', ({ data }) => {
        const { command, style } = data
        if (command != 'setStyle') return

        console.log('Got a new style:', style)
        map.setStyle(data.style)
    })
})

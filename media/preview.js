// @ts-nocheck
addEventListener('load', function () {
    const vscode = acquireVsCodeApi()

    const state = {
        projection: 'globe',
        ...vscode.getState(),
        style: window.styleUri,
        container: 'map',
    }

    const report = e => {
        console.error('caught:', e)
        vscode.postMessage({ error: e.message, stack: e.stack })
    }
    window.addEventListener('error', report)
    window.addEventListener('unhandledrejection', report)

    vscode.postMessage({ text: 'Starting Mapbox GL JS' })

    const map = new mapboxgl.Map(state)

    map.on('drag', () => (state.dirty = true))
    map.on('move', () => (state.dirty = true))
    map.on('zoom', () => (state.dirty = true))
    map.on('rotate', () => (state.dirty = true))
    map.on('pitch', () => (state.dirty = true))
    map.on('error', ({ error }) => report(error))

    setInterval(() => {
        if (!state.dirty) return
        state.dirty = false
        vscode.setState({
            center: map.getCenter(),
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
        })
    }, 100)

    window.addEventListener('message', ({ data }) => {
        const { command, style } = data
        if (command != 'setStyle') return

        console.log('Got a new style:', style)
        map.setStyle(data.style)
    })
})

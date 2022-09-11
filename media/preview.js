// @ts-nocheck
addEventListener('load', function () {
    const vscode = acquireVsCodeApi()

    const state = {
        projection: 'globe',
        ...vscode.getState(),
        style: window.styleUri,
        container: 'map',
    }

    vscode.postMessage({ text: 'Starting Mapbox GL JS' })

    const map = new mapboxgl.Map(state)

    map.on('drag', () => (state.dirty = true))
    map.on('move', () => (state.dirty = true))
    map.on('zoom', () => (state.dirty = true))
    map.on('rotate', () => (state.dirty = true))
    map.on('pitch', () => (state.dirty = true))

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
})

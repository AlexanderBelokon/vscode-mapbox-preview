// @ts-nocheck
addEventListener('load', function () {
    const vscode = acquireVsCodeApi()
    const lightPresetArr = window.lightPresets.split(',')
    const allMaps = []

    lightPresetArr.forEach((preset, index) => {

        const state = {
            projection: 'globe',
            ...vscode.getState(),
            style: window.styleUri,
            container: preset,
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
    
        map.on('style.load', () => {
            map.setConfigProperty('basemap', 'lightPreset', preset)
        })

        if (lightPresetArr.length === index + 1) {
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
        }
       
        window.addEventListener('message', ({ data }) => {
            console.log('message recieved')
            console.log(data)
            const { command, style } = data
            if (command != 'setStyle') return
    
            console.log('Got a new style:', style)
            map.setStyle(data.style)
        })

        allMaps.push(map)

    })

    if (allMaps.length > 1) {
        syncMaps(allMaps)
    }

})

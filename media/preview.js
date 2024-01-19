// @ts-nocheck

function createMap(savedState, style, preset) {
    console.log('Starting Mapbox GL JS')

    const map = new mapboxgl.Map({
        projection: 'globe',
        ...savedState,
        style,
        container: preset,
    })

    if (preset !== 'default')
        map.on('style.load', () => {
            map.setConfigProperty('basemap', 'lightPreset', preset)
        })

    return map
}

function addHash({ map, report, setState }) {
    const dirtyEvents = ['drag', 'move', 'zoom', 'rotate', 'pitch']
    let dirty = true

    const markDirty = () => (dirty = true)
    const reportError = ({ error }) => report(error)

    const hasher = window.showCoordinates && new HashControl()
    if (hasher) {
        map.addControl(hasher)
        map.unhash = () => {
            clearInterval(map.interval)

            for (const event of dirtyEvents) map.off(event, markDirty)
            map.off('error', reportError)

            map.removeControl(hasher)
            delete map.unhash
        }
    }

    for (const event of dirtyEvents) map.on(event, markDirty)
    map.on('error', reportError)

    map.interval = setInterval(() => {
        if (!dirty) return
        dirty = false

        const center = map.getCenter()
        const zoom = map.getZoom()
        const bearing = map.getBearing()
        const pitch = map.getPitch()
        const position = { center, zoom, bearing, pitch }
        setState(position)
        if (hasher) hasher.set(position)
    }, 100)
}

function compareLights(prev, next) {
    const unique = [...new Set([...prev, ...next])]
    if (next.length == prev.length && next.length == unique.length) return

    const added = unique.filter(d => !prev.includes(d))
    const removed = unique.filter(d => !next.includes(d))
    return { added, removed }
}

addEventListener('load', function () {
    const vscode = acquireVsCodeApi()

    const report = e => {
        console.error('Map error:', e)
        vscode.postMessage({ error: e.message, stack: e.stack })
    }

    window.addEventListener('error', report)
    window.addEventListener('unhandledrejection', report)

    const maps = []

    const mapContainer = document.getElementById('container')
    if (!mapContainer) return

    function mountMap(preset) {
        const div = document.createElement('div')
        div.id = preset
        div.className = 'map'
        mapContainer.appendChild(div)
        const map = createMap(vscode.getState(), window.styleUri, preset)
        maps.push({ preset, map })
    }
    function unmountMap(preset) {
        const index = maps.findIndex(d => d.preset === preset)
        const [{ map }] = maps.splice(index, 1)
        map.getContainer().remove()
        map.remove()
    }

    let mbxSync
    const resync = () => {
        if (mbxSync) {
            mbxSync()
            mbxSync = null
        }
        if (1 < maps.length) mbxSync = syncMaps(maps.map(d => d.map))
    }

    const addRemoveMaps = nextPresets => {
        const { added, removed } = compareLights(
            maps.map(d => d.preset),
            nextPresets
        )

        if (!added && !removed) return

        for (const preset of removed) unmountMap(preset)
        for (const preset of added) mountMap(preset)

        for (const { map } of maps) {
            map.unhash?.()
            map.resize()
        }

        const { map: lastMap } = maps.slice(-1)[0]
        addHash({ report, setState: vscode.setState, map: lastMap })
        resync()
    }

    addRemoveMaps(window.lightPresets)

    window.addEventListener('message', ({ data }) => {
        const { command, style, settings } = data

        if (command == 'setStyle') {
            console.log('Got a new style:', style)

            for (const sync of maps) sync.map.setStyle(style)
        } else if (command == 'updateMaps') {
            console.log('Got a config update:', settings)

            addRemoveMaps(settings.lightPresets)
            for (const sync of maps) sync.map.setStyle(style)
        }
    })
})

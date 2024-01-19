// @ts-nocheck
addEventListener('load', function () {
    const vscode = acquireVsCodeApi()
    const lightPresetArr = window.lightPresets.split(',')
    let syncedMaps = []
    let mbxSync
    let hasher

    let mapContainer = document.getElementById('container')

    if (mapContainer) {
        lightPresetArr.forEach(preset => {
            var div = document.createElement('div')
            div.id = preset
            div.className = 'map'
            mapContainer.appendChild(div)
        })
    }

    lightPresetArr.forEach(preset => {
        createMap(preset, window.styleUri)
    })

    if (syncedMaps.length > 1) {
        const arrayOfMaps = syncedMaps.map(obj => obj.map)
        mbxSync = syncMaps(arrayOfMaps)
    }

    const lastIndex = syncedMaps.length - 1
    syncedMaps[lastIndex].hash = true
    addHash(syncedMaps[lastIndex].map)

    window.addEventListener('message', ({ data }) => {
        const { command, update } = data

        if (command == 'setStyle') {
            console.log('Got a new style:', update)
            syncedMaps.forEach(sync => {
                sync.map.setStyle(update)
            })
        } else if (command == 'updateMaps') {
            console.log('update maps config', update)
            // removes existing sync so can be reset again with add/removed maps
            if (mbxSync) {
                mbxSync()
            }

            var mapContainer = document.getElementById('container')

            // determin if adding or removing maps
            const existingLight = syncedMaps.map(obj => obj.preset)
            const configChanges = compareLights(
                existingLight,
                update.settings.lightPresets
            )

            configChanges.removed.forEach(remove => {
                const removeIdx = syncedMaps.findIndex(
                    obj => obj.preset === remove
                )
                syncedMaps[removeIdx].map.remove()
                syncedMaps.splice(removeIdx, 1)
                var childToRemove = document.getElementById(remove)
                if (childToRemove) {
                    mapContainer.removeChild(childToRemove)
                }
            })

            configChanges.added.forEach(add => {
                var div = document.createElement('div')
                div.id = add
                div.className = 'map'
                mapContainer.appendChild(div)
                createMap(add, update.style)
            })

            syncedMaps.forEach((sync, index) => {
                if (sync.hash) {
                    syncedMaps[index].hash = false
                    sync.map.removeControl(hasher)
                }
                sync.map.resize()
            })

            if (syncedMaps.length > 1) {
                const arrayOfMaps = syncedMaps.map(obj => obj.map)
                mbxSync = syncMaps(arrayOfMaps)
            }

            const lastIndex = syncedMaps.length - 1
            syncedMaps[lastIndex].hash = true
            addHash(syncedMaps[lastIndex].map)
        }
    })

    function createMap(preset, style) {
        const state = {
            projection: 'globe',
            ...vscode.getState(),
            style: style,
            container: preset,
        }

        vscode.postMessage({ text: 'Starting Mapbox GL JS' })

        const map = new mapboxgl.Map(state)

        if (preset !== 'default') {
            map.on('style.load', () => {
                map.setConfigProperty('basemap', 'lightPreset', preset)
            })
        }

        syncedMaps.push({
            preset,
            map,
            hash: false,
        })
    }

    function addHash(map) {
        const report = e => {
            console.error('caught:', e)
            vscode.postMessage({ error: e.message, stack: e.stack })
        }
        window.addEventListener('error', report)
        window.addEventListener('unhandledrejection', report)

        hasher = showCoordinates && new HashControl()
        if (hasher) map.addControl(hasher)

        let dirty = true

        map.on('drag', () => (dirty = true))
        map.on('move', () => (dirty = true))
        map.on('zoom', () => (dirty = true))
        map.on('rotate', () => (dirty = true))
        map.on('pitch', () => (dirty = true))
        map.on('error', ({ error }) => report(error))
        setInterval(() => {
            if (!dirty) return
            dirty = false

            const center = map.getCenter()
            const zoom = map.getZoom()
            const bearing = map.getBearing()
            const pitch = map.getPitch()
            const position = { center, zoom, bearing, pitch }
            vscode.setState(position)
            if (hasher) hasher.set(position)
        }, 100)
    }

    function compareLights(oldArray, newArray) {
        const uniqueValues = new Set([...oldArray, ...newArray])

        // Check if the unique set has the same length as the old and new arrays
        if (
            uniqueValues.size !== oldArray.length ||
            uniqueValues.size !== newArray.length
        ) {
            // Values have been added or removed
            const added = newArray.filter(value => !oldArray.includes(value))
            const removed = oldArray.filter(value => !newArray.includes(value))
            return { added, removed }
        }
    }
})

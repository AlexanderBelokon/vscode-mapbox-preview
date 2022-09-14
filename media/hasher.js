class HashControl {
    onAdd(map) {
        this.map = map
        this.el = document.createElement('input')
        this.el.className = 'mapboxgl-ctrl'
        this.el.style = `
            padding: 2px 8px;
            border-radius: 6px;
            outline: none;
            border: 1px solid hsla(0, 0%, 0%, 0.4);
            background: hsla(0, 0%, 100%, 0.2);
            font-family: monospace;
            width: 30ch;
            text-align: center;
        `
        this.el.oninput = () => this.move()
        return this.el
    }

    onRemove() {
        this.el.parentNode.removeChild(this.el)
        this.map = undefined
    }

    set(position) {
        const { center, zoom, bearing, pitch } = position
        const round = mul => n => Math.round(n * mul) / mul
        const hash =
            '#' +
            [
                round(1e2)(zoom),
                round(1e4)(center.lat),
                round(1e4)(center.lng),
                round(1e1)(bearing),
                round(1)(pitch),
            ].join('/')
        this.el.setRangeText(hash, 0, this.el.value.length)
    }

    move() {
        const rx =
            /^#([\d.-]+)\/([\d.-]+)\/([\d.-]+)(?:\/([\d.-]+)\/([\d.-]+)?)?$/
        const match = this.el.value.match(rx)
        if (!match) return

        const [zoom, lat, lng, bearing, pitch] = match
            .slice(1)
            .map(s => Number(s) || 0)
        this.map.flyTo({ zoom, center: { lat, lng }, bearing, pitch })
    }
}

/* eslint-disable no-empty */
import * as vscode from 'vscode'
import { activate as activateKeys } from './keys'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('mapboxPreview.start', () => {
            const file = vscode.window.activeTextEditor?.document.uri
            if (!file)
                return vscode.window.showErrorMessage('Nothing to preview')
            console.log('Command:', file.path)
            context.workspaceState.update('mapboxPreview.style', file.path)
            MapboxPreview.extUri = context.extensionUri
            MapboxPreview.createOrShow(file)
        })
    )

    vscode.window.registerWebviewPanelSerializer?.(MapboxPreview.viewType, {
        async deserializeWebviewPanel(view: vscode.WebviewPanel, state: any) {
            console.log(`Reviving with state:`, state)
            MapboxPreview.extUri = context.extensionUri

            const previous = context.workspaceState.get<string>(
                'mapboxPreview.style'
            )
            if (!MapboxPreview.lastFile && previous)
                MapboxPreview.lastFile = vscode.Uri.file(previous)

            MapboxPreview.revive(view)
        },
    })

    activateKeys(context)
}

function webviewOptions(): vscode.WebviewOptions {
    const workspace = vscode.workspace.workspaceFolders?.map(f => f.uri) || []
    const ext = vscode.Uri.joinPath(MapboxPreview.extUri, 'media')
    return { enableScripts: true, localResourceRoots: [ext, ...workspace] }
}

class MapboxPreview {
    public static currentPanel: MapboxPreview | undefined
    public static readonly viewType = 'mapboxPreview'
    public static extUri: vscode.Uri
    public static lastFile: vscode.Uri
    private readonly panel: vscode.WebviewPanel
    private fileUri: vscode.Uri
    private lastFile = ''
    private lastStyle = ''
    private lastSettings = ''
    private disposables: vscode.Disposable[] = []

    public static createOrShow(fileUri: vscode.Uri) {
        MapboxPreview.lastFile = fileUri || MapboxPreview.lastFile

        const old = MapboxPreview.currentPanel
        if (old) {
            old.fileUri = fileUri
            return old.panel.reveal(vscode.ViewColumn.Beside)
        }

        const panel = vscode.window.createWebviewPanel(
            MapboxPreview.viewType,
            'Mapbox Preview',
            vscode.ViewColumn.Beside,
            webviewOptions()
        )

        this.revive(panel, fileUri)
    }

    public static revive(panel: vscode.WebviewPanel, fileUri?: vscode.Uri) {
        panel.webview.options = webviewOptions()
        MapboxPreview.currentPanel = new MapboxPreview(
            panel,
            fileUri || MapboxPreview.lastFile
        )
    }

    private constructor(panel: vscode.WebviewPanel, fileUri: vscode.Uri) {
        this.panel = panel
        this.fileUri = fileUri
        this.update()
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables)

        this.panel.onDidChangeViewState(
            e => this.panel.visible && this.update(),
            null,
            this.disposables
        )

        this.panel.webview.onDidReceiveMessage(
            e => {
                if (!e.error) return console.log(e)
                console.error(e.error)
                return vscode.window.showErrorMessage(e.error)
            },
            null,
            this.disposables
        )

        const interval = vscode.workspace
            .getConfiguration()
            .get('mapboxPreview.updateThrottle', 100)
        const throttledRefresh = throttle(
            interval,
            (ev: vscode.TextDocumentChangeEvent) =>
                this.refreshDocument(ev.document)
        )

        vscode.workspace.onDidChangeTextDocument(
            throttledRefresh,
            null,
            this.disposables
        )

        vscode.workspace.onDidSaveTextDocument(
            document => MapboxPreview.refreshFile(document),
            null,
            this.disposables
        )

        vscode.workspace.onDidChangeConfiguration(
            e => this.update(),
            null,
            this.disposables
        )
    }

    public dispose() {
        MapboxPreview.currentPanel = undefined

        this.panel.dispose()

        while (this.disposables.length) {
            const x = this.disposables.pop()
            if (x) x.dispose()
        }
    }

    public static refreshFile(document: vscode.TextDocument) {
        const same = document.uri.path == this.currentPanel?.fileUri?.path
        const isSettings = document.uri.path.endsWith('settings.json')
        const isJson = document.uri.path.endsWith('.json')
        const loadable = isJson && !isSettings

        if (!this.currentPanel)
            if (loadable) return MapboxPreview.createOrShow(document.uri)
            else return

        if (!this.currentPanel.fileUri && loadable)
            this.currentPanel.fileUri = document.uri

        if (!same || !this.currentPanel.fileUri || isSettings) return

        this.currentPanel.update()
    }

    public refreshDocument(document: vscode.TextDocument) {
        if (document.uri.path != this.fileUri.path) return

        const refreshOnKeystroke = vscode.workspace
            .getConfiguration()
            .get('mapboxPreview.refreshOnKeystroke', false)
        if (!refreshOnKeystroke) return

        try {
            const style = document.getText()
            this.updateStyle(normalizeJSON(style))
        } catch {}
    }

    private async updateStyle(style: string) {
        if (this.lastStyle == style) return
        this.lastStyle = style

        console.log('Updating style')
        this.panel.webview.postMessage({
            command: 'setStyle',
            style: JSON.parse(style),
        })
    }

    private async update() {
        if (!this.fileUri) return console.log('No file')

        const path = vscode.workspace.asRelativePath(this.fileUri)

        const token = vscode.workspace
            .getConfiguration()
            .get<string>('mapboxPreview.token')
        if (!token) return vscode.window.showErrorMessage('No token!')

        const version = vscode.workspace
            .getConfiguration()
            .get('mapboxPreview.version', '3.0.1')

        const showCoordinates = vscode.workspace
            .getConfiguration()
            .get('mapboxPreview.showCoordinates', false)

        const lightPresets = vscode.workspace
            .getConfiguration()
            .get('mapboxPreview.lightPresets', ['day'])

        if (!lightPresets.length) lightPresets.push('default')

        const settings = { path, token, version, showCoordinates, lightPresets }
        const nextSettings = JSON.stringify(settings)
        const sameSettings = this.lastSettings == nextSettings
        this.lastSettings = nextSettings

        this.panel.title = `Mapbox: ${path}`

        try {
            const data = await vscode.workspace.fs.readFile(this.fileUri)
            const style = normalizeJSON(data.toString())
            if (this.lastFile != style) this.updateStyle(style)
            this.lastFile = style
        } catch (e: any) {
            console.log(`Could not load '${path}': ${e.message}`)
            return vscode.window.showErrorMessage(`Invalid style: ${path}`)
        }

        if (sameSettings)
            return console.log('Same settings, skipping rendering')

        if (this.panel.webview.html) {
            this.panel.webview.postMessage({
                command: 'updateMaps',
                settings,
                style: JSON.parse(this.lastFile),
            })
            return console.log('Has webview, skipping rendering')
        }

        const webview = this.panel.webview
        const styleUri = webview.asWebviewUri(this.fileUri)

        const extUri = (...segs: string[]) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(MapboxPreview.extUri, ...segs)
            )

        const hasherUri = extUri('media', 'hasher.js')
        const previewUri = extUri('media', 'preview.js')

        const nonce = getNonce()

        const csp = [
            `default-src 'none'`,
            `img-src ${webview.cspSource} data: https:`,
            `connect-src ${webview.cspSource} https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com`,
            `style-src ${webview.cspSource} 'unsafe-inline' https://api.mapbox.com`,
            `script-src ${webview.cspSource} 'nonce-${nonce}' 'self' https://api.mapbox.com https://unpkg.com 'unsafe-eval'`,
            `worker-src ${webview.cspSource} 'strict-dynamic'`,
        ].join('; ')

        console.log('Rendering:', path)

        this.panel.webview.html = `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no">
        <meta http-equiv="Content-Security-Policy" content="${csp}">

        <link href="https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.css" rel="stylesheet">
        <script src="https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.js"></script>
        <script src="https://unpkg.com/@mapbox/mapbox-gl-sync-move@0.3.1/index.js"></script>
        <script nonce="${nonce}">
            mapboxgl.accessToken = '${token}';
            window.styleUri = '${styleUri}';
            window.showCoordinates = ${showCoordinates};
            window.lightPresets = JSON.parse('${JSON.stringify(lightPresets)}')
        </script>
        <script src="${hasherUri}"></script>
        <script src="${previewUri}"></script>
        <style> 
            #container { position: relative; display: flex; height: 100vh;}
            .map { width: 100% }
        </style>
        </head>
        <body><div id="container"></div></body>
    </html>`
    }
}

function normalizeJSON(json: string) {
    return JSON.stringify(JSON.parse(json))
}

function getNonce() {
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
        'abcdefghijklmnopqrstuvwxyz' +
        '0123456789'

    const randomChar = () =>
        possible.charAt(Math.floor(Math.random() * possible.length))

    return [...new Array(64).keys()].map(randomChar).join('')
}

// eslint-disable-next-line @typescript-eslint/ban-types
function throttle(delay: number, func: Function) {
    let timeoutId: any | undefined
    let args: any[] = []
    return function () {
        // eslint-disable-next-line prefer-rest-params
        args = [...arguments]
        if (timeoutId) return
        timeoutId = setTimeout(() => {
            timeoutId = undefined
            func(...args)
            args = []
        }, delay)
    }
}

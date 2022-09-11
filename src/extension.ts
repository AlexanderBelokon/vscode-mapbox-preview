import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('mapboxPreview.start', () => {
            const file = vscode.window.activeTextEditor?.document.uri
            if (!file)
                return vscode.window.showErrorMessage('Nothing to preview')
            console.log('Command:', file.path)
            context.workspaceState.update('mapbox.preview.style', file.path)
            MapboxPreview.extUri = context.extensionUri
            MapboxPreview.createOrShow(file)
        })
    )

    vscode.window.registerWebviewPanelSerializer?.(MapboxPreview.viewType, {
        async deserializeWebviewPanel(view: vscode.WebviewPanel, state: any) {
            console.log(`Reviving with state:`, state)
            MapboxPreview.extUri = context.extensionUri

            const previous = context.workspaceState.get<string>(
                'mapbox.preview.style'
            )
            if (!MapboxPreview.lastFile && previous)
                MapboxPreview.lastFile = vscode.Uri.file(previous)

            MapboxPreview.revive(view)
        },
    })

    vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) =>
        MapboxPreview.refresh(document)
    )
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
    private lastStyle = ''
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

    public static refresh(document: vscode.TextDocument) {
        const same = document.uri.path == this.currentPanel?.fileUri?.path
        const isSettings = document.uri.path.endsWith('settings.json')
        const isJson = document.uri.path.endsWith('.json')
        const loadable = isJson && !isSettings

        if (!this.currentPanel)
            if (loadable) return MapboxPreview.createOrShow(document.uri)
            else return

        if (!this.currentPanel.fileUri && loadable)
            this.currentPanel.fileUri = document.uri

        if ((!same && !isSettings) || !this.currentPanel.fileUri) return

        console.log('Refreshing')

        this.currentPanel.update()
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
            e => console.log(e),
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

    private async update() {
        if (!this.fileUri) return console.log('No file')

        const nicePath = vscode.workspace.asRelativePath(this.fileUri)

        this.panel.title = `Mapbox: ${nicePath}`
        try {
            const data = await vscode.workspace.fs.readFile(this.fileUri)
            const style = JSON.stringify(JSON.parse(data.toString()))
            if (style == this.lastStyle)
                return console.log('Same style, skipping')
            this.lastStyle = style
        } catch (e: any) {
            console.log('Could not load', this.fileUri, ':', e.message)
            return vscode.window.showErrorMessage(`Invalid style: ${nicePath}`)
        }

        const styleUri = this.panel.webview.asWebviewUri(this.fileUri)
        const previewUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(MapboxPreview.extUri, 'media', 'preview.js')
        )
        console.log('Rendering:', nicePath)

        const token = vscode.workspace
            .getConfiguration()
            .get<string>('mapbox.preview.token')
        if (!token) vscode.window.showErrorMessage('No token!')

        const version = vscode.workspace
            .getConfiguration()
            .get<string>('mapbox.preview.version', '2.10.0')

        // Make sure content has changed to force re-render
        const random = Math.random()

        this.panel.webview.html = `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no">
        <link href="https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.css" rel="stylesheet">
        <script src="https://api.mapbox.com/mapbox-gl-js/v${version}/mapbox-gl.js"></script>
        <script src="${previewUri}"></script>
        <style>
            body { margin: 0; padding: 0; }
            #map { position: absolute; top: 0; bottom: 0; width: 100%; }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>mapboxgl.accessToken = '${token}'; window.styleUri = '${styleUri}'; ${random};</script>
    </body>
</html>
`
    }
}

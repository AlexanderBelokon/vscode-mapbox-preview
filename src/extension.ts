import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('mapboxPreview.start', () => {
            const file = vscode.window.activeTextEditor?.document.uri
            if (!file) return vscode.window.showErrorMessage('Nothing to preview')
            MapboxPreview.createOrShow(file)
        })
    )

    vscode.window.registerWebviewPanelSerializer?.(MapboxPreview.viewType, {
        async deserializeWebviewPanel(view: vscode.WebviewPanel, state: any) {
            vscode.window.showInformationMessage(String(['reviving']))
            view.webview.options = webviewOptions()
            MapboxPreview.revive(view)
        },
    })

    vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        MapboxPreview.refresh(document)
    })
}

function webviewOptions(): vscode.WebviewOptions {
    return {
        enableScripts: true,
        localResourceRoots: vscode.workspace.workspaceFolders?.map(f => f.uri) || [],
    }
}

class MapboxPreview {
    public static currentPanel: MapboxPreview | undefined
    public static readonly viewType = 'mapboxPreview'
    public static lastFile: vscode.Uri
    private readonly panel: vscode.WebviewPanel
    private fileUri: vscode.Uri
    private lastCode: string = ''
    private disposables: vscode.Disposable[] = []

    public static createOrShow(fileUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined

        this.lastFile = fileUri || this.lastFile

        if (MapboxPreview.currentPanel) return MapboxPreview.currentPanel.panel.reveal(column)

        const panel = vscode.window.createWebviewPanel(
            MapboxPreview.viewType,
            'Mapbox Preview',
            column ? column + 1 : vscode.ViewColumn.Beside,
            webviewOptions()
        )

        this.revive(panel, fileUri)
    }

    public static revive(panel: vscode.WebviewPanel, fileUri?: vscode.Uri) {
        MapboxPreview.currentPanel = new MapboxPreview(panel, fileUri || this.lastFile)
    }

    public static refresh(document: vscode.TextDocument) {
        const same = document.uri == this.currentPanel?.fileUri
        if (!this.currentPanel) return MapboxPreview.createOrShow(document.uri)
        if (!this.currentPanel.fileUri) this.currentPanel.fileUri = document.uri
        if (!same && !document.uri.path.match('settings.json$')) return
        this.currentPanel.update()
    }

    private constructor(panel: vscode.WebviewPanel, fileUri: vscode.Uri) {
        this.panel = panel
        this.fileUri = fileUri

        this.update()
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables)

        this.panel.onDidChangeViewState(e => this.panel.visible && this.update(), null, this.disposables)
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
        this.panel.title = 'Mapbox Preview'

        try {
            const data = await vscode.workspace.fs.readFile(this.fileUri)
            const style = JSON.stringify(JSON.parse(data.toString()))
            if (style == this.lastCode) return
            this.lastCode = style
        } catch {
            return vscode.window.showErrorMessage('Invalid style')
        }

        const styleUri = this.panel.webview.asWebviewUri(this.fileUri)

        const token = vscode.workspace.getConfiguration().get<string>('mapbox.preview.token')
        if (!token) vscode.window.showErrorMessage('No token!')

        const version = vscode.workspace.getConfiguration().get<string>('mapbox.preview.version', '2.10.0')

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
        <style>
            body { margin: 0; padding: 0; }
            #map { position: absolute; top: 0; bottom: 0; width: 100%; }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>
            mapboxgl.accessToken = '${token}'; ${random};
            new mapboxgl.Map({ container: 'map', style: '${styleUri}', projection: 'globe' });
        </script>
    </body>
</html>
`
    }
}

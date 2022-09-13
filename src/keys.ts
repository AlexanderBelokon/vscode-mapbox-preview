import * as vscode from 'vscode'

function transformNumberUnderCursor(
    editor: vscode.TextEditor,
    edit: vscode.TextEditorEdit,
    transformation: any
) {
    const active = editor?.document ? editor : vscode.window.activeTextEditor
    const doc = active?.document
    if (!doc) return

    for (const sel of active.selections) {
        const { line: row, character: col } = sel.start
        const line = doc.lineAt(row)
        line.text.replace(
            /-?\d+(?:\.\d+)?(?:e\d+)?|-?\.\d+/g,
            function (match: string, beg: number) {
                const end = beg + match.length
                if (col < beg || end < col) return match
                const range = new vscode.Range(row, beg, row, end)
                edit.replace(range, transformation(match))
                return match
            }
        )
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'mapboxPreview.increase',
            (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) =>
                transformNumberUnderCursor(editor, edit, (s: string) =>
                    String(Number(s) + 1)
                )
        )
    )
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'mapboxPreview.decrease',
            (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) =>
                transformNumberUnderCursor(editor, edit, (s: string) =>
                    String(Number(s) - 1)
                )
        )
    )
}

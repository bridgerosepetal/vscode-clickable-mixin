import * as vscode from 'vscode'
import { MixinIndex } from './mixinIndex'
import {
	findPugMixinCallAtPosition,
	type TextPosition,
	type TextRange,
} from './pugMixins'

const PUG_LANGUAGE_SELECTOR: vscode.DocumentSelector = [
	{ language: 'pug' },
	{ language: 'jade' },
]

export function registerMixinDefinitionProvider(): vscode.Disposable {
	const workspaceIndex = new WorkspaceMixinIndex()
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		PUG_LANGUAGE_SELECTOR,
		{
			provideDefinition: async (document, position) => {
				const call = findPugMixinCallAtPosition(
					document.getText(),
					toTextPosition(position),
				)
				if (!call) {
					return undefined
				}

				try {
					await workspaceIndex.ensureIndexed()
					workspaceIndex.updateFile(
						document.uri.toString(),
						document.getText(),
					)

					return workspaceIndex
						.find(call.name, document.uri.toString())
						.map(definition => toLocationLink(definition, call.range))
				} catch {
					return undefined
				}
			},
		},
	)

	const watcher = vscode.workspace.createFileSystemWatcher(
		'**/*.{pug,jade}',
	)
	const invalidate = () => workspaceIndex.invalidate()
	const documentChange = vscode.workspace.onDidChangeTextDocument(event => {
		if (isPugDocument(event.document)) {
			invalidate()
		}
	})
	const watcherChanges = [
		watcher.onDidChange(invalidate),
		watcher.onDidCreate(invalidate),
		watcher.onDidDelete(invalidate),
	]

	return vscode.Disposable.from(
		definitionProvider,
		watcher,
		documentChange,
		...watcherChanges,
	)
}

class WorkspaceMixinIndex {
	private readonly index = new MixinIndex()
	private indexed = false
	private indexing: Promise<void> | undefined

	async ensureIndexed(): Promise<void> {
		if (this.indexed) {
			return
		}
		if (this.indexing) {
			return this.indexing
		}

		this.indexing = this.rebuild().finally(() => {
			this.indexing = undefined
		})
		return this.indexing
	}

	invalidate(): void {
		this.indexed = false
	}

	updateFile(uri: string, text: string): void {
		this.index.updateFile(uri, text)
	}

	find(name: string, preferredUri?: string) {
		return this.index.find(name, preferredUri)
	}

	private async rebuild(): Promise<void> {
		const [pugUris, jadeUris] = await Promise.all([
			vscode.workspace.findFiles('**/*.pug', '**/node_modules/**'),
			vscode.workspace.findFiles('**/*.jade', '**/node_modules/**'),
		])
		const uris = new Map<string, vscode.Uri>()
		for (const uri of [...pugUris, ...jadeUris]) {
			uris.set(uri.toString(), uri)
		}

		this.index.clear()
		await Promise.all(
			[...uris.values()].map(async uri => {
				try {
					const bytes = await vscode.workspace.fs.readFile(uri)
					this.index.updateFile(
						uri.toString(),
						Buffer.from(bytes).toString('utf8'),
					)
				} catch {
					// A file may disappear between findFiles and readFile.
				}
			}),
		)

		this.indexed = true
	}
}

function toLocationLink(
	definition: {
		uri: string
		range: TextRange
	},
	originSelectionRange: TextRange,
): vscode.LocationLink {
	const targetRange = toVscodeRange(definition.range)
	return {
		originSelectionRange: toVscodeRange(originSelectionRange),
		targetUri: vscode.Uri.parse(definition.uri),
		targetRange,
		targetSelectionRange: targetRange,
	}
}

function toVscodeRange(range: TextRange): vscode.Range {
	return new vscode.Range(
		range.start.line,
		range.start.character,
		range.end.line,
		range.end.character,
	)
}

function toTextPosition(position: vscode.Position): TextPosition {
	return {
		line: position.line,
		character: position.character,
	}
}

function isPugDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'pug' || document.languageId === 'jade'
}

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

					let definitions = workspaceIndex.find(
						call.name,
						document.uri.toString(),
					)

					if (definitions.length === 0) {
						workspaceIndex.updateFromOpenDocuments()
						definitions = workspaceIndex.find(
							call.name,
							document.uri.toString(),
						)
					}

					if (definitions.length === 0) {
						await workspaceIndex.forceRebuild()
						definitions = workspaceIndex.find(
							call.name,
							document.uri.toString(),
						)
					}

					return definitions.map(definition =>
						toLocationLink(definition, call.range),
					)
				} catch {
					return undefined
				}
			},
		},
	)

	const pugWatcher = vscode.workspace.createFileSystemWatcher('**/*.pug')
	const jadeWatcher = vscode.workspace.createFileSystemWatcher('**/*.jade')

	const onFileChangedOrCreated = async (uri: vscode.Uri) => {
		try {
			const bytes = await vscode.workspace.fs.readFile(uri)
			workspaceIndex.updateFile(
				uri.toString(),
				Buffer.from(bytes).toString('utf8'),
			)
		} catch {
			workspaceIndex.invalidate()
		}
	}

	const onFileDeleted = (uri: vscode.Uri) => {
		workspaceIndex.removeFile(uri.toString())
	}

	const watcherChanges = [
		pugWatcher.onDidChange(onFileChangedOrCreated),
		pugWatcher.onDidCreate(onFileChangedOrCreated),
		pugWatcher.onDidDelete(onFileDeleted),
		jadeWatcher.onDidChange(onFileChangedOrCreated),
		jadeWatcher.onDidCreate(onFileChangedOrCreated),
		jadeWatcher.onDidDelete(onFileDeleted),
	]

	const documentChanges = [
		vscode.workspace.onDidChangeTextDocument(event => {
			if (isPugDocument(event.document)) {
				workspaceIndex.updateFile(
					event.document.uri.toString(),
					event.document.getText(),
				)
			}
		}),
		vscode.workspace.onDidOpenTextDocument(document => {
			if (isPugDocument(document)) {
				workspaceIndex.updateFile(
					document.uri.toString(),
					document.getText(),
				)
			}
		}),
		vscode.workspace.onDidSaveTextDocument(document => {
			if (isPugDocument(document)) {
				workspaceIndex.updateFile(
					document.uri.toString(),
					document.getText(),
				)
			}
		}),
	]

	return vscode.Disposable.from(
		definitionProvider,
		pugWatcher,
		jadeWatcher,
		...watcherChanges,
		...documentChanges,
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

	async forceRebuild(): Promise<void> {
		this.indexing = undefined
		this.indexed = false
		return this.ensureIndexed()
	}

	updateFile(uri: string, text: string): void {
		this.index.updateFile(uri, text)
	}

	removeFile(uri: string): void {
		this.index.removeFile(uri)
	}

	updateFromOpenDocuments(): void {
		for (const doc of vscode.workspace.textDocuments) {
			if (isPugDocument(doc)) {
				this.updateFile(doc.uri.toString(), doc.getText())
			}
		}
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

		this.updateFromOpenDocuments()
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

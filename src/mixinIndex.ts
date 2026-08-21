import { parsePugMixinDefinitions, type MixinDefinition } from './pugMixins'

export class MixinIndex {
	private readonly definitionsByFile = new Map<string, MixinDefinition[]>()
	private readonly definitionsByName = new Map<string, MixinDefinition[]>()

	clear(): void {
		this.definitionsByFile.clear()
		this.definitionsByName.clear()
	}

	updateFile(uri: string, text: string): void {
		this.removeFile(uri)

		const definitions = parsePugMixinDefinitions(text, uri)
		this.definitionsByFile.set(uri, definitions)

		for (const definition of definitions) {
			const existing = this.definitionsByName.get(definition.name) ?? []
			existing.push(definition)
			this.definitionsByName.set(definition.name, existing)
		}
	}

	removeFile(uri: string): void {
		const definitions = this.definitionsByFile.get(uri)
		if (!definitions) {
			return
		}

		this.definitionsByFile.delete(uri)
		for (const definition of definitions) {
			const existing = this.definitionsByName.get(definition.name) ?? []
			const remaining = existing.filter(candidate => candidate.uri !== uri)

			if (remaining.length === 0) {
				this.definitionsByName.delete(definition.name)
			} else {
				this.definitionsByName.set(definition.name, remaining)
			}
		}
	}

	find(name: string, preferredUri?: string): MixinDefinition[] {
		return [...(this.definitionsByName.get(name) ?? [])].sort((left, right) => {
			if (preferredUri) {
				const leftIsPreferred = left.uri === preferredUri
				const rightIsPreferred = right.uri === preferredUri
				if (leftIsPreferred !== rightIsPreferred) {
					return leftIsPreferred ? -1 : 1
				}
			}

			return (
			left.uri.localeCompare(right.uri) ||
			left.range.start.line - right.range.start.line ||
			left.range.start.character - right.range.start.character
			)
		})
	}
}

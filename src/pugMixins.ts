const MIXIN_NAME = '[A-Za-z_$][A-Za-z0-9_$-]*'

// `//` and `//-` comments swallow every more-indented line below them.
const COMMENT_START = /^[ \t]*\/\//u

// A bare tag ending in `.` (`script.`, `p.`, `div(class='x').`) turns its
// more-indented children into plain text, so nothing inside is Pug source.
const TEXT_BLOCK_START =
	/^[ \t]*(?=[A-Za-z.#])(?:[A-Za-z][\w:-]*)?(?:[.#][A-Za-z_-][\w-]*)*(?:\(.*\))?\.[ \t]*$/u

export type TextPosition = {
	line: number
	character: number
}

export type TextRange = {
	start: TextPosition
	end: TextPosition
}

export type MixinDefinition = {
	name: string
	uri: string
	range: TextRange
}

export type MixinCall = {
	name: string
	range: TextRange
}

export function parsePugMixinDefinitions(
	text: string,
	uri: string,
): MixinDefinition[] {
	const definitions: MixinDefinition[] = []
	const lines = splitLines(text)
	const ignoredLines = findIgnoredLines(lines)
	const declarationPattern = new RegExp(
		`^[ \\t]*mixin[ \\t]+(${MIXIN_NAME})(?![A-Za-z0-9_$-])`,
		'u',
	)

	for (let line = 0; line < lines.length; line += 1) {
		if (ignoredLines[line]) {
			continue
		}

		const match = lines[line].match(declarationPattern)
		if (!match) {
			continue
		}

		const name = match[1]
		const character = match[0].lastIndexOf(name)
		definitions.push({
			name,
			uri,
			range: {
				start: { line, character },
				end: { line, character: character + name.length },
			},
		})
	}

	return definitions
}

export function findPugMixinCallAtPosition(
	text: string,
	position: TextPosition,
): MixinCall | undefined {
	const lines = splitLines(text)
	const line = lines[position.line]
	if (line === undefined || findIgnoredLines(lines)[position.line]) {
		return undefined
	}

	const callPattern = new RegExp(`\\+(${MIXIN_NAME})(?![A-Za-z0-9_$-])`, 'gu')
	for (const match of line.matchAll(callPattern)) {
		const plusCharacter = match.index ?? -1
		if (plusCharacter < 0 || !isLikelyMixinCall(line, plusCharacter)) {
			continue
		}

		const name = match[1]
		const nameCharacter = plusCharacter + 1
		const endCharacter = nameCharacter + name.length
		if (
			position.character < plusCharacter ||
			position.character >= endCharacter
		) {
			continue
		}

		return {
			name,
			range: {
				start: { line: position.line, character: nameCharacter },
				end: { line: position.line, character: endCharacter },
			},
		}
	}

	return undefined
}

function isLikelyMixinCall(line: string, plusCharacter: number): boolean {
	const beforeCall = line.slice(0, plusCharacter).trimEnd()
	return (
		beforeCall.length === 0 ||
		beforeCall.endsWith(':') ||
		beforeCall.endsWith('#[')
	)
}

/**
 * Marks lines that are not Pug source: comments and the bodies of comment
 * and dot text blocks. Mixin-looking text on those lines must be skipped.
 */
function findIgnoredLines(lines: string[]): boolean[] {
	const ignored = new Array<boolean>(lines.length).fill(false)
	let blockIndent: number | undefined

	for (let line = 0; line < lines.length; line += 1) {
		const text = lines[line]
		if (text.trim().length === 0) {
			ignored[line] = blockIndent !== undefined
			continue
		}

		const indent = text.length - text.trimStart().length
		if (blockIndent !== undefined) {
			if (indent > blockIndent) {
				ignored[line] = true
				continue
			}
			blockIndent = undefined
		}

		if (COMMENT_START.test(text)) {
			ignored[line] = true
			blockIndent = indent
		} else if (TEXT_BLOCK_START.test(text)) {
			blockIndent = indent
		}
	}

	return ignored
}

function splitLines(text: string): string[] {
	return text.replace(/\r\n/gu, '\n').split('\n')
}

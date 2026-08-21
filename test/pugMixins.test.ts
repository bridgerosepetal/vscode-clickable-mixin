import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MixinIndex } from '../src/mixinIndex'
import {
	findPugMixinCallAtPosition,
	parsePugMixinDefinitions,
} from '../src/pugMixins'

describe('Pug mixin parsing', () => {
	it('finds declarations and their exact name ranges', () => {
		const uri = 'file:///workspace/mixins.pug'
		const text = [
			'//- mixin hidden() ',
			'mixin card(title)',
			'  mixin card-item(value)',
		].join('\n')

		assert.deepEqual(parsePugMixinDefinitions(text, uri), [
			{
				name: 'card',
				uri,
				range: {
					start: { line: 1, character: 6 },
					end: { line: 1, character: 10 },
				},
			},
			{
				name: 'card-item',
				uri,
				range: {
					start: { line: 2, character: 8 },
					end: { line: 2, character: 17 },
				},
			},
		])
	})

	it('finds calls on the plus sign or mixin name', () => {
		const text = [
			'+card(\'Hello\')',
			'li: +card-item(value)',
			'p plain +not-a-call',
			'//- +hidden()',
		].join('\n')

		assert.equal(findPugMixinCallAtPosition(text, { line: 0, character: 0 })?.name, 'card')
		assert.deepEqual(
			findPugMixinCallAtPosition(text, { line: 1, character: 7 }),
			{
				name: 'card-item',
				range: {
					start: { line: 1, character: 5 },
					end: { line: 1, character: 14 },
				},
			},
		)
		assert.equal(
			findPugMixinCallAtPosition(text, { line: 2, character: 9 }),
			undefined,
		)
		assert.equal(
			findPugMixinCallAtPosition(text, { line: 3, character: 5 }),
			undefined,
		)
	})
})

describe('MixinIndex', () => {
	it('indexes, prefers the current file, and removes stale declarations', () => {
		const index = new MixinIndex()
		const firstUri = 'file:///workspace/first.pug'
		const secondUri = 'file:///workspace/second.pug'

		index.updateFile(firstUri, 'mixin card()')
		index.updateFile(secondUri, 'mixin card()')

		assert.deepEqual(
			index.find('card', secondUri).map(definition => definition.uri),
			[secondUri, firstUri],
		)

		index.updateFile(firstUri, 'mixin button()')
		assert.deepEqual(index.find('card').map(definition => definition.uri), [secondUri])
		assert.deepEqual(index.find('button').map(definition => definition.uri), [firstUri])

		index.removeFile(secondUri)
		assert.deepEqual(index.find('card'), [])
	})
})

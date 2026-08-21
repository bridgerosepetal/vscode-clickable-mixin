import * as vscode from 'vscode'
import { registerMixinDefinitionProvider } from './mixinDefinitionProvider'

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(registerMixinDefinitionProvider())
}

export function deactivate(): void {
	// Nothing to clean up.
}

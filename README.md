# Clickable Mixin

Jump from a Pug or Jade mixin call to its declaration with Ctrl+Click, **Go to
Definition** (F12), or **Peek Definition**.

## Example

`mixins.pug`:

```pug
mixin card(title)
  .card= title
```

`page.pug`:

```pug
+card('Hello')
```

Place the cursor on `card` and Ctrl+Click. VS Code opens `mixins.pug` with the
declaration name selected on its exact line.

The extension supports both `pug` and `jade` language IDs, scans Pug/Jade files
in the current workspace, and returns every matching declaration when a name is
defined more than once so VS Code can show a definition picker.

Declarations and calls inside `//` or `//-` comment blocks and `.` text blocks
(such as `script.` or `p.`) are ignored. Unsaved edits in open editors take
precedence over the file on disk.

## Development

```sh
npm install
npm run check
npm run package
```

Open this project in VS Code and press F5 to launch an Extension Development
Host. The GitHub Actions workflow runs the compile and test checks on pushes and
pull requests.

The resolver intentionally works from source declarations (`mixin name(...)`)
and calls (`+name(...)`). Dynamically generated names cannot be resolved
statically.

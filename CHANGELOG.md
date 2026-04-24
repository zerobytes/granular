# Changelog

## 3.0.0

### Breaking

- Removed the `granular` CLI binary from `@granularjs/core`. The umbrella CLI now ships in [`@granularjs/cli`](https://www.npmjs.com/package/@granularjs/cli) and dispatches to the dedicated tooling packages (`@granularjs/lint`, `@granularjs/codemods`, `@granularjs/create-app`). To keep using `granular <subcommand>`, run:

  ```bash
  npm uninstall -g @granularjs/core   # if you had it installed for the bin
  npm install  -g @granularjs/cli
  ```

  Individual tools also work standalone:

  ```bash
  npx @granularjs/lint .
  npx @granularjs/codemods react-to-granular ./src
  npm create @granularjs/app my-app
  ```

- Removed `@babel/parser` and `@babel/traverse` from `devDependencies`. They were only needed by the removed CLI; the runtime core was always parser-free.
- Removed `bin/granular.js`, `scripts/scaffold.mjs`, `scripts/migrate.mjs`, and `scripts/serve-module-docs.mjs`. The migration and docs-viewer logic now lives in `@granularjs/cli`.

### Added

- `docs/modules/` is now part of the published tarball so the `granular docs` viewer (in `@granularjs/cli`) can render the module references against an installed copy.
- `exports['./package.json']` so tooling packages can read the manifest at runtime.

### Why

`@granularjs/core` is a runtime library, not a tooling distribution. Bundling a Babel-based CLI with the core forced runtime consumers to depend on (or globally install) tooling they do not need, broke global installs by relying on `devDependencies`, and violated the project's "zero runtime dependencies" rule. Splitting the CLI into `@granularjs/cli` keeps the runtime small, version-stable, and dependency-free while letting tooling iterate independently.

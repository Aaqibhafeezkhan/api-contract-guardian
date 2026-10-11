# Changelog

All notable changes to API Contract Guardian are documented here.

## [Unreleased]

### Added

- Static route discovery for supported FastAPI routers and Flask blueprints
- Python relative imports, module aliases, and package initializer re-exports
- Python FastAPI/Flask contracts in Git revision comparisons

### Improved

- Apply generated and dependency directory exclusions to both workspace and Git revision source discovery
- Ignore common Python virtual-environment and cache directories during workspace discovery

### Limitations

- Python discovery is syntax-pattern based and does not support the full Python language, dynamic routing, or arbitrary framework behavior

## [2.0.0]

### Added

- Repository-wide JavaScript and TypeScript API discovery
- Cross-file module indexing
- Relative import resolution
- Express application and router detection without hardcoded variable names
- Default and named router export/import resolution
- Express `use()` mount detection
- Cross-file route path composition
- Nested router mount support
- Multiple router mount support

### Improved

- API discovery now analyzes the repository rather than only changed files
- Git revision comparisons now work with APIs located across source files
- Expanded automated test coverage


## [1.0.0] - 2026-09-26

### Added

- Express API route detection for JavaScript and TypeScript.
- API response contract extraction from `res.json()`.
- Detection of removed API endpoints.
- Detection of removed response fields.
- Detection of response field type changes.
- Git-aware comparison of added, modified, and deleted files.
- Git revision comparison through the VS Code command palette.
- VS Code Problems-panel diagnostics for breaking changes.
- Static JavaScript/TypeScript consumer analysis.
- Potential consumer warnings for statically detectable response-field usage.
- Cross-platform source-file scanning.
- Automated unit, integration, and end-to-end tests.
- GitHub Actions CI.

### Limitations

- Consumer analysis is intentionally conservative.
- Dynamic API URLs are not fully analyzed.
- Runtime-generated routes are not analyzed.
- Arbitrary HTTP clients and complex cross-file data flow are not fully supported.
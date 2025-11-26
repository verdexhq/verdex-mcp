# Changelog

## [0.1.5] - 2025-11-26

### Documentation
- **Enhanced LLM instruction layer**: Reorganized SKILL.md with progressive disclosure strategy
- **New comprehensive guides**: Added selector-writing.md, workflow-discovery.md, and playwright-patterns.md to /guides directory
- **Cursor rules synchronization**: Added .cursor/rules/ directory with workspace-level rules that mirror the guides
- **Improved CONTRIBUTING.md**: Added detailed instruction layer contribution guidelines
- **Deprecated legacy guide**: Moved VERDEX_SELECTOR_GUIDE.md to .archive/ (superseded by modular guides)

### Changed (Minor Breaking)
- **Ref persistence across snapshots:** Element refs now persist within a page session
  - Refs like `e25` stay consistent across multiple `snapshot()` calls
  - Enables multi-turn LLM exploration workflows
  - Stale refs (removed elements) are automatically cleaned up
  - **Breaking:** `resolve_container()`, `inspect_pattern()`, `extract_anchors()` now throw errors 
    instead of returning `null` for missing/stale refs (error handling already updated in 0.1.3)

### Fixed
- Fixed conversational workflow where refs broke after snapshots
- Fixed browser back/forward button causing ref conflicts

### Added
- SECURITY.md with vulnerability reporting process
- CODE_OF_CONDUCT.md for community guidelines

## [0.1.4] - 2025-11-18

### Changed
- Package maintenance and documentation updates

## [0.1.3] - 2025-10-08

### Changed
- **Entry point standardization**: Renamed main entry file from `verdex-mcp-server.ts` to `index.ts` for better convention alignment
- Updated all references in package.json, README.md, and CHANGELOG.md

## [0.1.2] - 2025-10-08

### Fixed
- **npx execution**: Fixed CLI entry detection to work with npx by using `fileURLToPath` and `realpathSync` instead of fragile `import.meta.url` comparison
- **Missing import**: Added `fileURLToPath` from `url` module to compiled output

## [0.1.1] - 2025-10-08

### Fixed
- **Executable permissions**: Fixed bin script not being executable in npm package

## [0.1.0] - 2025-10-08

### Package
- **Package name**: `@verdex/mcp` (scoped package, professional branding)
- **CLI command**: `npx @verdex/mcp@latest`
- Repository migrated to `verdexhq/verdex-mcp`

### Added (P0 Correctness Fixes)
- Enhanced `inspect()` with `siblingIndex` and `parentRef` fields
- Added DOMAnalyzer helper methods for DOM relationship facts
- Fixed type consistency across injected and Node-side code
- Fixed ESM compatibility (proper import instead of require)

### Added (P1 DX Improvements)
- Added bin field for CLI execution
- Added npm scripts (dev, start, test)
- Added TypeScript declaration files
- Added package metadata (engines, repo, homepage)

### Fixed
- README paths (mcp-server.ts → index.ts)
- Type mismatches in inspect() return types
- Auth file validation now actually runs

### Documentation
- Comprehensive testing (20/20 tests passed)
- Edge case coverage for new fields
- No regressions in existing functionality

## [Unreleased]
- Initial development
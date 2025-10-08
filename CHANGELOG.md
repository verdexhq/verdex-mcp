# Changelog

## [0.1.0] - 2025-10-08

### Package
- **Package name**: `@verdex/mcp` (scoped package, professional branding)
- **CLI command**: `npx @verdex/mcp`
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
- README paths (mcp-server.ts → verdex-mcp-server.ts)
- Type mismatches in inspect() return types
- Auth file validation now actually runs

### Documentation
- Comprehensive testing (20/20 tests passed)
- Edge case coverage for new fields
- No regressions in existing functionality

## [Unreleased]
- Initial development
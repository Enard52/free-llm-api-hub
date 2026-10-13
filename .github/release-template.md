<!-- Title: vX.Y.Z — <one-line summary> -->

<One paragraph: what changes for people who use the data, and whether they need to do anything.>

No breaking changes.

### Added

- …

### Changed and fixed

- …

### Contributors

Thank you @… .

### Verify

This release is a snapshot of the dataset at the tag. To check it:

```bash
git rev-parse vX.Y.Z^{commit}           # <commit>
git show vX.Y.Z:data/providers.json | sha256sum   # <sha256>
npm ci && npm run check
```

# Third-party material

| Path | Origin | License |
|---|---|---|
| `typegpu-examples/vendor/` | TypeGPU docs examples and `@typegpu/*` package sources, unmodified, commit `e893ad11f215f08ef164fb20daae851702007185` of https://github.com/software-mansion/TypeGPU | MIT, copyright Software Mansion (`typegpu-examples/vendor/LICENSE`) |
| `mutation/typegpu-tree.tar.xz` | pinned subset of the same TypeGPU commit (350 files, hashes in `mutation/typegpu-tree.sha256`) | MIT, same notice |
| `mutation/patches/*.patch` | small edits of TypeGPU source files (seeded bugs) | MIT, same notice |
| `ported/`, `ported/auto/` | GPU ports of TypeGPU's `std/numeric` unit tests | MIT, same notice |

Fetched at build time, not stored here: WebGPU CTS (`gpuweb/cts`, commit `e325d0bcc2cb785c4eab1d908339019215bd9462`, BSD-3-Clause), Mesa/Lavapipe (Ubuntu or Debian packages), Chromium's SwiftShader build (Debian `chromium-common` package, BSD-3-Clause with third-party components), Node.js, and the npm packages pinned in `package-lock.json`.

The code written for this study has no license file yet; add one before publishing.

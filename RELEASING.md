# Releasing

Releases are **tag-driven**. Pushing a `v*` tag runs the [`Release`](.github/workflows/release.yml) workflow, which gates (typecheck / lint / test), builds, publishes all packages to npm, and cuts a GitHub Release whose notes git-cliff generates from the Conventional Commit history since the previous tag (see [`cliff.toml`](cliff.toml)). The tag also runs the [`Pages`](.github/workflows/pages.yml) workflow, deploying the playground to [GitHub Pages](https://coldsmirk.github.io/ledger/) so the live demo tracks the released version (it can also be redeployed on demand from the Actions tab).

## One-time setup

1. **npm scope** — packages publish under the personal `@coldsmirk` scope, so no organization is needed; the publishing token's account must be `coldsmirk` (or have publish rights on `@coldsmirk/*`).
2. **`NPM_TOKEN` secret** — create an npm **automation** (or granular, with _Read and write_ on `@coldsmirk/*`) access token, then add it to the GitHub repo: _Settings → Secrets and variables → Actions → New repository secret_ → name `NPM_TOKEN`, value the token.

That is all the workflow needs — `GITHUB_TOKEN` is provided automatically.

> npm provenance is **not** used yet: it was skipped while the repository was private. The repo is public now, so `--provenance` can be added to the publish step, or the workflow can switch to npm Trusted Publishing (OIDC, no stored token) — it already keeps `id-token: write` for that.

## Cutting a release

The root and every workspace package share one version, bumped together. Private packages such as
`ledger-playground` participate in the lockstep even though only `@coldsmirk/*` packages publish:

```bash
pnpm version:patch      # 0.1.0 -> 0.1.1   (or version:minor / version:major / an explicit x.y.z)
```

This updates the root manifest and every workspace package's `version`. Then review, commit, tag,
and push — the script prints these exact commands:

```bash
git add package.json packages/*/package.json
git commit -m "chore(release): v0.1.1"
git tag -a v0.1.1 -m "v0.1.1"
git push --follow-tags
```

Pushing the tag triggers the `Release` workflow. The tag **must** match every published package version (the workflow verifies this and fails otherwise).

To re-run a failed release, fix the cause and re-run the workflow from the **Actions** tab (already-published versions cannot be republished — bump again).

## CI

Every push to `main` and every pull request to `main` runs the [`CI`](.github/workflows/ci.yml) workflow: typecheck, lint, test, build, and published-package validation (publint + arethetypeswrong).

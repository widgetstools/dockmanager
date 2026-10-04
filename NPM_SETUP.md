# npm publishing setup

The [`Publish to npm`](.github/workflows/publish.yml) workflow publishes three packages:

| Package | Source |
| --- | --- |
| `@widgetstools/dock-manager-core` | `packages/dock-manager-core` |
| `@widgetstools/react-dock-manager` | `packages/react-dock-manager` |
| `@widgetstools/angular-dock-manager` | `dist/angular-dock-manager` (built from `packages/angular-dock-manager`) |

It runs when a GitHub release is published, or manually from **Actions → Publish to npm → Run workflow**
(choose `all`, `core`, `react` or `angular`, and optionally a dry run).

## How the workflow authenticates

The workflow supports two methods, and works with either or both:

1. **Trusted publishing (OIDC)** — npm trusts this repository's `publish.yml` workflow directly. No secret
   to store or rotate. Only possible for a package that **already exists** on npm.
2. **`NPM_TOKEN` secret** — an npm access token, passed to `npm publish` as `NODE_AUTH_TOKEN`. Needed for
   a package's first publish, and for any package that has no trusted publisher configured.

npm (11.5.1 or later, which the workflow installs) tries trusted publishing first and falls back to the
token. Every publish is signed with `--provenance`.

### Why publishing fails with `E404`

```
npm error 404 Not Found - PUT https://registry.npmjs.org/@widgetstools%2fdock-manager-core - Not found
```

npm answers `404` (not `401`/`403`) when the publish is not authorized. Usual causes:

- the `@widgetstools` organization does not exist, or your npm user is not a member who can publish to it;
- the `NPM_TOKEN` secret is missing, expired or lacks write access to the packages; and
- trusted publishing is not configured for that package (or names a different repository/workflow file).

Work through the steps below to fix it.

## 1. Create or verify the `@widgetstools` npm organization

1. Sign in at <https://www.npmjs.com>.
2. Open your avatar menu → **Organizations**. If `widgetstools` is listed, open it; otherwise click
   **Create an Organization**, enter `widgetstools` and choose the free plan (public packages only).
3. In the organization, under **Members**, make sure your npm user has the **Owner** or **Admin** role
   (or is in a team with **read and write** access to the packages).
4. Enable two-factor authentication on your account (**Account → Two-Factor Authentication**); npm
   requires it to publish to an organization.

## 2. Generate an npm token with publish permissions

1. On npmjs.com open your avatar menu → **Access Tokens** → **Generate New Token** →
   **Granular Access Token**.
2. Fill in:
   - **Token name**: e.g. `dockmanager GitHub Actions`
   - **Expiration**: as long as allowed (npm limits write tokens to 90 days — note the date, the token
     must be renewed before it expires unless you move to trusted publishing, step 5)
   - **Bypass two-factor authentication**: enable it, so CI can publish without an OTP
   - **Packages and scopes** → **Permissions**: **Read and write**, scope **`@widgetstools`** (select the
     organization, or "All packages" if the packages do not exist yet)
   - **Organizations**: leave as **No access** (not needed to publish)
3. Click **Generate Token** and copy it — it is shown only once.

> A classic **Automation** token also works if your account can still create one.

## 3. Add the token to GitHub as `NPM_TOKEN`

1. In <https://github.com/widgetstools/dockmanager> go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** (or update the existing `NPM_TOKEN`).
3. **Name**: `NPM_TOKEN`, **Secret**: the token from step 2. Click **Add secret**.

The workflow's "Check npm authentication" step logs whether the secret is set.

## 4. Publish the packages for the first time

From GitHub (recommended):

1. **Actions → Publish to npm → Run workflow**, branch `main`, packages `all`.
2. Optionally run once with **Dry run** checked to verify the build and package contents.
3. Run again without dry run. The packages appear at:
   - <https://www.npmjs.com/package/@widgetstools/dock-manager-core>
   - <https://www.npmjs.com/package/@widgetstools/react-dock-manager>
   - <https://www.npmjs.com/package/@widgetstools/angular-dock-manager>

Or from your machine (logged in with `npm login` as a member of `@widgetstools`):

```bash
npm ci
npm run build:core && npm run build && npm run build:angular
npm publish --workspace=@widgetstools/dock-manager-core --access public
npm publish --workspace=@widgetstools/react-dock-manager --access public
(cd dist/angular-dock-manager && npm publish --access public)
```

(`--provenance` only works from CI, so it is omitted locally.)

Each version can be published only once: if a version is already on npm, bump it (`npm run release`)
before publishing again.

## 5. Configure trusted publishing for future releases

Once a package exists on npm, configure trusted publishing so releases no longer depend on a token.
For **each** of the three packages:

1. Open the package on npmjs.com → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Enter exactly:
   - **Organization or user**: `widgetstools`
   - **Repository**: `dockmanager`
   - **Workflow filename**: `publish.yml`
   - **Environment name**: leave empty
3. Save.
4. Recommended: under **Publishing access**, select
   **Require two-factor authentication and disallow tokens** so only the trusted workflow can publish.

After all three packages are configured and a release has published successfully, you can delete the
`NPM_TOKEN` secret (and revoke the token on npmjs.com). The workflow then publishes with trusted
publishing only. If you keep the secret, it remains a fallback — but it must be renewed before it expires.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `E404 Not Found - PUT …` | See [Why publishing fails with `E404`](#why-publishing-fails-with-e404): check the org membership, the `NPM_TOKEN` secret, and the trusted publisher settings. |
| `E403 … cannot publish over the previously published versions` | That version is already on npm; bump the version. |
| `E403 … two-factor authentication` | The token was created without **Bypass two-factor authentication**; generate a new one (step 2). |
| `E401` / `ENEEDAUTH` | `NPM_TOKEN` is missing or invalid and no trusted publisher is configured. |
| Trusted publishing still fails | The repository, workflow filename (`publish.yml`) and environment (empty) on npm must match exactly; the job needs `id-token: write` (already set). |

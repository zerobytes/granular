# Release & Publish Process

This package publishes to npm automatically via GitHub Actions when a Release is created.

## One-time setup (per repository)

1. Generate an npm **Automation token** (bypasses 2FA):
   - Go to https://www.npmjs.com/settings/<your-username>/tokens
   - Click "Generate New Token" → **Automation** type → copy the token
2. Add it as a GitHub secret in this repository:
   - Repo → Settings → Secrets and variables → Actions → "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: `<paste the npm token>`

## How to release

1. Bump the version in `package.json` (follow semver):
   ```bash
   npm version patch   # 0.1.0 -> 0.1.1
   npm version minor   # 0.1.0 -> 0.2.0
   npm version major   # 0.1.0 -> 1.0.0
   ```
   This commits the bump and tags it locally.

2. Push the commit and tag:
   ```bash
   git push && git push --tags
   ```

3. Create a GitHub Release for the pushed tag (UI or CLI):
   ```bash
   gh release create v0.2.0 --generate-notes
   ```

4. The `Publish to npm` workflow runs automatically:
   - Verifies `package.json` version matches the tag
   - Runs tests
   - Publishes to npm with provenance (no manual OTP needed)

## Manual publish (fallback)

If you need to publish without a release:

```bash
gh workflow run publish.yml -f tag=latest
```

Or, locally with 2FA OTP:

```bash
npm publish --access public --otp=123456
```

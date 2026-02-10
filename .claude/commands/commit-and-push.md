# Commit and Push Work (onchain)

This repo-specific command handles version bumping, tagging, and pushing for the onchain CLI.

## Steps to perform:

### 1. Pre-flight checks
- Run `pnpm run lint` to ensure code passes linting
- Run `pnpm run test` to ensure tests pass
- Check `git status` to see what files have changed

### 2. Determine version bump type
Ask the user which version bump to use:
- **patch** (0.5.1 → 0.5.2): Bug fixes, minor changes
- **minor** (0.5.1 → 0.6.0): New features, backwards compatible
- **major** (0.5.1 → 1.0.0): Breaking changes

### 3. Bump version in package.json
Use `pnpm version <patch|minor|major> --no-git-tag-version` to bump the version without creating a tag yet (we'll create it after committing).

### 4. Stage and commit all changes
- Stage all modified files (be specific, avoid `git add -A`)
- Create a commit with a clear message describing the changes
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` in the commit

### 5. Create git tag
After the commit succeeds, create a git tag:
```bash
git tag v$(node -p "require('./package.json').version")
```

### 6. Push to remote with tags
Push the commit and the tag to origin:
```bash
git push origin main && git push origin v$(node -p "require('./package.json').version")
```

## Important notes:
- The user has a YubiKey for git signing - inform them to watch for the touch prompt
- Use 60000ms timeout for git commit and push operations
- This triggers the npm release via GitHub Actions
- Never push force or amend commits without explicit user request

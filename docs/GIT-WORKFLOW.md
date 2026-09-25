# Git Workflow

## Branch model

Use trunk-based development:

```text
main
 ├── feature/<short-name>
 ├── fix/<short-name>
 ├── chore/<short-name>
 ├── docs/<short-name>
 └── spike/<short-name>
```

## Main branch

`main` must remain deployable.

Protect it with:

- pull requests
- required CI
- review
- no direct pushes for normal development

## Branch lifetime

Keep branches short-lived. Avoid long-lived `develop` branches unless a specific operational need emerges.

## Commits

Prefer Conventional Commits.

Examples:

```text
feat: add property ownership workflow
fix: prevent cross-organization document access
test: add owner approval e2e
docs: update deployment guide
chore: upgrade prisma
```

## Pull request

A PR should include:

- problem
- solution
- tests
- migrations
- security impact
- screenshots for UI changes where useful
- rollout/flag information

## Release

A release should have:

- passing CI
- migration plan
- rollback/forward-fix plan
- release notes
- monitoring plan

## Hotfix

For urgent production issues:

```text
main
 ↓
fix/*
 ↓
CI
 ↓
production
```

Back-merge or otherwise preserve the fix in the normal history.

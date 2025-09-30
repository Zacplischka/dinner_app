# CI/CD Setup Guide

## Overview

This project uses GitHub Actions to automatically test and deploy to Railway when PRs are merged to main.

**Status**: ✅ Fully configured and ready to use!

## GitHub Actions Workflow

The `.github/workflows/ci-cd.yml` workflow has two jobs:

### 1. **Test Job** (runs on PRs)
- Lints backend and frontend code
- Type checks all TypeScript code
- Runs backend unit/integration tests (with Redis service)
- Runs frontend unit tests

### 2. **Deploy Job** (runs on push to main)
- Runs all tests from Test job
- Deploys backend to Railway (if tests pass)
- Deploys frontend to Railway (if tests pass)

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret below:

### Required Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `RAILWAY_TOKEN` | Railway API token for deployments | [Generate token](https://railway.app/account/tokens) |
| `RAILWAY_BACKEND_SERVICE_ID` | Backend service ID | Run `railway service` in backend context |
| `RAILWAY_FRONTEND_SERVICE_ID` | Frontend service ID | Run `railway service` in frontend context |

### Getting Railway Service IDs

```bash
# Get backend service ID
railway service backend
railway service
# Copy the service ID (e.g., "backend-production-4ce9")

# Get frontend service ID
railway service frontend
railway service
# Copy the service ID (e.g., "frontend-production-bdfc")
```

### Getting Railway Token

1. Go to https://railway.app/account/tokens
2. Click **Create Token**
3. Name it "GitHub Actions"
4. Copy the token value
5. Add as `RAILWAY_TOKEN` secret in GitHub

## Workflow Triggers

### Pull Requests to Main
- ✅ Runs linting and tests
- ❌ Does NOT deploy
- Provides fast feedback on code quality

### Merged PRs (push to main)
- ✅ Runs all tests
- ✅ Deploys to Railway if tests pass
- 🚀 Backend deploys first, then frontend

## Testing the Workflow

### 1. Test PR Checks

```bash
# Create a feature branch
git checkout -b test-ci

# Make a small change
echo "# Test" >> README.md

# Commit and push
git add README.md
git commit -m "Test CI pipeline"
git push origin test-ci

# Create PR on GitHub
# GitHub Actions will run tests automatically
```

### 2. Test Deployment

```bash
# Merge the PR on GitHub
# GitHub Actions will:
# 1. Run all tests
# 2. Deploy backend to Railway
# 3. Deploy frontend to Railway
```

## Monitoring Deployments

### GitHub Actions
- View workflow runs: **Actions** tab in GitHub
- See logs for each step
- Check success/failure status

### Railway
- View deployments: Railway dashboard
- Check build logs: Click on service → **Deployments**
- Monitor health: Check backend `/health` endpoint

## Troubleshooting

### Issue: "RAILWAY_TOKEN not found"

**Cause**: Secret not set in GitHub

**Fix**:
1. Generate token at https://railway.app/account/tokens
2. Add as `RAILWAY_TOKEN` secret in GitHub Settings → Secrets

### Issue: "railway link failed"

**Cause**: Service IDs incorrect or not set

**Fix**:
1. Get service IDs with `railway service` command
2. Update `RAILWAY_BACKEND_SERVICE_ID` and `RAILWAY_FRONTEND_SERVICE_ID` secrets

### Issue: Tests fail in CI but pass locally

**Cause**: Environment differences (Redis, Node version, etc.)

**Fix**:
1. Check GitHub Actions logs for error details
2. Ensure Redis service is healthy (CI uses Redis 7-alpine)
3. Verify Node.js version matches (20 LTS)

### Issue: Deployment succeeds but app doesn't work

**Cause**: Environment variables not set in Railway

**Fix**:
1. Verify Railway environment variables (see `DEPLOY_GUIDE.md`)
2. Check backend/frontend Railway service settings
3. Ensure `FRONTEND_URL`, `REDIS_*` vars are correct

## Skipping CI

Add `[skip ci]` to commit message to skip workflow:

```bash
git commit -m "Update docs [skip ci]"
```

## Advanced Configuration

### Customizing Test Execution

Edit `.github/workflows/ci-cd.yml`:

```yaml
# Add Playwright E2E tests (requires more setup)
- name: Run E2E tests
  run: npm run test:e2e --workspace=@dinner-app/frontend
  env:
    VITE_API_BASE_URL: http://localhost:3001/api
```

### Parallel Deployments

To deploy backend and frontend in parallel:

```yaml
# Current: Sequential deployment
# Backend → Frontend

# Parallel: Use matrix strategy
strategy:
  matrix:
    service: [backend, frontend]
steps:
  - name: Deploy ${{ matrix.service }}
    run: railway up --service ${{ matrix.service }}
```

### Deployment Notifications

Add Slack/Discord notifications:

```yaml
- name: Notify on deployment
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d '{"text":"🚀 Deployed to Railway successfully!"}'
```

## Security Notes

- Railway tokens have full project access - keep them secret
- Tokens can be revoked at https://railway.app/account/tokens
- GitHub secrets are encrypted and only exposed to workflow runs
- Never commit tokens or secrets to git

## Related Documentation

- Railway deployment: See `DEPLOY_GUIDE.md`
- Project architecture: See `CLAUDE.md`
- Feature specs: See `specs/001-dinner-decider-enables/`

---

**Last Updated**: 2025-09-30
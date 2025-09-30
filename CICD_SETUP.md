# CI/CD Setup Guide

## Overview

This project uses a simple two-part CI/CD approach:
1. **GitHub Actions**: Runs tests on pull requests (quality gate)
2. **Railway Auto-Deploy**: Automatically deploys when code is pushed to main

**Status**: ✅ Fully configured and ready to use!

## GitHub Actions (PR Testing)

The `.github/workflows/ci-cd.yml` workflow runs on every PR to main:

- ✅ Lints backend and frontend code
- ✅ Type checks all TypeScript code
- ✅ Runs backend unit/integration tests (with Redis service)
- ✅ Runs frontend unit tests

## Railway Auto-Deploy

Railway watches your GitHub repository and automatically deploys when main branch is updated:

- ✅ Backend service deploys automatically on push to main
- ✅ Frontend service deploys automatically on push to main
- ✅ No manual deployment needed
- ✅ No GitHub Actions deployment job required

## Railway Setup (One-Time Configuration)

### Connect GitHub to Railway

For each service (backend and frontend):

1. Go to Railway dashboard → Select your project
2. Click on the service (backend or frontend)
3. Go to **Settings** → **Source**
4. Click **Connect to GitHub**
5. Select your repository: `Zacplischka/dinner_app`
6. Choose branch: `main`
7. Set root directory (if needed):
   - Backend: Leave blank or set to `backend`
   - Frontend: Leave blank or set to `frontend`

### Configure Auto-Deploy

Railway automatically deploys when:
- ✅ Code is pushed to the `main` branch
- ✅ PR is merged to main
- ✅ Manual trigger from Railway dashboard

No additional configuration needed!

## How It Works

### 1. Create a Pull Request
1. Create a feature branch
2. Make your changes
3. Push to GitHub
4. Create PR to `main`
5. **GitHub Actions automatically runs tests**
6. Review test results in PR

### 2. Merge Pull Request
1. Review code and ensure tests pass
2. Merge PR to `main`
3. **Railway automatically deploys both services**
4. Monitor deployment in Railway dashboard

### Workflow Summary
```
PR Created → GitHub Actions Tests → PR Review → Merge → Railway Auto-Deploy
```

## Testing the Workflow

### 1. Test PR Checks

```bash
# Create a feature branch
git checkout -b test-feature

# Make a small change
echo "# Test Feature" >> README.md

# Commit and push
git add README.md
git commit -m "Test: Add feature documentation"
git push origin test-feature

# Create PR on GitHub
# GitHub Actions will run tests automatically
```

### 2. Test Auto-Deploy

```bash
# Merge the PR on GitHub (after tests pass)
# Railway will automatically deploy both services

# Monitor deployment
# Go to Railway dashboard to watch deployments
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
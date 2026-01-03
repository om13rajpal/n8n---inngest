# 🚀 Production Deployment Guide

**Version:** 1.0
**Last Updated:** 2026-01-04
**For:** n8n → Inngest Converter - Production Deployments

---

## TABLE OF CONTENTS

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Deployment Steps](#deployment-steps)
4. [Rollback Procedures](#rollback-procedures)
5. [Post-Deployment Validation](#post-deployment-validation)
6. [Troubleshooting](#troubleshooting)

---

## PRE-DEPLOYMENT CHECKLIST

### Code Review
- [ ] All edge cases reviewed (see EDGE_CASE_REVIEW_CHECKLIST.md)
- [ ] Variable names follow camelCase convention
- [ ] TypeScript compilation successful
- [ ] No hardcoded secrets in code
- [ ] .env documentation complete

### Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Edge case scenarios tested
- [ ] Load testing completed
- [ ] Security audit passed

### Infrastructure
- [ ] Inngest account created/configured
- [ ] Environment variables set up
- [ ] Monitoring configured
- [ ] Alerts set up
- [ ] Logging pipeline ready

### Documentation
- [ ] README updated
- [ ] API documentation current
- [ ] Runbooks created
- [ ] Team trained

---

## ENVIRONMENT SETUP

### 1. Create Inngest Account

**Steps:**
1. Go to https://www.inngest.com
2. Sign up or log in
3. Create new environment (e.g., "production")
4. Note your signing key and event key

**Get Keys:**
```bash
# From Inngest Dashboard
# Settings → Keys → Create Key
INNGEST_SIGNING_KEY=signkey-prod-...
INNGEST_EVENT_KEY=...
```

### 2. Configure Environment Variables

**Create `.env` file:**
```bash
# Inngest Configuration
INNGEST_SIGNING_KEY=signkey-prod-xxx
INNGEST_EVENT_KEY=xxx
INNGEST_ENV=production

# Workflow-Specific Variables (from generated .env header)
# Copy from generated workflow file header

# AI APIs
OPENROUTER_API_KEY=sk-or-v1-xxx
PERPLEXITY_API_KEY=pplx-xxx
TAVILY_API_KEY=tvly-xxx

# Databases
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJxxx
DATABASE_URL=postgresql://xxx

# External Services
GOOGLE_SHEETS_API_KEY=xxx
AIRTABLE_API_KEY=patxxx
SLACK_BOT_TOKEN=xoxb-xxx

# Application Config
NODE_ENV=production
LOG_LEVEL=info
```

**Security:**
```bash
# NEVER commit .env to git
echo ".env" >> .gitignore

# Use environment variable management service
# - Vercel: Environment Variables section
# - AWS: Systems Manager Parameter Store
# - Heroku: Config Vars
# - Railway: Variables tab
```

### 3. Install Dependencies

```bash
# Install all dependencies
npm install

# Install production-only deps
npm install --omit=dev

# Verify installations
npm list inngest @inngest/agent-kit sharp
```

### 4. Build Application

```bash
# Compile TypeScript
npm run build

# Verify build output
ls -la dist/

# Test generated code
node dist/generated-workflow.js
```

---

## DEPLOYMENT STEPS

### Option 1: Deploy to Vercel (Recommended)

**Step 1: Install Vercel CLI**
```bash
npm install -g vercel
```

**Step 2: Login**
```bash
vercel login
```

**Step 3: Configure Project**
```bash
# Create vercel.json
cat > vercel.json << 'EOF'
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": null,
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs20.x"
    }
  }
}
EOF
```

**Step 4: Set Environment Variables**
```bash
# Set all env vars
vercel env add INNGEST_SIGNING_KEY production
vercel env add OPENROUTER_API_KEY production
# ... repeat for all variables
```

**Step 5: Deploy**
```bash
# Deploy to production
vercel --prod

# Note the deployment URL
# https://your-project.vercel.app
```

**Step 6: Register Functions with Inngest**
```bash
# Inngest will auto-discover functions at:
# https://your-project.vercel.app/api/inngest
```

---

### Option 2: Deploy to Railway

**Step 1: Install Railway CLI**
```bash
npm install -g @railway/cli
```

**Step 2: Login**
```bash
railway login
```

**Step 3: Initialize Project**
```bash
railway init
```

**Step 4: Set Environment Variables**
```bash
# Upload .env file
railway variables set --env production < .env
```

**Step 5: Deploy**
```bash
# Deploy
railway up

# Get deployment URL
railway domain
```

---

### Option 3: Deploy to Custom Server

**Step 1: Build**
```bash
npm run build
```

**Step 2: Copy Files**
```bash
# Copy to server
scp -r dist/ package.json package-lock.json user@server:/app/
```

**Step 3: Install on Server**
```bash
ssh user@server
cd /app
npm install --production
```

**Step 4: Start Application**
```bash
# Using PM2
npm install -g pm2
pm2 start dist/index.js --name inngest-workflows

# Or use systemd
sudo systemctl start inngest-workflows
```

**Step 5: Configure Reverse Proxy (nginx)**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/inngest {
        proxy_pass http://localhost:3000/api/inngest;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## INNGEST FUNCTION REGISTRATION

### Automatic Discovery

Inngest will auto-discover functions at your `/api/inngest` endpoint.

**Verify Registration:**
1. Go to https://app.inngest.com
2. Navigate to Functions
3. Confirm your functions appear

**Manual Registration (if needed):**
```bash
curl -X PUT https://api.inngest.com/v1/functions \
  -H "Authorization: Bearer $INNGEST_EVENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/api/inngest"
  }'
```

---

## POST-DEPLOYMENT VALIDATION

### 1. Health Check

**Test endpoint:**
```bash
curl https://your-app.com/api/inngest

# Should return:
# {"message": "Inngest endpoint is running"}
```

### 2. Trigger Test Event

**Send test event:**
```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({
  id: 'test-client',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Send test event
const result = await inngest.send({
  name: 'app/workflow.trigger',
  data: {
    test: true,
    message: 'Hello from production!',
  },
});

console.log('Event ID:', result.ids);
```

**Or use curl:**
```bash
curl -X POST https://inn.gs/e/$INNGEST_EVENT_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app/workflow.trigger",
    "data": {
      "test": true,
      "message": "Hello from production!"
    }
  }'
```

### 3. Monitor Execution

**Check Inngest Dashboard:**
1. Go to https://app.inngest.com/env/[your-env]/functions
2. Find your function
3. Click "Runs"
4. Verify test execution succeeded

### 4. Verify Logs

**Check application logs:**
```bash
# Vercel
vercel logs

# Railway
railway logs

# PM2
pm2 logs inngest-workflows

# Docker
docker logs inngest-workflows
```

### 5. Test All Paths

**Run smoke tests:**
```bash
npm run test:smoke
```

**Manual testing:**
- [ ] Trigger fires correctly
- [ ] Happy path executes
- [ ] Error handling works
- [ ] Retry logic functions
- [ ] Outputs are correct

---

## MONITORING & ALERTS

### Configure Monitoring

**1. Inngest Dashboard Alerts:**
- Go to Settings → Alerts
- Add alert for function failures
- Set threshold: > 5% error rate
- Configure notification channels

**2. Application Monitoring:**
```typescript
// Add to your functions
import { trackMetric } from './monitoring';

await step.run('track-execution', async () => {
  await trackMetric({
    name: 'workflow.executed',
    value: 1,
    tags: {
      workflow: 'process-data',
      status: 'success',
    },
  });
});
```

**3. Log Aggregation:**
- Configure Datadog/New Relic
- Set up log forwarding
- Create dashboards

### Test Alerts

**Trigger test alert:**
```bash
# Cause intentional failure
curl -X POST https://inn.gs/e/$INNGEST_EVENT_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app/workflow.trigger",
    "data": {
      "causeError": true
    }
  }'

# Verify alert fired
# Check email/Slack/PagerDuty
```

---

## ROLLBACK PROCEDURES

### If Deployment Fails

**Vercel:**
```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]
```

**Railway:**
```bash
# List deployments
railway status

# Rollback
railway rollback [deployment-id]
```

**Custom Server:**
```bash
# Restore backup
ssh user@server
cd /app
mv /app/backup/dist ./
pm2 restart inngest-workflows
```

### If Functions Fail in Production

**Immediate Actions:**
1. **Pause function execution:**
   - Inngest Dashboard → Functions → [Function] → Pause

2. **Revert to previous version:**
   ```bash
   # Vercel
   vercel rollback

   # Railway
   railway rollback
   ```

3. **Monitor rollback:**
   - Check Inngest Dashboard
   - Verify no new errors
   - Confirm successful executions

4. **Notify team:**
   ```bash
   # Post to Slack
   curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
     -d '{"text": "⚠️ Rolled back inngest-workflows to previous version"}'
   ```

### Post-Rollback

1. **Investigate root cause:**
   - Review error logs
   - Check recent changes
   - Test locally

2. **Create hotfix:**
   - Fix issue
   - Test thoroughly
   - Deploy to staging first

3. **Document incident:**
   - What happened
   - Root cause
   - Fix applied
   - Preventive measures

---

## COMMON DEPLOYMENT ISSUES

### Issue 1: Environment Variables Not Found

**Symptom:**
```
Error: Environment variable OPENROUTER_API_KEY is not defined
```

**Solution:**
1. Verify `.env` file exists
2. Check environment variable names match exactly
3. Restart application after setting env vars
4. For Vercel/Railway, re-deploy after setting vars

---

### Issue 2: Function Not Discovered

**Symptom:** Function doesn't appear in Inngest Dashboard

**Solution:**
1. Check `/api/inngest` endpoint is accessible
2. Verify `INNGEST_SIGNING_KEY` is set
3. Check function export is correct:
   ```typescript
   export const functions = [myFunction];
   ```
4. Manually trigger discovery in Inngest Dashboard

---

### Issue 3: TypeScript Compilation Errors

**Symptom:**
```
error TS2339: Property 'X' does not exist on type 'Y'
```

**Solution:**
1. Run `npm run build` locally to catch errors
2. Fix type errors before deploying
3. Update types if using latest Inngest SDK
4. Check `tsconfig.json` is correct

---

### Issue 4: Module Not Found

**Symptom:**
```
Error: Cannot find module 'sharp'
```

**Solution:**
1. Install missing dependency: `npm install sharp`
2. Verify `package.json` includes all deps
3. Run `npm install` on server
4. For Lambda/Vercel, check build includes node_modules

---

### Issue 5: Rate Limiting / Quota Exceeded

**Symptom:** Functions fail with 429 errors

**Solution:**
1. Implement exponential backoff
2. Add rate limiting to function:
   ```typescript
   { rateLimit: { limit: 10, period: '1m' } }
   ```
3. Upgrade Inngest plan if needed
4. Batch operations to reduce API calls

---

## SCALING CONSIDERATIONS

### Horizontal Scaling

**Inngest handles this automatically:**
- Functions auto-scale based on load
- No server management required
- Pay per execution

**Monitor costs:**
```bash
# Check Inngest usage
# Dashboard → Billing → Usage
```

### Performance Optimization

**1. Batch Processing:**
```typescript
// Instead of processing items one by one
for (const item of items) {
  await processItem(item);
}

// Batch them
await Promise.all(
  items.map(item => processItem(item))
);
```

**2. Caching:**
```typescript
// Cache frequently accessed data
const cache = new Map();

await step.run('get-data', async () => {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const data = await fetchData(key);
  cache.set(key, data);
  return data;
});
```

**3. Timeout Configuration:**
```typescript
inngest.createFunction(
  {
    id: 'long-running-task',
    timeout: '5m', // Increase if needed
  },
  // ...
);
```

---

## MAINTENANCE

### Regular Tasks

**Daily:**
- Check error logs
- Review execution metrics
- Monitor costs

**Weekly:**
- Review performance trends
- Update dependencies
- Test disaster recovery

**Monthly:**
- Security audit
- Performance optimization
- Documentation updates
- Team training

### Dependency Updates

```bash
# Check for updates
npm outdated

# Update safely
npm update

# Test after update
npm run test
npm run build

# Deploy to staging first
```

---

## DISASTER RECOVERY

### Backup Strategy

**1. Code Backups:**
```bash
# Git is your backup
git push origin main

# Tag releases
git tag -a v1.0.0 -m "Production release"
git push origin v1.0.0
```

**2. Environment Variable Backups:**
```bash
# Export to file (DO NOT commit)
vercel env pull .env.backup

# Store securely (1Password, AWS Secrets Manager)
```

**3. Database Backups:**
- Configure automatic backups
- Test restore procedures
- Keep multiple restore points

### Recovery Procedures

**Total Outage:**
1. Check Inngest status page
2. Verify your deployment is running
3. Check DNS/networking
4. Review recent changes
5. Rollback if needed

**Partial Outage:**
1. Identify affected functions
2. Pause problematic functions
3. Route traffic to backup
4. Investigate and fix
5. Gradual rollout of fix

---

## COMPLIANCE & SECURITY

### Security Best Practices

- [ ] All secrets in environment variables
- [ ] HTTPS only
- [ ] API keys rotated regularly
- [ ] Least privilege access
- [ ] Audit logs enabled
- [ ] Security headers configured
- [ ] Dependencies scanned for vulnerabilities

### Compliance Checklist

- [ ] Data retention policies defined
- [ ] PII handling documented
- [ ] GDPR compliance (if applicable)
- [ ] Audit trail maintained
- [ ] Incident response plan
- [ ] Regular security reviews

---

## DEPLOYMENT CHECKLIST

**Pre-Deployment:**
- [ ] Code reviewed and approved
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Environment variables configured
- [ ] Monitoring set up
- [ ] Rollback plan ready

**Deployment:**
- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Verify function registration
- [ ] Test with real traffic
- [ ] Monitor for errors

**Post-Deployment:**
- [ ] Verify all functions working
- [ ] Check logs and metrics
- [ ] Test alerts firing
- [ ] Update documentation
- [ ] Notify team
- [ ] Monitor for 24 hours

---

**Deployment Complete!** 🎉

For issues, refer to:
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)
- Inngest Docs: https://www.inngest.com/docs
- Inngest Discord: https://www.inngest.com/discord

---

**Last Updated:** 2026-01-04
**Version:** 1.0
**Next Review:** After first production deployment

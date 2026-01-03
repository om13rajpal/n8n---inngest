# 🔍 Production Monitoring & Observability Guide

**Version:** 1.0
**Last Updated:** 2026-01-04
**For:** n8n → Inngest Converter Production Deployments

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Monitoring Metrics](#monitoring-metrics)
3. [Logging Strategy](#logging-strategy)
4. [Alert Configuration](#alert-configuration)
5. [Error Tracking](#error-tracking)
6. [Performance Monitoring](#performance-monitoring)
7. [Integration Testing](#integration-testing)
8. [Dashboard Setup](#dashboard-setup)

---

## OVERVIEW

This guide provides comprehensive monitoring strategies for production deployments of converted n8n workflows running on Inngest.

### Why Monitoring Matters

- **Early Detection:** Identify issues before they impact users
- **Performance Optimization:** Track slow functions and bottlenecks
- **Cost Control:** Monitor resource usage and credit consumption
- **Quality Assurance:** Validate conversion accuracy in production
- **Compliance:** Audit trails for security and regulatory requirements

---

## MONITORING METRICS

### 1. Conversion Metrics

**Track during conversion process:**

```typescript
interface ConversionMetrics {
  // Basic metrics
  workflowName: string;
  nodeCount: number;
  generatedLines: number;
  conversionTime: number; // milliseconds

  // Quality metrics
  patternCoverage: number; // percentage
  warnings: number;
  hardcodedSecrets: number;
  envVarsDetected: number;

  // Success indicators
  functionCount: number;
  hasEmptyFunctions: boolean;
  compilationSuccess: boolean;
}
```

**Implementation:**

```typescript
// In your conversion script
const metrics: ConversionMetrics = {
  workflowName: workflow.name,
  nodeCount: workflow.nodes.length,
  generatedLines: result.code.split('\n').length,
  conversionTime: Date.now() - startTime,
  patternCoverage: calculatePatternCoverage(result),
  warnings: result.warnings.length,
  hardcodedSecrets: detectHardcodedSecrets(result.code).length,
  envVarsDetected: detectEnvVarsInCode(result.code).length,
  functionCount: countFunctions(result.code),
  hasEmptyFunctions: checkEmptyFunctions(result.code),
  compilationSuccess: await testTypeScriptCompilation(result.code),
};

// Log to monitoring service
console.log(JSON.stringify({ type: 'conversion_metrics', ...metrics }));
```

### 2. Runtime Metrics (Inngest)

**Automatically tracked by Inngest:**

- Function execution count
- Success/failure rate
- Execution duration (p50, p95, p99)
- Error rate
- Retry count
- Step duration

**Access via:**
- Inngest Dashboard: https://app.inngest.com
- Inngest API: For programmatic access

### 3. Custom Application Metrics

**Add to converted functions:**

```typescript
export const processWorkflow = inngest.createFunction(
  { id: 'process-workflow' },
  { event: 'app/workflow.trigger' },
  async ({ event, step }) => {
    const startTime = Date.now();

    try {
      // Your workflow logic
      const result = await step.run('main-logic', async () => {
        // ... logic
      });

      // Track success
      await step.run('track-success', async () => {
        await metrics.increment('workflow.success', {
          workflow: 'process-workflow',
          duration: Date.now() - startTime,
        });
      });

      return result;
    } catch (error) {
      // Track error
      await step.run('track-error', async () => {
        await metrics.increment('workflow.error', {
          workflow: 'process-workflow',
          error: error.message,
          duration: Date.now() - startTime,
        });
      });
      throw error;
    }
  }
);
```

---

## LOGGING STRATEGY

### 1. Structured Logging

**Use structured JSON logs:**

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  workflow: string;
  runId?: string;
  step?: string;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

function log(entry: LogEntry) {
  console.log(JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  }));
}

// Usage in functions
await step.run('process-data', async () => {
  log({
    level: 'info',
    message: 'Processing data',
    workflow: 'process-workflow',
    step: 'process-data',
    data: { recordCount: data.length },
  });

  // ... processing
});
```

### 2. Log Levels

**Development:**
- `debug`: Detailed debugging information
- `info`: General information about execution

**Production:**
- `info`: Key execution milestones
- `warn`: Potential issues (degraded performance, fallbacks)
- `error`: Errors requiring attention

**Configuration:**

```typescript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function shouldLog(level: string): boolean {
  const levels = ['debug', 'info', 'warn', 'error'];
  const currentIndex = levels.indexOf(LOG_LEVEL);
  const messageIndex = levels.indexOf(level);
  return messageIndex >= currentIndex;
}
```

### 3. Log Aggregation

**Recommended services:**
- **Datadog:** Full-stack monitoring
- **New Relic:** APM and logging
- **LogDNA/Mezmo:** Log management
- **Sentry:** Error tracking with logs
- **CloudWatch:** If using AWS

**Setup Example (Datadog):**

```typescript
import { datadogLogs } from '@datadog/browser-logs';

datadogLogs.init({
  clientToken: process.env.DATADOG_CLIENT_TOKEN!,
  site: 'datadoghq.com',
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
});

// Enhanced logging function
function log(entry: LogEntry) {
  const logData = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Console for local/Inngest logs
  console.log(JSON.stringify(logData));

  // Datadog for aggregation
  datadogLogs.logger.log(
    entry.level,
    entry.message,
    logData
  );
}
```

---

## ALERT CONFIGURATION

### 1. Critical Alerts (Immediate Response)

**Alert on:**
- Function failure rate > 5% over 5 minutes
- Zero successful executions in 30 minutes (for scheduled functions)
- Error rate spike (3x baseline)
- Database connection failures
- API authentication failures

**Configuration Example (Inngest Dashboard):**

```
Alert: High Error Rate
Condition: error_rate > 0.05 for 5m
Channels: PagerDuty, Slack #critical-alerts
```

### 2. Warning Alerts (Review Within Hours)

**Alert on:**
- Slow function execution (p95 > 30s)
- High retry rate (> 20%)
- Memory usage > 80%
- Hardcoded secrets detected in logs
- Pattern coverage < 60%

### 3. Informational Alerts (Daily Review)

**Alert on:**
- Daily execution summary
- Cost report
- New warnings introduced
- Performance trends

**Implementation:**

```typescript
// Custom alerting in functions
async function checkThresholds(metrics: RuntimeMetrics) {
  if (metrics.errorRate > 0.05) {
    await sendAlert({
      severity: 'critical',
      title: 'High Error Rate Detected',
      description: `Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
      workflow: metrics.workflowName,
      runbook: 'https://docs.company.com/runbooks/high-error-rate',
    });
  }

  if (metrics.duration > 30000) {
    await sendAlert({
      severity: 'warning',
      title: 'Slow Function Execution',
      description: `Duration: ${metrics.duration}ms (threshold: 30000ms)`,
      workflow: metrics.workflowName,
    });
  }
}
```

---

## ERROR TRACKING

### 1. Error Categories

**Categorize errors for better tracking:**

```typescript
enum ErrorCategory {
  CONVERSION_ERROR = 'conversion_error',      // During conversion
  VALIDATION_ERROR = 'validation_error',      // Input validation
  API_ERROR = 'api_error',                    // External API failures
  DATABASE_ERROR = 'database_error',          // Database operations
  AUTH_ERROR = 'auth_error',                  // Authentication issues
  TIMEOUT_ERROR = 'timeout_error',            // Timeouts
  UNKNOWN_ERROR = 'unknown_error',            // Uncategorized
}

function categorizeError(error: Error): ErrorCategory {
  if (error.message.includes('Conversion produced no functions')) {
    return ErrorCategory.CONVERSION_ERROR;
  }
  if (error.message.includes('timeout')) {
    return ErrorCategory.TIMEOUT_ERROR;
  }
  // ... more categorization logic
  return ErrorCategory.UNKNOWN_ERROR;
}
```

### 2. Error Context

**Capture rich context:**

```typescript
interface ErrorContext {
  category: ErrorCategory;
  message: string;
  stack?: string;
  workflow: string;
  step?: string;
  runId?: string;
  userId?: string;
  input?: unknown;
  environment: string;
  timestamp: string;
}

async function trackError(error: Error, context: Partial<ErrorContext>) {
  const errorData: ErrorContext = {
    category: categorizeError(error),
    message: error.message,
    stack: error.stack,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Log
  console.error(JSON.stringify({ type: 'error', ...errorData }));

  // Send to error tracking service
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: {
        category: errorData.category,
        workflow: errorData.workflow,
      },
      extra: errorData,
    });
  }
}
```

### 3. Error Recovery

**Track recovery actions:**

```typescript
await step.run('process-with-recovery', async () => {
  try {
    return await processData(data);
  } catch (error) {
    await trackError(error, {
      workflow: 'process-workflow',
      step: 'process-with-recovery',
    });

    // Attempt recovery
    if (isRetryable(error)) {
      await logRecovery({
        action: 'retry',
        attempts: step.retries,
      });
      throw error; // Inngest will retry
    }

    // Fallback logic
    await logRecovery({
      action: 'fallback',
      reason: 'non-retryable error',
    });
    return await fallbackProcess(data);
  }
});
```

---

## PERFORMANCE MONITORING

### 1. Function Performance

**Track key metrics:**

```typescript
interface PerformanceMetrics {
  functionId: string;
  duration: number;
  stepCount: number;
  stepDurations: Record<string, number>;
  memoryUsed: number;
  apiCalls: number;
  dbQueries: number;
}

async function trackPerformance(metrics: PerformanceMetrics) {
  // Log for analysis
  console.log(JSON.stringify({
    type: 'performance',
    ...metrics,
  }));

  // Send to monitoring service
  await monitoring.record(metrics);
}
```

### 2. Bottleneck Detection

**Automatic detection:**

```typescript
function detectBottlenecks(metrics: PerformanceMetrics) {
  const slowSteps = Object.entries(metrics.stepDurations)
    .filter(([_, duration]) => duration > 5000) // 5 seconds
    .sort(([_, a], [__, b]) => b - a);

  if (slowSteps.length > 0) {
    console.warn(JSON.stringify({
      type: 'bottleneck_detected',
      function: metrics.functionId,
      slowSteps: slowSteps.map(([step, duration]) => ({
        step,
        duration,
        percentOfTotal: (duration / metrics.duration * 100).toFixed(2) + '%',
      })),
    }));
  }
}
```

### 3. Resource Monitoring

**Track resource usage:**

```typescript
await step.run('resource-intensive-task', async () => {
  const startMemory = process.memoryUsage().heapUsed;
  const startTime = Date.now();

  // ... task logic

  const endMemory = process.memoryUsage().heapUsed;
  const duration = Date.now() - startTime;

  await trackResource({
    task: 'resource-intensive-task',
    memoryDelta: endMemory - startMemory,
    duration,
  });
});
```

---

## INTEGRATION TESTING

### 1. Canary Deployments

**Test converted workflows gradually:**

```typescript
// Route 10% of traffic to new converted function
export const processWorkflowCanary = inngest.createFunction(
  {
    id: 'process-workflow-canary',
    rateLimit: {
      limit: 10,
      period: '1m',
    },
  },
  { event: 'app/workflow.trigger' },
  async ({ event, step }) => {
    // Same logic as main function
    // Monitor for errors/performance
  }
);
```

### 2. Shadow Testing

**Run new version alongside old:**

```typescript
export const processWorkflow = inngest.createFunction(
  { id: 'process-workflow' },
  { event: 'app/workflow.trigger' },
  async ({ event, step }) => {
    // Original logic
    const originalResult = await originalWorkflow(event);

    // Shadow test converted version
    try {
      const convertedResult = await step.run('shadow-test', async () => {
        return await convertedWorkflow(event);
      });

      // Compare results
      const match = deepEqual(originalResult, convertedResult);
      await trackShadowTest({
        workflow: 'process-workflow',
        match,
        differences: match ? null : diff(originalResult, convertedResult),
      });
    } catch (error) {
      await trackShadowTestError({
        workflow: 'process-workflow',
        error,
      });
    }

    return originalResult; // Use original until validated
  }
);
```

### 3. Smoke Tests

**Automated validation:**

```typescript
// Run after deployment
async function smokeTest() {
  const tests = [
    {
      name: 'Basic trigger',
      event: { name: 'app/workflow.trigger', data: {} },
      expectedStatus: 'success',
    },
    {
      name: 'With invalid input',
      event: { name: 'app/workflow.trigger', data: { invalid: true } },
      expectedStatus: 'error',
    },
  ];

  for (const test of tests) {
    const result = await inngest.send(test.event);

    // Wait for completion
    await waitForRun(result.id);

    // Validate
    const run = await inngest.getRun(result.id);
    if (run.status !== test.expectedStatus) {
      throw new Error(`Smoke test failed: ${test.name}`);
    }
  }

  console.log('✅ All smoke tests passed');
}
```

---

## DASHBOARD SETUP

### 1. Conversion Dashboard

**Metrics to display:**
- Total workflows converted
- Average conversion time
- Success rate (last 24h, 7d, 30d)
- Pattern coverage trend
- Top warnings
- Node type coverage

**Example (Grafana):**

```json
{
  "dashboard": {
    "title": "n8n → Inngest Conversion Monitoring",
    "panels": [
      {
        "title": "Conversion Success Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(conversions_total{status='success'}[5m]) / rate(conversions_total[5m])"
          }
        ]
      },
      {
        "title": "Average Pattern Coverage",
        "type": "gauge",
        "targets": [
          {
            "expr": "avg(conversion_pattern_coverage)"
          }
        ]
      }
    ]
  }
}
```

### 2. Runtime Dashboard (Inngest)

**Use Inngest's built-in dashboard:**
- Function execution trends
- Error rate graphs
- Step performance breakdown
- Event volume
- Retry patterns

**Access:** https://app.inngest.com/env/[your-env]/functions

### 3. Custom Application Dashboard

**Track business metrics:**
```
- Workflows processed per day
- Average processing time
- Cost per workflow
- API calls made
- Data volume processed
```

---

## BEST PRACTICES

### 1. Start Small
- Monitor 1-2 converted workflows initially
- Expand monitoring as you gain confidence
- Iterate based on learnings

### 2. Set Realistic Thresholds
- Base alerts on actual performance data
- Adjust thresholds after observing normal behavior
- Avoid alert fatigue with too many notifications

### 3. Document Runbooks
- Create response procedures for each alert
- Include troubleshooting steps
- Link to relevant documentation

### 4. Regular Reviews
- Weekly: Review error trends
- Monthly: Analyze performance patterns
- Quarterly: Update monitoring strategy

### 5. Cost Monitoring
- Track Inngest credit usage
- Monitor third-party API costs
- Set budget alerts

---

## MONITORING CHECKLIST

Before production deployment:

- [ ] Conversion metrics logged
- [ ] Structured logging implemented
- [ ] Error tracking configured (Sentry/Datadog)
- [ ] Critical alerts set up
- [ ] Dashboard created
- [ ] Smoke tests written
- [ ] Runbooks documented
- [ ] Team trained on monitoring tools
- [ ] Escalation path defined
- [ ] Cost budgets set

---

## TROUBLESHOOTING GUIDE

### Issue: High Error Rate

**Check:**
1. Error logs for common patterns
2. Recent deployments or changes
3. Third-party API status
4. Environment variable configuration
5. Database connectivity

**Actions:**
1. Roll back if recent deployment
2. Enable debug logging
3. Check API rate limits
4. Verify credentials

### Issue: Slow Performance

**Check:**
1. Step duration breakdown
2. API response times
3. Database query performance
4. Network latency
5. Memory usage

**Actions:**
1. Optimize slow steps
2. Add caching
3. Parallelize independent operations
4. Increase timeout limits if justified

### Issue: Zero Executions

**Check:**
1. Event is being sent to Inngest
2. Function is deployed
3. Trigger configuration correct
4. No rate limiting active

**Actions:**
1. Test event sending manually
2. Check Inngest deployment status
3. Review function configuration
4. Verify environment is active

---

**Next Steps:**
1. Set up monitoring for first production workflow
2. Create initial dashboard
3. Configure critical alerts
4. Run smoke tests
5. Document custom runbooks

**Need Help?**
- Inngest Docs: https://www.inngest.com/docs
- Inngest Discord: https://www.inngest.com/discord
- Converter Issues: https://github.com/your-repo/issues

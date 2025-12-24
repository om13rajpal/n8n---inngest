# n8n to Inngest Conversion Guide

Comprehensive mapping of n8n node types to Inngest SDK constructs for workflow migration.

## Table of Contents

1. [Trigger Nodes](#trigger-nodes)
2. [HTTP Nodes](#http-nodes)
3. [Control Flow Nodes](#control-flow-nodes)
4. [Data Transformation Nodes](#data-transformation-nodes)
5. [Integration Nodes](#integration-nodes)
6. [AI Nodes](#ai-nodes)
7. [Workflow Structure](#workflow-structure)

---

## 1. Trigger Nodes

### 1.1 Manual Trigger (`n8n-nodes-base.manualTrigger`)

**n8n Structure:**
```json
{
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "typeVersion": 1,
  "position": [250, 300],
  "parameters": {}
}
```

**Inngest Equivalent:**
```typescript
// Manual triggers in n8n map to event-driven functions in Inngest
// Triggered by sending events via API or inngest.send()

export const manualWorkflow = inngest.createFunction(
  { id: 'manual-workflow' },
  { event: 'manual/trigger.activated' },
  async ({ event, step }) => {
    // Workflow logic here
    return { success: true };
  }
);

// Trigger manually:
await inngest.send({
  name: 'manual/trigger.activated',
  data: { triggeredBy: 'user' }
});
```

---

### 1.2 Webhook Trigger (`n8n-nodes-base.webhook`)

**n8n Structure:**
```json
{
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 1,
  "position": [250, 300],
  "parameters": {
    "path": "my-webhook-path",
    "httpMethod": "POST",
    "responseMode": "onReceived",
    "responseData": "firstEntryJson",
    "options": {
      "allowedOrigins": "*",
      "responseCode": 200,
      "responseHeaders": {}
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// Webhook endpoint that sends events to Inngest
// Use your framework's HTTP handler (Express, Next.js, etc.)

import { serve } from 'inngest/next';
import { inngest } from './client';

// 1. Create HTTP endpoint to receive webhooks
export async function POST(req: Request) {
  const body = await req.json();

  // Send event to Inngest
  await inngest.send({
    name: 'webhook/received',
    data: body,
    user: { id: body.userId },
    ts: Date.now()
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 2. Function that processes webhook events
export const processWebhook = inngest.createFunction(
  { id: 'process-webhook' },
  { event: 'webhook/received' },
  async ({ event, step }) => {
    // Access webhook data
    const { userId, data } = event.data;

    await step.run('process-webhook-data', async () => {
      // Process the webhook payload
      return processData(data);
    });
  }
);
```

**Key Parameters Mapping:**
- `path` → API route in your framework
- `httpMethod` → HTTP method handler (GET, POST, etc.)
- `responseMode` → Immediate response vs waiting for workflow completion
- `responseCode` → HTTP status code in response
- `allowedOrigins` → CORS configuration in your API route

---

### 1.3 Schedule Trigger (`n8n-nodes-base.scheduleTrigger`)

**n8n Structure:**
```json
{
  "name": "Schedule Trigger",
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1,
  "position": [250, 300],
  "parameters": {
    "rule": {
      "interval": [
        {
          "triggerAtHour": 9,
          "triggerAtMinute": 0,
          "field": "hours",
          "hoursInterval": 6
        }
      ]
    },
    "timezone": "America/New_York"
  }
}
```

**n8n Cron Expression:**
```json
{
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "cronExpression",
          "expression": "0 9 * * 1-5"
        }
      ]
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// Scheduled function using cron
export const scheduledTask = inngest.createFunction(
  { id: 'scheduled-task' },
  { cron: 'TZ=America/New_York 0 9 * * 1-5' }, // 9am weekdays NY time
  async ({ step }) => {
    await step.run('execute-scheduled-task', async () => {
      // Task logic
      return { executed: new Date() };
    });
  }
);

// Every 6 hours
export const sixHourlyTask = inngest.createFunction(
  { id: 'six-hourly-task' },
  { cron: '0 */6 * * *' },
  async ({ step }) => {
    // Runs every 6 hours
  }
);

// Multiple schedules
export const multiSchedule = inngest.createFunction(
  { id: 'multi-schedule' },
  [
    { cron: 'TZ=America/New_York 0 9 * * 1-5' }, // Weekday mornings
    { cron: 'TZ=America/New_York 0 12 * * 6' },  // Saturday noon
  ],
  async ({ step }) => {
    // Runs on multiple schedules
  }
);
```

**Interval Mapping:**
- `seconds` → `*/X * * * * *` (every X seconds)
- `minutes` → `*/X * * * *` (every X minutes)
- `hours` → `0 */X * * *` (every X hours)
- `days` → `0 0 */X * *` (every X days)
- `weeks` → `0 0 * * 0` (Sunday), `0 0 * * 1` (Monday), etc.
- `months` → `0 0 X * *` (Xth day of month)

---

### 1.4 Error Trigger (`n8n-nodes-base.errorTrigger`)

**n8n Structure:**
```json
{
  "name": "Error Trigger",
  "type": "n8n-nodes-base.errorTrigger",
  "typeVersion": 1,
  "position": [250, 300],
  "parameters": {}
}
```

**Inngest Equivalent:**
```typescript
// Use onFailure handler for error handling
export const mainWorkflow = inngest.createFunction(
  {
    id: 'main-workflow',
    retries: 3,
    onFailure: async ({ error, event, step }) => {
      // This is the error workflow
      await step.run('notify-admin', async () => {
        await sendAlert({
          type: 'workflow_failed',
          workflowId: 'main-workflow',
          error: error.message,
          eventId: event.id,
          timestamp: new Date()
        });
      });

      await step.run('log-error', async () => {
        await logger.error('Workflow failed', {
          error: error.stack,
          event: event.data
        });
      });
    }
  },
  { event: 'workflow/execute' },
  async ({ event, step }) => {
    // Main workflow logic
  }
);

// Alternative: Separate error handling function
export const errorHandler = inngest.createFunction(
  { id: 'error-handler' },
  { event: 'workflow/error' },
  async ({ event, step }) => {
    const { workflowId, error, originalEvent } = event.data;

    await step.run('handle-error', async () => {
      // Error handling logic
    });
  }
);
```

---

## 2. HTTP Nodes

### 2.1 HTTP Request (`n8n-nodes-base.httpRequest`)

**n8n Structure:**
```json
{
  "name": "HTTP Request",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 3,
  "position": [450, 300],
  "parameters": {
    "method": "POST",
    "url": "https://api.example.com/data",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendQuery": true,
    "queryParameters": {
      "parameters": [
        {
          "name": "filter",
          "value": "active"
        }
      ]
    },
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "bodyContentType": "json",
    "jsonBody": "={{ $json }}",
    "options": {
      "timeout": 10000,
      "redirect": {
        "followRedirects": true
      }
    }
  }
}
```

**Inngest Equivalent:**
```typescript
export const httpRequestWorkflow = inngest.createFunction(
  { id: 'http-request-workflow' },
  { event: 'http/request.needed' },
  async ({ event, step }) => {
    const response = await step.run('make-http-request', async () => {
      const url = new URL('https://api.example.com/data');
      url.searchParams.set('filter', 'active');

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify(event.data),
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    });

    return response;
  }
);

// With retry logic for rate limits
export const rateLimitedRequest = inngest.createFunction(
  { id: 'rate-limited-request', retries: 5 },
  { event: 'api/call.needed' },
  async ({ event, step }) => {
    const response = await step.run('api-call', async () => {
      const response = await fetch('https://api.example.com/endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.data)
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RetryAfterError(
          'Rate limited',
          retryAfter ? `${retryAfter}s` : '60s'
        );
      }

      return await response.json();
    });

    return response;
  }
);
```

**Method Mapping:**
- `GET`, `POST`, `PUT`, `PATCH`, `DELETE` → Same in fetch()
- `queryParameters` → URLSearchParams
- `headerParameters` → fetch headers object
- `bodyContentType: "json"` → `JSON.stringify()` + Content-Type header
- `bodyContentType: "form-urlencoded"` → URLSearchParams + Content-Type
- `bodyContentType: "multipart-form-data"` → FormData object
- `timeout` → AbortSignal.timeout()

---

### 2.2 Respond to Webhook (`n8n-nodes-base.respondToWebhook`)

**n8n Structure:**
```json
{
  "name": "Respond to Webhook",
  "type": "n8n-nodes-base.respondToWebhook",
  "typeVersion": 1,
  "position": [650, 300],
  "parameters": {
    "respondWith": "json",
    "responseBody": "={{ $json }}",
    "options": {
      "responseCode": 200,
      "responseHeaders": {
        "entries": [
          {
            "name": "X-Custom-Header",
            "value": "custom-value"
          }
        ]
      }
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// In Inngest, responses are handled at the HTTP endpoint level
// Not within the function itself

// HTTP Endpoint (Next.js example)
export async function POST(req: Request) {
  const body = await req.json();

  // Option 1: Immediate response (like responseMode: "onReceived")
  inngest.send({
    name: 'webhook/received',
    data: body
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'custom-value'
    }
  });
}

// Option 2: Wait for workflow to complete (like responseMode: "lastNode")
export async function POST(req: Request) {
  const body = await req.json();

  // Invoke function and wait for result
  const result = await inngest.send({
    name: 'inngest/function.invoke',
    data: {
      function_id: 'process-webhook',
      data: body
    }
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Processing function
export const processWebhook = inngest.createFunction(
  { id: 'process-webhook' },
  { event: 'webhook/received' },
  async ({ event, step }) => {
    const result = await step.run('process', async () => {
      return processData(event.data);
    });

    // Return value for webhook response
    return result;
  }
);
```

---

## 3. Control Flow Nodes

### 3.1 IF Node (`n8n-nodes-base.if`)

**n8n Structure:**
```json
{
  "name": "IF",
  "type": "n8n-nodes-base.if",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "conditions": {
      "boolean": [
        {
          "value1": "={{ $json.status }}",
          "value2": "active"
        }
      ],
      "number": [
        {
          "value1": "={{ $json.amount }}",
          "value2": 1000,
          "operation": "larger"
        }
      ]
    },
    "combineOperation": "all"
  }
}
```

**Inngest Equivalent:**
```typescript
export const conditionalWorkflow = inngest.createFunction(
  { id: 'conditional-workflow' },
  { event: 'data/received' },
  async ({ event, step }) => {
    const { status, amount } = event.data;

    // Method 1: Standard JavaScript if/else
    if (status === 'active' && amount > 1000) {
      await step.run('handle-active-large', async () => {
        return handleActiveLarge(event.data);
      });
    } else {
      await step.run('handle-other', async () => {
        return handleOther(event.data);
      });
    }
  }
);

// Method 2: Use conditional event trigger (filter at trigger level)
export const highPriorityOnly = inngest.createFunction(
  { id: 'high-priority' },
  {
    event: 'data/received',
    if: 'event.data.status == "active" && event.data.amount > 1000'
  },
  async ({ event, step }) => {
    // Only runs for high-priority items
  }
);

export const lowPriority = inngest.createFunction(
  { id: 'low-priority' },
  {
    event: 'data/received',
    if: 'event.data.status != "active" || event.data.amount <= 1000'
  },
  async ({ event, step }) => {
    // Only runs for low-priority items
  }
);

// Method 3: Use step.sendEvent() for branching
export const branchingWorkflow = inngest.createFunction(
  { id: 'branching-workflow' },
  { event: 'data/received' },
  async ({ event, step }) => {
    const { status, amount } = event.data;

    if (status === 'active' && amount > 1000) {
      await step.sendEvent('send-to-high-priority', {
        name: 'process/high-priority',
        data: event.data
      });
    } else {
      await step.sendEvent('send-to-low-priority', {
        name: 'process/low-priority',
        data: event.data
      });
    }
  }
);
```

**Condition Operators:**
- `equal` → `===`
- `notEqual` → `!==`
- `larger` → `>`
- `largerEqual` → `>=`
- `smaller` → `<`
- `smallerEqual` → `<=`
- `contains` → `.includes()`
- `notContains` → `!.includes()`
- `startsWith` → `.startsWith()`
- `endsWith` → `.endsWith()`
- `regex` → `.match()` or `new RegExp().test()`

---

### 3.2 Switch Node (`n8n-nodes-base.switch`)

**n8n Structure:**
```json
{
  "name": "Switch",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "mode": "rules",
    "rules": {
      "rules": [
        {
          "conditions": {
            "string": [
              {
                "value1": "={{ $json.priority }}",
                "value2": "high"
              }
            ]
          },
          "renameOutput": true,
          "outputKey": "high"
        },
        {
          "conditions": {
            "string": [
              {
                "value1": "={{ $json.priority }}",
                "value2": "medium"
              }
            ]
          },
          "renameOutput": true,
          "outputKey": "medium"
        }
      ]
    },
    "fallbackOutput": "extra"
  }
}
```

**Inngest Equivalent:**
```typescript
export const switchWorkflow = inngest.createFunction(
  { id: 'switch-workflow' },
  { event: 'task/received' },
  async ({ event, step }) => {
    const { priority } = event.data;

    // Method 1: Switch statement
    switch (priority) {
      case 'high':
        await step.run('handle-high-priority', async () => {
          return handleHighPriority(event.data);
        });
        break;

      case 'medium':
        await step.run('handle-medium-priority', async () => {
          return handleMediumPriority(event.data);
        });
        break;

      case 'low':
        await step.run('handle-low-priority', async () => {
          return handleLowPriority(event.data);
        });
        break;

      default:
        await step.run('handle-default', async () => {
          return handleDefault(event.data);
        });
    }
  }
);

// Method 2: Multiple functions with conditional triggers
export const highPriority = inngest.createFunction(
  { id: 'high-priority' },
  { event: 'task/received', if: 'event.data.priority == "high"' },
  async ({ event, step }) => {
    // Handle high priority
  }
);

export const mediumPriority = inngest.createFunction(
  { id: 'medium-priority' },
  { event: 'task/received', if: 'event.data.priority == "medium"' },
  async ({ event, step }) => {
    // Handle medium priority
  }
);

export const lowPriority = inngest.createFunction(
  { id: 'low-priority' },
  { event: 'task/received', if: 'event.data.priority == "low"' },
  async ({ event, step }) => {
    // Handle low priority
  }
);

// Method 3: Fan-out to different event types
export const router = inngest.createFunction(
  { id: 'priority-router' },
  { event: 'task/received' },
  async ({ event, step }) => {
    const eventName = `task/priority.${event.data.priority}`;

    await step.sendEvent('route-by-priority', {
      name: eventName,
      data: event.data
    });
  }
);
```

---

### 3.3 Merge Node (`n8n-nodes-base.merge`)

**n8n Structure:**
```json
{
  "name": "Merge",
  "type": "n8n-nodes-base.merge",
  "typeVersion": 2,
  "position": [650, 300],
  "parameters": {
    "mode": "combine",
    "mergeByFields": {
      "values": [
        {
          "field1": "id",
          "field2": "userId"
        }
      ]
    },
    "options": {
      "includeUnpaired": true
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// Inngest handles merging through data composition in steps
export const mergeWorkflow = inngest.createFunction(
  { id: 'merge-workflow' },
  { event: 'data/merge.needed' },
  async ({ event, step }) => {
    // Get data from multiple sources
    const [users, orders] = await Promise.all([
      step.run('fetch-users', async () => {
        return fetchUsers();
      }),
      step.run('fetch-orders', async () => {
        return fetchOrders();
      })
    ]);

    // Merge data by matching fields
    const merged = await step.run('merge-data', async () => {
      return users.map(user => {
        const userOrders = orders.filter(order => order.userId === user.id);
        return {
          ...user,
          orders: userOrders
        };
      });
    });

    return merged;
  }
);

// Alternative: Use step.waitForEvent() for time-based merging
export const eventMerge = inngest.createFunction(
  { id: 'event-merge' },
  { event: 'data/first' },
  async ({ event, step }) => {
    const firstData = event.data;

    // Wait for second event
    const secondEvent = await step.waitForEvent('wait-for-second', {
      event: 'data/second',
      timeout: '1h',
      match: 'data.correlationId'
    });

    if (secondEvent) {
      const merged = await step.run('merge-events', async () => {
        return {
          ...firstData,
          ...secondEvent.data,
          mergedAt: new Date()
        };
      });

      return merged;
    }
  }
);
```

**Merge Modes:**
- `append` → Concatenate arrays: `[...array1, ...array2]`
- `combine` → Merge by matching fields (like SQL JOIN)
- `chooseBranch` → Select one branch's data: `branch === 'input1' ? data1 : data2`

---

### 3.4 Loop Over Items / Split in Batches (`n8n-nodes-base.splitInBatches`)

**n8n Structure:**
```json
{
  "name": "SplitInBatches",
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "batchSize": 10,
    "options": {
      "reset": false
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// Method 1: Process in batches within a single function
export const batchProcessor = inngest.createFunction(
  { id: 'batch-processor' },
  { event: 'data/batch.process' },
  async ({ event, step }) => {
    const items = event.data.items; // Large array
    const batchSize = 10;

    // Process in batches sequentially
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      await step.run(`process-batch-${i}`, async () => {
        // Process this batch
        return Promise.all(batch.map(item => processItem(item)));
      });

      // Optional: Wait between batches to respect rate limits
      if (i + batchSize < items.length) {
        await step.sleep(`wait-after-batch-${i}`, '5s');
      }
    }

    return { processed: items.length };
  }
);

// Method 2: Fan-out pattern (parallel processing)
export const fanOutScheduler = inngest.createFunction(
  { id: 'fan-out-scheduler' },
  { event: 'data/fan-out' },
  async ({ step }) => {
    const items = await step.run('load-items', async () => {
      return loadLargeDataset(); // Returns array of items
    });

    // Send individual events for each item
    const events = items.map(item => ({
      name: 'data/process.item',
      data: item
    }));

    await step.sendEvent('fan-out-items', events);

    return { sentEvents: events.length };
  }
);

// Worker function (processes individual items in parallel)
export const itemProcessor = inngest.createFunction(
  { id: 'item-processor', concurrency: 10 }, // Limit to 10 concurrent
  { event: 'data/process.item' },
  async ({ event, step }) => {
    await step.run('process-item', async () => {
      return processItem(event.data);
    });
  }
);

// Method 3: Batch events (process multiple events together)
export const batchEventProcessor = inngest.createFunction(
  {
    id: 'batch-event-processor',
    batchEvents: {
      maxSize: 10,    // Process up to 10 events together
      timeout: '5s'   // Or wait max 5 seconds
    }
  },
  { event: 'data/item.created' },
  async ({ events, step }) => {
    // `events` is an array of up to 10 events
    const items = events.map(e => e.data);

    await step.run('bulk-process', async () => {
      return bulkProcess(items);
    });

    return { processed: events.length };
  }
);
```

---

### 3.5 Wait Node (`n8n-nodes-base.wait`)

**n8n Structure:**
```json
{
  "name": "Wait",
  "type": "n8n-nodes-base.wait",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "resume": "timeInterval",
    "amount": 30,
    "unit": "seconds"
  }
}
```

**n8n Wait Until Specific Time:**
```json
{
  "parameters": {
    "resume": "specificTime",
    "dateTime": "2024-12-25T00:00:00.000Z"
  }
}
```

**n8n Wait for Webhook:**
```json
{
  "parameters": {
    "resume": "webhook",
    "options": {
      "httpMethod": "POST"
    }
  }
}
```

**Inngest Equivalent:**
```typescript
// Time interval
export const waitInterval = inngest.createFunction(
  { id: 'wait-interval' },
  { event: 'workflow/start' },
  async ({ event, step }) => {
    await step.sleep('wait-30-seconds', '30s');

    await step.run('continue-after-wait', async () => {
      return processNext(event.data);
    });
  }
);

// Wait units mapping
await step.sleep('wait-seconds', '30s');
await step.sleep('wait-minutes', '5m');
await step.sleep('wait-hours', '2h');
await step.sleep('wait-days', '7d');

// Wait until specific time
export const waitUntilTime = inngest.createFunction(
  { id: 'wait-until-time' },
  { event: 'workflow/start' },
  async ({ event, step }) => {
    const targetTime = new Date('2024-12-25T00:00:00Z');
    await step.sleepUntil('wait-until-christmas', targetTime);

    await step.run('christmas-action', async () => {
      return sendChristmasGreeting();
    });
  }
);

// Wait for webhook/event
export const waitForEvent = inngest.createFunction(
  { id: 'wait-for-approval' },
  { event: 'request/submitted' },
  async ({ event, step }) => {
    const approval = await step.waitForEvent('wait-for-approval', {
      event: 'request/approved',
      timeout: '7d',
      match: 'data.requestId' // Match by requestId
    });

    if (!approval) {
      // Timeout - request not approved in 7 days
      await step.run('handle-timeout', async () => {
        return sendReminderEmail(event.data.requestId);
      });
      return { status: 'timeout' };
    }

    // Approved
    await step.run('process-approval', async () => {
      return processApproval(approval.data);
    });

    return { status: 'approved' };
  }
);
```

**Important:** n8n waits < 65 seconds don't offload to database. In Inngest, all sleeps are durable.

---

## 4. Data Transformation Nodes

### 4.1 Set Node (`n8n-nodes-base.set`)

**n8n Structure:**
```json
{
  "name": "Set",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3,
  "position": [450, 300],
  "parameters": {
    "mode": "manual",
    "fields": {
      "values": [
        {
          "name": "fullName",
          "stringValue": "={{ $json.firstName }} {{ $json.lastName }}"
        },
        {
          "name": "total",
          "numberValue": "={{ $json.price * $json.quantity }}"
        },
        {
          "name": "isActive",
          "booleanValue": true
        }
      ]
    },
    "options": {
      "includeBinaryData": false,
      "includeOtherFields": false
    }
  }
}
```

**Inngest Equivalent:**
```typescript
export const setDataWorkflow = inngest.createFunction(
  { id: 'set-data' },
  { event: 'data/transform' },
  async ({ event, step }) => {
    const transformed = await step.run('transform-data', async () => {
      const { firstName, lastName, price, quantity } = event.data;

      return {
        fullName: `${firstName} ${lastName}`,
        total: price * quantity,
        isActive: true,
        timestamp: new Date().toISOString()
      };
    });

    return transformed;
  }
);

// Keep other fields (includeOtherFields: true)
export const setWithKeep = inngest.createFunction(
  { id: 'set-with-keep' },
  { event: 'data/transform' },
  async ({ event, step }) => {
    const transformed = await step.run('transform-data', async () => {
      return {
        ...event.data, // Keep all original fields
        fullName: `${event.data.firstName} ${event.data.lastName}`,
        computedTotal: event.data.price * event.data.quantity
      };
    });

    return transformed;
  }
);
```

---

### 4.2 Code Node (`n8n-nodes-base.code`)

**n8n Structure:**
```json
{
  "name": "Code",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [450, 300],
  "parameters": {
    "language": "javaScript",
    "jsCode": "const items = $input.all();\n\nreturn items.map(item => ({\n  json: {\n    ...item.json,\n    processed: true\n  }\n}));"
  }
}
```

**Inngest Equivalent:**
```typescript
export const codeWorkflow = inngest.createFunction(
  { id: 'code-workflow' },
  { event: 'data/process' },
  async ({ event, step }) => {
    // All custom code goes in step.run()
    const result = await step.run('custom-code', async () => {
      const items = event.data.items; // $input.all() equivalent

      return items.map(item => ({
        ...item,
        processed: true,
        processedAt: new Date().toISOString()
      }));
    });

    return result;
  }
);

// Complex transformation
export const complexCode = inngest.createFunction(
  { id: 'complex-code' },
  { event: 'data/complex' },
  async ({ event, step }) => {
    const result = await step.run('complex-transform', async () => {
      // Any JavaScript/TypeScript code
      const data = event.data;

      // Complex calculations
      const aggregated = data.reduce((acc, item) => {
        const key = item.category;
        if (!acc[key]) {
          acc[key] = { total: 0, count: 0 };
        }
        acc[key].total += item.amount;
        acc[key].count += 1;
        return acc;
      }, {});

      // External libraries (if installed)
      const _ = require('lodash');
      const sorted = _.sortBy(Object.entries(aggregated), ([, v]) => -v.total);

      return Object.fromEntries(sorted);
    });

    return result;
  }
);
```

---

### 4.3 Aggregate Node (`n8n-nodes-base.aggregate`)

**n8n Structure:**
```json
{
  "name": "Aggregate",
  "type": "n8n-nodes-base.aggregate",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "aggregate": "aggregateIndividualFields",
    "fieldsToAggregate": {
      "fieldToAggregate": [
        {
          "fieldToAggregate": "amount",
          "renameField": true,
          "outputFieldName": "totalAmount",
          "aggregation": "sum"
        },
        {
          "fieldToAggregate": "id",
          "renameField": true,
          "outputFieldName": "count",
          "aggregation": "count"
        }
      ]
    }
  }
}
```

**Inngest Equivalent:**
```typescript
export const aggregateWorkflow = inngest.createFunction(
  { id: 'aggregate-workflow' },
  { event: 'data/aggregate' },
  async ({ event, step }) => {
    const aggregated = await step.run('aggregate-data', async () => {
      const items = event.data.items;

      return {
        totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
        count: items.length,
        avgAmount: items.reduce((sum, item) => sum + item.amount, 0) / items.length,
        maxAmount: Math.max(...items.map(item => item.amount)),
        minAmount: Math.min(...items.map(item => item.amount))
      };
    });

    return aggregated;
  }
);

// Group by field
export const groupByAggregate = inngest.createFunction(
  { id: 'group-by-aggregate' },
  { event: 'data/group' },
  async ({ event, step }) => {
    const grouped = await step.run('group-and-aggregate', async () => {
      const items = event.data.items;

      // Group by category
      const groups = items.reduce((acc, item) => {
        const key = item.category;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);
        return acc;
      }, {});

      // Aggregate each group
      return Object.entries(groups).map(([category, groupItems]) => ({
        category,
        totalAmount: groupItems.reduce((sum, item) => sum + item.amount, 0),
        count: groupItems.length,
        avgAmount: groupItems.reduce((sum, item) => sum + item.amount, 0) / groupItems.length
      }));
    });

    return grouped;
  }
);
```

---

## 5. Integration Nodes

### 5.1 Supabase Node (`n8n-nodes-base.supabase`)

**n8n Structure:**
```json
{
  "name": "Supabase",
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "operation": "getAll",
    "tableId": "users",
    "returnAll": false,
    "limit": 100,
    "filterType": "manual",
    "filters": {
      "conditions": [
        {
          "keyName": "status",
          "condition": "equals",
          "keyValue": "active"
        }
      ]
    }
  },
  "credentials": {
    "supabaseApi": {
      "id": "1",
      "name": "Supabase account"
    }
  }
}
```

**Inngest Equivalent:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export const supabaseQuery = inngest.createFunction(
  { id: 'supabase-query' },
  { event: 'supabase/query.needed' },
  async ({ event, step }) => {
    const data = await step.run('query-supabase', async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .limit(100);

      if (error) throw error;
      return data;
    });

    return data;
  }
);

// Insert
export const supabaseInsert = inngest.createFunction(
  { id: 'supabase-insert' },
  { event: 'user/created' },
  async ({ event, step }) => {
    const result = await step.run('insert-user', async () => {
      const { data, error } = await supabase
        .from('users')
        .insert([event.data])
        .select();

      if (error) throw error;
      return data;
    });

    return result;
  }
);

// Update
export const supabaseUpdate = inngest.createFunction(
  { id: 'supabase-update' },
  { event: 'user/updated' },
  async ({ event, step }) => {
    const result = await step.run('update-user', async () => {
      const { data, error } = await supabase
        .from('users')
        .update(event.data.updates)
        .eq('id', event.data.userId)
        .select();

      if (error) throw error;
      return data;
    });

    return result;
  }
);
```

**Supabase Operations:**
- `getAll` → `.select().limit()`
- `get` → `.select().eq('id', id).single()`
- `insert` → `.insert()`
- `update` → `.update().eq()`
- `delete` → `.delete().eq()`

---

### 5.2 Firecrawl Node (`n8n-nodes-firecrawl`)

**n8n Structure:**
```json
{
  "name": "Firecrawl",
  "type": "n8n-nodes-firecrawl",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "operation": "scrape",
    "url": "https://example.com",
    "formats": ["markdown", "html"],
    "options": {
      "onlyMainContent": true,
      "includeTags": ["article", "main"],
      "excludeTags": ["nav", "footer"]
    }
  }
}
```

**Inngest Equivalent:**
```typescript
import FirecrawlApp from '@mendable/firecrawl-js';

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY
});

export const scrapeWebsite = inngest.createFunction(
  { id: 'scrape-website' },
  { event: 'scrape/url' },
  async ({ event, step }) => {
    const scraped = await step.run('scrape-page', async () => {
      const result = await firecrawl.scrapeUrl(event.data.url, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        includeTags: ['article', 'main'],
        excludeTags: ['nav', 'footer']
      });

      return result;
    });

    return scraped;
  }
);

// Crawl entire site
export const crawlWebsite = inngest.createFunction(
  { id: 'crawl-website' },
  { event: 'crawl/site' },
  async ({ event, step }) => {
    const crawled = await step.run('crawl-site', async () => {
      const result = await firecrawl.crawlUrl(event.data.url, {
        limit: 100,
        scrapeOptions: {
          formats: ['markdown']
        }
      });

      return result;
    });

    return crawled;
  }
);
```

---

## 6. AI Nodes

### 6.1 OpenAI Node (`n8n-nodes-langchain.openai`)

**n8n Structure:**
```json
{
  "name": "OpenAI Chat Model",
  "type": "n8n-nodes-langchain.lmChatOpenAi",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "model": "gpt-4o",
    "options": {
      "temperature": 0.7,
      "maxTokens": 2000,
      "topP": 1,
      "frequencyPenalty": 0,
      "presencePenalty": 0
    }
  }
}
```

**Inngest Equivalent:**
```typescript
export const openaiChat = inngest.createFunction(
  { id: 'openai-chat' },
  { event: 'ai/chat.request' },
  async ({ event, step }) => {
    const response = await step.ai.infer('openai-completion', {
      model: step.ai.models.openai({
        model: 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY
      }),
      body: {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: event.data.prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }
    });

    return response.choices[0].message.content;
  }
);

// With structured output
export const structuredOutput = inngest.createFunction(
  { id: 'structured-output' },
  { event: 'ai/extract.data' },
  async ({ event, step }) => {
    const extracted = await step.ai.infer('extract-structured', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [
          { role: 'user', content: event.data.text }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extraction',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                company: { type: 'string' }
              },
              required: ['name', 'email']
            }
          }
        }
      }
    });

    return JSON.parse(extracted.choices[0].message.content);
  }
);
```

---

### 6.2 AI Agent Node (`n8n-nodes-langchain.agent`)

**n8n Structure:**
```json
{
  "name": "AI Agent",
  "type": "n8n-nodes-langchain.agent",
  "typeVersion": 1,
  "position": [450, 300],
  "parameters": {
    "agentType": "conversationalAgent",
    "promptType": "define",
    "text": "={{ $json.chatInput }}",
    "hasOutputParser": true
  }
}
```

**Inngest Equivalent:**
```typescript
import { createAgent, createNetwork, openai } from '@inngest/agent-kit';
import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';

// Define tools
const searchTool = createTool({
  name: 'search',
  description: 'Search for information',
  parameters: z.object({
    query: z.string().describe('Search query')
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run('search', async () => {
      return performSearch(query);
    });
  }
});

const calculatorTool = createTool({
  name: 'calculator',
  description: 'Perform calculations',
  parameters: z.object({
    expression: z.string().describe('Math expression to evaluate')
  }),
  handler: async ({ expression }) => {
    return eval(expression);
  }
});

// Create agent
const agent = createAgent({
  name: 'Conversational Agent',
  system: 'You are a helpful AI assistant.',
  tools: [searchTool, calculatorTool],
  model: openai({
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY
  })
});

// Create network
const network = createNetwork({
  name: 'AI Network',
  agents: [agent],
  defaultModel: openai({ model: 'gpt-4o' }),
  maxIter: 10
});

// Inngest function
export const aiAgent = inngest.createFunction(
  { id: 'ai-agent' },
  { event: 'ai/agent.request' },
  async ({ event, step }) => {
    const result = await network.run(event.data.prompt);
    return result;
  }
);
```

---

## 7. Workflow Structure

### 7.1 n8n Workflow JSON Structure

```json
{
  "name": "Example Workflow",
  "nodes": [
    {
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "https://api.example.com/data",
        "method": "POST"
      },
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [450, 300]
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "HTTP Request",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 7.2 Inngest Equivalent

```typescript
// Single file with multiple functions
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'my-app' });

// Trigger function
export const manualTrigger = inngest.createFunction(
  { id: 'manual-workflow' },
  { event: 'workflow/manual.trigger' },
  async ({ event, step }) => {
    // HTTP Request step
    const response = await step.run('http-request', async () => {
      const response = await fetch('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.data)
      });
      return await response.json();
    });

    return response;
  }
);

// Export all functions
export default [manualTrigger];
```

---

## Key Differences Summary

| Aspect | n8n | Inngest |
|--------|-----|---------|
| **Execution** | Visual workflow canvas | Code-based functions |
| **Triggers** | Node-based (webhook, schedule, manual) | Event-driven + cron |
| **Branching** | IF/Switch nodes with visual outputs | JavaScript if/switch or conditional triggers |
| **Loops** | SplitInBatches node | for loops, Promise.all(), or fan-out pattern |
| **Waiting** | Wait node | step.sleep(), step.sleepUntil() |
| **Event Sync** | Webhook wait | step.waitForEvent() |
| **Data Transform** | Set/Code nodes | step.run() with JavaScript/TypeScript |
| **Error Handling** | Error Trigger workflow | onFailure handler, try/catch |
| **Retries** | Node-level retry settings | Function-level retries config |
| **HTTP Calls** | HTTP Request node | fetch() in step.run() |
| **State** | Implicit between nodes | Explicit step memoization |
| **Parallelization** | Multiple node branches | Promise.all() or fan-out |
| **Credentials** | Centralized credential store | Environment variables |

---

## Migration Strategy

### 1. Identify Workflow Pattern
- **Linear workflows** → Single Inngest function with sequential steps
- **Branching workflows** → Conditional logic or multiple functions
- **Fan-out patterns** → step.sendEvent() + worker functions
- **Long-running with waits** → step.sleep() or step.waitForEvent()

### 2. Map Triggers
- Manual → Event-driven function
- Webhook → HTTP endpoint + event sender
- Schedule → Cron trigger
- Error → onFailure handler

### 3. Convert Nodes to Steps
- Each n8n node becomes a `step.run()` call
- Maintain step IDs for debugging
- Group related operations in single steps

### 4. Handle Data Flow
- n8n's `$json` → TypeScript function parameters
- n8n expressions → JavaScript template literals or expressions
- Node outputs → Step return values

### 5. Test Incrementally
- Start with simple workflows
- Test each step independently
- Verify error handling
- Confirm retries work as expected

---

## Sources

- [n8n Node Types Documentation](https://docs.n8n.io/integrations/builtin/node-types/)
- [n8n Webhook Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n HTTP Request Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [n8n Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/)
- [n8n IF Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/)
- [n8n Switch Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch/)
- [n8n Loop Over Items](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/)
- [n8n Wait Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/)
- [n8n Code Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/)
- [n8n Error Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/)
- [n8n Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
- [n8n Compare Datasets](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.comparedatasets/)
- [n8n Aggregate Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/)
- [n8n Supabase Integration](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/)
- [Firecrawl with n8n](https://www.firecrawl.dev/blog/firecrawl-n8n-web-automation)
- [n8n AI Agent Node](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
- [n8n OpenAI Functions Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/openai-functions-agent/)
- [n8n Workflow Export/Import](https://docs.n8n.io/workflows/export-import/)
- [Inngest Functions Documentation](https://www.inngest.com/docs/learn/inngest-functions)
- [Inngest Steps Documentation](https://www.inngest.com/docs/learn/inngest-steps)
- [Inngest Multi-Step Functions](https://www.inngest.com/docs/guides/multi-step-functions)
- [Inngest Wait for Event](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)
- [Inngest Sleeps](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps)
- [Inngest Events & Triggers](https://www.inngest.com/docs/features/events-triggers)

---

*Generated by Hive Mind Research Agent - 2024-12-24*

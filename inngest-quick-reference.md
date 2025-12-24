# Inngest SDK Quick Reference Card

Fast lookup for common Inngest patterns and code snippets.

---

## Basic Setup

### Initialize Client
```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'my-app' });
```

### Export for Serve Handler
```typescript
import { serve } from 'inngest/next';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [myFunction1, myFunction2],
});
```

---

## Function Triggers

| Pattern | Code |
|---------|------|
| **Event** | `{ event: 'app/user.created' }` |
| **Cron** | `{ cron: '0 9 * * *' }` |
| **Cron with TZ** | `{ cron: 'TZ=America/New_York 0 9 * * 1-5' }` |
| **Conditional** | `{ event: 'app/signup', if: 'event.data.plan == "pro"' }` |
| **Multiple** | `[{ event: 'user.created' }, { cron: '0 5 * * *' }]` |

---

## Step Functions

### step.run()
```typescript
await step.run('step-id', async () => {
  return await externalAPI.call();
});
```

### step.sleep()
```typescript
await step.sleep('wait-1-hour', '1h');
await step.sleep('wait-until', new Date('2024-12-25'));
```

### step.waitForEvent()
```typescript
const event = await step.waitForEvent('wait', {
  event: 'app/approval',
  timeout: '7d',
  match: 'data.invoiceId',
});

if (!event) {
  // Timeout - event not received
}
```

### step.sendEvent()
```typescript
// Single
await step.sendEvent('send', {
  name: 'app/user.activated',
  data: { userId: '123' },
});

// Batch
await step.sendEvent('batch', [
  { name: 'app/event1', data: {...} },
  { name: 'app/event2', data: {...} },
]);
```

### step.invoke()
```typescript
const result = await step.invoke('invoke', {
  function: otherFunction,
  data: { input: 'value' },
  timeout: '1h',
});
```

---

## AI Integration

### Basic Inference
```typescript
const result = await step.ai.infer('inference', {
  model: step.ai.models.openai({ model: 'gpt-4o' }),
  body: {
    messages: [
      { role: 'user', content: 'Your prompt here' }
    ],
  },
});

const content = result.choices[0].message.content;
```

### Create Agent
```typescript
import { createAgent, openai } from '@inngest/agent-kit';

const agent = createAgent({
  name: 'Assistant',
  system: 'You are a helpful assistant.',
  model: openai({ model: 'gpt-4o' }),
  tools: [myTool],
});
```

### Create Tool
```typescript
import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';

const myTool = createTool({
  name: 'search_database',
  description: 'Search for information',
  parameters: z.object({
    query: z.string(),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run('search', async () => {
      return database.search(query);
    });
  },
});
```

---

## Error Handling

### Automatic Retries
```typescript
{
  id: 'my-function',
  retries: 5,
}
```

### onFailure
```typescript
{
  id: 'my-function',
  onFailure: async ({ error, event, step }) => {
    await step.run('alert', () => sendAlert(error));
  },
}
```

### RetryAfterError
```typescript
import { RetryAfterError } from 'inngest';

if (rateLimited) {
  throw new RetryAfterError('Rate limited', '5m');
}
```

### Try/Catch Recovery
```typescript
try {
  await step.run('primary', () => primaryAPI());
} catch (err) {
  await step.run('backup', () => backupAPI());
}
```

### Cancellation
```typescript
{
  id: 'my-function',
  cancelOn: [
    { event: 'app/user.deleted', match: 'data.userId' },
  ],
}
```

---

## Flow Control

### Concurrency
```typescript
// Simple
{ concurrency: 10 }

// Per-key
{
  concurrency: {
    limit: 1,
    key: 'event.data.userId',
  }
}

// Multiple scopes
{
  concurrency: [
    { scope: 'account', key: '"openai"', limit: 60 },
    { scope: 'fn', key: 'event.data.userId', limit: 1 },
  ]
}
```

### Rate Limiting
```typescript
{
  rateLimit: {
    limit: 1,
    period: '4h',
    key: 'event.data.companyId',
  }
}
```

### Throttling
```typescript
{
  throttle: {
    limit: 1,
    period: '5s',
    burst: 2,
    key: 'event.data.userId',
  }
}
```

### Batching
```typescript
{
  batchEvents: {
    maxSize: 100,
    timeout: '5s',
  }
}
```

### Debouncing
```typescript
{
  debounce: {
    period: '5s',
    key: 'event.data.userId',
  }
}
```

---

## Middleware

### Basic Structure
```typescript
import { InngestMiddleware } from 'inngest';

const middleware = new InngestMiddleware({
  name: 'My Middleware',
  init() {
    return {
      onFunctionRun() {
        return {
          transformInput({ ctx }) {
            return {
              ctx: { custom: 'value' },
            };
          },
        };
      },
    };
  },
});
```

### Register
```typescript
// Client-level
new Inngest({
  id: 'my-app',
  middleware: [middleware1, middleware2],
});

// Function-level
inngest.createFunction(
  {
    id: 'my-function',
    middleware: [middleware3],
  },
  ...
);
```

---

## CEL Expressions

| Use Case | Expression |
|----------|-----------|
| **String match** | `event.data.plan == "pro"` |
| **Number compare** | `event.data.amount > 1000` |
| **AND condition** | `event.data.plan == "pro" && event.data.amount > 1000` |
| **OR condition** | `event.data.plan != "free" \|\| event.data.trial` |
| **Event matching** | `event.data.userId == async.data.userId` |

---

## Time Formats

| Duration | Format |
|----------|--------|
| **Seconds** | `"30s"` or `"30 seconds"` |
| **Minutes** | `"5m"` or `"5 minutes"` |
| **Hours** | `"2h"` or `"2 hours"` |
| **Days** | `"7d"` or `"7 days"` |
| **Weeks** | `"2w"` or `"2 weeks"` |

---

## Cron Patterns

| Schedule | Expression |
|----------|-----------|
| **Every hour** | `"0 * * * *"` |
| **Every 2 hours** | `"0 */2 * * *"` |
| **Daily at 9am** | `"0 9 * * *"` |
| **Weekdays at 9am** | `"0 9 * * 1-5"` |
| **First of month** | `"0 0 1 * *"` |
| **Every Friday noon** | `"0 12 * * 5"` |
| **With timezone** | `"TZ=America/New_York 0 9 * * 1-5"` |

---

## Complete Function Template

```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'my-app' });

export const myFunction = inngest.createFunction(
  {
    id: 'unique-function-id',
    name: 'Descriptive Function Name',

    // Flow control
    concurrency: { limit: 10, key: 'event.data.userId' },
    rateLimit: { limit: 1, period: '1h', key: 'event.data.userId' },

    // Error handling
    retries: 3,
    onFailure: async ({ error, event, step }) => {
      await step.run('notify', () => notifyAdmin(error));
    },

    // Cancellation
    cancelOn: [
      { event: 'app/user.deleted', match: 'data.userId' },
    ],
  },

  // Trigger
  { event: 'app/event.triggered' },

  // Handler
  async ({ event, step }) => {
    // Step 1: External API call
    const data = await step.run('fetch-data', async () => {
      return await externalAPI.fetch(event.data.id);
    });

    // Step 2: Process data
    const processed = await step.run('process', () => {
      return processData(data);
    });

    // Step 3: Wait for approval
    const approval = await step.waitForEvent('wait-approval', {
      event: 'app/approval.received',
      timeout: '7d',
      match: 'data.requestId',
    });

    if (!approval) {
      // Timeout
      return { status: 'timeout' };
    }

    // Step 4: Send notification
    await step.sendEvent('send-notification', {
      name: 'app/notification.send',
      data: { userId: event.data.userId },
    });

    return { status: 'success', data: processed };
  }
);
```

---

## Model Configurations

### OpenAI
```typescript
import { openai } from '@inngest/agent-kit';

const model = openai({
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
  defaultParameters: {
    temperature: 0.7,
    max_tokens: 2000,
  },
});
```

### Anthropic
```typescript
import { anthropic } from '@inngest/agent-kit';

const model = anthropic({
  model: 'claude-3-5-sonnet-20240620',
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultParameters: {
    max_tokens: 4096, // Required for Anthropic
    temperature: 0.7,
  },
});
```

### Gemini
```typescript
import { gemini } from '@inngest/agent-kit';

const model = gemini({
  model: 'gemini-1.5-pro',
  apiKey: process.env.GOOGLE_API_KEY,
  defaultParameters: {
    maxOutputTokens: 2048,
  },
});
```

### Grok
```typescript
import { grok } from '@inngest/agent-kit';

const model = grok({
  model: 'grok-beta',
  apiKey: process.env.XAI_API_KEY,
  defaultParameters: {
    temperature: 0.5,
  },
});
```

---

## Sending Events

### From Application Code
```typescript
await inngest.send({
  name: 'app/user.created',
  data: {
    userId: '123',
    email: 'user@example.com',
  },
  user: {
    id: '123',
  },
});
```

### Batch Send
```typescript
await inngest.send([
  { name: 'app/event1', data: {...} },
  { name: 'app/event2', data: {...} },
]);
```

### Scheduled Event
```typescript
await inngest.send({
  name: 'app/reminder',
  data: { message: 'Hello' },
  ts: Date.now() + 5 * 60 * 1000, // 5 minutes from now
});
```

---

## Common Patterns

### Fan-out (Parallel Processing)
```typescript
// Scheduler
inngest.createFunction(
  { id: 'scheduler' },
  { cron: '0 0 * * *' },
  async ({ step }) => {
    const items = await step.run('load', () => db.loadAll());
    await step.sendEvent('fan-out', items.map(item => ({
      name: 'item/process',
      data: item,
    })));
  }
);

// Worker
inngest.createFunction(
  { id: 'worker' },
  { event: 'item/process' },
  async ({ event, step }) => {
    await step.run('process', () => processItem(event.data));
  }
);
```

### Human-in-the-Loop
```typescript
inngest.createFunction(
  { id: 'approval-flow' },
  { event: 'request/submitted' },
  async ({ event, step }) => {
    await step.run('notify', () => sendApprovalRequest(event.data));

    const approval = await step.waitForEvent('wait', {
      event: 'request/approved',
      timeout: '7d',
      match: 'data.requestId',
    });

    if (approval) {
      await step.run('process', () => processRequest(event.data));
    } else {
      await step.run('reject', () => rejectRequest(event.data));
    }
  }
);
```

### API Rate Limiting
```typescript
inngest.createFunction(
  {
    id: 'api-calls',
    concurrency: {
      scope: 'account',
      key: '"external-api"',
      limit: 10, // Max 10 concurrent calls to external API
    },
  },
  { event: 'api/call.requested' },
  async ({ event, step }) => {
    try {
      return await step.run('call-api', () => externalAPI.call(event.data));
    } catch (err) {
      if (err.statusCode === 429) {
        throw new RetryAfterError('Rate limited', err.retryAfter);
      }
      throw err;
    }
  }
);
```

### Multi-step AI Workflow
```typescript
inngest.createFunction(
  { id: 'ai-workflow' },
  { event: 'ai/research' },
  async ({ event, step }) => {
    // Generate queries
    const queries = await step.ai.infer('generate', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{ role: 'user', content: `Generate search queries for: ${event.data.topic}` }],
      },
    });

    // Execute searches in parallel
    const results = await Promise.all(
      queries.choices[0].message.content.split('\n').map((q, i) =>
        step.run(`search-${i}`, () => searchWeb(q))
      )
    );

    // Summarize
    const summary = await step.ai.infer('summarize', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{
          role: 'user',
          content: `Summarize: ${results.join('\n')}`
        }],
      },
    });

    return summary.choices[0].message.content;
  }
);
```

---

## Debugging Tips

1. **Check function logs** in Inngest Dashboard
2. **Use descriptive step IDs** for easy identification
3. **Return meaningful data** from steps for debugging
4. **Set reasonable timeouts** to avoid hanging functions
5. **Test locally** with Inngest Dev Server: `npx inngest-cli dev`
6. **Use onFailure** handlers to capture errors
7. **Validate event data** early in function
8. **Check concurrency limits** if functions are queued

---

## Environment Variables

```bash
# Required
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key

# Optional
INNGEST_DEV=true  # Enable dev mode
INNGEST_BASE_URL=https://your-app.com/api/inngest  # Custom endpoint
```

---

## TypeScript Types

### Event Type
```typescript
type MyEvent = {
  name: 'app/user.created';
  data: {
    userId: string;
    email: string;
    plan: 'free' | 'pro' | 'enterprise';
  };
};

inngest.createFunction(
  { id: 'typed-function' },
  { event: 'app/user.created' },
  async ({ event }: { event: MyEvent }) => {
    // event.data is fully typed
  }
);
```

### Function Return Type
```typescript
const myFunction = inngest.createFunction(
  { id: 'my-function' },
  { event: 'app/event' },
  async ({ event, step }): Promise<{ success: boolean; data: any }> => {
    return { success: true, data: {} };
  }
);

type ReturnType = Awaited<ReturnType<typeof myFunction>>;
```

---

*Quick Reference for Inngest SDK v3.x - Hive Mind Coder Agent*

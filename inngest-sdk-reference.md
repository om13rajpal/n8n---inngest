# Inngest SDK Code Generation Reference

Comprehensive patterns and templates for generating Inngest SDK code.

## Table of Contents

1. [Function Creation Patterns](#function-creation-patterns)
2. [Step Patterns](#step-patterns)
3. [Error Handling](#error-handling)
4. [AI/AgentKit Integration](#ai-agentkit-integration)
5. [Middleware and Context](#middleware-and-context)
6. [Advanced Patterns](#advanced-patterns)

---

## 1. Function Creation Patterns

### 1.1 Basic Event Trigger

```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'my-app' });

export default inngest.createFunction(
  { id: 'function-id' },
  { event: 'app/event.name' },
  async ({ event, step }) => {
    // Access event data
    const { userId, data } = event.data;

    // Function logic here
    return { success: true };
  }
);
```

**Template Variables:**
- `{APP_ID}`: Unique application identifier
- `{FUNCTION_ID}`: Unique function identifier
- `{EVENT_NAME}`: Event trigger name (format: `namespace/action.name`)
- `{EVENT_DATA_FIELDS}`: Destructured event data fields

---

### 1.2 Cron Trigger (Scheduled Function)

```typescript
export default inngest.createFunction(
  { id: 'scheduled-task' },
  { cron: 'TZ=America/New_York 0 9 * * 1-5' }, // 9am weekdays in NY timezone
  async ({ step }) => {
    // No event parameter for cron triggers
    await step.run('execute-task', async () => {
      // Scheduled task logic
      return { executed: new Date() };
    });
  }
);
```

**Cron Format:**
- Standard Unix cron: `minute hour day month weekday`
- Optional timezone prefix: `TZ={timezone}`
- Common examples:
  - `"0 */2 * * *"` - Every 2 hours
  - `"0 12 * * 5"` - Noon every Friday
  - `"TZ=Europe/Paris 0 12 * * 5"` - Noon Friday Paris time

---

### 1.3 Multiple Triggers

```typescript
export default inngest.createFunction(
  { id: 'resync-user-data' },
  [
    { event: 'user.created' },
    { event: 'user.updated' },
    { cron: '0 5 * * *' }, // Daily at 5am
  ],
  async ({ event, step }) => {
    // Handle both event-triggered and scheduled runs
    const userId = event?.data?.userId;

    await step.run('sync-data', async () => {
      // Sync logic
    });
  }
);
```

**Limitations:** Up to 10 unique triggers per function

---

### 1.4 Conditional Event Trigger

```typescript
export default inngest.createFunction(
  { id: 'priority-handler' },
  {
    event: 'app/account.created',
    if: 'event.data.priority >= 4' // CEL expression
  },
  async ({ event, step }) => {
    // Only processes high-priority events
  }
);
```

**CEL Expression Examples:**
```javascript
// String matching
"event.data.billingPlan == 'enterprise'"

// Number comparison
"event.data.amount > 1000"

// Combining conditions
"event.data.billingPlan == 'enterprise' && event.data.amount > 1000"
"event.data.billingPlan != 'pro' || event.data.amount < 300"
```

---

### 1.5 Development vs Production Triggers

```typescript
export default inngest.createFunction(
  { id: 'conditional-trigger' },
  process.env.NODE_ENV === 'production'
    ? { cron: '0 5 * * *' }
    : { event: 'dev/manual-trigger' },
  async ({ event, step }) => {
    // Production: runs on schedule
    // Development: runs on manual event
  }
);
```

---

## 2. Step Patterns

### 2.1 step.run() - Execute Retriable Code

```typescript
await step.run('step-id', async () => {
  // Automatically retried on error
  // Result is memoized on success
  const data = await fetch('https://api.example.com/data').then(r => r.json());
  return data;
});

// Synchronous handlers
const result = await step.run('transform', () => {
  return transformData(input);
});

// No return value needed
await step.run('insert-data', async () => {
  await db.insert(data);
});
```

**Key Features:**
- Automatic retries on failure
- State memoization on success
- Supports sync/async/Promise handlers
- Return values serialized as JSON

---

### 2.2 step.sleep() - Time-based Delays

```typescript
// Sleep for duration
await step.sleep('wait-30-seconds', '30s');
await step.sleep('wait-1-hour', '1h');
await step.sleep('wait-2-days', '2d');

// Sleep until specific time
await step.sleepUntil('wait-until-midnight', new Date('2024-12-25T00:00:00Z'));
```

**Duration Format:** Compatible with [ms](https://npm.im/ms) package
- `"30s"`, `"5m"`, `"2h"`, `"7d"`
- `"30 seconds"`, `"5 minutes"`, `"2 hours"`

---

### 2.3 step.waitForEvent() - Event Synchronization

```typescript
// Basic usage with property matching
const approvalEvent = await step.waitForEvent('wait-for-approval', {
  event: 'app/invoice.approved',
  timeout: '7d',
  match: 'data.invoiceId', // Matches invoiceId between events
});

// Advanced: Conditional matching with CEL
const subscription = await step.waitForEvent('wait-for-subscription', {
  event: 'app/subscription.created',
  timeout: '30d',
  if: 'event.data.userId == async.data.userId && async.data.billing_plan == "pro"',
});

// Handle timeout (returns null)
if (!approvalEvent) {
  // Event not received within timeout
  await step.run('send-reminder', async () => {
    await sendReminderEmail();
  });
}
```

**Match vs If:**
- `match`: Simple property matching (e.g., `"data.userId"`)
- `if`: Complex CEL expressions comparing original event (`event`) and waited event (`async`)

---

### 2.4 step.sendEvent() - Fan-out Pattern

```typescript
// Send single event
await step.sendEvent('send-activation-event', {
  name: 'app/user.activated',
  data: { userId: event.data.userId },
});

// Send multiple events (batch)
const events = users.map(user => ({
  name: 'app/send.weekly.digest',
  data: {
    user_id: user.id,
    email: user.email,
  },
}));

await step.sendEvent('fan-out-digest-events', events);
```

**Complete Fan-out Example:**
```typescript
// Scheduler function
export const prepareWeeklyDigest = inngest.createFunction(
  { id: 'prepare-weekly-digest' },
  { cron: 'TZ=Europe/Paris 0 12 * * 5' },
  async ({ step }) => {
    const users = await step.run('load-users', async () => {
      return db.load('SELECT * FROM users');
    });

    const events = users.map(user => ({
      name: 'app/send.weekly.digest',
      data: {
        user_id: user.id,
        email: user.email,
      },
    }));

    await step.sendEvent('send-digest-events', events);

    return { count: users.length };
  }
);

// Worker function (runs in parallel for each event)
export const sendWeeklyDigest = inngest.createFunction(
  { id: 'send-weekly-digest-email' },
  { event: 'app/send.weekly.digest' },
  async ({ event }) => {
    const { email, user_id } = event.data;
    await emailService.send('weekly_digest', email, user_id);
  }
);
```

---

### 2.5 step.invoke() - Function Composition

```typescript
// Define reusable function
export const computeSquare = inngest.createFunction(
  { id: 'compute-square' },
  { event: 'calculate/square' },
  async ({ event }) => {
    return { result: event.data.number * event.data.number };
  }
);

// Invoke from another function
export const mainFunction = inngest.createFunction(
  { id: 'main-function' },
  { event: 'main/event' },
  async ({ step }) => {
    const square = await step.invoke('compute-square-value', {
      function: computeSquare,
      data: { number: 4 },
    });

    console.log(square.result); // 16 (typed)
    return `Square of 4 is ${square.result}`;
  }
);

// With timeout
await step.invoke('invoke-with-timeout', {
  function: anotherFunction,
  data: { ... },
  timeout: '1h', // Throws error if not complete in 1 hour
});

// Parallel invocations
const [result1, result2] = await Promise.all([
  step.invoke('invoke-first', { function: firstFn, data: {...} }),
  step.invoke('invoke-second', { function: secondFn, data: {...} }),
]);
```

**Cross-App Invocation:** Works across different apps (app ID is part of function reference)

---

## 3. Error Handling

### 3.1 Automatic Retries

```typescript
export default inngest.createFunction(
  {
    id: 'send-user-email',
    retries: 5, // Default retry count
  },
  { event: 'user/created' },
  async ({ event, step }) => {
    await step.run('send-email', async () => {
      const result = await emailService.send({
        to: event.data.email,
        template: 'welcome',
      });

      if (!result.success) {
        throw new Error('Email failed to send');
      }

      return result;
    });
  }
);
```

---

### 3.2 RetryAfterError - Custom Retry Timing

```typescript
import { RetryAfterError } from 'inngest';

export default inngest.createFunction(
  { id: 'send-welcome-sms' },
  { event: 'app/user.created' },
  async ({ event, step }) => {
    await step.run('send-sms', async () => {
      const result = await twilio.messages.create({
        to: event.data.user.phoneNumber,
        body: 'Welcome to our service!',
      });

      // Handle rate limiting
      if (result.status === 429 && result.retryAfter) {
        throw new RetryAfterError(
          'Hit Twilio rate limit',
          result.retryAfter // Duration or Date
        );
      }

      return result;
    });
  }
);
```

**Use Cases:**
- API rate limiting
- Race conditions
- External service throttling

---

### 3.3 onFailure Handler

```typescript
export default inngest.createFunction(
  {
    id: 'import-product-images',
    onFailure: async ({ error, event, step }) => {
      // Called after all retries exhausted
      await step.run('notify-admin', async () => {
        await notificationService.send({
          channel: 'alerts',
          message: `Import failed for product ${event.data.productId}`,
          error: error.message,
        });
      });

      await step.run('log-to-monitoring', async () => {
        await logger.error('Product import failed', {
          productId: event.data.productId,
          error: error.stack,
          eventId: event.id,
        });
      });
    },
  },
  { event: 'shop/product.imported' },
  async ({ event, step }) => {
    // Main function logic
  }
);
```

---

### 3.4 Step Error Recovery with try/catch

```typescript
export default inngest.createFunction(
  { id: 'send-weather-forecast' },
  { event: 'weather/forecast.requested' },
  async ({ event, step }) => {
    let data;

    try {
      data = await step.run('get-public-weather-data', async () => {
        return await fetch('https://api.weather.com/data').then(r => r.json());
      });
    } catch (err) {
      // err is instance of StepError
      // Recover with backup step
      data = await step.run('use-backup-weather-api', async () => {
        return await fetch('https://api.stormwaters.com/data').then(r => r.json());
      });
    }

    // Continue with data
    await step.run('send-forecast', async () => {
      await emailService.send({ data });
    });
  }
);
```

**Alternative: Chaining with .catch()**
```typescript
const data = await step
  .run('get-public-weather-data', async () => {
    return await fetch('https://api.weather.com/data').then(r => r.json());
  })
  .catch((err) => {
    // Recover with chained step
    return step.run('use-backup-weather-api', async () => {
      return fetch('https://api.stormwaters.com/data').then(r => r.json());
    });
  });
```

---

### 3.5 Function Cancellation

```typescript
export default inngest.createFunction(
  {
    id: 'sync-contacts',
    cancelOn: [
      {
        event: 'app/user.deleted',
        if: 'async.data.userId == event.data.userId',
      },
      {
        event: 'app/subscription.cancelled',
        match: 'data.userId',
      },
    ],
  },
  { event: 'app/user.created' },
  async ({ event, step }) => {
    // Long-running sync process
    await step.sleep('wait-for-verification', '7d');
    // Cancelled if user deleted before 7 days
  }
);
```

---

## 4. AI/AgentKit Integration

### 4.1 step.ai.infer() - Model Inference

```typescript
import { inngest } from './client';

export const researchWebTool = inngest.createFunction(
  { id: 'research-web-tool' },
  { event: 'research-web-tool/run' },
  async ({ event, step }) => {
    const { input } = event.data;

    // Generate search queries with AI
    const searchQueries = await step.ai.infer('generate-search-queries', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{
          role: 'user',
          content: `From the given input, generate a list of search queries to perform.\n${input}`,
        }],
      },
    });

    // Parallel web crawling
    const searchResults = await Promise.all(
      searchQueries.map((query, idx) =>
        step.run(`crawl-web-${idx}`, async () => {
          return await crawlWeb(query);
        })
      )
    );

    // Summarize results
    const summary = await step.ai.infer('summarize-search-results', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{
          role: 'user',
          content: `Summarize the following search results:\n${searchResults.join('\n')}`,
        }],
      },
    });

    return summary.choices[0].message.content;
  }
);
```

---

### 4.2 Creating Agent Networks

```typescript
import { createNetwork, createAgent, openai, anthropic } from '@inngest/agent-kit';
import { createServer } from '@inngest/agent-kit/server';

// Define agents
const navigatorAgent = createAgent({
  name: 'Navigator',
  system: 'You are a navigator that helps find relevant information.',
  tools: [searchWebTool],
  model: openai({ model: 'gpt-4o' }),
});

const classifierAgent = createAgent({
  name: 'Classifier',
  system: 'You classify content into categories.',
  model: openai({ model: 'gpt-3.5-turbo' }),
});

const summarizerAgent = createAgent({
  name: 'Summarizer',
  system: 'You create concise summaries of content.',
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
    defaultParameters: { max_tokens: 4096 },
  }),
});

// Create network
const network = createNetwork({
  name: 'Research Network',
  agents: [navigatorAgent, classifierAgent, summarizerAgent],
  defaultModel: openai({ model: 'gpt-4o' }),
  maxIter: 10,
});

// Run network
const result = await network.run(
  'Classify then summarize the latest 10 blog posts on https://www.deeplearning.ai/blog/'
);
```

---

### 4.3 Creating Tools for Agents

```typescript
import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';

// Simple tool
const searchKnowledgeBase = createTool({
  name: 'search_knowledge_base',
  description: 'Search the knowledge base for relevant articles',
  parameters: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Maximum results to return'),
  }),
  handler: async ({ query, limit = 10 }, { step }) => {
    return await step?.run('search_knowledge_base', async () => {
      const results = knowledgeBaseDB.filter(article =>
        article.title.toLowerCase().includes(query.toLowerCase()) ||
        article.content.toLowerCase().includes(query.toLowerCase())
      );
      return results.slice(0, limit);
    });
  },
});

// Multi-step tool (Inngest Function)
const inngest = new Inngest({ id: 'my-agentkit-network' });

export const researchWebTool = inngest.createFunction(
  { id: 'research-web-tool' },
  { event: 'research-web-tool/run' },
  async ({ event, step }) => {
    const { input } = event.data;

    // Step 1: Generate search queries
    const queries = await step.ai.infer('generate-queries', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{
          role: 'user',
          content: `Generate search queries from: ${input}`,
        }],
      },
    });

    // Step 2: Parallel web crawling
    const results = await Promise.all(
      queries.map((q, i) => step.run(`crawl-${i}`, () => crawlWeb(q)))
    );

    // Step 3: Summarize
    const summary = await step.ai.infer('summarize', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{
          role: 'user',
          content: `Summarize: ${results.join('\n')}`,
        }],
      },
    });

    return summary.choices[0].message.content;
  }
);

// Integrate into network
const deepResearchAgent = createAgent({
  name: 'Deep Research Agent',
  tools: [searchKnowledgeBase, researchWebTool],
});

const network = createNetwork({
  name: 'My Network',
  defaultModel: openai({ model: 'gpt-4o' }),
  agents: [deepResearchAgent],
});

const server = createServer({
  networks: [network],
  functions: [researchWebTool], // Register Inngest Functions
});

server.listen(3010, () => console.log('Agent kit running!'));
```

---

### 4.4 Model Configuration

```typescript
import { openai, anthropic, gemini, grok } from '@inngest/agent-kit';

// OpenAI
const gptModel = openai({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY,
  defaultParameters: {
    temperature: 0.7,
    max_tokens: 2000,
  },
});

// Anthropic (max_tokens required)
const claudeModel = anthropic({
  model: 'claude-3-5-sonnet-20240620',
  apiKey: process.env.ANTHROPIC_API_KEY,
  betaHeaders: ['prompt-caching-2024-07-31'],
  defaultParameters: {
    max_tokens: 4096,
    temperature: 0.7,
    top_p: 0.9,
  },
});

// Gemini
const geminiModel = gemini({
  model: 'gemini-1.5-pro',
  apiKey: process.env.GOOGLE_API_KEY,
  defaultParameters: {
    maxOutputTokens: 2048,
  },
});

// Grok
const grokModel = grok({
  model: 'grok-beta',
  apiKey: process.env.XAI_API_KEY,
  baseUrl: 'https://api.x.ai/v1',
  defaultParameters: {
    temperature: 0.5,
  },
});

// Use with agent
const agent = createAgent({
  name: 'flexible-agent',
  model: claudeModel,
  tools: [],
});

// Override at runtime
await agent.run('Hello', { model: gptModel });
```

---

### 4.5 Routing Agents

```typescript
import { createRoutingAgent, createTool } from '@inngest/agent-kit';
import { z } from 'zod';

const router = createRoutingAgent({
  name: 'Code Assistant routing agent',
  system: async ({ network }) => {
    if (!network) {
      throw new Error('Router requires network context');
    }

    const agents = await network.availableAgents();

    return `You are the orchestrator between a group of agents.

Available agents:
${agents.map(a => `
  - ${a.name}: ${a.description}
    Tools: ${JSON.stringify(Array.from(a.tools.values()))}
`).join('\n')}

Instructions:
- Review the conversation history
- If the task is complete, call select_agent with "finished"
- Otherwise, choose the best agent for the current request
`;
  },
  tools: [
    createTool({
      name: 'select_agent',
      description: 'Select an agent to handle the input',
      parameters: z.object({
        name: z.string().describe('The name of the agent'),
      }),
      handler: ({ name }, { network }) => {
        if (!network) {
          throw new Error('Router requires network context');
        }

        if (name === 'finished') {
          return undefined;
        }

        const agent = network.agents.get(name);
        if (!agent) {
          throw new Error(`Agent not found: ${name}`);
        }

        return agent.name;
      },
    }),
  ],
  tool_choice: 'select_agent',
  lifecycle: {
    onRoute: ({ result }) => {
      const tool = result.toolCalls[0];
      if (!tool) return;

      const agentName = (tool.content as any).data || (tool.content as string);
      return agentName === 'finished' ? undefined : [agentName];
    },
  },
});
```

---

## 5. Middleware and Context

### 5.1 Basic Middleware Structure

```typescript
import { InngestMiddleware } from 'inngest';

const myMiddleware = new InngestMiddleware({
  name: 'My Middleware',
  async init() {
    // Setup dependencies
    const dependency = initializeDependency();

    return {
      onFunctionRun({ ctx, fn, steps }) {
        // Access initialization context via closures

        return {
          beforeExecution() {
            console.log('Before function execution');
          },

          afterExecution() {
            console.log('After function execution');
          },

          transformInput({ ctx, fn, steps }) {
            // Inject into function context
            return {
              ctx: {
                customProperty: dependency,
              },
            };
          },
        };
      },

      onSendEvent() {
        return {
          beforeSend({ events }) {
            console.log(`Sending ${events.length} events`);
          },
        };
      },
    };
  },
});
```

---

### 5.2 Dependency Injection Middleware

```typescript
import { InngestMiddleware } from 'inngest';
import { OpenAI } from 'openai';

const openaiMiddleware = new InngestMiddleware({
  name: 'OpenAI Middleware',
  init() {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    return {
      onFunctionRun(ctx) {
        return {
          transformInput(ctx) {
            return {
              ctx: {
                openai,
              },
            };
          },
        };
      },
    };
  },
});

// Register middleware
const inngest = new Inngest({
  id: 'my-app',
  middleware: [openaiMiddleware],
});

// Use in function
inngest.createFunction(
  { id: 'user-create' },
  { event: 'app/user.create' },
  async ({ openai, event, step }) => {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: 'Say this is a test' }],
      model: 'gpt-3.5-turbo',
    });

    return completion.choices[0].message.content;
  }
);
```

---

### 5.3 Actions Middleware

```typescript
import { InngestMiddleware } from 'inngest';

type Actions = Record<string, (...args: any[]) => any>;

const createActionsMiddleware = <T extends Actions>(rawActions: T) => {
  return new InngestMiddleware({
    name: 'Inngest: Actions',
    init: () => {
      return {
        onFunctionRun: () => {
          return {
            transformInput: ({ ctx: { step } }) => {
              const actions = Object.entries(rawActions).reduce((acc, [key, value]) => {
                if (typeof value !== 'function') return acc;

                const action = (idOrOptions: string | object, ...args: unknown[]) => {
                  return step.run(idOrOptions, () => value(...args));
                };

                return { ...acc, [key]: action };
              }, {} as any);

              return {
                ctx: { action: actions },
              };
            },
          };
        },
      };
    },
  });
};

// Usage
const inngest = new Inngest({
  id: 'my-app',
  middleware: [
    createActionsMiddleware({
      getUser(id: string) {
        return db.user.get(id);
      },
      updateUser(id: string, data: any) {
        return db.user.update(id, data);
      },
    }),
  ],
});

inngest.createFunction(
  { id: 'user-data-dump' },
  { event: 'app/data.requested' },
  async ({ event, action: { getUser, updateUser } }) => {
    // Actions automatically wrapped in step.run()
    const user = await getUser('get-user-details', event.data.userId);
    await updateUser('update-user', user.id, { exported: true });
  }
);
```

---

### 5.4 Middleware Registration

```typescript
// Client-level middleware (all functions)
const inngest = new Inngest({
  id: 'my-app',
  middleware: [
    logMiddleware,      // Executed first (reverse order)
    errorMiddleware,    // Executed second
  ],
});

// Function-level middleware (specific function)
inngest.createFunction(
  {
    id: 'example',
    middleware: [
      dbSetupMiddleware,    // Executed third
      datadogMiddleware,    // Executed fourth
    ],
  },
  { event: 'test' },
  async () => {
    // Function logic
  }
);
```

**Execution Order:** Client middleware (reverse) → Function middleware (reverse)

---

### 5.5 Type Inference with Middleware

```typescript
// Middleware with literal types
const middleware = new InngestMiddleware({
  name: 'Typed Middleware',
  init() {
    return {
      onFunctionRun() {
        return {
          transformInput() {
            return {
              ctx: {
                foo: 'bar' as const, // Literal type
              },
            };
          },
        };
      },
    };
  },
});

// Function receives inferred type
inngest.createFunction(
  { id: 'example' },
  { event: 'test' },
  async ({ foo }) => {
    // foo is typed as 'bar' (not string)
    console.log(foo); // 'bar'
  }
);
```

---

## 6. Advanced Patterns

### 6.1 Concurrency Control

```typescript
// Simple limit
export default inngest.createFunction(
  {
    id: 'sync-contacts',
    concurrency: 10, // Max 10 concurrent executions
  },
  { event: 'contact/sync.requested' },
  async ({ event, step }) => {
    // Function logic
  }
);

// Per-user limit
export default inngest.createFunction(
  {
    id: 'process-customer-csv-import',
    concurrency: {
      limit: 1,
      key: 'event.data.customerId', // One per customer
    },
  },
  { event: 'csv/file.uploaded' },
  async ({ event, step }) => {
    // Only one import per customer at a time
  }
);

// Multiple scopes
export default inngest.createFunction(
  {
    id: 'ai-summary',
    concurrency: [
      {
        scope: 'account', // Shared across all functions
        key: '"openai"',   // Static key (quoted string)
        limit: 60,         // 60 total OpenAI calls
      },
      {
        scope: 'fn',              // Function-specific
        key: 'event.data.userId', // Per user for this function
        limit: 1,                 // One per user
      },
    ],
  },
  { event: 'ai/summary.requested' },
  async ({ event, step }) => {
    // Respects both limits
  }
);
```

**Scopes:**
- `fn` (default): Function-specific concurrency
- `account`: Shared across all functions using same key

---

### 6.2 Rate Limiting

```typescript
export default inngest.createFunction(
  {
    id: 'synchronize-data',
    rateLimit: {
      limit: 1,
      period: '4h',
      key: 'event.data.company_id',
    },
  },
  { event: 'intercom/company.updated' },
  async ({ event, step }) => {
    // Only runs once per 4 hours per company
  }
);
```

**Rate Limit vs Concurrency:**
- **Rate Limit:** Controls how often function *starts* (e.g., once per hour)
- **Concurrency:** Controls how many *run simultaneously* (e.g., max 10)

---

### 6.3 Throttling

```typescript
export default inngest.createFunction(
  {
    id: 'process-webhook',
    throttle: {
      limit: 1,      // 1 execution
      period: '5s',  // per 5 seconds
      burst: 2,      // allow bursts of 2
      key: 'event.data.user_id',
    },
  },
  { event: 'webhook/received' },
  async ({ event, step }) => {
    // Throttled per user
  }
);
```

**Throttle Parameters:**
- `limit`: Max executions in period
- `period`: Time window
- `burst`: Allow bursts above limit
- `key`: Scope (user, account, etc.)

---

### 6.4 Batch Processing

```typescript
export default inngest.createFunction(
  {
    id: 'batch-processor',
    batchEvents: {
      maxSize: 100,     // Max events per batch
      timeout: '5s',    // Max wait time
    },
  },
  { event: 'app/item.created' },
  async ({ events, step }) => {
    // Process multiple events together
    const items = events.map(e => e.data);

    await step.run('bulk-insert', async () => {
      return db.bulkInsert(items);
    });

    return { processed: events.length };
  }
);

// Conditional batching
export default inngest.createFunction(
  {
    id: 'conditional-batch',
    batchEvents: {
      maxSize: 50,
      timeout: '10s',
      if: 'event.data.type == "user.signup"', // Only batch signups
    },
  },
  { event: 'app/event' },
  async ({ events, step }) => {
    // events is array only for matching events
  }
);
```

---

### 6.5 Idempotency

```typescript
export default inngest.createFunction(
  {
    id: 'send-notification',
    idempotency: 'event.data.notificationId', // Unique per notification
  },
  { event: 'notification/send.requested' },
  async ({ event, step }) => {
    // Only executes once per notificationId
    // Duplicate events with same ID are ignored
  }
);
```

---

### 6.6 Priority Queues

```typescript
export default inngest.createFunction(
  {
    id: 'process-order',
  },
  { event: 'order/created' },
  async ({ event, step }) => {
    // Set priority dynamically
    const priority = event.data.isPremium ? 100 : 0;

    // Higher priority runs first
  }
);

// Via event
await inngest.send({
  name: 'order/created',
  data: { orderId: '123' },
  priority: 100, // 0-100, higher = higher priority
});
```

---

### 6.7 Debouncing

```typescript
export default inngest.createFunction(
  {
    id: 'sync-user-preferences',
    debounce: {
      period: '5s',
      key: 'event.data.userId',
    },
  },
  { event: 'user/preferences.updated' },
  async ({ event, step }) => {
    // Only executes once per 5 seconds per user
    // Multiple rapid updates are collapsed into one execution
  }
);
```

---

## Code Generation Template System

### Template Variables Reference

```typescript
// Function Configuration
{FUNCTION_ID}         // Unique function identifier
{APP_ID}              // Application identifier
{EVENT_NAME}          // Event trigger name
{CRON_SCHEDULE}       // Cron expression
{TIMEOUT}             // Timeout duration

// Event Data
{EVENT_DATA_FIELDS}   // Destructured event fields
{EVENT_CONDITION}     // CEL expression for filtering

// Steps
{STEP_ID}             // Unique step identifier
{STEP_HANDLER}        // Step handler function

// AI/Models
{MODEL_PROVIDER}      // openai | anthropic | gemini | grok
{MODEL_NAME}          // Model identifier
{MODEL_PARAMS}        // Model parameters (temperature, etc.)

// Concurrency
{CONCURRENCY_LIMIT}   // Max concurrent executions
{CONCURRENCY_KEY}     // Concurrency key expression
{CONCURRENCY_SCOPE}   // 'fn' | 'account'

// Error Handling
{RETRY_COUNT}         // Number of retries
{ON_FAILURE_HANDLER}  // Failure handler function
```

---

## Quick Reference: Common Patterns

### Event-Driven Workflow
```typescript
inngest.createFunction(
  { id: '{FUNCTION_ID}' },
  { event: '{EVENT_NAME}' },
  async ({ event, step }) => {
    const result = await step.run('{STEP_ID}', async () => {
      return processData(event.data);
    });
    return result;
  }
);
```

### Scheduled Task with Fan-out
```typescript
inngest.createFunction(
  { id: 'scheduler' },
  { cron: '{CRON_SCHEDULE}' },
  async ({ step }) => {
    const items = await step.run('load', () => loadItems());
    await step.sendEvent('fan-out', items.map(item => ({
      name: 'item/process',
      data: item,
    })));
  }
);
```

### AI-Powered Function
```typescript
inngest.createFunction(
  { id: 'ai-function' },
  { event: 'ai/request' },
  async ({ event, step }) => {
    const result = await step.ai.infer('inference', {
      model: step.ai.models.openai({ model: 'gpt-4o' }),
      body: {
        messages: [{ role: 'user', content: event.data.prompt }],
      },
    });
    return result.choices[0].message.content;
  }
);
```

### Resilient External API Call
```typescript
inngest.createFunction(
  {
    id: 'api-call',
    retries: 3,
    onFailure: async ({ error, step }) => {
      await step.run('alert', () => sendAlert(error));
    },
  },
  { event: 'api/call' },
  async ({ event, step }) => {
    try {
      return await step.run('primary-api', () => callPrimaryAPI());
    } catch (err) {
      return await step.run('backup-api', () => callBackupAPI());
    }
  }
);
```

---

## Best Practices

1. **Step IDs**: Use descriptive, kebab-case IDs for steps
2. **Error Handling**: Always handle external API failures with try/catch or .catch()
3. **Idempotency**: Use idempotency keys for critical operations
4. **Fan-out**: Use step.sendEvent() for parallel processing of large datasets
5. **Concurrency**: Set appropriate limits to avoid overwhelming external services
6. **Timeouts**: Set realistic timeouts for step.invoke() and step.waitForEvent()
7. **Middleware**: Keep middleware focused and composable
8. **Types**: Leverage TypeScript for type-safe event data and tool parameters
9. **Retries**: Use RetryAfterError for rate-limited APIs
10. **Monitoring**: Implement onFailure handlers for critical functions

---

*Generated for Hive Mind Coder Agent - Inngest SDK v3.x*

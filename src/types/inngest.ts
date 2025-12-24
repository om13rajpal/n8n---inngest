/**
 * Inngest Function Types
 * Types for generating Inngest code
 */

export interface InngestFunctionConfig {
  id: string;
  name?: string;
  triggers: InngestTrigger[];
  retries?: number;
  concurrency?: InngestConcurrency[];
  throttle?: InngestThrottle;
  debounce?: InngestDebounce;
  rateLimit?: InngestRateLimit;
  cancelOn?: InngestCancelOn[];
  onFailure?: boolean;
  priority?: InngestPriority;
  batchEvents?: InngestBatchEvents;
}

export type InngestTrigger = InngestEventTrigger | InngestCronTrigger;

export interface InngestEventTrigger {
  type: 'event';
  event: string;
  expression?: string;
}

export interface InngestCronTrigger {
  type: 'cron';
  cron: string;
}

export interface InngestConcurrency {
  limit: number;
  key?: string;
  scope?: 'fn' | 'env' | 'account';
}

export interface InngestThrottle {
  limit: number;
  period: string;
  key?: string;
}

export interface InngestDebounce {
  period: string;
  key?: string;
  timeout?: string;
}

export interface InngestRateLimit {
  limit: number;
  period: string;
  key?: string;
}

export interface InngestCancelOn {
  event: string;
  match?: string;
  timeout?: string;
  if?: string;
}

export interface InngestPriority {
  run?: string;
}

export interface InngestBatchEvents {
  maxSize: number;
  timeout: string;
  key?: string;
}

// Step types for code generation
export type InngestStep =
  | InngestRunStep
  | InngestSleepStep
  | InngestSleepUntilStep
  | InngestWaitForEventStep
  | InngestSendEventStep
  | InngestInvokeStep
  | InngestAIInferStep;

export interface InngestRunStep {
  type: 'run';
  id: string;
  code: string;
  comment?: string;
}

export interface InngestSleepStep {
  type: 'sleep';
  id: string;
  duration: string;
  comment?: string;
}

export interface InngestSleepUntilStep {
  type: 'sleepUntil';
  id: string;
  timestamp: string;
  comment?: string;
}

export interface InngestWaitForEventStep {
  type: 'waitForEvent';
  id: string;
  eventName: string;
  timeout: string;
  match?: string;
  if?: string;
  comment?: string;
}

export interface InngestSendEventStep {
  type: 'sendEvent';
  id: string;
  eventName: string;
  data: string;
  comment?: string;
}

export interface InngestInvokeStep {
  type: 'invoke';
  id: string;
  functionId: string;
  data: string;
  comment?: string;
}

export interface InngestAIInferStep {
  type: 'ai.infer';
  id: string;
  model: string;
  body: {
    messages: string;
    temperature?: number;
    maxTokens?: number;
  };
  comment?: string;
}

// Generated function structure
export interface GeneratedInngestFunction {
  imports: string[];
  config: InngestFunctionConfig;
  steps: InngestStep[];
  handlerBody: string;
  eventTypes?: string;
  helperFunctions?: string[];
}

// Code generation options
export interface CodeGenerationOptions {
  includeComments?: boolean;
  prettierConfig?: Record<string, unknown>;
  eventPrefix?: string;
  useAgentKit?: boolean;
  credentialsStrategy?: 'env' | 'config' | 'inline';
  // Inngest best practices
  defaultRetries?: number;
  defaultConcurrencyLimit?: number;
  includeEnvValidation?: boolean;
  includeInputValidation?: boolean;
}

// Template fragments for code generation
export const INNGEST_IMPORTS = {
  core: `import { Inngest } from "inngest";`,
  agentKit: `import { createAgent, createNetwork, createTool, anthropic, openai } from "@inngest/agent-kit";`,
  zod: `import { z } from "zod";`,
} as const;

export const INNGEST_CLIENT_TEMPLATE = `
const inngest = new Inngest({ id: "{{appId}}" });
`;

export const INNGEST_FUNCTION_TEMPLATE = `
export const {{functionName}} = inngest.createFunction(
  {{config}},
  {{trigger}},
  async ({{ event, step }}) => {
{{body}}
  }
);
`;

export const INNGEST_CRON_FUNCTION_TEMPLATE = `
export const {{functionName}} = inngest.createFunction(
  {{config}},
  { cron: "{{cronExpression}}" },
  async ({{ step }}) => {
{{body}}
  }
);
`;

export const STEP_RUN_TEMPLATE = `
    const {{resultVar}} = await step.run("{{stepId}}", async () => {
{{code}}
    });
`;

export const STEP_SLEEP_TEMPLATE = `
    await step.sleep("{{stepId}}", "{{duration}}");
`;

export const STEP_WAIT_FOR_EVENT_TEMPLATE = `
    const {{resultVar}} = await step.waitForEvent("{{stepId}}", {
      event: "{{eventName}}",
      timeout: "{{timeout}}",
{{matchCondition}}
    });
`;

export const STEP_SEND_EVENT_TEMPLATE = `
    await step.sendEvent("{{stepId}}", {{eventData}});
`;

export const STEP_INVOKE_TEMPLATE = `
    const {{resultVar}} = await step.invoke("{{stepId}}", {
      function: {{functionRef}},
      data: {{data}},
    });
`;

export const STEP_AI_INFER_TEMPLATE = `
    const {{resultVar}} = await step.ai.infer("{{stepId}}", {
      model: {{model}},
      body: {
        messages: {{messages}},
{{options}}
      },
    });
`;

// AgentKit templates
export const AGENT_KIT_TOOL_TEMPLATE = `
const {{toolName}} = createTool({
  name: "{{name}}",
  description: "{{description}}",
  parameters: z.object({
{{parameters}}
  }),
  handler: async ({{params}}) => {
{{handler}}
  },
});
`;

export const AGENT_KIT_AGENT_TEMPLATE = `
const {{agentName}} = createAgent({
  name: "{{name}}",
  description: "{{description}}",
  system: \`{{systemPrompt}}\`,
  tools: [{{tools}}],
});
`;

export const AGENT_KIT_NETWORK_TEMPLATE = `
const {{networkName}} = createNetwork({
  name: "{{name}}",
  agents: [{{agents}}],
  defaultModel: {{model}},
  router: {{router}},
  maxIter: {{maxIter}},
});
`;

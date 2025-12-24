/**
 * Browser-compatible n8n to Inngest converter
 */

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
}

interface N8nWorkflow {
  name?: string;
  nodes: N8nNode[];
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
  settings?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface ConversionOptions {
  includeComments: boolean;
  eventPrefix: string;
  useAgentKit: boolean;
}

interface ConversionResult {
  code: string;
  functions: Array<{ name: string; id: string; trigger: string }>;
  credentials: Array<{ type: string; envVars: string[]; instructions: string }>;
  envVars: string[];
  warnings: string[];
}

// Node type categories
const TRIGGER_TYPES = [
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.cron',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.errorTrigger',
  'n8n-nodes-base.chatTrigger',
];

function toStepId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toVariableName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function isTrigger(node: N8nNode): boolean {
  return TRIGGER_TYPES.some(t => node.type.includes(t.split('.')[1])) ||
         node.type.toLowerCase().includes('trigger');
}

function getExecutionOrder(nodes: N8nNode[], connections: N8nWorkflow['connections']): string[] {
  const triggers = nodes.filter(isTrigger);
  const regularNodes = nodes.filter(n => !isTrigger(n));

  // Simple topological sort
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(nodeName: string) {
    if (visited.has(nodeName)) return;
    visited.add(nodeName);

    // Find nodes that come before this one
    for (const [sourceName, conns] of Object.entries(connections)) {
      for (const outputs of Object.values(conns)) {
        for (const outputList of outputs || []) {
          for (const conn of outputList || []) {
            if (conn.node === nodeName) {
              visit(sourceName);
            }
          }
        }
      }
    }

    order.push(nodeName);
  }

  regularNodes.forEach(n => visit(n.name));

  return order;
}

function convertN8nExpression(expr: string): string {
  if (typeof expr !== 'string') return JSON.stringify(expr);
  if (!expr.includes('{{') && !expr.startsWith('=')) return JSON.stringify(expr);

  let result = expr.startsWith('=') ? expr.slice(1) : expr;
  result = result.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, '${data.$1}');
  result = result.replace(/\{\{\s*\$json\s*\}\}/g, '${data}');

  if (result.includes('${')) {
    return '`' + result + '`';
  }
  return result;
}

function generateNodeCode(node: N8nNode, previousVar: string, options: ConversionOptions): string {
  const stepId = toStepId(node.name);
  const varName = toVariableName(node.name);
  const comment = options.includeComments ? `    // ${node.name}\n` : '';

  let code = '';

  // Handle different node types
  if (node.type.includes('httpRequest')) {
    const params = node.parameters as { url?: string; method?: string };
    code = `${comment}    const ${varName} = await step.run("${stepId}", async () => {
      const response = await fetch(${convertN8nExpression(params.url || '')}, {
        method: "${params.method || 'GET'}",
        headers: { "Content-Type": "application/json" },
      });
      return response.json();
    });`;
  } else if (node.type.includes('if')) {
    const params = node.parameters as { conditions?: { conditions?: Array<{ leftValue: string; rightValue: string }> } };
    const condition = params.conditions?.conditions?.[0];
    code = `${comment}    const ${varName} = await step.run("${stepId}", async () => {
      const data = ${previousVar};
      const condition = data${condition?.leftValue?.replace(/\{\{\s*\$json/, '').replace(/\s*\}\}/, '') || '.value'} === ${JSON.stringify(condition?.rightValue || '')};
      return { branch: condition ? 'true' : 'false', data, condition };
    });`;
  } else if (node.type.includes('code')) {
    const params = node.parameters as { jsCode?: string };
    const jsCode = params.jsCode || 'return items;';
    code = `${comment}    const ${varName} = await step.run("${stepId}", async () => {
      const data = ${previousVar};
      const items = Array.isArray(data) ? data : [data];
      // Original n8n code (review and adjust):
      ${jsCode.split('\n').map(l => '      // ' + l).join('\n')}
      return items;
    });`;
  } else if (node.type.includes('supabase')) {
    const params = node.parameters as { operation?: string; tableId?: string };
    code = `${comment}    const ${varName} = await step.run("${stepId}", async () => {
      const supabase = getSupabaseClient();
      const data = ${previousVar};
      const { data: result, error } = await supabase
        .from("${params.tableId || 'table'}")
        .${params.operation === 'getAll' ? 'select("*")' : params.operation === 'create' ? 'insert(data).select()' : 'select("*")'};
      if (error) throw new Error(error.message);
      return result;
    });`;
  } else if (node.type.includes('openAi') || node.type.includes('openai')) {
    const params = node.parameters as { model?: string; prompt?: string };
    code = `${comment}    const ${varName} = await step.ai.infer("${stepId}", {
      model: openai("${params.model || 'gpt-4o'}"),
      body: {
        messages: [{ role: "user", content: ${convertN8nExpression(params.prompt || '')} }],
      },
    });`;
  } else {
    // Generic node handler
    code = `${comment}    const ${varName} = await step.run("${stepId}", async () => {
      const data = ${previousVar};
      // TODO: Implement ${node.type}
      // Original parameters: ${JSON.stringify(node.parameters).slice(0, 100)}...
      return data;
    });`;
  }

  return code;
}

function extractCredentials(nodes: N8nNode[]): ConversionResult['credentials'] {
  const credentials: ConversionResult['credentials'] = [];
  const seen = new Set<string>();

  const credentialConfigs: Record<string, { envVars: string[]; instructions: string }> = {
    supabaseApi: { envVars: ['SUPABASE_URL', 'SUPABASE_KEY'], instructions: 'Get from Supabase project settings' },
    openAiApi: { envVars: ['OPENAI_API_KEY'], instructions: 'Get from platform.openai.com/api-keys' },
    httpHeaderAuth: { envVars: ['API_HEADER_NAME', 'API_HEADER_VALUE'], instructions: 'Configure API authentication' },
    firecrawlApi: { envVars: ['FIRECRAWL_API_KEY'], instructions: 'Get from firecrawl.dev' },
  };

  for (const node of nodes) {
    if (node.credentials) {
      for (const [type, cred] of Object.entries(node.credentials)) {
        if (!seen.has(type)) {
          seen.add(type);
          const config = credentialConfigs[type] || {
            envVars: [`${type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`],
            instructions: `Configure ${type} credentials`,
          };
          credentials.push({ type: cred.name || type, ...config });
        }
      }
    }
  }

  return credentials;
}

export function generateInngestCode(workflow: N8nWorkflow, options: ConversionOptions): ConversionResult {
  const workflowName = workflow.name || 'converted-workflow';
  const functionId = toStepId(workflowName);
  const functionName = toVariableName(workflowName);

  const triggers = workflow.nodes.filter(isTrigger);
  const regularNodes = workflow.nodes.filter(n => !isTrigger(n) && !n.disabled);
  const executionOrder = getExecutionOrder(regularNodes, workflow.connections);

  const credentials = extractCredentials(workflow.nodes);
  const envVars = credentials.flatMap(c => c.envVars);
  const warnings: string[] = [];

  // Determine trigger type
  const trigger = triggers[0];
  let triggerConfig = '{ event: "app/workflow.run" }';
  let isCron = false;

  if (trigger) {
    if (trigger.type.includes('cron') || trigger.type.includes('schedule')) {
      isCron = true;
      const params = trigger.parameters as { rule?: { interval?: Array<{ field: string; hoursInterval?: number }> } };
      const interval = params.rule?.interval?.[0];
      let cron = '0 * * * *';
      if (interval?.field === 'hours' && interval.hoursInterval) {
        cron = `0 */${interval.hoursInterval} * * *`;
      }
      triggerConfig = `{ cron: "${cron}" }`;
    } else if (trigger.type.includes('webhook')) {
      triggerConfig = `{ event: "${options.eventPrefix}/webhook.received" }`;
    }
  }

  // Generate imports
  const imports: string[] = ['import { Inngest } from "inngest";'];

  if (credentials.some(c => c.type.toLowerCase().includes('supabase'))) {
    imports.push('import { createClient } from "@supabase/supabase-js";');
  }
  if (credentials.some(c => c.type.toLowerCase().includes('openai'))) {
    imports.push('import { openai } from "@inngest/ai";');
  }

  // Generate helper functions
  const helpers: string[] = [];

  if (credentials.some(c => c.type.toLowerCase().includes('supabase'))) {
    helpers.push(`
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key);
}`);
  }

  // Generate function body
  let previousVar = 'inputData';
  const steps: string[] = [];

  for (const nodeName of executionOrder) {
    const node = regularNodes.find(n => n.name === nodeName);
    if (!node) continue;

    const stepCode = generateNodeCode(node, previousVar, options);
    steps.push(stepCode);
    previousVar = toVariableName(node.name);
  }

  // Check for unsupported nodes
  for (const node of regularNodes) {
    if (node.type.includes('splitInBatches')) {
      warnings.push('This workflow contains loop/batch processing. Consider using fan-out pattern.');
    }
  }

  if (credentials.length > 0) {
    warnings.push(`This workflow requires ${credentials.length} credential(s). Configure environment variables.`);
  }

  // Assemble the code
  const code = `/**
 * Inngest Functions - Converted from n8n Workflow
 * Original Workflow: ${workflowName}
 * Converted: ${new Date().toISOString()}
 */

${imports.join('\n')}

// Inngest Client
const inngest = new Inngest({ id: "${functionId}" });
${helpers.length > 0 ? '\n// Helper Functions' + helpers.join('\n') : ''}

/**
 * ${workflowName}
 */
export const ${functionName} = inngest.createFunction(
  { id: "${functionId}", name: "${workflowName}" },
  ${triggerConfig},
  async ({ ${isCron ? 'step' : 'event, step'} }) => {
    // Input data
    const inputData = ${isCron ? '{}' : 'event?.data ?? {}'};

${steps.join('\n\n')}

    // Return result
    return { success: true, result: ${previousVar} };
  }
);

// Export functions
export const functions = [${functionName}];
`;

  return {
    code,
    functions: [{ name: workflowName, id: functionId, trigger: isCron ? 'cron' : 'event' }],
    credentials,
    envVars,
    warnings,
  };
}

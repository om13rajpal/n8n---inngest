/**
 * Control Flow Node Converters
 * Converts n8n IF, Switch, Merge, Loop, Wait nodes to Inngest steps
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import {
  NodeConverter,
  ConversionContext,
  ConversionResult,
  toStepId,
  toVariableName,
  convertCondition,
  generateDataAccess,
  indent,
} from './base-converter.js';
import { InngestStep } from '../types/inngest.js';
import {
  IfNodeParameters,
  SwitchNodeParameters,
  MergeNodeParameters,
  SplitInBatchesParameters,
  WaitNodeParameters,
} from '../types/n8n.js';

/**
 * IF Node Converter
 * Converts n8n IF node to conditional step.run with if/else logic
 */
export const ifNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.if'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as IfNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Convert conditions to JavaScript expression
    let conditionExpr = 'true';
    if (params.conditions?.conditions) {
      conditionExpr = convertCondition(
        params.conditions.conditions,
        params.conditions.combinator || 'and',
        context
      );
    }

    const code = `
      const data = ${dataAccess};
      const condition = ${conditionExpr};

      return {
        branch: condition ? 'true' : 'false',
        data,
        condition,
      };
    `.trim();

    context.variableMap.set(node.name, varName);

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `IF condition: ${node.name}`,
      }],
    };
  },
};

/**
 * Switch Node Converter
 * Converts n8n Switch node to multi-branch conditional logic
 */
export const switchNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.switch'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as SwitchNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    let switchCode: string;

    if (params.mode === 'expression') {
      // Expression mode - evaluate expression to determine output
      switchCode = `
      const data = ${dataAccess};
      const value = ${params.expression || 'null'};

      return {
        branch: value,
        data,
      };
      `.trim();
    } else {
      // Rules mode - evaluate each rule condition
      const rules = params.rules || [];
      const ruleConditions = rules.map((rule, index) => {
        if (rule.conditions && rule.conditions.length > 0) {
          const condition = convertCondition(
            rule.conditions,
            'and',
            context
          );
          return `if (${condition}) return { branch: ${rule.output ?? index}, data };`;
        }
        return `// Rule ${index} - no conditions`;
      }).join('\n      ');

      const fallback = params.fallbackOutput === 'extra'
        ? `return { branch: ${rules.length}, data };`
        : `return { branch: -1, data };`;

      switchCode = `
      const data = ${dataAccess};

      ${ruleConditions}

      // Fallback
      ${fallback}
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code: switchCode,
        comment: `Switch: ${node.name}`,
      }],
    };
  },
};

/**
 * Merge Node Converter
 * Converts n8n Merge node to data combination step
 */
export const mergeNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.merge'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as MergeNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);

    context.variableMap.set(node.name, varName);

    // Get inputs from all incoming connections
    const inputs = node.incomingConnections.map((conn, index) => {
      const sourceVar = context.variableMap.get(conn.nodeName);
      return { varName: sourceVar || `input${index}`, inputIndex: conn.inputIndex };
    }).sort((a, b) => a.inputIndex - b.inputIndex);

    let mergeCode: string;

    switch (params.mode) {
      case 'append':
        // Append all items from both inputs
        mergeCode = `
      const items = [
        ${inputs.map(i => `...(Array.isArray(${i.varName}) ? ${i.varName} : [${i.varName}])`).join(',\n        ')}
      ];
      return items;
        `.trim();
        break;

      case 'combine':
        // Combine by matching fields
        const matchFields = params.mergeByFields?.values || [];
        if (matchFields.length > 0) {
          const matchLogic = matchFields.map(f =>
            `item1.${f.field1} === item2.${f.field2}`
          ).join(' && ');

          mergeCode = `
      const input1 = Array.isArray(${inputs[0]?.varName}) ? ${inputs[0]?.varName} : [${inputs[0]?.varName}];
      const input2 = Array.isArray(${inputs[1]?.varName}) ? ${inputs[1]?.varName} : [${inputs[1]?.varName}];

      const combined = input1.map(item1 => {
        const match = input2.find(item2 => ${matchLogic});
        return { ...item1, ...match };
      });

      return combined;
          `.trim();
        } else {
          // Just merge objects
          mergeCode = `
      const input1 = ${inputs[0]?.varName};
      const input2 = ${inputs[1]?.varName};
      return { ...input1, ...input2 };
          `.trim();
        }
        break;

      case 'chooseBranch':
        // Choose specific branch
        const branchIndex = params.chooseBranch || 0;
        mergeCode = `
      return ${inputs[branchIndex]?.varName || inputs[0]?.varName};
        `.trim();
        break;

      case 'multiplex':
        // Create all combinations
        mergeCode = `
      const input1 = Array.isArray(${inputs[0]?.varName}) ? ${inputs[0]?.varName} : [${inputs[0]?.varName}];
      const input2 = Array.isArray(${inputs[1]?.varName}) ? ${inputs[1]?.varName} : [${inputs[1]?.varName}];

      const result = [];
      for (const item1 of input1) {
        for (const item2 of input2) {
          result.push({ ...item1, ...item2 });
        }
      }
      return result;
        `.trim();
        break;

      default:
        mergeCode = `
      return { ${inputs.map(i => `${i.varName}`).join(', ')} };
        `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code: mergeCode,
        comment: `Merge (${params.mode}): ${node.name}`,
      }],
    };
  },
};

/**
 * Split In Batches (Loop) Node Converter
 * Converts n8n SplitInBatches to iteration pattern
 */
export const splitInBatchesConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.splitInBatches'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as SplitInBatchesParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);
    const batchSize = params.batchSize || 10;

    context.variableMap.set(node.name, varName);

    // Generate code that will handle batch processing
    // In Inngest, we typically use step.run for each batch or fan-out pattern
    const code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const batchSize = ${batchSize};

      // Split into batches
      const batches = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      return {
        batches,
        totalBatches: batches.length,
        totalItems: items.length,
        batchSize,
      };
    `.trim();

    // Add helper comment about loop pattern
    const comment = `
Loop Over Items: ${node.name}
NOTE: n8n's SplitInBatches creates a loop. In Inngest, you have two options:

1. Fan-out pattern (recommended for independent batch processing):
   Use step.sendEvent() to send events for each batch, handled by separate functions.

2. Sequential processing:
   Process batches within a single function using step.run() for each batch.

The code below sets up the batch structure. Implement batch processing based on your needs.
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment,
      }],
      helperFunctions: [generateBatchProcessingHelper()],
    };
  },
};

/**
 * Wait Node Converter
 * Converts n8n Wait node to step.sleep or step.waitForEvent
 */
export const waitNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.wait'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as WaitNodeParameters;
    const stepId = toStepId(node.name);

    const steps: InngestStep[] = [];

    switch (params.resume) {
      case 'timeInterval':
        // Convert to step.sleep
        const duration = convertDuration(params.amount || 1, params.unit || 'minutes');
        steps.push({
          type: 'sleep',
          id: stepId,
          duration,
          comment: `Wait for ${params.amount} ${params.unit}`,
        });
        break;

      case 'specificTime':
        // Convert to step.sleepUntil
        steps.push({
          type: 'sleepUntil',
          id: stepId,
          timestamp: params.dateTime || 'new Date().toISOString()',
          comment: `Wait until specific time`,
        });
        break;

      case 'webhook':
        // Convert to step.waitForEvent
        const eventName = `${context.options.eventPrefix || 'webhook'}/${params.webhookSuffix || stepId}`;
        steps.push({
          type: 'waitForEvent',
          id: stepId,
          eventName,
          timeout: '7d', // Default timeout
          comment: `Wait for webhook: ${params.webhookSuffix || 'callback'}`,
        });
        break;

      default:
        // Default to a short sleep
        steps.push({
          type: 'sleep',
          id: stepId,
          duration: '1m',
          comment: `Wait: ${node.name}`,
        });
    }

    return { steps };
  },
};

/**
 * NoOp (No Operation) Node Converter
 */
export const noOpConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.noOp'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // NoOp just passes data through
    return {
      steps: [{
        type: 'run',
        id: toStepId(node.name),
        code: `
      // No operation - pass through data
      return ${dataAccess};
        `.trim(),
        comment: `NoOp: ${node.name}`,
      }],
    };
  },
};

/**
 * Respond to Webhook Node Converter
 */
export const respondToWebhookConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.respondToWebhook'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const stepId = toStepId(node.name);
    const dataAccess = generateDataAccess(node, context);
    const params = node.parameters as Record<string, unknown>;

    // In Inngest, webhook responses are typically handled differently
    // This generates a step that prepares the response data
    const responseCode = params.respondWith === 'json'
      ? `return { status: ${params.responseCode || 200}, body: ${dataAccess} };`
      : `return { status: ${params.responseCode || 200}, body: ${JSON.stringify(params.responseBody || '{}')} };`;

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code: `
      // Prepare webhook response
      // NOTE: In Inngest, you'll need to handle webhook responses at the API route level
      // This step prepares the response data
      ${responseCode}
        `.trim(),
        comment: `Respond to Webhook: ${node.name}`,
      }],
    };
  },
};

/**
 * Convert duration to Inngest format
 */
function convertDuration(amount: number, unit: string): string {
  const unitMap: Record<string, string> = {
    seconds: 's',
    minutes: 'm',
    hours: 'h',
    days: 'd',
  };

  return `${amount}${unitMap[unit] || 'm'}`;
}

/**
 * Generate batch processing helper function
 */
function generateBatchProcessingHelper(): string {
  return `
/**
 * Helper function for processing items in batches
 * Use with step.run() for each batch
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number } = {}
): Promise<R[]> {
  const { concurrency = 5 } = options;
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, idx) => processor(item, i + idx))
    );
    results.push(...batchResults);
  }

  return results;
}
`.trim();
}

/**
 * Generate conditional branch handler code
 */
export function generateConditionalBranchCode(
  conditionVar: string,
  trueBranchCode: string,
  falseBranchCode: string
): string {
  return `
    if (${conditionVar}.branch === 'true' || ${conditionVar}.condition === true) {
${indent(trueBranchCode, 6)}
    } else {
${indent(falseBranchCode, 6)}
    }
  `.trim();
}

/**
 * Generate switch branch handler code
 */
export function generateSwitchBranchCode(
  switchVar: string,
  branches: Map<number, string>,
  defaultBranch?: string
): string {
  const cases = Array.from(branches.entries())
    .map(([index, code]) => `
      case ${index}:
${indent(code, 8)}
        break;
    `.trim())
    .join('\n');

  const defaultCase = defaultBranch
    ? `
      default:
${indent(defaultBranch, 8)}
        break;
    `.trim()
    : '';

  return `
    switch (${switchVar}.branch) {
      ${cases}
      ${defaultCase}
    }
  `.trim();
}

// Export all converters
export const controlFlowConverters: NodeConverter[] = [
  ifNodeConverter,
  switchNodeConverter,
  mergeNodeConverter,
  splitInBatchesConverter,
  waitNodeConverter,
  noOpConverter,
  respondToWebhookConverter,
];

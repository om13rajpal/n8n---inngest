/**
 * Main n8n to Inngest Converter
 * Orchestrates the conversion process
 */

import { N8nWorkflow } from '../types/n8n.js';
import { CodeGenerationOptions, InngestFunctionConfig } from '../types/inngest.js';
import {
  parseWorkflow,
  ParsedWorkflow,
  ParsedNode,
  getExecutionOrder,
} from '../parser/workflow-parser.js';
import {
  ConverterRegistry,
  ConversionContext,
  ConversionResult,
  createDefaultConverter,
  toVariableName,
  toStepId,
} from '../converters/base-converter.js';
import { convertTrigger, TriggerConversionResult } from '../converters/trigger-converters.js';
import { controlFlowConverters } from '../converters/control-flow-converters.js';
import { httpConverters, generateAuthHelpers } from '../converters/http-converters.js';
import { codeConverters } from '../converters/code-converters.js';
import { integrationConverters } from '../converters/integration-converters.js';
import { aiConverters } from '../converters/ai-converters.js';

export interface ConversionOutput {
  code: string;
  functions: GeneratedFunction[];
  credentials: CredentialConfig[];
  envVars: string[];
  warnings: string[];
}

export interface GeneratedFunction {
  name: string;
  id: string;
  trigger: string;
  code: string;
}

export interface CredentialConfig {
  type: string;
  envVars: string[];
  instructions: string;
}

/**
 * Main converter class
 */
export class N8nToInngestConverter {
  private registry: ConverterRegistry;
  private options: CodeGenerationOptions;

  constructor(options: CodeGenerationOptions = {}) {
    this.options = {
      includeComments: true,
      eventPrefix: 'app',
      useAgentKit: true,
      credentialsStrategy: 'env',
      // Inngest best practice defaults
      defaultRetries: 3,
      defaultConcurrencyLimit: 10,
      ...options,
    };

    this.registry = new ConverterRegistry();
    this.registerConverters();
  }

  /**
   * Register all node converters
   */
  private registerConverters(): void {
    // Register all converters
    controlFlowConverters.forEach(c => this.registry.register(c));
    httpConverters.forEach(c => this.registry.register(c));
    codeConverters.forEach(c => this.registry.register(c));
    integrationConverters.forEach(c => this.registry.register(c));
    aiConverters.forEach(c => this.registry.register(c));

    // Set default converter for unhandled types
    this.registry.setDefault(createDefaultConverter());
  }

  /**
   * Convert n8n workflow JSON to Inngest code
   */
  convert(workflow: N8nWorkflow): ConversionOutput {
    // Parse the workflow
    const parsed = parseWorkflow(workflow);

    // Create conversion context
    const context = this.createContext(parsed);

    // Convert triggers
    const triggerResults = this.convertTriggers(parsed.triggers, context);

    // Get execution order
    const executionOrder = getExecutionOrder(parsed.executionGraph);

    // Convert nodes in order
    const nodeResults = this.convertNodes(parsed.nodes, executionOrder, context);

    // Generate the final code
    const generatedCode = this.generateCode(parsed, triggerResults, nodeResults, context);

    // Extract credential configurations
    const credentials = this.extractCredentialConfigs(parsed);

    // Collect warnings
    const warnings = this.collectWarnings(parsed, nodeResults);

    return {
      code: generatedCode,
      functions: this.extractFunctions(triggerResults, nodeResults, context),
      credentials,
      envVars: this.extractEnvVars(credentials),
      warnings,
    };
  }

  /**
   * Create conversion context
   */
  private createContext(parsed: ParsedWorkflow): ConversionContext {
    const allNodes = new Map<string, ParsedNode>();
    [...parsed.triggers, ...parsed.nodes].forEach(node => {
      allNodes.set(node.name, node);
    });

    return {
      workflowName: parsed.name,
      allNodes,
      options: this.options,
      variableMap: new Map(),
      stepIndex: 0,
      imports: new Set(),
      helpers: new Set(),
    };
  }

  /**
   * Convert trigger nodes
   */
  private convertTriggers(
    triggers: ParsedNode[],
    context: ConversionContext
  ): TriggerConversionResult[] {
    return triggers.map(trigger => convertTrigger(trigger, context));
  }

  /**
   * Convert regular nodes
   */
  private convertNodes(
    nodes: ParsedNode[],
    executionOrder: string[],
    context: ConversionContext
  ): Map<string, ConversionResult> {
    const results = new Map<string, ConversionResult>();

    // Sort nodes by execution order
    const sortedNodes = [...nodes].sort((a, b) => {
      const aIndex = executionOrder.indexOf(a.name);
      const bIndex = executionOrder.indexOf(b.name);
      return aIndex - bIndex;
    });

    for (const node of sortedNodes) {
      if (node.disabled) continue;

      const converter = this.registry.get(node.type);
      if (converter) {
        const result = converter.convert(node, context);
        results.set(node.name, result);

        // Collect additional imports and helpers
        result.additionalImports?.forEach(imp => context.imports.add(imp));
        result.helperFunctions?.forEach(helper => context.helpers.add(helper));

        context.stepIndex++;
      }
    }

    return results;
  }

  /**
   * Generate the final TypeScript code
   */
  private generateCode(
    parsed: ParsedWorkflow,
    triggers: TriggerConversionResult[],
    nodeResults: Map<string, ConversionResult>,
    context: ConversionContext
  ): string {
    const sections: string[] = [];

    // Header comment
    sections.push(this.generateHeader(parsed));

    // Imports
    sections.push(this.generateImports(context));

    // Event type definitions
    const eventTypes = triggers
      .map(t => t.eventTypeDef)
      .filter(Boolean)
      .join('\n\n');
    if (eventTypes) {
      sections.push('// Event Type Definitions');
      sections.push(eventTypes);
    }

    // Inngest client
    sections.push(this.generateClient(parsed));

    // Helper functions
    if (context.helpers.size > 0) {
      sections.push('// Helper Functions');
      sections.push(Array.from(context.helpers).join('\n\n'));
    }

    // Generate functions for each trigger
    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];
      const functionCode = this.generateFunction(
        parsed,
        trigger,
        nodeResults,
        context,
        i
      );
      sections.push(functionCode);
    }

    // Export all functions
    sections.push(this.generateExports(triggers, parsed));

    return sections.join('\n\n');
  }

  /**
   * Generate header comment
   */
  private generateHeader(parsed: ParsedWorkflow): string {
    return `/**
 * Inngest Functions - Converted from n8n Workflow
 * Original Workflow: ${parsed.name}
 * Converted: ${new Date().toISOString()}
 *
 * This code was automatically generated from an n8n workflow.
 * Review and adjust as needed for your specific use case.
 */`;
  }

  /**
   * Generate import statements
   */
  private generateImports(context: ConversionContext): string {
    const imports: string[] = [
      'import { Inngest } from "inngest";',
    ];

    // Add collected imports
    context.imports.forEach(imp => {
      if (!imports.includes(imp)) {
        imports.push(imp);
      }
    });

    return imports.join('\n');
  }

  /**
   * Generate Inngest client
   */
  private generateClient(parsed: ParsedWorkflow): string {
    const appId = toStepId(parsed.name);
    return `// Inngest Client
const inngest = new Inngest({ id: "${appId}" });`;
  }

  /**
   * Generate a single Inngest function
   */
  private generateFunction(
    parsed: ParsedWorkflow,
    trigger: TriggerConversionResult,
    nodeResults: Map<string, ConversionResult>,
    context: ConversionContext,
    index: number
  ): string {
    const functionId = trigger.config.id || toStepId(parsed.name);
    const functionName = toVariableName(functionId) + (index > 0 ? index : '');

    // Build config object with Inngest best practices
    const config: Partial<InngestFunctionConfig> = {
      id: functionId,
      name: trigger.config.name || parsed.name,
    };

    // Add retry configuration (best practice: always have retries)
    config.retries = this.options.defaultRetries ?? 3;

    // Add concurrency control (best practice: prevent resource exhaustion)
    if (this.options.defaultConcurrencyLimit) {
      config.concurrency = [{ limit: this.options.defaultConcurrencyLimit }];
    }

    // Add failure handler if error workflow exists
    if (parsed.settings.errorWorkflow) {
      config.onFailure = true;
    }

    const configStr = JSON.stringify(config, null, 2)
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/"/g, "'");

    // Build trigger
    let triggerStr: string;
    if (trigger.trigger.type === 'cron') {
      triggerStr = `{ cron: "${trigger.trigger.cron}" }`;
    } else {
      triggerStr = `{ event: "${trigger.trigger.event}" }`;
      if (trigger.trigger.expression) {
        triggerStr = `{ event: "${trigger.trigger.event}", if: "${trigger.trigger.expression}" }`;
      }
    }

    // Determine if this is a cron trigger
    const isCron = trigger.trigger.type === 'cron';

    // Build function body
    const body = this.generateFunctionBody(parsed, nodeResults, context, isCron);

    // Build the function
    const funcArgs = isCron
      ? '{ step }'
      : '{ event, step }';

    return `/**
 * ${trigger.config.name || parsed.name}
 * ${trigger.trigger.type === 'cron' ? `Schedule: ${trigger.trigger.cron}` : `Event: ${trigger.trigger.event}`}
 */
export const ${functionName} = inngest.createFunction(
  ${configStr},
  ${triggerStr},
  async (${funcArgs}) => {
${body}
  }
);`;
  }

  /**
   * Generate the function body from converted nodes
   */
  private generateFunctionBody(
    parsed: ParsedWorkflow,
    nodeResults: Map<string, ConversionResult>,
    context: ConversionContext,
    isCron: boolean = false
  ): string {
    const lines: string[] = [];

    // Add initial data access with validation
    lines.push('    // Input data from trigger');
    if (isCron) {
      lines.push('    const inputData: Record<string, unknown> = {};  // Cron triggers have no event data');
    } else {
      lines.push('    const inputData = event?.data ?? {};');
      // Add input type guard
      lines.push('    if (typeof inputData !== "object" || inputData === null) {');
      lines.push('      throw new Error("Invalid input: expected object data");');
      lines.push('    }');
    }
    lines.push('');

    // Get execution order and generate steps
    const executionOrder = getExecutionOrder(parsed.executionGraph);

    for (const nodeName of executionOrder) {
      const result = nodeResults.get(nodeName);
      if (!result) continue;

      for (const step of result.steps) {
        if (this.options.includeComments && step.comment) {
          lines.push(`    // ${step.comment}`);
        }

        switch (step.type) {
          case 'run':
            lines.push(this.generateRunStep(step.id, step.code, context));
            break;
          case 'sleep':
            lines.push(`    await step.sleep("${step.id}", "${step.duration}");`);
            break;
          case 'sleepUntil':
            lines.push(`    await step.sleepUntil("${step.id}", ${step.timestamp});`);
            break;
          case 'waitForEvent':
            lines.push(this.generateWaitForEventStep(step));
            break;
          case 'sendEvent':
            lines.push(`    await step.sendEvent("${step.id}", ${step.data});`);
            break;
          case 'invoke':
            lines.push(`    const ${toVariableName(step.id)}Result = await step.invoke("${step.id}", { function: ${step.functionId}, data: ${step.data} });`);
            break;
          case 'ai.infer':
            lines.push(this.generateAIInferStep(step, context));
            break;
        }

        lines.push('');
      }
    }

    // Add return statement
    lines.push('    // Return final result');
    lines.push('    return { success: true };');

    return lines.join('\n');
  }

  /**
   * Generate a step.run call
   */
  private generateRunStep(id: string, code: string, context: ConversionContext): string {
    const varName = toVariableName(id);
    const indentedCode = code
      .split('\n')
      .map(line => '      ' + line)
      .join('\n');

    return `    const ${varName} = await step.run("${id}", async () => {
${indentedCode}
    });`;
  }

  /**
   * Generate a waitForEvent step
   */
  private generateWaitForEventStep(step: any): string {
    const varName = toVariableName(step.id);
    let options = `event: "${step.eventName}", timeout: "${step.timeout}"`;

    if (step.match) {
      options += `, match: "${step.match}"`;
    }
    if (step.if) {
      options += `, if: "${step.if}"`;
    }

    return `    const ${varName} = await step.waitForEvent("${step.id}", { ${options} });`;
  }

  /**
   * Generate an AI infer step
   */
  private generateAIInferStep(step: any, context: ConversionContext): string {
    const varName = toVariableName(step.id);
    const bodyOptions: string[] = [`messages: ${step.body.messages}`];

    if (step.body.temperature !== undefined) {
      bodyOptions.push(`temperature: ${step.body.temperature}`);
    }
    if (step.body.maxTokens !== undefined) {
      bodyOptions.push(`max_tokens: ${step.body.maxTokens}`);
    }

    return `    const ${varName} = await step.ai.infer("${step.id}", {
      model: ${step.model},
      body: { ${bodyOptions.join(', ')} },
    });`;
  }

  /**
   * Generate exports
   */
  private generateExports(triggers: TriggerConversionResult[], parsed: ParsedWorkflow): string {
    const functionNames = triggers.map((t, i) => {
      const functionId = t.config.id || toStepId(parsed.name);
      return toVariableName(functionId) + (i > 0 ? i : '');
    });

    return `// Export all functions
export const functions = [${functionNames.join(', ')}];`;
  }

  /**
   * Extract credential configurations
   */
  private extractCredentialConfigs(parsed: ParsedWorkflow): CredentialConfig[] {
    const configs: CredentialConfig[] = [];
    const seenTypes = new Set<string>();

    for (const cred of parsed.credentials) {
      if (seenTypes.has(cred.credentialType)) continue;
      seenTypes.add(cred.credentialType);

      const config = this.getCredentialConfig(cred.credentialType);
      if (config) {
        configs.push(config);
      }
    }

    return configs;
  }

  /**
   * Get credential configuration for a type
   */
  private getCredentialConfig(type: string): CredentialConfig | null {
    const configs: Record<string, CredentialConfig> = {
      openAiApi: {
        type: 'OpenAI',
        envVars: ['N8N_OPENAI_API_KEY'],
        instructions: 'Get your API key from https://platform.openai.com/api-keys',
      },
      supabaseApi: {
        type: 'Supabase',
        envVars: ['N8N_SUPABASE_URL', 'N8N_SUPABASE_KEY'],
        instructions: 'Get credentials from your Supabase project settings',
      },
      httpHeaderAuth: {
        type: 'HTTP Header Auth',
        envVars: ['N8N_API_HEADER_NAME', 'N8N_API_HEADER_VALUE'],
        instructions: 'Configure the header name and value for API authentication',
      },
      httpBasicAuth: {
        type: 'HTTP Basic Auth',
        envVars: ['N8N_API_USERNAME', 'N8N_API_PASSWORD'],
        instructions: 'Configure username and password for basic authentication',
      },
      firecrawlApi: {
        type: 'Firecrawl',
        envVars: ['N8N_FIRECRAWL_API_KEY'],
        instructions: 'Get your API key from https://firecrawl.dev',
      },
      googleSheetsOAuth2Api: {
        type: 'Google Sheets',
        envVars: ['N8N_GOOGLE_ACCESS_TOKEN', 'N8N_GOOGLE_REFRESH_TOKEN', 'N8N_GOOGLE_CLIENT_ID', 'N8N_GOOGLE_CLIENT_SECRET'],
        instructions: 'Configure Google OAuth2 credentials',
      },
      airtableTokenApi: {
        type: 'Airtable',
        envVars: ['N8N_AIRTABLE_TOKEN'],
        instructions: 'Get your API key from https://airtable.com/account',
      },
      anthropicApi: {
        type: 'Anthropic',
        envVars: ['N8N_ANTHROPIC_API_KEY'],
        instructions: 'Get your API key from https://console.anthropic.com',
      },
      openRouterApi: {
        type: 'OpenRouter',
        envVars: ['N8N_OPENROUTER_API_KEY'],
        instructions: 'Get your API key from https://openrouter.ai/keys',
      },
      perplexityApi: {
        type: 'Perplexity',
        envVars: ['N8N_PERPLEXITY_API_KEY'],
        instructions: 'Get your API key from https://www.perplexity.ai/settings/api',
      },
      slackApi: {
        type: 'Slack',
        envVars: ['N8N_SLACK_BOT_TOKEN'],
        instructions: 'Create a Slack app and get your bot token',
      },
      ollamaApi: {
        type: 'Ollama',
        envVars: ['N8N_OLLAMA_BASE_URL'],
        instructions: 'Set the base URL for your Ollama instance (default: http://localhost:11434)',
      },
    };

    return configs[type] || {
      type,
      envVars: [`N8N_${type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`],
      instructions: `Configure credentials for ${type}`,
    };
  }

  /**
   * Extract environment variable names
   */
  private extractEnvVars(credentials: CredentialConfig[]): string[] {
    const envVars = new Set<string>();
    credentials.forEach(c => c.envVars.forEach(v => envVars.add(v)));
    return Array.from(envVars);
  }

  /**
   * Extract generated functions
   */
  private extractFunctions(
    triggers: TriggerConversionResult[],
    nodeResults: Map<string, ConversionResult>,
    context: ConversionContext
  ): GeneratedFunction[] {
    return triggers.map((t, i) => ({
      name: t.config.name || context.workflowName,
      id: t.config.id || toStepId(context.workflowName),
      trigger: t.trigger.type === 'cron' ? t.trigger.cron : t.trigger.event,
      code: '', // Would need to regenerate per function
    }));
  }

  /**
   * Collect warnings
   */
  private collectWarnings(
    parsed: ParsedWorkflow,
    nodeResults: Map<string, ConversionResult>
  ): string[] {
    const warnings: string[] = [];

    // Check for unsupported nodes
    for (const node of parsed.nodes) {
      if (!this.registry.has(node.type)) {
        warnings.push(`Node type "${node.type}" (${node.name}) has limited support. Review the generated code.`);
      }
    }

    // Check for credentials that need manual configuration
    if (parsed.credentials.length > 0) {
      warnings.push(`This workflow requires ${parsed.credentials.length} credential(s). Configure environment variables.`);
    }

    // Check for loops - either detected in graph or splitInBatches nodes present
    const hasLoopNodes = parsed.nodes.some(node => node.type === 'n8n-nodes-base.splitInBatches');
    if (parsed.executionGraph.loops.length > 0 || hasLoopNodes) {
      warnings.push('This workflow contains loop/batch processing. Consider using fan-out pattern for better scalability.');
    }

    return warnings;
  }
}

/**
 * Convenience function for quick conversion
 */
export function convertWorkflow(
  workflow: N8nWorkflow,
  options?: CodeGenerationOptions
): ConversionOutput {
  const converter = new N8nToInngestConverter(options);
  return converter.convert(workflow);
}

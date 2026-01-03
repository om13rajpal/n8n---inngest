/**
 * Enhanced AI/LLM Node Converters - Production Patterns
 * Generates production-ready AgentKit code matching E:/agiready/saas patterns
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import {
  NodeConverter,
  ConversionContext,
  ConversionResult,
  toStepId,
  toVariableName,
  generateDataAccess,
} from './base-converter.js';
import { AIAgentNodeParameters } from '../types/n8n.js';
import {
  generateOpenRouterHelper,
  generateSaveResultsTool,
  generateToolWithStepWrapping,
  generateSearchTool,
  generateResultSchema,
  generateNetworkConfig,
  generateModelConfig,
  generateResultRetrieval,
} from './ai-converter-helpers.js';

/**
 * Enhanced AI Agent Node Converter with Production Patterns
 *
 * Improvements over original:
 * 1. ✅ Custom router to avoid schema validation errors
 * 2. ✅ OpenRouter configuration with provider preferences
 * 3. ✅ Network state management for result retrieval
 * 4. ✅ Save results tool pattern
 * 5. ✅ Step wrapping in tool handlers
 * 6. ✅ Performance optimizations (maxIter, model selection)
 */
export const enhancedAiAgentConverter: NodeConverter = {
  nodeTypes: [
    '@n8n/n8n-nodes-langchain.agent',
    '@n8n/n8n-nodes-langchain.chainLlm',
    '@n8n/n8n-nodes-langchain.chainRetrievalQa',
    '@n8n/n8n-nodes-langchain.chainSummarization',
  ],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as AIAgentNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Find connected AI sub-nodes
    const connectedTools = findConnectedAINodes(node, context, 'ai_tool');
    const connectedMemory = findConnectedAINodes(node, context, 'ai_memory');
    const connectedLLM = findConnectedAINodes(node, context, 'ai_languageModel');

    if (context.options.useAgentKit) {
      // Generate enhanced AgentKit code with production patterns
      return generateEnhancedAgentKitCode(node, params, dataAccess, context, {
        tools: connectedTools,
        memory: connectedMemory,
        llm: connectedLLM,
      });
    }

    // Fallback to basic implementation
    return generateBasicAICode(node, params, dataAccess, context);
  },
};

/**
 * Generate enhanced AgentKit code with ALL production patterns
 */
function generateEnhancedAgentKitCode(
  node: ParsedNode,
  params: AIAgentNodeParameters,
  dataAccess: string,
  context: ConversionContext,
  connections: {
    tools: ParsedNode[];
    memory: ParsedNode[];
    llm: ParsedNode[];
  }
): ConversionResult {
  const stepId = toStepId(node.name);
  const agentName = toVariableName(node.name) + 'Agent';
  const networkName = toVariableName(node.name) + 'Network';

  const systemMessage = params.options?.systemMessage || 'You are a helpful AI assistant.';
  const maxIterations = params.options?.maxIterations || 10;

  // Generate result schema from parameters
  const resultSchema = generateResultSchema(params as unknown as Record<string, unknown>);

  // Generate tools with step wrapping
  const toolsCode = connections.tools.length > 0
    ? connections.tools.map(t => generateToolWithStepWrapping(t, context)).join('\n\n      ')
    : '';

  // Add search tool if agent needs web search capability
  // For now, disabled by default - can be enabled via custom parameters
  const hasSearchCapability = false; // TODO: Add to AIAgentNodeParameters type
  const searchToolCode = hasSearchCapability ? generateSearchTool('tavily') : '';

  // Generate save results tool
  const saveToolCode = generateSaveResultsTool(node.name, resultSchema);

  // Combine all tools
  const allToolsCode = [toolsCode, searchToolCode, saveToolCode]
    .filter(Boolean)
    .join('\n\n      ');

  // Generate model configuration with OpenRouter
  const modelCode = generateModelConfig(
    connections.llm.length > 0 ? connections.llm[0] : null,
    true // use OpenRouter
  );

  // Build tools array for agent
  const toolNames = [
    ...connections.tools.map(t => toVariableName(t.name) + 'Tool'),
    hasSearchCapability ? 'webSearchTool' : '',
    'saveResultsTool',
  ].filter(Boolean);

  const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.text || data.prompt || data.message || JSON.stringify(data);

      // Check environment variables
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY environment variable is required");
      }
      ${hasSearchCapability ? 'if (!process.env.TAVILY_API_KEY) { throw new Error("TAVILY_API_KEY required for web search"); }' : ''}

      ${generateOpenRouterHelper()}

      ${allToolsCode}

      // Create AI agent
      const ${agentName} = createAgent({
        name: "${node.name}",
        description: "AI agent specialized in the task",
        system: \`${systemMessage}

## IMPORTANT Instructions

When you have completed the task and gathered all necessary information, you MUST call the save_results tool with your findings.

If you need additional information that's not available, use the provided tools to gather it, then save your results.\`,
        tools: [${toolNames.join(', ')}],
        model: ${modelCode},
      });

      ${generateNetworkConfig(networkName, agentName, modelCode, maxIterations)}

      // Run the network (NOT wrapped in step.run to avoid NESTING_STEPS error)
      // NOTE: This is important - wrapping network.run() in step.run() causes errors
      const startTime = Date.now();
      const networkResult = await ${networkName}.run(input);
      const duration = Date.now() - startTime;

      ${generateResultRetrieval('results')}

      // Return results with metadata
      return {
        ...results,
        metadata: {
          duration_ms: duration,
          agent_name: "${node.name}",
          completed: !!results.completed,
        },
      };
  `.trim();

  return {
    steps: [{
      type: 'run',
      id: stepId,
      code,
      comment: `AI Agent (Enhanced AgentKit): ${node.name}`,
    }],
    additionalImports: [
      'import { createAgent, createNetwork, createTool, openai, anthropic } from "@inngest/agent-kit";',
      'import { z } from "zod";',
    ],
    helperFunctions: [
      '// Note: Ensure OPENROUTER_API_KEY is set in your environment',
      hasSearchCapability ? '// Note: Ensure TAVILY_API_KEY is set for web search capability' : '',
    ].filter(Boolean),
  };
}

/**
 * Generate basic AI code (fallback when not using AgentKit)
 */
function generateBasicAICode(
  node: ParsedNode,
  params: AIAgentNodeParameters,
  dataAccess: string,
  context: ConversionContext
): ConversionResult {
  const stepId = toStepId(node.name);
  const systemMessage = params.options?.systemMessage || 'You are a helpful assistant.';

  const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.text || data.prompt || data.message || JSON.stringify(data);

      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY environment variable is required");
      }

      // AI Agent implementation using OpenRouter
      // NOTE: For full agent capabilities, use @inngest/agent-kit (set useAgentKit: true)

      const systemPrompt = \`${systemMessage}\`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ];

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.OPENROUTER_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4",
          messages,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[AIAgent] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        output: result.choices?.[0]?.message?.content,
        usage: result.usage,
      };
    `.trim();

  return {
    steps: [{
      type: 'run',
      id: stepId,
      code,
      comment: `AI Agent (Basic): ${node.name}`,
    }],
  };
}

/**
 * Find connected AI sub-nodes by connection type
 */
function findConnectedAINodes(
  node: ParsedNode,
  context: ConversionContext,
  connectionType: string
): ParsedNode[] {
  const connected: ParsedNode[] = [];

  for (const conn of node.incomingConnections) {
    if (conn.connectionType === connectionType) {
      const connectedNode = context.allNodes.get(conn.nodeName);
      if (connectedNode) {
        connected.push(connectedNode);
      }
    }
  }

  return connected;
}

/**
 * Export enhanced converter
 * This can replace the original aiAgentConverter
 */
export const enhancedAIConverters = [
  enhancedAiAgentConverter,
];

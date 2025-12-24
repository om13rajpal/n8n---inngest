/**
 * AI/LLM Node Converters
 * Converts n8n AI Agent, LangChain, and OpenAI nodes to Inngest AgentKit
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import {
  NodeConverter,
  ConversionContext,
  ConversionResult,
  toStepId,
  toVariableName,
  convertN8nExpression,
  generateDataAccess,
  generateEnvVarCheck,
  generateHttpRequest,
  generateDataExtraction,
} from './base-converter.js';
import { OpenAINodeParameters, AIAgentNodeParameters } from '../types/n8n.js';

// ============================================================================
// AI-SPECIFIC HELPER FUNCTIONS
// ============================================================================

/**
 * Generate OpenAI API call with standardized error handling
 */
function generateOpenAIApiCall(
  endpoint: string,
  bodyCode: string,
  responseFields: Record<string, string>
): string {
  const fieldEntries = Object.entries(responseFields)
    .map(([key, path]) => `${key}: ${path}`)
    .join(',\n        ');

  return `
      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/${endpoint}", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(${bodyCode}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:${endpoint}] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        ${fieldEntries}
      };
  `.trim();
}

/**
 * Generate Perplexity API call with standardized error handling
 */
function generatePerplexityApiCall(
  model: string,
  messagesCode: string,
  options: { returnCitations?: boolean; returnImages?: boolean } = {}
): string {
  return `
      ${generateEnvVarCheck('N8N_PERPLEXITY_API_KEY', 'Perplexity')}

      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_PERPLEXITY_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          messages: ${messagesCode},
          ${options.returnCitations ? 'return_citations: true,' : ''}
          ${options.returnImages ? 'return_images: true,' : ''}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Perplexity] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        content: result.choices?.[0]?.message?.content,
        citations: result.citations || [],
        images: result.images || [],
        usage: result.usage,
        model: result.model,
      };
  `.trim();
}

/**
 * OpenAI Node Converter (base version)
 */
export const openaiConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.openAi'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as OpenAINodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const resource = params.resource || 'chat';
    const model = params.model || 'gpt-4o';

    let code: string;

    if (resource === 'chat') {
      code = generateOpenAIChatCompletion(params, dataAccess, model, context);
    } else if (resource === 'completion') {
      code = generateOpenAICompletion(params, dataAccess, model, context);
    } else if (resource === 'image') {
      code = generateOpenAIImage(params, dataAccess, context);
    } else if (resource === 'embedding') {
      code = generateOpenAIEmbedding(params, dataAccess, model, context);
    } else {
      code = `
      // TODO: Implement OpenAI resource: ${resource}
      return ${dataAccess};
      `.trim();
    }

    // Use Inngest's step.ai.infer when available
    if (context.options.useAgentKit) {
      return {
        steps: [{
          type: 'ai.infer',
          id: stepId,
          model: `openai({ model: "${model}" })`,
          body: {
            messages: generateMessagesFromParams(params, dataAccess, context),
            temperature: params.options?.temperature,
            maxTokens: params.options?.maxTokens,
          },
          comment: `OpenAI ${resource}: ${node.name}`,
        }],
        additionalImports: [
          'import { openai } from "@inngest/agent-kit";',
        ],
      };
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `OpenAI ${resource}: ${node.name}`,
      }],
    };
  },
};

function generateOpenAIChatCompletion(
  params: OpenAINodeParameters,
  dataAccess: string,
  model: string,
  _context: ConversionContext
): string {
  const messages = params.messages?.values || [];
  const messagesCode = messages.length > 0
    ? JSON.stringify(messages.map(m => ({
        role: m.role,
        content: m.content,
      })))
    : `[{ role: "user", content: ${dataAccess}.prompt || ${dataAccess}.message || JSON.stringify(${dataAccess}) }]`;

  const options = params.options || {};

  // Build options object
  const optionLines: string[] = [];
  if (options.temperature !== undefined) optionLines.push(`temperature: ${options.temperature}`);
  if (options.maxTokens !== undefined) optionLines.push(`max_tokens: ${options.maxTokens}`);
  if (options.topP !== undefined) optionLines.push(`top_p: ${options.topP}`);
  if (options.frequencyPenalty !== undefined) optionLines.push(`frequency_penalty: ${options.frequencyPenalty}`);
  if (options.presencePenalty !== undefined) optionLines.push(`presence_penalty: ${options.presencePenalty}`);

  const bodyOptions = optionLines.length > 0 ? optionLines.join(',\n          ') + ',' : '';

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          messages: ${messagesCode},
          ${bodyOptions}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:chat/completions] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        content: result.choices?.[0]?.message?.content,
        usage: result.usage,
        model: result.model,
        finishReason: result.choices?.[0]?.finish_reason,
      };
  `.trim();
}

function generateOpenAICompletion(
  params: OpenAINodeParameters,
  dataAccess: string,
  model: string,
  context: ConversionContext
): string {
  const prompt = params.prompt
    ? convertN8nExpression(params.prompt, context)
    : `${dataAccess}.prompt || ${dataAccess}`;

  const maxTokens = params.options?.maxTokens || 256;

  return `
      const data = ${dataAccess};
      const prompt = ${prompt};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          prompt,
          max_tokens: ${maxTokens},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:completions] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        text: result.choices?.[0]?.text,
        usage: result.usage,
      };
  `.trim();
}

function generateOpenAIImage(
  params: OpenAINodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const prompt = params.prompt
    ? convertN8nExpression(params.prompt, context)
    : `${dataAccess}.prompt || ${dataAccess}`;

  const options = params.options || {};
  const size = (options as Record<string, unknown>).size as string || '1024x1024';
  const quality = (options as Record<string, unknown>).quality as string || 'standard';

  return `
      const data = ${dataAccess};
      const prompt = ${prompt};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "${size}",
          quality: "${quality}",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:images/generations] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        url: result.data?.[0]?.url,
        revisedPrompt: result.data?.[0]?.revised_prompt,
      };
  `.trim();
}

function generateOpenAIEmbedding(
  _params: OpenAINodeParameters,
  dataAccess: string,
  model: string,
  _context: ConversionContext
): string {
  const embeddingModel = model.includes('embedding') ? model : 'text-embedding-3-small';

  return `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.text || data.input || JSON.stringify(data);

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${embeddingModel}",
          input,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:embeddings] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        embedding: result.data?.[0]?.embedding,
        usage: result.usage,
      };
  `.trim();
}

function generateMessagesFromParams(
  params: OpenAINodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const messages = params.messages?.values || [];
  if (messages.length > 0) {
    return JSON.stringify(messages.map(m => ({
      role: m.role,
      content: m.content,
    })));
  }
  return `[{ role: "user", content: ${dataAccess}.prompt || ${dataAccess}.message || String(${dataAccess}) }]`;
}

/**
 * AI Agent Node Converter (LangChain)
 */
export const aiAgentConverter: NodeConverter = {
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

    // Check for connected AI sub-nodes (tools, memory, etc.)
    const connectedTools = findConnectedAINodes(node, context, 'ai_tool');
    const connectedMemory = findConnectedAINodes(node, context, 'ai_memory');
    const connectedLLM = findConnectedAINodes(node, context, 'ai_languageModel');

    if (context.options.useAgentKit) {
      // Generate AgentKit network code
      return generateAgentKitCode(node, params, dataAccess, context, {
        tools: connectedTools,
        memory: connectedMemory,
        llm: connectedLLM,
      });
    }

    // Generate standard step.run code with OpenAI
    const systemMessage = params.options?.systemMessage || 'You are a helpful assistant.';

    const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.text || data.prompt || data.message || JSON.stringify(data);

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      // AI Agent implementation
      // NOTE: For full agent capabilities, consider using @inngest/agent-kit
      // This is a simplified implementation using direct OpenAI calls

      const systemPrompt = \`${systemMessage}\`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
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
        comment: `AI Agent: ${node.name}`,
      }],
    };
  },
};

/**
 * Generate AgentKit code for AI Agent node
 */
function generateAgentKitCode(
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
  const varName = toVariableName(node.name);
  const agentName = toVariableName(node.name) + 'Agent';
  const networkName = toVariableName(node.name) + 'Network';

  const systemMessage = params.options?.systemMessage || 'You are a helpful AI assistant.';
  const maxIterations = params.options?.maxIterations || 10;

  // Generate tools
  const toolsCode = connections.tools.length > 0
    ? generateToolsCode(connections.tools, context)
    : '';

  // Determine model from connected LLM or default
  const modelCode = connections.llm.length > 0
    ? getModelFromLLMNode(connections.llm[0])
    : 'openai({ model: "gpt-4o" })';

  const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.text || data.prompt || data.message || JSON.stringify(data);

      ${toolsCode}

      // Create agent
      const ${agentName} = createAgent({
        name: "${node.name}",
        description: "AI Agent from n8n workflow",
        system: \`${systemMessage}\`,
        tools: [${connections.tools.map(t => toVariableName(t.name) + 'Tool').join(', ')}],
      });

      // Create network
      const ${networkName} = createNetwork({
        name: "${networkName}",
        agents: [${agentName}],
        defaultModel: ${modelCode},
        maxIter: ${maxIterations},
      });

      // Run the network
      const result = await ${networkName}.run(input);

      return {
        output: result.output,
        state: result.state,
      };
  `.trim();

  return {
    steps: [{
      type: 'run',
      id: stepId,
      code,
      comment: `AI Agent (AgentKit): ${node.name}`,
    }],
    additionalImports: [
      'import { createAgent, createNetwork, createTool, openai, anthropic } from "@inngest/agent-kit";',
      'import { z } from "zod";',
    ],
  };
}

/**
 * Find connected AI sub-nodes
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
 * Generate tool code from tool nodes
 */
function generateToolsCode(toolNodes: ParsedNode[], context: ConversionContext): string {
  return toolNodes.map(toolNode => {
    const toolName = toVariableName(toolNode.name) + 'Tool';
    const params = toolNode.parameters as Record<string, unknown>;

    if (toolNode.type === '@n8n/n8n-nodes-langchain.toolCode') {
      // Custom code tool
      const jsCode = params.jsCode as string || 'return input;';
      return `
      const ${toolName} = createTool({
        name: "${toolNode.name}",
        description: "${params.description || 'Custom tool'}",
        parameters: z.object({
          input: z.string().describe("Input to the tool"),
        }),
        handler: async ({ input }) => {
          ${jsCode}
        },
      });
      `.trim();
    }

    if (toolNode.type === '@n8n/n8n-nodes-langchain.toolCalculator') {
      return `
      const ${toolName} = createTool({
        name: "calculator",
        description: "Perform mathematical calculations",
        parameters: z.object({
          expression: z.string().describe("Mathematical expression to evaluate"),
        }),
        handler: async ({ expression }) => {
          // Simple calculator implementation
          try {
            const result = Function('"use strict";return (' + expression + ')')();
            return String(result);
          } catch (e) {
            return "Error: Invalid expression";
          }
        },
      });
      `.trim();
    }

    if (toolNode.type === '@n8n/n8n-nodes-langchain.toolHttpRequest') {
      const url = params.url as string || '';
      const method = params.method as string || 'GET';
      return `
      const ${toolName} = createTool({
        name: "http_request",
        description: "Make HTTP requests",
        parameters: z.object({
          url: z.string().describe("URL to request"),
          body: z.string().optional().describe("Request body"),
        }),
        handler: async ({ url, body }) => {
          const response = await fetch(url || "${url}", {
            method: "${method}",
            body: body ? JSON.stringify(body) : undefined,
            headers: { "Content-Type": "application/json" },
          });
          return await response.text();
        },
      });
      `.trim();
    }

    // Default generic tool
    return `
      const ${toolName} = createTool({
        name: "${toolNode.name}",
        description: "${params.description || 'Tool from n8n'}",
        parameters: z.object({
          input: z.string(),
        }),
        handler: async ({ input }) => {
          // TODO: Implement tool logic from ${toolNode.type}
          return input;
        },
      });
    `.trim();
  }).join('\n\n      ');
}

/**
 * Get model configuration from LLM node
 */
function getModelFromLLMNode(llmNode: ParsedNode): string {
  const params = llmNode.parameters as Record<string, unknown>;
  const model = params.model as string;

  if (llmNode.type.includes('OpenAi') || llmNode.type.includes('openai')) {
    return `openai({ model: "${model || 'gpt-4o'}" })`;
  }

  if (llmNode.type.includes('Anthropic') || llmNode.type.includes('anthropic')) {
    return `anthropic({ model: "${model || 'claude-3-5-sonnet-latest'}" })`;
  }

  if (llmNode.type.includes('Ollama')) {
    return `openai({ model: "${model || 'llama2'}", baseURL: process.env.N8N_OLLAMA_BASE_URL || "http://localhost:11434/v1" })`;
  }

  if (llmNode.type.includes('OpenRouter')) {
    // OpenRouter uses OpenAI-compatible API
    // Model format is typically "provider/model" e.g., "anthropic/claude-opus-4.5"
    const openRouterModel = model || 'openai/gpt-4o';
    return `openai({ model: "${openRouterModel}", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.N8N_OPENROUTER_API_KEY })`;
  }

  return `openai({ model: "gpt-4o" })`;
}

/**
 * LangChain Chat Model Converter
 * Supports OpenAI, Anthropic, Ollama, and OpenRouter
 */
export const chatModelConverter: NodeConverter = {
  nodeTypes: [
    '@n8n/n8n-nodes-langchain.lmChatOpenAi',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic',
    '@n8n/n8n-nodes-langchain.lmChatOllama',
    '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  ],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    // Chat model nodes are typically connected to agent nodes
    // They don't produce steps themselves but configure the model
    const params = node.parameters as Record<string, unknown>;
    const model = params.model as string || 'gpt-4o';

    // Store model info for parent agent node
    context.variableMap.set(node.name + '_model', model);
    context.variableMap.set(node.name + '_type', node.type);

    return {
      steps: [], // No steps - configuration only
    };
  },
};

/**
 * Memory Node Converter
 */
export const memoryNodeConverter: NodeConverter = {
  nodeTypes: [
    '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    '@n8n/n8n-nodes-langchain.memoryPostgresChat',
    '@n8n/n8n-nodes-langchain.memoryRedisChat',
  ],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    // Memory nodes configure agent memory
    // In AgentKit, memory is handled through state
    const params = node.parameters as Record<string, unknown>;

    context.variableMap.set(node.name + '_windowSize', String(params.windowSize || 10));

    return {
      steps: [], // Configuration only
    };
  },
};

/**
 * Output Parser Converter
 */
export const outputParserConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.outputParserStructured'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const schema = params.schemaType === 'manual'
      ? params.schema
      : params.jsonSchema;

    const code = `
      const data = ${dataAccess};
      const text = typeof data === 'string' ? data : data.output || data.content || data.text || JSON.stringify(data);

      // Parse structured output
      // Schema: ${JSON.stringify(schema)}

      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(text);
        return parsed;
      } catch {
        // If not valid JSON, try to extract JSON from the text
        const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return { raw: text };
      }
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Output Parser: ${node.name}`,
      }],
    };
  },
};

/**
 * Agent Tool Converter (Sub-agent as a tool)
 * Converts n8n agentTool node to AgentKit tool
 */
export const agentToolConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.agentTool'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const toolDescription = params.toolDescription as string || 'Sub-agent tool';
    const text = params.text as string || '';

    // Find connected sub-tools and LLM for this agent tool
    const connectedTools = findConnectedAINodes(node, context, 'ai_tool');
    const connectedLLM = findConnectedAINodes(node, context, 'ai_languageModel');

    const toolsCode = connectedTools.length > 0
      ? generateToolsCode(connectedTools, context)
      : '';

    const modelCode = connectedLLM.length > 0
      ? getModelFromLLMNode(connectedLLM[0])
      : 'openai({ model: "gpt-4o" })';

    const options = params.options as Record<string, unknown> | undefined;
    const systemMessage = (options?.systemMessage as string) || 'You are a helpful assistant.';

    const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : ${text ? convertN8nExpression(text, context) : 'data.text || data.prompt || JSON.stringify(data)'};

      ${generateEnvVarCheck('N8N_OPENROUTER_API_KEY', 'OpenRouter')}

      ${toolsCode}

      // Sub-agent implementation
      // Tool Description: ${toolDescription}
      const subAgentMessages = [
        { role: "system", content: \`${systemMessage}\` },
        { role: "user", content: input },
      ];

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENROUTER_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${modelCode.includes('openrouter') ? 'openai/gpt-4o' : 'gpt-4o'}",
          messages: subAgentMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[AgentTool] Request failed: \${response.status} - \${errorText}\`);
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
        comment: `Agent Tool (Sub-agent): ${node.name}`,
      }],
    };
  },
};

/**
 * Perplexity Tool Converter
 * Converts n8n perplexityTool to Inngest step with Perplexity API
 */
export const perplexityToolConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.perplexityTool'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const model = params.model as string || 'sonar-pro';
    const messages = params.messages as { message: Array<{ content: string }> } | undefined;

    const code = `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_PERPLEXITY_API_KEY', 'Perplexity')}

      // Build message content from input or parameters
      let messageContent;
      ${messages?.message?.[0]?.content
        ? `messageContent = ${convertN8nExpression(messages.message[0].content, context)};`
        : 'messageContent = typeof data === "string" ? data : data.query || data.message || JSON.stringify(data);'
      }

      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_PERPLEXITY_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          messages: [
            { role: "user", content: messageContent }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Perplexity:Tool] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        content: result.choices?.[0]?.message?.content,
        citations: result.citations || [],
        usage: result.usage,
      };
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Perplexity Search: ${node.name}`,
      }],
    };
  },
};

/**
 * HTTP Request Tool Converter (AI Tool variant)
 * Converts n8n httpRequestTool to Inngest step for AI agent tools
 */
export const httpRequestToolConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.httpRequestTool'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const toolDescription = params.toolDescription as string || 'HTTP request tool';
    const method = params.method as string || 'GET';
    const url = params.url as string || '';
    const sendHeaders = params.sendHeaders as boolean || false;
    const sendBody = params.sendBody as boolean || false;

    // Build headers
    let headersCode = '{}';
    if (sendHeaders && params.headerParameters) {
      const headerParams = params.headerParameters as { parameters: Array<{ name: string; value: string }> };
      if (headerParams.parameters) {
        const headers = headerParams.parameters
          .map(h => `"${h.name}": ${convertN8nExpression(h.value, context)}`)
          .join(',\n          ');
        headersCode = `{\n          ${headers}\n        }`;
      }
    }

    // Build body
    let bodyCode = 'undefined';
    if (sendBody && params.bodyParameters) {
      const bodyParams = params.bodyParameters as { parameters: Array<{ name: string; value: string }> };
      if (bodyParams.parameters) {
        const body = bodyParams.parameters
          .map(b => `"${b.name}": ${convertN8nExpression(b.value, context)}`)
          .join(',\n          ');
        bodyCode = `JSON.stringify({\n          ${body}\n        })`;
      }
    }

    const code = `
      const data = ${dataAccess};

      // HTTP Request Tool: ${toolDescription}
      const url = ${url ? convertN8nExpression(url, context) : 'data.url'};

      if (!url) {
        throw new Error("[HTTPTool] No URL provided for HTTP request");
      }

      const response = await fetch(url, {
        method: "${method}",
        headers: {
          "Content-Type": "application/json",
          ...${headersCode},
        },
        ${method !== 'GET' && method !== 'HEAD' ? `body: ${bodyCode},` : ''}
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[HTTPTool] Request failed: \${response.status} - \${errorText}\`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `HTTP Tool: ${node.name}`,
      }],
    };
  },
};

/**
 * Think Tool Converter
 * Converts n8n toolThink to a reasoning/thinking step
 */
export const thinkToolConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.toolThink'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // The Think tool is a meta-cognitive tool that allows the AI to "think" before responding
    // In Inngest, we can implement this as a structured reasoning step
    const code = `
      const data = ${dataAccess};
      const input = typeof data === 'string' ? data : data.thought || data.input || JSON.stringify(data);

      // Think tool - structured reasoning step
      // This allows the AI agent to perform intermediate reasoning
      // The output can be used by subsequent steps for better decision making

      return {
        thought: input,
        timestamp: new Date().toISOString(),
        type: "reasoning",
      };
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Think (Reasoning): ${node.name}`,
      }],
    };
  },
};

/**
 * Wikipedia Tool Converter
 */
export const wikipediaToolConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.toolWikipedia'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const code = `
      const data = ${dataAccess};
      const query = typeof data === 'string' ? data : data.query || data.search || '';

      if (!query) {
        throw new Error("[Wikipedia] No search query provided");
      }

      // Wikipedia API search
      const searchUrl = \`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\${encodeURIComponent(query)}&format=json&origin=*\`;

      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        throw new Error(\`[Wikipedia] Search failed: \${searchResponse.status}\`);
      }
      const searchData = await searchResponse.json();

      if (!searchData.query?.search?.length) {
        return { content: "No Wikipedia results found.", query, found: false };
      }

      // Get the first result's content
      const title = searchData.query.search[0].title;
      const contentUrl = \`https://en.wikipedia.org/w/api.php?action=query&titles=\${encodeURIComponent(title)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*\`;

      const contentResponse = await fetch(contentUrl);
      if (!contentResponse.ok) {
        throw new Error(\`[Wikipedia] Content fetch failed: \${contentResponse.status}\`);
      }
      const contentData = await contentResponse.json();

      const pages = contentData.query?.pages || {};
      const page = Object.values(pages)[0] as { title: string; extract: string };

      return {
        title: page?.title,
        content: page?.extract,
        query,
        found: true,
      };
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Wikipedia Search: ${node.name}`,
      }],
    };
  },
};

/**
 * Calculator Tool Converter
 */
export const calculatorToolConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.toolCalculator'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const code = `
      const data = ${dataAccess};
      const expression = typeof data === 'string' ? data : data.expression || data.input || '';

      // Safe calculator implementation
      try {
        // Use Function constructor for safe evaluation (still be careful in production)
        const sanitized = expression.replace(/[^0-9+\\-*/().\\s]/g, '');
        const result = Function('"use strict"; return (' + sanitized + ')')();
        return {
          expression,
          result: String(result),
          success: true,
        };
      } catch (error) {
        return {
          expression,
          result: "Error: Invalid expression",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Calculator: ${node.name}`,
      }],
    };
  },
};

/**
 * Perplexity Node Converter (non-tool version)
 * Converts n8n Perplexity node (standalone, not AI tool) to Inngest step
 */
export const perplexityConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.perplexity'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const resource = params.resource as string || 'chatCompletion';
    const model = params.model as string || 'sonar-pro';

    let code: string;

    if (resource === 'chatCompletion') {
      const options = params.options as Record<string, unknown> || {};
      const prompt = params.prompt as string || '';
      const returnCitations = options.returnCitations as boolean ?? true;
      const returnImages = options.returnImages as boolean ?? false;
      const returnRelatedQuestions = options.returnRelatedQuestions as boolean ?? false;

      const promptCode = prompt
        ? convertN8nExpression(prompt, context)
        : `typeof ${dataAccess} === 'string' ? ${dataAccess} : ${dataAccess}.prompt || ${dataAccess}.query || JSON.stringify(${dataAccess})`;

      // Build options for body
      const bodyOptions: string[] = [];
      if (returnCitations) bodyOptions.push('return_citations: true');
      if (returnImages) bodyOptions.push('return_images: true');
      if (returnRelatedQuestions) bodyOptions.push('return_related_questions: true');
      const bodyOptionsStr = bodyOptions.length > 0 ? bodyOptions.join(',\n          ') + ',' : '';

      code = `
      const data = ${dataAccess};
      const prompt = ${promptCode};

      ${generateEnvVarCheck('N8N_PERPLEXITY_API_KEY', 'Perplexity')}

      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_PERPLEXITY_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          messages: [
            { role: "user", content: prompt }
          ],
          ${bodyOptionsStr}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Perplexity] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        content: result.choices?.[0]?.message?.content,
        citations: result.citations || [],
        images: result.images || [],
        relatedQuestions: result.related_questions || [],
        usage: result.usage,
        model: result.model,
      };
      `.trim();
    } else {
      // Default handling for other resources
      code = `
      const data = ${dataAccess};

      // TODO: Implement Perplexity resource: ${resource}
      // Current input: data

      return data;
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Perplexity ${resource}: ${node.name}`,
      }],
    };
  },
};

/**
 * LangChain OpenAI Node Converter
 * Converts @n8n/n8n-nodes-langchain.openAi to Inngest step
 * This handles the langchain-specific OpenAI node variant
 */
export const langchainOpenAiConverter: NodeConverter = {
  nodeTypes: ['@n8n/n8n-nodes-langchain.openAi'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const resource = params.resource as string || 'chat';
    const operation = params.operation as string || 'message';
    const model = params.model as string || 'gpt-4o';

    let code: string;

    if (resource === 'chat' || resource === 'text') {
      // Get message/prompt from parameters
      const text = params.text as string || '';
      const prompt = params.prompt as string || '';
      const inputText = text || prompt;

      const messageCode = inputText
        ? convertN8nExpression(inputText, context)
        : `typeof ${dataAccess} === 'string' ? ${dataAccess} : ${dataAccess}.text || ${dataAccess}.prompt || ${dataAccess}.message || JSON.stringify(${dataAccess})`;

      // Get options
      const options = params.options as Record<string, unknown> || {};
      const temperature = options.temperature as number ?? 0.7;
      const maxTokens = options.maxTokens as number || 4096;
      const topP = options.topP as number | undefined;
      const frequencyPenalty = options.frequencyPenalty as number | undefined;
      const presencePenalty = options.presencePenalty as number | undefined;

      // Build options for body
      const bodyOptions: string[] = [];
      if (topP !== undefined) bodyOptions.push(`top_p: ${topP}`);
      if (frequencyPenalty !== undefined) bodyOptions.push(`frequency_penalty: ${frequencyPenalty}`);
      if (presencePenalty !== undefined) bodyOptions.push(`presence_penalty: ${presencePenalty}`);
      const bodyOptionsStr = bodyOptions.length > 0 ? bodyOptions.join(',\n          ') + ',' : '';

      code = `
      const data = ${dataAccess};
      const messageContent = ${messageCode};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "${model}",
          messages: [
            { role: "user", content: messageContent }
          ],
          temperature: ${temperature},
          max_tokens: ${maxTokens},
          ${bodyOptionsStr}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:LangChain] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        content: result.choices?.[0]?.message?.content,
        usage: result.usage,
        model: result.model,
        finishReason: result.choices?.[0]?.finish_reason,
      };
      `.trim();
    } else if (resource === 'image') {
      const prompt = params.prompt as string || '';
      const promptCode = prompt
        ? convertN8nExpression(prompt, context)
        : `${dataAccess}.prompt || ${dataAccess}`;

      const options = params.options as Record<string, unknown> || {};
      const size = options.size as string || '1024x1024';
      const quality = options.quality as string || 'standard';

      code = `
      const data = ${dataAccess};
      const prompt = ${promptCode};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "${size}",
          quality: "${quality}",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:images/generations] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        url: result.data?.[0]?.url,
        revisedPrompt: result.data?.[0]?.revised_prompt,
      };
      `.trim();
    } else if (resource === 'audio') {
      const operation = params.operation as string || 'transcribe';

      if (operation === 'transcribe') {
        code = `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_OPENAI_API_KEY', 'OpenAI')}

      // Audio transcription requires file upload
      // In n8n, this typically comes from a previous node
      const audioData = data.binary?.data || data.audio;

      if (!audioData) {
        throw new Error("[OpenAI:audio] No audio data provided for transcription");
      }

      // Note: For actual implementation, you'd need to handle file upload
      // This is a placeholder showing the API structure
      const formData = new FormData();
      formData.append('model', 'whisper-1');
      // formData.append('file', audioData);

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_OPENAI_API_KEY}\`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[OpenAI:audio/transcriptions] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return {
        text: result.text,
      };
        `.trim();
      } else {
        code = `
      const data = ${dataAccess};
      // TODO: Implement OpenAI audio operation: ${operation}
      return data;
        `.trim();
      }
    } else {
      code = `
      const data = ${dataAccess};
      // TODO: Implement OpenAI langchain resource: ${resource}
      return data;
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `OpenAI (LangChain) ${resource}: ${node.name}`,
      }],
    };
  },
};

// Export all AI converters
export const aiConverters: NodeConverter[] = [
  openaiConverter,
  langchainOpenAiConverter,
  perplexityConverter,
  aiAgentConverter,
  chatModelConverter,
  memoryNodeConverter,
  outputParserConverter,
  agentToolConverter,
  perplexityToolConverter,
  httpRequestToolConverter,
  thinkToolConverter,
  wikipediaToolConverter,
  calculatorToolConverter,
];

/**
 * AI Converter Helper Functions - Production Patterns
 * Enhanced helpers for generating production-ready AgentKit code
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import { ConversionContext } from './base-converter.js';
import { toVariableName, toStepId, convertN8nExpression } from './base-converter.js';

/**
 * Generate OpenRouter configuration helper
 * Production pattern from E:/agiready/saas
 */
export function generateOpenRouterHelper(): string {
  return `
    // OpenRouter configuration with provider preferences
    // Avoids Azure (stricter function schema validation)
    const openrouter = (config: { model: string; apiKey?: string; defaultParameters?: Record<string, unknown> }) =>
      openai({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        defaultParameters: {
          ...config.defaultParameters,
          provider: {
            order: ["OpenAI", "Anthropic", "Together"],
            ignore: ["Azure"],
          },
        } as Record<string, unknown>,
      });
  `.trim();
}

/**
 * Generate save_results tool with network state management
 * Production pattern: stores results in network.state.data
 */
export function generateSaveResultsTool(nodeName: string, resultSchema: string): string {
  return `
    // Tool: Save final results to network state
    const saveResultsTool = createTool({
      name: "save_results",
      description: "Save the final results when task is complete. Call this when you have all the information needed.",
      parameters: z.object({
        ${resultSchema}
      }),
      handler: async (result, { network }) => {
        // Store results in network state for retrieval
        if (network) network.state.data.results = result;
        return { success: true, message: "Results saved successfully" };
      },
    });
  `.trim();
}

/**
 * Generate custom router to avoid schema validation errors
 * Production pattern: bypasses default routing agent
 */
export function generateCustomRouter(agentName: string): string {
  return `
      // Custom router to bypass Default Routing Agent (avoids schema validation errors)
      // Since we only have one agent, we don't need LLM-based routing
      defaultRouter: ({ network }) => {
        // Stop if results have been saved, otherwise keep running the agent
        if (network.state.data.results) {
          return undefined;
        }
        return ${agentName};
      },
  `.trim();
}

/**
 * Generate tool with step wrapping for retryability
 * Production pattern: wraps external operations in step?.run()
 */
export function generateToolWithStepWrapping(
  toolNode: ParsedNode,
  context: ConversionContext
): string {
  const toolName = toVariableName(toolNode.name) + 'Tool';
  const params = toolNode.parameters as Record<string, unknown>;

  if (toolNode.type === '@n8n/n8n-nodes-langchain.toolCode') {
    const jsCode = params.jsCode as string || 'return input;';
    const description = params.description as string || 'Custom code tool';

    return `
    const ${toolName} = createTool({
      name: "${toolNode.name}",
      description: "${description}",
      parameters: z.object({
        input: z.string().describe("Input to the tool"),
      }),
      handler: async ({ input }, { step }) => {
        // Wrap in step.run for retryability if available
        return await step?.run("${toStepId(toolNode.name)}", async () => {
          ${jsCode}
        }) ?? (() => { ${jsCode} })();
      },
    });
    `.trim();
  }

  if (toolNode.type === '@n8n/n8n-nodes-langchain.toolHttpRequest') {
    const url = params.url as string || '';
    const method = params.method as string || 'GET';
    const description = params.description as string || 'Make HTTP requests';

    return `
    const ${toolName} = createTool({
      name: "http_request",
      description: "${description}",
      parameters: z.object({
        url: z.string().describe("URL to request"),
        body: z.string().optional().describe("Request body"),
      }),
      handler: async ({ url, body }, { step }) => {
        // Wrap external API call in step.run for retryability
        return await step?.run("http-request-${toStepId(toolNode.name)}", async () => {
          const response = await fetch(url || "${url}", {
            method: "${method}",
            body: body ? JSON.stringify(body) : undefined,
            headers: { "Content-Type": "application/json" },
          });

          if (!response.ok) {
            throw new Error(\`HTTP request failed: \${response.status}\`);
          }

          return await response.text();
        }) ?? fetch(url || "${url}").then(r => r.text());
      },
    });
    `.trim();
  }

  if (toolNode.type === '@n8n/n8n-nodes-langchain.toolCalculator') {
    return `
    const ${toolName} = createTool({
      name: "calculator",
      description: "Perform mathematical calculations. Input should be a valid mathematical expression.",
      parameters: z.object({
        expression: z.string().describe("Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5')"),
      }),
      handler: async ({ expression }) => {
        // Calculator doesn't need step wrapping (pure computation)
        try {
          const sanitized = expression.replace(/[^0-9+\\-*/().\\s]/g, '');
          const result = Function('"use strict";return (' + sanitized + ')')();
          return String(result);
        } catch (e) {
          return "Error: Invalid expression";
        }
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
      handler: async ({ input }, { step }) => {
        // Wrap in step.run if step is available
        return await step?.run("${toStepId(toolNode.name)}", async () => {
          // TODO: Implement tool logic from ${toolNode.type}
          return input;
        }) ?? input;
      },
    });
  `.trim();
}

/**
 * Generate Perplexity/Tavily search tool with step wrapping
 * Production pattern: uses Tavily for faster searches
 */
export function generateSearchTool(apiProvider: 'tavily' | 'perplexity' = 'tavily'): string {
  if (apiProvider === 'tavily') {
    return `
    // Tool: Web Search using Tavily (faster than Perplexity)
    const webSearchTool = createTool({
      name: "web_search",
      description: "Search the web for information. Use ONE comprehensive query to get all needed context.",
      parameters: z.object({
        query: z.string().describe("Comprehensive search query"),
      }),
      handler: async ({ query }, { step }) => {
        if (!process.env.TAVILY_API_KEY) {
          return { error: "Tavily API key not configured" };
        }

        return await step?.run("web-search", async () => {
          const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: process.env.TAVILY_API_KEY,
              query,
              search_depth: "basic",
              include_answer: true,
              max_results: 5,
            }),
          });

          if (!response.ok) {
            throw new Error(\`Tavily search failed: \${response.statusText}\`);
          }

          const data = await response.json();
          return {
            answer: data.answer || "No direct answer available",
            results: data.results || [],
          };
        });
      },
    });
    `.trim();
  }

  // Perplexity version
  return `
    // Tool: Web Search using Perplexity
    const webSearchTool = createTool({
      name: "web_search",
      description: "Search the web for information when website content is insufficient.",
      parameters: z.object({
        query: z.string().describe("The search query to find information"),
      }),
      handler: async ({ query }, { step }) => {
        if (!process.env.PERPLEXITY_API_KEY) {
          return { error: "Perplexity API key not configured" };
        }

        return await step?.run("web-search", async () => {
          const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": \`Bearer \${process.env.PERPLEXITY_API_KEY}\`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages: [{ role: "user", content: query }],
            }),
          });

          if (!response.ok) {
            throw new Error(\`Perplexity search failed: \${response.statusText}\`);
          }

          const data = await response.json();
          return {
            result: data.choices?.[0]?.message?.content || "No results found",
            citations: data.citations || [],
          };
        });
      },
    });
  `.trim();
}

/**
 * Generate result schema based on node parameters
 */
export function generateResultSchema(params: Record<string, unknown>): string {
  // If output schema is defined, use it
  const outputSchema = params.outputSchema as Record<string, unknown> | undefined;

  if (outputSchema) {
    // Parse schema and generate zod schema
    const schemaFields = Object.entries(outputSchema)
      .map(([key, value]) => {
        const desc = typeof value === 'object' ? (value as any).description : '';
        return `${key}: z.string().describe("${desc || key}")`;
      })
      .join(',\n        ');
    return schemaFields;
  }

  // Default schema
  return `result: z.string().describe("The final result or answer")`;
}

/**
 * Generate performance-optimized network configuration
 * Production pattern: limits iterations, uses faster models
 */
export function generateNetworkConfig(
  networkName: string,
  agentName: string,
  modelCode: string,
  maxIterations: number = 10
): string {
  // Cap iterations for performance (production uses 3-6)
  const optimizedMaxIter = Math.min(maxIterations, 5);

  return `
    // Create network with custom router and performance optimizations
    const ${networkName} = createNetwork({
      name: "${networkName}",
      agents: [${agentName}],
      defaultModel: ${modelCode},
      maxIter: ${optimizedMaxIter}, // Optimized for faster completion
      ${generateCustomRouter(agentName)}
    });
  `.trim();
}

/**
 * Generate model configuration with OpenRouter
 * Production pattern: uses OpenRouter for better compatibility
 */
export function generateModelConfig(
  llmNode: ParsedNode | null,
  useOpenRouter: boolean = true
): string {
  if (!llmNode) {
    // Default to OpenRouter with Claude Sonnet 4
    return useOpenRouter
      ? `openrouter({ model: "anthropic/claude-sonnet-4", apiKey: process.env.OPENROUTER_API_KEY })`
      : `openai({ model: "gpt-4o" })`;
  }

  const params = llmNode.parameters as Record<string, unknown>;
  const model = params.model as string;

  if (llmNode.type.includes('OpenAi') || llmNode.type.includes('openai')) {
    return useOpenRouter
      ? `openrouter({ model: "openai/${model || 'gpt-4o'}", apiKey: process.env.OPENROUTER_API_KEY })`
      : `openai({ model: "${model || 'gpt-4o'}" })`;
  }

  if (llmNode.type.includes('Anthropic') || llmNode.type.includes('anthropic')) {
    return useOpenRouter
      ? `openrouter({ model: "anthropic/${model || 'claude-sonnet-4'}", apiKey: process.env.OPENROUTER_API_KEY })`
      : `anthropic({ model: "${model || 'claude-3-5-sonnet-latest'}" })`;
  }

  if (llmNode.type.includes('OpenRouter')) {
    const openRouterModel = model || 'anthropic/claude-sonnet-4';
    return `openrouter({ model: "${openRouterModel}", apiKey: process.env.OPENROUTER_API_KEY })`;
  }

  if (llmNode.type.includes('Ollama')) {
    return `openai({ model: "${model || 'llama2'}", baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1" })`;
  }

  return useOpenRouter
    ? `openrouter({ model: "anthropic/claude-sonnet-4", apiKey: process.env.OPENROUTER_API_KEY })`
    : `openai({ model: "gpt-4o" })`;
}

/**
 * Generate network result retrieval with fallback
 * Production pattern: retrieves from network.state.data
 */
export function generateResultRetrieval(resultType: string = 'results'): string {
  return `
    // Get results from network state (set by save_results tool)
    const ${resultType} = (networkResult.state.data.${resultType}) || {
      output: "Information not available - agent did not complete task",
      completed: false,
    };
  `.trim();
}

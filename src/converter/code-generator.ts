/**
 * Code Generator with Industry Standards
 *
 * Features:
 * - .env credentials documentation at the top
 * - Proper template literal handling
 * - Industry-standard error handling
 * - API key detection and suggestions
 */

export interface EnvVariable {
  name: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface CodeGenerationConfig {
  envVars: EnvVariable[];
  workflowName: string;
  convertedDate: string;
}

/**
 * Generate header with .env credentials documentation
 */
export function generateHeaderWithCredentials(config: CodeGenerationConfig): string {
  const { envVars, workflowName, convertedDate } = config;

  const lines: string[] = [
    '/**',
    ' * Inngest Functions - Converted from n8n Workflow',
    ` * Original Workflow: ${workflowName}`,
    ` * Converted: ${convertedDate}`,
    ' *',
    ' * This code was automatically generated from an n8n workflow.',
    ' * Review and adjust as needed for your specific use case.',
  ];

  // Add .env credentials section if there are any env vars
  if (envVars.length > 0) {
    lines.push(' *');
    lines.push(' * ========================================');
    lines.push(' * REQUIRED ENVIRONMENT VARIABLES (.env)');
    lines.push(' * ========================================');
    lines.push(' *');

    // Group env vars by category
    const grouped = groupEnvVarsByCategory(envVars);

    Object.entries(grouped).forEach(([category, vars]) => {
      lines.push(` * ${category}:`);
      vars.forEach(envVar => {
        const requiredTag = envVar.required ? '[REQUIRED]' : '[OPTIONAL]';
        const exampleText = envVar.example ? ` (e.g., ${envVar.example})` : '';
        lines.push(` *   ${requiredTag} ${envVar.name} - ${envVar.description}${exampleText}`);
      });
      lines.push(' *');
    });

    lines.push(' * Add these to your .env file:');
    lines.push(' * ```');
    envVars.filter(v => v.required).forEach(envVar => {
      const exampleValue = envVar.example || 'your_' + envVar.name.toLowerCase();
      lines.push(` * ${envVar.name}=${exampleValue}`);
    });
    lines.push(' * ```');
  }

  lines.push(' */');

  return lines.join('\n');
}

/**
 * Group environment variables by category
 */
function groupEnvVarsByCategory(envVars: EnvVariable[]): Record<string, EnvVariable[]> {
  const categories: Record<string, EnvVariable[]> = {
    'AI Models & APIs': [],
    'Databases & Storage': [],
    'External Services': [],
    'Authentication': [],
    'Other': [],
  };

  envVars.forEach(envVar => {
    const name = envVar.name.toLowerCase();

    if (name.includes('openrouter') || name.includes('anthropic') || name.includes('openai') ||
        name.includes('perplexity') || name.includes('gemini') || name.includes('claude')) {
      categories['AI Models & APIs'].push(envVar);
    } else if (name.includes('airtable') || name.includes('supabase') || name.includes('database') ||
               name.includes('postgres') || name.includes('redis')) {
      categories['Databases & Storage'].push(envVar);
    } else if (name.includes('tavily') || name.includes('github') || name.includes('api')) {
      categories['External Services'].push(envVar);
    } else if (name.includes('auth') || name.includes('token') || name.includes('key') ||
               name.includes('secret')) {
      categories['Authentication'].push(envVar);
    } else {
      categories['Other'].push(envVar);
    }
  });

  // Remove empty categories
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });

  return categories;
}

/**
 * Detect environment variables used in code
 */
export function detectEnvVarsInCode(code: string): EnvVariable[] {
  const envVars: EnvVariable[] = [];
  const seen = new Set<string>();

  // Pattern: process.env.VARIABLE_NAME
  const envRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  let match;

  while ((match = envRegex.exec(code)) !== null) {
    const envVarName = match[1];
    if (seen.has(envVarName)) continue;
    seen.add(envVarName);

    const envVar = categorizeEnvVar(envVarName, code);
    envVars.push(envVar);
  }

  return envVars;
}

/**
 * Categorize and describe an environment variable
 */
function categorizeEnvVar(name: string, code: string): EnvVariable {
  const lowerName = name.toLowerCase();

  // Check if it's required (has a validation check)
  const isRequired = code.includes(`if (!process.env.${name})`) ||
                     code.includes(`throw new Error`) && code.includes(name);

  // Generate description based on name
  let description = 'Configuration variable';
  let example: string | undefined;

  if (lowerName.includes('openrouter')) {
    description = 'OpenRouter API key for AI model access';
    example = 'sk-or-v1-...';
  } else if (lowerName.includes('anthropic')) {
    description = 'Anthropic Claude API key';
    example = 'sk-ant-...';
  } else if (lowerName.includes('openai')) {
    description = 'OpenAI API key';
    example = 'sk-...';
  } else if (lowerName.includes('perplexity')) {
    description = 'Perplexity AI API key';
    example = 'pplx-...';
  } else if (lowerName.includes('tavily')) {
    description = 'Tavily Search API key';
    example = 'tvly-...';
  } else if (lowerName.includes('airtable')) {
    description = 'Airtable API token';
    example = 'pat...';
  } else if (lowerName.includes('supabase_url')) {
    description = 'Supabase project URL';
    example = 'https://xxxxx.supabase.co';
  } else if (lowerName.includes('supabase')) {
    description = 'Supabase API key';
    example = 'eyJ...';
  } else if (lowerName.includes('github')) {
    description = 'GitHub API token';
    example = 'ghp_...';
  } else if (lowerName.includes('api_key') || lowerName.includes('apikey')) {
    description = `API key for ${name.split('_')[0].toLowerCase()} service`;
  }

  return {
    name,
    description,
    required: isRequired,
    example,
  };
}

/**
 * Fix template literal syntax issues
 * Converts incorrect ${variable} outside of template literals to proper syntax
 */
export function fixTemplateLiteralSyntax(code: string): string {
  let fixed = code;

  // Pattern 1: const var = ${expression}; (should be: const var = expression;)
  fixed = fixed.replace(
    /const\s+(\w+)\s*=\s*\$\{([^}]+)\};/g,
    'const $1 = $2;'
  );

  // Pattern 2: const url = https://...; (missing quotes)
  fixed = fixed.replace(
    /const\s+(\w+)\s*=\s*(https?:\/\/[^\s;]+);/g,
    'const $1 = "$2";'
  );

  // Pattern 3: Property assignment without template literal: "key": ${value},
  // Should be: "key": value,
  fixed = fixed.replace(
    /("[^"]+"):\s*\$\{([^}]+)\}(,?)/g,
    '$1: $2$3'
  );

  // Pattern 4: Template strings with n8n syntax: ${/*n8n-auto-generated-fromAI-override*/ ...}
  // These should be replaced with proper values or placeholders
  fixed = fixed.replace(
    /\$\{\/\*n8n-auto-generated-fromAI-override\*\/\s*\$fromAI\([^)]+\)\}/g,
    '""  // TODO: Replace with actual value from AI'
  );

  return fixed;
}

/**
 * Add try-catch error handling wrapper
 */
export function wrapWithErrorHandling(functionBody: string, errorNodeCode?: string): string {
  const indent = '    '; // 4 spaces

  const lines = [
    `${indent}try {`,
    '',
    ...functionBody.split('\n').map(line => `${indent}  ${line}`),
    '',
    `${indent}} catch (error) {`,
    `${indent}  // Error handling`,
    errorNodeCode
      ? errorNodeCode.split('\n').map(line => `${indent}  ${line}`).join('\n')
      : `${indent}  console.error("Workflow error:", error);`,
    `${indent}  throw error; // Re-throw to trigger Inngest retry`,
    `${indent}}`,
  ];

  return lines.join('\n');
}

/**
 * Detect hardcoded API keys and suggest environment variables
 */
export function detectHardcodedSecrets(code: string): Array<{ line: number; secret: string; suggestion: string }> {
  const secrets: Array<{ line: number; secret: string; suggestion: string }> = [];
  const lines = code.split('\n');

  lines.forEach((line, index) => {
    // Pattern 1: Bearer tokens
    const bearerMatch = line.match(/["']Bearer\s+([a-zA-Z0-9_-]{20,})["']/);
    if (bearerMatch) {
      const secretType = detectSecretType(bearerMatch[1]);
      secrets.push({
        line: index + 1,
        secret: bearerMatch[1],
        suggestion: `Replace with: \`Bearer \${process.env.${secretType}_API_KEY}\``,
      });
    }

    // Pattern 2: API keys in strings
    const apiKeyMatch = line.match(/["']([a-zA-Z0-9_-]{30,})["']/);
    if (apiKeyMatch && !line.includes('process.env')) {
      const secret = apiKeyMatch[1];
      if (isLikelyApiKey(secret)) {
        const secretType = detectSecretType(secret);
        secrets.push({
          line: index + 1,
          secret,
          suggestion: `Replace with: process.env.${secretType}_API_KEY`,
        });
      }
    }
  });

  return secrets;
}

/**
 * Detect the type of secret based on prefix
 */
function detectSecretType(secret: string): string {
  if (secret.startsWith('sk-or-')) return 'OPENROUTER';
  if (secret.startsWith('sk-ant-')) return 'ANTHROPIC';
  if (secret.startsWith('sk-')) return 'OPENAI';
  if (secret.startsWith('pplx-')) return 'PERPLEXITY';
  if (secret.startsWith('tvly-')) return 'TAVILY';
  if (secret.startsWith('pat')) return 'AIRTABLE';
  if (secret.startsWith('ghp_')) return 'GITHUB';
  return 'API';
}

/**
 * Check if a string looks like an API key
 */
function isLikelyApiKey(str: string): boolean {
  // At least 30 chars, mix of letters and numbers/symbols
  if (str.length < 30) return false;

  const hasLetters = /[a-zA-Z]/.test(str);
  const hasNumbers = /[0-9]/.test(str);
  const hasSymbols = /[_-]/.test(str);

  return hasLetters && (hasNumbers || hasSymbols);
}

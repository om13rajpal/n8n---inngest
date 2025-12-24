/**
 * Example HTTP Request Node Mapper Implementation
 *
 * This file demonstrates how to implement a node mapper for n8n's HTTP Request node.
 * It shows best practices for code generation, error handling, and environment variable management.
 */

import { BaseNodeMapper } from './base-mapper';
import type {
  N8nNode,
  CodeGenContext,
  CodeFragment,
  EnvVarMetadata,
  PackageDependency,
  ConversionWarning,
} from '../types';

/**
 * HTTP Request Node Mapper
 *
 * Converts n8n HTTP Request nodes to Inngest step.run() calls with fetch API
 */
export class HttpRequestMapper extends BaseNodeMapper {
  readonly nodeType = 'n8n-nodes-base.httpRequest';
  readonly supportedVersions = '>=1.0.0';
  readonly description = 'Maps HTTP Request nodes to fetch() calls';

  /**
   * Generate Inngest code for HTTP request
   */
  generateCode(node: N8nNode, context: CodeGenContext): CodeFragment {
    const warnings: ConversionWarning[] = [];
    const envVars: EnvVarMetadata[] = [];
    const imports: string[] = [];

    // Extract parameters
    const method = this.getMethod(node);
    const url = this.getUrl(node);
    const headers = this.getHeaders(node, envVars);
    const body = this.getBody(node);
    const timeout = this.getTimeout(node);
    const retry = this.getRetryConfig(node);

    // Validate configuration
    warnings.push(...this.validate(node));

    // Generate variable names
    const stepName = this.sanitizeStepName(node.name);
    const varName = this.sanitizeVarName(node.name);

    // Build fetch options
    const fetchOptions = this.buildFetchOptions({
      method,
      headers,
      body,
      timeout,
    });

    // Generate step code
    const stepCode = `
// ${node.notes || `HTTP ${method} request`}
const ${varName} = await step.run("${stepName}", async () => {
  ${this.generateTimeoutWrapper(timeout, `
  const response = await fetch(${this.quoteUrl(url)}, ${fetchOptions});

  ${this.generateResponseHandler(node, method)}

  return ${this.generateReturnValue(node)};
  `)}
}, ${this.generateRetryConfig(retry)});
`.trim();

    // Add comments
    const comments = [
      `HTTP ${method} to ${url}`,
      node.notes ? `Note: ${node.notes}` : '',
    ].filter(Boolean);

    return {
      stepName,
      stepCode,
      imports,
      environmentVars: envVars,
      comments,
      warnings,
    };
  }

  /**
   * Extract HTTP method from node parameters
   */
  private getMethod(node: N8nNode): string {
    const method = (node.parameters.method as string) || 'GET';
    return method.toUpperCase();
  }

  /**
   * Extract and process URL
   */
  private getUrl(node: N8nNode): string {
    const url = node.parameters.url as string;

    // Check if URL contains n8n expressions
    if (url.includes('{{')) {
      // Convert n8n expression to JavaScript template literal
      return this.convertN8nExpression(url);
    }

    return url;
  }

  /**
   * Extract and process headers
   */
  private getHeaders(
    node: N8nNode,
    envVars: EnvVarMetadata[]
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    // Process custom headers
    if (node.parameters.headerParameters) {
      const headerParams = node.parameters.headerParameters as any;
      if (headerParams.parameters) {
        for (const header of headerParams.parameters) {
          headers[header.name] = this.processHeaderValue(header.value);
        }
      }
    }

    // Process authentication
    if (node.credentials) {
      const authHeaders = this.processAuthentication(node, envVars);
      Object.assign(headers, authHeaders);
    }

    // Set default Content-Type if body exists
    if (this.hasBody(node) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  /**
   * Process authentication credentials
   */
  private processAuthentication(
    node: N8nNode,
    envVars: EnvVarMetadata[]
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (!node.credentials) {
      return headers;
    }

    // Handle different authentication types
    for (const [credType, credRef] of Object.entries(node.credentials)) {
      if (credType === 'httpBasicAuth') {
        const envVar = this.generateCredentialEnvVar(credRef.name, 'BASIC_AUTH');
        envVars.push({
          key: envVar,
          description: `Basic auth credentials for ${credRef.name}`,
          example: 'username:password',
          required: true,
          source: node.name,
        });

        headers['Authorization'] = `Basic \${Buffer.from(process.env.${envVar}!).toString('base64')}`;
      } else if (credType === 'httpHeaderAuth') {
        const envVar = this.generateCredentialEnvVar(credRef.name, 'HEADER_AUTH');
        envVars.push({
          key: envVar,
          description: `Header auth token for ${credRef.name}`,
          example: 'your-token-here',
          required: true,
          source: node.name,
        });

        // Header name from credential config (would need to be passed)
        headers['Authorization'] = `Bearer \${process.env.${envVar}}`;
      } else if (credType === 'oAuth2Api') {
        const envVar = this.generateCredentialEnvVar(credRef.name, 'OAUTH_TOKEN');
        envVars.push({
          key: envVar,
          description: `OAuth2 token for ${credRef.name}`,
          example: 'your-oauth-token',
          required: true,
          source: node.name,
        });

        headers['Authorization'] = `Bearer \${process.env.${envVar}}`;
      }
    }

    return headers;
  }

  /**
   * Extract request body
   */
  private getBody(node: N8nNode): string | null {
    if (!this.hasBody(node)) {
      return null;
    }

    const bodyType = node.parameters.bodyType || 'json';

    if (bodyType === 'json') {
      const jsonBody = node.parameters.jsonParameters || node.parameters.body;
      if (typeof jsonBody === 'string') {
        return jsonBody;
      }
      return JSON.stringify(jsonBody);
    } else if (bodyType === 'raw') {
      return node.parameters.body as string;
    } else if (bodyType === 'form') {
      // Handle form data
      return this.buildFormData(node);
    }

    return null;
  }

  /**
   * Check if request has body
   */
  private hasBody(node: N8nNode): boolean {
    const method = this.getMethod(node);
    return ['POST', 'PUT', 'PATCH'].includes(method);
  }

  /**
   * Extract timeout configuration
   */
  private getTimeout(node: N8nNode): number | null {
    const timeout = node.parameters.timeout as number;
    return timeout || null;
  }

  /**
   * Extract retry configuration
   */
  private getRetryConfig(node: N8nNode): RetryConfig {
    return {
      enabled: node.retryOnFail || false,
      maxAttempts: node.maxTries || 3,
      waitBetween: node.waitBetweenTries || 1000,
    };
  }

  /**
   * Build fetch options object
   */
  private buildFetchOptions(options: {
    method: string;
    headers: Record<string, string>;
    body: string | null;
    timeout: number | null;
  }): string {
    const opts: string[] = [
      `method: "${options.method}"`,
    ];

    // Add headers
    if (Object.keys(options.headers).length > 0) {
      const headerLines = Object.entries(options.headers).map(
        ([key, value]) => `      "${key}": ${this.quoteValue(value)}`
      );
      opts.push(`headers: {\n${headerLines.join(',\n')}\n    }`);
    }

    // Add body
    if (options.body !== null) {
      opts.push(`body: JSON.stringify(${this.sanitizeBody(options.body)})`);
    }

    // Add signal for timeout
    if (options.timeout) {
      opts.push(`signal: AbortSignal.timeout(${options.timeout})`);
    }

    return `{\n    ${opts.join(',\n    ')}\n  }`;
  }

  /**
   * Generate response handler code
   */
  private generateResponseHandler(node: N8nNode, method: string): string {
    const continueOnFail = node.continueOnFail || false;

    if (continueOnFail) {
      return `
  if (!response.ok) {
    console.warn(\`HTTP ${method} failed with status \${response.status}: \${response.statusText}\`);
    return { error: true, status: response.status, statusText: response.statusText };
  }`;
    }

    return `
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unable to read error body');
    throw new Error(\`HTTP ${method} failed with status \${response.status}: \${response.statusText}. Body: \${errorBody}\`);
  }`;
  }

  /**
   * Generate return value parsing
   */
  private generateReturnValue(node: N8nNode): string {
    const responseFormat = node.parameters.responseFormat || 'json';

    switch (responseFormat) {
      case 'json':
        return 'await response.json()';
      case 'text':
        return 'await response.text()';
      case 'binary':
        return 'await response.arrayBuffer()';
      default:
        return 'await response.json()';
    }
  }

  /**
   * Generate retry configuration for step
   */
  private generateRetryConfig(retry: RetryConfig): string {
    if (!retry.enabled) {
      return '{ retries: 0 }';
    }

    return `{
    retries: ${retry.maxAttempts},
    retryDelay: ${retry.waitBetween}
  }`;
  }

  /**
   * Generate timeout wrapper if needed
   */
  private generateTimeoutWrapper(timeout: number | null, code: string): string {
    if (!timeout) {
      return code.trim();
    }

    return `
  try {
    ${code.trim()}
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(\`Request timeout after ${timeout}ms\`);
    }
    throw error;
  }`.trim();
  }

  /**
   * Validate node configuration
   */
  validate(node: N8nNode): ConversionWarning[] {
    const warnings: ConversionWarning[] = [];

    // Check for required URL
    if (!node.parameters.url) {
      this.addWarning(
        warnings,
        node,
        'URL is required for HTTP Request node',
        'error',
        'Add a URL to the HTTP Request node'
      );
    }

    // Warn about unsupported features
    if (node.parameters.proxy) {
      this.addWarning(
        warnings,
        node,
        'Proxy configuration is not automatically converted',
        'warning',
        'Configure proxy manually in generated code if needed'
      );
    }

    if (node.parameters.followRedirect === false) {
      this.addWarning(
        warnings,
        node,
        'Follow redirect setting is not converted (fetch follows redirects by default)',
        'info',
        'Use custom fetch configuration to disable redirects if needed'
      );
    }

    return warnings;
  }

  /**
   * Get required dependencies
   */
  getDependencies(node: N8nNode): PackageDependency[] {
    // fetch is built into Node.js 18+, no dependencies needed
    return [];
  }

  /**
   * Helper: Convert n8n expression syntax to JavaScript
   */
  private convertN8nExpression(expr: string): string {
    // Convert {{ $json.field }} to ${previousStep.field}
    // This is a simplified conversion - real implementation would be more complex
    let converted = expr.replace(/\{\{(.+?)\}\}/g, (match, inner) => {
      // Remove $json prefix
      const cleaned = inner.trim().replace(/^\$json\./, '');
      return `\${${cleaned}}`;
    });

    return `\`${converted}\``;
  }

  /**
   * Helper: Quote URL appropriately
   */
  private quoteUrl(url: string): string {
    if (url.startsWith('${')) {
      return url; // Already a template literal
    }
    if (url.includes('${')) {
      return url; // Contains interpolation
    }
    return `"${url}"`;
  }

  /**
   * Helper: Quote header value
   */
  private quoteValue(value: string): string {
    if (value.includes('${')) {
      return `\`${value}\``;
    }
    return `"${value}"`;
  }

  /**
   * Helper: Process header value
   */
  private processHeaderValue(value: string): string {
    if (value.includes('{{')) {
      return this.convertN8nExpression(value);
    }
    return value;
  }

  /**
   * Helper: Sanitize body content
   */
  private sanitizeBody(body: string): string {
    // If already an object, return as-is
    if (body.startsWith('{')) {
      return body;
    }
    // Otherwise quote it
    return `"${body}"`;
  }

  /**
   * Helper: Build form data
   */
  private buildFormData(node: N8nNode): string {
    // Simplified - real implementation would handle multipart/form-data
    return '{}';
  }

  /**
   * Helper: Generate credential environment variable name
   */
  private generateCredentialEnvVar(credName: string, type: string): string {
    const base = credName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    return `${base}_${type}`;
  }
}

/**
 * Type for retry configuration
 */
interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  waitBetween: number;
}

/**
 * Example generated code output:
 *
 * ```typescript
 * // Fetch user data from API
 * const fetchUserData = await step.run("fetch-user-data", async () => {
 *   const response = await fetch("https://api.example.com/users/123", {
 *     method: "GET",
 *     headers: {
 *       "Content-Type": "application/json",
 *       "Authorization": `Bearer ${process.env.API_AUTH_TOKEN}`
 *     },
 *     signal: AbortSignal.timeout(30000)
 *   });
 *
 *   if (!response.ok) {
 *     const errorBody = await response.text().catch(() => 'Unable to read error body');
 *     throw new Error(`HTTP GET failed with status ${response.status}: ${response.statusText}. Body: ${errorBody}`);
 *   }
 *
 *   return await response.json();
 * }, {
 *   retries: 3,
 *   retryDelay: 1000
 * });
 * ```
 */

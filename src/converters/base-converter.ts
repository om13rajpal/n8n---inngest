/**
 * Base Converter Interface and Utilities
 * Foundation for all node type converters
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import { InngestStep, CodeGenerationOptions } from '../types/inngest.js';

export interface ConversionContext {
  workflowName: string;
  allNodes: Map<string, ParsedNode>;
  options: CodeGenerationOptions;
  variableMap: Map<string, string>;
  stepIndex: number;
  imports: Set<string>;
  helpers: Set<string>;
}

export interface ConversionResult {
  steps: InngestStep[];
  additionalImports?: string[];
  helperFunctions?: string[];
  variables?: Map<string, string>;
}

export interface NodeConverter {
  nodeTypes: string[];
  convert(node: ParsedNode, context: ConversionContext): ConversionResult;
}

/**
 * Registry for node converters
 */
export class ConverterRegistry {
  private converters: Map<string, NodeConverter> = new Map();
  private defaultConverter: NodeConverter | null = null;

  register(converter: NodeConverter): void {
    converter.nodeTypes.forEach(type => {
      this.converters.set(type, converter);
    });
  }

  setDefault(converter: NodeConverter): void {
    this.defaultConverter = converter;
  }

  get(nodeType: string): NodeConverter | null {
    return this.converters.get(nodeType) || this.defaultConverter;
  }

  has(nodeType: string): boolean {
    return this.converters.has(nodeType) || this.defaultConverter !== null;
  }
}

/**
 * Utility functions for converters
 */

/**
 * Generate a safe variable name from node name
 */
export function toVariableName(nodeName: string): string {
  return nodeName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Generate a safe step ID from node name
 */
export function toStepId(nodeName: string): string {
  return nodeName
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/**
 * Convert n8n expression to JavaScript
 * n8n uses {{ }} for expressions, we need to convert them
 */
export function convertN8nExpression(expression: string, context: ConversionContext): string {
  if (typeof expression !== 'string') {
    return JSON.stringify(expression);
  }

  // Check if it's an n8n expression
  if (!expression.includes('{{') && !expression.startsWith('=')) {
    // Static value
    return JSON.stringify(expression);
  }

  // Remove leading = if present
  let expr = expression.startsWith('=') ? expression.slice(1) : expression;

  // Convert n8n expression syntax to JavaScript
  // {{ $json.field }} -> event.data.field or previousStepResult.field
  expr = expr.replace(/\{\{\s*(.+?)\s*\}\}/g, (match, inner) => {
    return convertN8nExpressionInner(inner.trim(), context);
  });

  // If the entire expression was wrapped, return without quotes
  if (expr.startsWith('`') || expr.startsWith('${') || !expression.includes('{{')) {
    return expr;
  }

  // Use template literal for mixed content
  return `\`${expr}\``;
}

/**
 * Convert inner n8n expression to JavaScript
 */
function convertN8nExpressionInner(expr: string, context: ConversionContext): string {
  // Handle common n8n expression patterns

  // $json.* -> Access current item data
  if (expr.startsWith('$json')) {
    const path = expr.slice(5); // Remove '$json'
    return `\${data${path}}`;
  }

  // $('Node Name').item.json.* -> Access output from specific node
  const nodeRefMatch = expr.match(/\$\(['"](.+?)['"]\)\.(?:item\.)?json(\.[\w.[\]]+)?/);
  if (nodeRefMatch) {
    const [, nodeName, path = ''] = nodeRefMatch;
    const varName = context.variableMap.get(nodeName) || toVariableName(nodeName);
    return `\${${varName}${path}}`;
  }

  // $node["Node Name"].json.* -> Legacy syntax
  const legacyNodeRefMatch = expr.match(/\$node\[['"](.+?)['"]\]\.json(\.[\w.[\]]+)?/);
  if (legacyNodeRefMatch) {
    const [, nodeName, path = ''] = legacyNodeRefMatch;
    const varName = context.variableMap.get(nodeName) || toVariableName(nodeName);
    return `\${${varName}${path}}`;
  }

  // $input.* -> Access input data
  if (expr.startsWith('$input')) {
    const path = expr.slice(6); // Remove '$input'
    if (path.startsWith('.item.json')) {
      return `\${data${path.slice(10)}}`;
    }
    if (path.startsWith('.all()')) {
      return `\${items}`;
    }
    if (path.startsWith('.first()')) {
      return `\${items[0]}`;
    }
    return `\${data${path}}`;
  }

  // $env.* -> Environment variables
  if (expr.startsWith('$env.')) {
    const envVar = expr.slice(5);
    return `\${process.env.${envVar}}`;
  }

  // $now -> Current timestamp
  if (expr === '$now' || expr.startsWith('$now.')) {
    if (expr === '$now') {
      return '${new Date().toISOString()}';
    }
    // Handle $now.toISO(), $now.toMillis(), etc.
    const method = expr.slice(5);
    if (method === '.toISO()' || method === '.toISOString()') {
      return '${new Date().toISOString()}';
    }
    if (method === '.toMillis()') {
      return '${Date.now()}';
    }
    return '${new Date()}';
  }

  // $today -> Today's date
  if (expr === '$today') {
    return '${new Date().toISOString().split("T")[0]}';
  }

  // $execution.* -> Execution context
  if (expr.startsWith('$execution.')) {
    const path = expr.slice(11);
    if (path === 'id') {
      return '${event.data.executionId || "unknown"}';
    }
    if (path === 'mode') {
      return '"production"';
    }
    return `\${event.data.${path}}`;
  }

  // $workflow.* -> Workflow context
  if (expr.startsWith('$workflow.')) {
    const path = expr.slice(10);
    if (path === 'id') {
      return `"${context.workflowName}"`;
    }
    if (path === 'name') {
      return `"${context.workflowName}"`;
    }
    return `\${event.data.workflow.${path}}`;
  }

  // $runIndex -> Current run index in loop
  if (expr === '$runIndex') {
    return '${index}';
  }

  // $itemIndex -> Current item index
  if (expr === '$itemIndex') {
    return '${itemIndex}';
  }

  // Function calls like $if(), $min(), $max(), etc.
  if (expr.startsWith('$if(')) {
    const argsMatch = expr.match(/\$if\((.+?),\s*(.+?),\s*(.+?)\)/);
    if (argsMatch) {
      const [, condition, trueVal, falseVal] = argsMatch;
      return `\${(${convertN8nExpressionInner(condition, context)}) ? ${convertN8nExpressionInner(trueVal, context)} : ${convertN8nExpressionInner(falseVal, context)}}`;
    }
  }

  // Math operations
  if (expr.includes('+') || expr.includes('-') || expr.includes('*') || expr.includes('/')) {
    return `\${${expr.replace(/\$json/g, 'data')}}`;
  }

  // Default: return as-is in template literal
  return `\${${expr}}`;
}

/**
 * Convert n8n expression to plain JavaScript (for conditions, not template literals)
 * Returns raw JavaScript like `data.status` instead of template literal `${data.status}`
 */
export function convertN8nExpressionToJS(expression: string, context: ConversionContext): string {
  if (typeof expression !== 'string') {
    return JSON.stringify(expression);
  }

  // Check if it's an n8n expression
  if (!expression.includes('{{') && !expression.startsWith('=')) {
    // Static value
    return JSON.stringify(expression);
  }

  // Remove leading = if present
  let expr = expression.startsWith('=') ? expression.slice(1) : expression;

  // Extract the inner expression from {{ }}
  const match = expr.match(/\{\{\s*(.+?)\s*\}\}/);
  if (!match) {
    return JSON.stringify(expression);
  }

  const inner = match[1].trim();

  // Convert common n8n expression patterns to plain JS
  // $json.* -> Access current item data
  if (inner.startsWith('$json')) {
    const path = inner.slice(5); // Remove '$json'
    return `data${path}`;
  }

  // $('Node Name').item.json.* -> Access output from specific node
  const nodeRefMatch = inner.match(/\$\(['"](.+?)['"]\)\.(?:item\.)?json(\.[\w.[\]]+)?/);
  if (nodeRefMatch) {
    const [, nodeName, path = ''] = nodeRefMatch;
    const varName = context.variableMap.get(nodeName) || toVariableName(nodeName);
    return `${varName}${path}`;
  }

  // $node["Node Name"].json.* -> Legacy syntax
  const legacyNodeRefMatch = inner.match(/\$node\[['"](.+?)['"]\]\.json(\.[\w.[\]]+)?/);
  if (legacyNodeRefMatch) {
    const [, nodeName, path = ''] = legacyNodeRefMatch;
    const varName = context.variableMap.get(nodeName) || toVariableName(nodeName);
    return `${varName}${path}`;
  }

  // $input.* -> Access input data
  if (inner.startsWith('$input')) {
    const path = inner.slice(6);
    if (path.startsWith('.item.json')) {
      return `data${path.slice(10)}`;
    }
    return `data${path}`;
  }

  // Default: return as-is
  return inner.replace(/\$json/g, 'data');
}

/**
 * Convert n8n condition to JavaScript expression
 */
export function convertCondition(
  conditions: Array<{
    leftValue: string;
    rightValue: unknown;
    operator: { type: string; operation: string };
  }>,
  combinator: 'and' | 'or',
  context: ConversionContext
): string {
  const converted = conditions.map(condition => {
    const left = convertN8nExpressionToJS(condition.leftValue, context);
    const right = convertN8nExpressionToJS(String(condition.rightValue), context);
    const op = mapOperator(condition.operator.operation, condition.operator.type);

    // Handle special operators
    if (condition.operator.operation === 'exists') {
      return `(${left} !== undefined && ${left} !== null)`;
    }
    if (condition.operator.operation === 'notExists') {
      return `(${left} === undefined || ${left} === null)`;
    }
    if (condition.operator.operation === 'empty') {
      return `(!${left} || ${left} === '' || (Array.isArray(${left}) && ${left}.length === 0))`;
    }
    if (condition.operator.operation === 'notEmpty') {
      return `(${left} && ${left} !== '' && (!Array.isArray(${left}) || ${left}.length > 0))`;
    }
    if (condition.operator.operation === 'contains') {
      return `(${left}?.includes?.(${right}) ?? false)`;
    }
    if (condition.operator.operation === 'notContains') {
      return `(!${left}?.includes?.(${right}) ?? true)`;
    }
    if (condition.operator.operation === 'startsWith') {
      return `(${left}?.startsWith?.(${right}) ?? false)`;
    }
    if (condition.operator.operation === 'endsWith') {
      return `(${left}?.endsWith?.(${right}) ?? false)`;
    }
    if (condition.operator.operation === 'regex') {
      return `(new RegExp(${right}).test(${left}))`;
    }

    return `(${left} ${op} ${right})`;
  });

  const joiner = combinator === 'and' ? ' && ' : ' || ';
  return converted.join(joiner);
}

/**
 * Map n8n operator to JavaScript operator
 */
function mapOperator(operation: string, type: string): string {
  const operatorMap: Record<string, string> = {
    equals: '===',
    notEquals: '!==',
    equal: '===',
    notEqual: '!==',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    larger: '>',
    largerEqual: '>=',
    smaller: '<',
    smallerEqual: '<=',
  };

  return operatorMap[operation] || '===';
}

/**
 * Generate code for accessing data from previous steps
 */
export function generateDataAccess(
  node: ParsedNode,
  context: ConversionContext
): string {
  if (node.incomingConnections.length === 0) {
    // Use inputData which is defined in function body (works for both event and cron)
    return 'inputData';
  }

  if (node.incomingConnections.length === 1) {
    const sourceName = node.incomingConnections[0].nodeName;
    const varName = context.variableMap.get(sourceName);
    return varName || 'inputData';
  }

  // Multiple inputs - need to merge
  const sources = node.incomingConnections.map(conn => {
    const varName = context.variableMap.get(conn.nodeName);
    return varName || 'inputData';
  });

  return `{ ${sources.map((s, i) => `input${i}: ${s}`).join(', ')} }`;
}

/**
 * Indent code block
 */
export function indent(code: string, spaces: number = 4): string {
  const indentation = ' '.repeat(spaces);
  return code
    .split('\n')
    .map(line => (line.trim() ? indentation + line : line))
    .join('\n');
}

/**
 * Generate try-catch wrapper for error handling
 */
export function wrapWithErrorHandling(
  code: string,
  errorHandler?: string
): string {
  if (!errorHandler) {
    return code;
  }

  return `
try {
${indent(code, 2)}
} catch (error) {
${indent(errorHandler, 2)}
}`.trim();
}

// ============================================================================
// CODE GENERATION HELPERS - Centralized utilities for consistent output
// ============================================================================

/**
 * HTTP Request Generation Options
 */
export interface HttpRequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: string;
  body?: string;
  envVarKey?: string;
  errorContext: string;
  responseType?: 'json' | 'text' | 'auto';
}

/**
 * Generate standardized HTTP request code
 * Centralizes fetch pattern used across 65+ locations
 */
export function generateHttpRequest(options: HttpRequestOptions): string {
  const {
    url,
    method,
    headers = '{}',
    body,
    errorContext,
    responseType = 'auto',
  } = options;

  const hasBody = body && method !== 'GET' && method !== 'HEAD';

  return `
      const response = await fetch(${url}, {
        method: "${method}",
        headers: {
          "Content-Type": "application/json",
          ...${headers},
        },${hasBody ? `
        body: ${body},` : ''}
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[${errorContext}] Request failed: \${response.status} - \${errorText}\`);
      }

      ${responseType === 'json' ? 'return await response.json();' :
        responseType === 'text' ? 'return await response.text();' :
        `const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return await response.json();
      }
      return await response.text();`}
  `.trim();
}

/**
 * Generate environment variable validation code
 * Ensures required env vars exist before making API calls
 */
export function generateEnvVarCheck(varName: string, serviceName: string): string {
  return `if (!process.env.${varName}) {
        throw new Error("Missing ${varName} environment variable for ${serviceName}");
      }`;
}

/**
 * Generate multiple environment variable checks
 */
export function generateEnvVarChecks(vars: Array<{ name: string; service: string }>): string {
  return vars.map(v => generateEnvVarCheck(v.name, v.service)).join('\n      ');
}

/**
 * Generate authorization header based on env var
 */
export function generateAuthHeader(envVarKey: string, type: 'bearer' | 'basic' | 'header' = 'bearer'): string {
  switch (type) {
    case 'bearer':
      return `"Authorization": \`Bearer \${process.env.${envVarKey}}\``;
    case 'basic':
      return `"Authorization": \`Basic \${Buffer.from(process.env.${envVarKey} || '').toString('base64')}\``;
    case 'header':
      return `"Authorization": process.env.${envVarKey}`;
    default:
      return `"Authorization": \`Bearer \${process.env.${envVarKey}}\``;
  }
}

/**
 * Generate headers object from n8n header parameters
 */
export function generateHeadersObject(
  parameters: Array<{ name: string; value: string }> | undefined,
  context: ConversionContext,
  authHeader?: string
): string {
  const headers: string[] = [];

  if (authHeader) {
    headers.push(authHeader);
  }

  if (parameters && parameters.length > 0) {
    parameters.forEach(p => {
      const value = convertN8nExpression(p.value, context);
      headers.push(`"${p.name}": ${value}`);
    });
  }

  if (headers.length === 0) {
    return '{}';
  }

  return `{
          ${headers.join(',\n          ')}
        }`;
}

/**
 * Generate query string code from n8n query parameters
 */
export function generateQueryString(
  parameters: Array<{ name: string; value: string }> | undefined,
  context: ConversionContext
): string {
  if (!parameters || parameters.length === 0) {
    return '';
  }

  const queryParts = parameters.map(p => {
    const value = convertN8nExpression(p.value, context);
    return `\${encodeURIComponent("${p.name}")}=\${encodeURIComponent(${value})}`;
  });

  return `const queryString = \`${queryParts.join('&')}\`;`;
}

/**
 * Generate body object from n8n body parameters
 */
export function generateBodyObject(
  parameters: Array<{ name: string; value: string }> | undefined,
  context: ConversionContext
): string {
  if (!parameters || parameters.length === 0) {
    return 'undefined';
  }

  const bodyParts = parameters.map(p => {
    const value = convertN8nExpression(p.value, context);
    return `"${p.name}": ${value}`;
  });

  return `JSON.stringify({
          ${bodyParts.join(',\n          ')}
        })`;
}

/**
 * Generate safe property access with optional chaining and fallback
 */
export function generateSafeAccess(
  basePath: string,
  propertyPath: string,
  fallback?: string
): string {
  const safePath = propertyPath
    .split('.')
    .filter(Boolean)
    .map(p => `?.${p}`)
    .join('');

  if (fallback !== undefined) {
    return `${basePath}${safePath} ?? ${fallback}`;
  }
  return `${basePath}${safePath}`;
}

/**
 * Generate input validation code for the start of a step
 */
export function generateInputValidation(
  dataVar: string = 'data',
  requiredFields?: string[]
): string {
  let code = '';

  if (requiredFields && requiredFields.length > 0) {
    const checks = requiredFields.map(field =>
      `if (${dataVar}.${field} === undefined) throw new Error("Missing required field: ${field}");`
    );
    code = checks.join('\n      ');
  }

  return code;
}

/**
 * Standard result wrapper for consistent return shapes
 */
export function generateResultWrapper(
  resultVar: string,
  fields: Record<string, string>
): string {
  const fieldEntries = Object.entries(fields)
    .map(([key, path]) => `${key}: ${path}`)
    .join(',\n        ');

  return `{
        ${fieldEntries}
      }`;
}

/**
 * Generate code comment block
 */
export function generateComment(text: string, style: 'line' | 'block' = 'line'): string {
  if (style === 'block') {
    return `/**
       * ${text.split('\n').join('\n       * ')}
       */`;
  }
  return `// ${text}`;
}

/**
 * Generate a standardized API call with all best practices
 * This is the main helper that combines env checks, headers, body, and error handling
 */
export function generateApiCall(options: {
  serviceName: string;
  operation: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  envVarKey: string;
  authType?: 'bearer' | 'basic' | 'header';
  headers?: Array<{ name: string; value: string }>;
  body?: string;
  context: ConversionContext;
}): string {
  const {
    serviceName,
    operation,
    url,
    method,
    envVarKey,
    authType = 'bearer',
    headers,
    body,
    context,
  } = options;

  const authHeader = generateAuthHeader(envVarKey, authType);
  const headersObj = generateHeadersObject(headers, context, authHeader);
  const errorContext = `${serviceName}:${operation}`;

  return `
      ${generateEnvVarCheck(envVarKey, serviceName)}

      ${generateHttpRequest({
        url,
        method,
        headers: headersObj,
        body,
        errorContext,
      })}
  `.trim();
}

/**
 * Generates consistent data extraction from n8n input
 * Handles string, object, and various input shapes
 */
export function generateDataExtraction(
  dataAccess: string,
  primaryField: string,
  fallbackFields: string[] = []
): string {
  const allFields = [primaryField, ...fallbackFields];
  const fieldAccess = allFields
    .map(f => `${dataAccess}.${f}`)
    .join(' || ');

  return `typeof ${dataAccess} === 'string' ? ${dataAccess} : ${fieldAccess} || JSON.stringify(${dataAccess})`;
}

/**
 * Create default converter for unhandled node types
 */
export function createDefaultConverter(): NodeConverter {
  return {
    nodeTypes: ['*'],
    convert(node: ParsedNode, context: ConversionContext): ConversionResult {
      const stepId = toStepId(node.name);
      const varName = toVariableName(node.name);
      const dataAccess = generateDataAccess(node, context);

      context.variableMap.set(node.name, varName);

      return {
        steps: [{
          type: 'run',
          id: stepId,
          code: `
      // TODO: Implement conversion for node type: ${node.type}
      // Original parameters: ${JSON.stringify(node.parameters, null, 2)}
      const ${varName} = ${dataAccess};
      return ${varName};
          `.trim(),
          comment: `Unhandled node type: ${node.type} - ${node.name}`,
        }],
      };
    },
  };
}

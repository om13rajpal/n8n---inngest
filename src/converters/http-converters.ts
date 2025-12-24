/**
 * HTTP/API Node Converters
 * Converts n8n HTTP Request and related nodes to Inngest steps
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
} from './base-converter.js';
import { HttpRequestParameters } from '../types/n8n.js';

/**
 * HTTP Request Node Converter
 */
export const httpRequestConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.httpRequest'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as HttpRequestParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Build URL
    const url = convertN8nExpression(params.url || '', context);

    // Build method
    const method = params.method || 'GET';

    // Build headers
    let headersCode = '{}';
    if (params.sendHeaders && params.headerParameters?.parameters) {
      const headers = params.headerParameters.parameters.map(p => {
        const name = convertN8nExpression(p.name, context);
        const value = convertN8nExpression(p.value, context);
        return `[${name}]: ${value}`;
      });
      headersCode = `{ ${headers.join(', ')} }`;
    }

    // Build query parameters
    let queryCode = '';
    if (params.sendQuery && params.queryParameters?.parameters) {
      const queryParams = params.queryParameters.parameters.map(p => {
        const name = convertN8nExpression(p.name, context);
        const value = convertN8nExpression(p.value, context);
        return `\${encodeURIComponent(${name})}=\${encodeURIComponent(${value})}`;
      });
      queryCode = `const queryString = \`${queryParams.join('&')}\`;`;
    }

    // Build body
    let bodyCode = 'undefined';
    if (params.sendBody) {
      if (params.body) {
        bodyCode = `JSON.stringify(${convertN8nExpression(params.body, context)})`;
      } else if (params.bodyParameters?.parameters) {
        const bodyParams = params.bodyParameters.parameters.map(p => {
          const name = p.name;
          const value = convertN8nExpression(p.value, context);
          return `"${name}": ${value}`;
        });
        bodyCode = `JSON.stringify({ ${bodyParams.join(', ')} })`;
      }
    }

    // Handle authentication
    let authHeaders = '';
    if (params.authentication === 'genericCredentialType') {
      authHeaders = generateAuthHeaders(params.genericAuthType, node, context);
    }

    // Build options
    const timeout = params.options?.timeout || 30000;
    const followRedirects = params.options?.redirect?.redirect?.followRedirects !== false;

    const code = `
      const data = ${dataAccess};

      const requestUrl = ${url};
      if (!requestUrl) {
        throw new Error("[HTTP:${method}] No URL provided");
      }
      ${queryCode}

      const response = await fetch(${queryCode ? `\`\${requestUrl}?\${queryString}\`` : 'requestUrl'}, {
        method: "${method}",
        headers: {
          "Content-Type": "${params.contentType || 'application/json'}",
          ...${headersCode},
          ${authHeaders}
        },
        body: ${bodyCode},
        redirect: ${followRedirects ? '"follow"' : '"manual"'},
        signal: AbortSignal.timeout(${timeout}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[HTTP:${method}] Request failed: \${response.status} - \${errorText}\`);
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
        comment: `HTTP ${method}: ${node.name}`,
      }],
    };
  },
};

/**
 * GraphQL Node Converter
 */
export const graphqlConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.graphql'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const endpoint = convertN8nExpression(String(params.endpoint || ''), context);
    const query = convertN8nExpression(String(params.query || ''), context);
    const variables = params.variables
      ? convertN8nExpression(JSON.stringify(params.variables), context)
      : '{}';

    // Build headers
    let headersCode = '{}';
    const headerParams = params.headerParametersJson as Record<string, string> | undefined;
    if (headerParams) {
      const headers = Object.entries(headerParams).map(([name, value]) => {
        return `"${name}": ${convertN8nExpression(String(value), context)}`;
      });
      headersCode = `{ ${headers.join(', ')} }`;
    }

    const code = `
      const data = ${dataAccess};

      const endpointUrl = ${endpoint};
      if (!endpointUrl) {
        throw new Error("[GraphQL] No endpoint URL provided");
      }

      const queryStr = ${query};
      if (!queryStr) {
        throw new Error("[GraphQL] No query provided");
      }

      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...${headersCode},
        },
        body: JSON.stringify({
          query: queryStr,
          variables: ${variables},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[GraphQL] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(\`[GraphQL] Query errors: \${JSON.stringify(result.errors)}\`);
      }

      return result.data;
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `GraphQL: ${node.name}`,
      }],
    };
  },
};

/**
 * Generate authentication headers based on auth type
 */
function generateAuthHeaders(
  authType: string | undefined,
  node: ParsedNode,
  context: ConversionContext
): string {
  if (!authType) return '';

  const credentialRef = node.credentials?.length > 0
    ? node.credentials[0]
    : null;

  const envPrefix = credentialRef
    ? toVariableName(credentialRef.credentialName).toUpperCase()
    : 'API';

  switch (authType) {
    case 'httpHeaderAuth':
      return `...getHeaderAuthCredentials("${envPrefix}"),`;

    case 'httpBasicAuth':
      return `"Authorization": \`Basic \${Buffer.from(\`\${process.env.${envPrefix}_USERNAME}:\${process.env.${envPrefix}_PASSWORD}\`).toString("base64")}\`,`;

    case 'httpBearerAuth':
      return `"Authorization": \`Bearer \${process.env.${envPrefix}_TOKEN}\`,`;

    case 'httpDigestAuth':
      return `// TODO: Implement Digest Auth - use a library like 'digest-fetch'`;

    case 'oAuth1Api':
      return `// TODO: Implement OAuth1 - use a library like 'oauth-1.0a'`;

    case 'oAuth2Api':
      return `"Authorization": \`Bearer \${await getOAuth2Token("${envPrefix}")}\`,`;

    default:
      return '';
  }
}

/**
 * Generate helper functions for authentication
 */
export function generateAuthHelpers(): string[] {
  return [
    `
/**
 * Get header auth credentials from environment
 */
function getHeaderAuthCredentials(prefix: string): Record<string, string> {
  const headerName = process.env[\`\${prefix}_HEADER_NAME\`] || "Authorization";
  const headerValue = process.env[\`\${prefix}_HEADER_VALUE\`];

  if (!headerValue) {
    console.warn(\`Missing credential: \${prefix}_HEADER_VALUE\`);
    return {};
  }

  return { [headerName]: headerValue };
}
    `.trim(),

    `
/**
 * Get OAuth2 access token
 * NOTE: Implement token refresh logic as needed
 */
async function getOAuth2Token(prefix: string): Promise<string> {
  const token = process.env[\`\${prefix}_ACCESS_TOKEN\`];

  if (!token) {
    throw new Error(\`Missing OAuth2 token: \${prefix}_ACCESS_TOKEN\`);
  }

  // TODO: Implement token refresh if needed
  // const refreshToken = process.env[\`\${prefix}_REFRESH_TOKEN\`];
  // const tokenExpiry = process.env[\`\${prefix}_TOKEN_EXPIRY\`];

  return token;
}
    `.trim(),
  ];
}

/**
 * RSS Feed Read Node Converter
 */
export const rssFeedReadConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.rssFeedRead'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const url = convertN8nExpression(String(params.url || ''), context);

    const code = `
      const data = ${dataAccess};

      const feedUrl = ${url};
      if (!feedUrl) {
        throw new Error("[RSS] No feed URL provided");
      }

      // Fetch RSS feed
      const response = await fetch(feedUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[RSS] Fetch failed: \${response.status} - \${errorText}\`);
      }

      const xmlText = await response.text();

      // Parse RSS/Atom feed
      // NOTE: You'll need to add an XML parser library like 'fast-xml-parser'
      // For now, returning the raw XML
      return {
        raw: xmlText,
        url: feedUrl,
        // TODO: Parse with xml parser
        // items: parseFeed(xmlText)
      };
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `RSS Feed: ${node.name}`,
      }],
      additionalImports: [
        '// TODO: Add RSS parsing library like "fast-xml-parser" or "rss-parser"',
      ],
    };
  },
};

/**
 * HTML Extract Node Converter
 */
export const htmlExtractConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.htmlExtract', 'n8n-nodes-base.html'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const extractionValues = params.extractionValues as {
      values: Array<{
        key: string;
        cssSelector: string;
        returnValue?: string;
      }>;
    } | undefined;

    let extractionCode = '';
    if (extractionValues?.values) {
      const extractions = extractionValues.values.map(v => {
        const returnType = v.returnValue || 'text';
        if (returnType === 'html') {
          return `"${v.key}": doc.querySelector("${v.cssSelector}")?.innerHTML || null`;
        } else if (returnType === 'attribute') {
          return `"${v.key}": doc.querySelector("${v.cssSelector}")?.getAttribute("${v.returnValue}") || null`;
        }
        return `"${v.key}": doc.querySelector("${v.cssSelector}")?.textContent?.trim() || null`;
      });
      extractionCode = `{ ${extractions.join(', ')} }`;
    } else {
      extractionCode = '{}';
    }

    const code = `
      const data = ${dataAccess};
      const html = typeof data === 'string' ? data : data.html || data.body || '';

      if (!html) {
        throw new Error("[HTMLExtract] No HTML content provided");
      }

      // Parse HTML and extract data
      // NOTE: You'll need to add a DOM parser library like 'jsdom' or 'cheerio'
      // const { JSDOM } = require('jsdom');
      // const dom = new JSDOM(html);
      // const doc = dom.window.document;

      // For serverless environments, consider using 'cheerio' instead:
      // const cheerio = require('cheerio');
      // const $ = cheerio.load(html);

      // Extraction logic (using JSDOM example):
      // return ${extractionCode};

      // Placeholder return
      return {
        html,
        htmlLength: html.length,
        // TODO: Implement extraction with DOM parser
      };
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `HTML Extract: ${node.name}`,
      }],
      additionalImports: [
        '// TODO: Add HTML parsing library like "cheerio" or "jsdom"',
      ],
    };
  },
};

// Export all HTTP converters
export const httpConverters: NodeConverter[] = [
  httpRequestConverter,
  graphqlConverter,
  rssFeedReadConverter,
  htmlExtractConverter,
];

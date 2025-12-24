/**
 * Integration Node Converters
 * Converts n8n database, API, and third-party integration nodes to Inngest steps
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
import { SupabaseNodeParameters, HttpRequestParameters, FirecrawlNodeParameters } from '../types/n8n.js';

/**
 * Supabase Node Converter
 * Converts n8n Supabase node to Inngest step with @supabase/supabase-js
 */
export const supabaseConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.supabase'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as SupabaseNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const operation = params.operation || 'getAll';
    const tableId = params.tableId || 'table_name';

    let code: string;

    switch (operation) {
      case 'create':
        code = generateSupabaseInsert(params, dataAccess, tableId, context);
        break;
      case 'update':
        code = generateSupabaseUpdate(params, dataAccess, tableId, context);
        break;
      case 'upsert':
        code = generateSupabaseUpsert(params, dataAccess, tableId, context);
        break;
      case 'delete':
        code = generateSupabaseDelete(params, dataAccess, tableId, context);
        break;
      case 'get':
        code = generateSupabaseGet(params, dataAccess, tableId, context);
        break;
      case 'getAll':
      default:
        code = generateSupabaseGetAll(params, dataAccess, tableId, context);
        break;
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Supabase ${operation}: ${node.name}`,
      }],
      additionalImports: [
        'import { createClient } from "@supabase/supabase-js";',
      ],
    };
  },
};

function convertFieldValue(value: string, context: ConversionContext): string {
  if (!value) return '""';

  // Check if it's an n8n expression
  if (value.startsWith('=') || value.includes('{{')) {
    return convertN8nExpression(value, context);
  }

  return JSON.stringify(value);
}

function generateSupabaseInsert(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const fields = params.fieldsUi?.fieldValues || [];
  const fieldAssignments = fields.map(f => {
    const value = convertFieldValue(f.fieldValue, context);
    return `"${f.fieldId}": ${value}`;
  }).join(',\n          ');

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const insertData = {
        ${fieldAssignments || '...data'}
      };

      const { data: result, error } = await supabase
        .from("${tableId}")
        .insert(insertData)
        .select();

      if (error) {
        throw new Error(\`[Supabase:insert] \${error.message}\`);
      }

      return result;
  `.trim();
}

function generateSupabaseUpdate(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const fields = params.fieldsUi?.fieldValues || [];
  const filters = params.filters?.conditions || [];

  const fieldAssignments = fields.map(f => {
    const value = convertFieldValue(f.fieldValue, context);
    return `"${f.fieldId}": ${value}`;
  }).join(',\n          ');

  const filterCode = filters.map(f => {
    const condition = mapSupabaseCondition(f.condition);
    const value = convertFieldValue(f.keyValue, context);
    return `.${condition}("${f.keyName}", ${value})`;
  }).join('\n        ');

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const updateData = {
        ${fieldAssignments || '...data'}
      };

      const { data: result, error } = await supabase
        .from("${tableId}")
        .update(updateData)
        ${filterCode}
        .select();

      if (error) {
        throw new Error(\`[Supabase:update] \${error.message}\`);
      }

      return result;
  `.trim();
}

function generateSupabaseUpsert(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const fields = params.fieldsUi?.fieldValues || [];
  const matchingColumns = params.matchingColumns || ['id'];

  const fieldAssignments = fields.map(f => {
    const value = convertFieldValue(f.fieldValue, context);
    return `"${f.fieldId}": ${value}`;
  }).join(',\n          ');

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const upsertData = {
        ${fieldAssignments || '...data'}
      };

      const { data: result, error } = await supabase
        .from("${tableId}")
        .upsert(upsertData, {
          onConflict: "${matchingColumns.join(',')}",
        })
        .select();

      if (error) {
        throw new Error(\`[Supabase:upsert] \${error.message}\`);
      }

      return result;
  `.trim();
}

function generateSupabaseDelete(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const filters = params.filters?.conditions || [];

  const filterCode = filters.map(f => {
    const condition = mapSupabaseCondition(f.condition);
    const value = convertFieldValue(f.keyValue, context);
    return `.${condition}("${f.keyName}", ${value})`;
  }).join('\n        ');

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const { data: result, error } = await supabase
        .from("${tableId}")
        .delete()
        ${filterCode || '.eq("id", data.id)'}
        .select();

      if (error) {
        throw new Error(\`[Supabase:delete] \${error.message}\`);
      }

      return result;
  `.trim();
}

function generateSupabaseGet(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const filters = params.filters?.conditions || [];

  const filterCode = filters.map(f => {
    const condition = mapSupabaseCondition(f.condition);
    const value = convertFieldValue(f.keyValue, context);
    return `.${condition}("${f.keyName}", ${value})`;
  }).join('\n        ');

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const { data: result, error } = await supabase
        .from("${tableId}")
        .select("*")
        ${filterCode || '.eq("id", data.id)'}
        .single();

      if (error) {
        throw new Error(\`[Supabase:get] \${error.message}\`);
      }

      return result;
  `.trim();
}

function generateSupabaseGetAll(
  params: SupabaseNodeParameters,
  dataAccess: string,
  tableId: string,
  context: ConversionContext
): string {
  const filters = params.filters?.conditions || [];
  const limit = params.limit;
  const returnAll = params.returnAll ?? true;

  const filterCode = filters.map(f => {
    const condition = mapSupabaseCondition(f.condition);
    const value = convertFieldValue(f.keyValue, context);
    return `.${condition}("${f.keyName}", ${value})`;
  }).join('\n        ');

  const limitCode = !returnAll && limit ? `.limit(${limit})` : '';

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SUPABASE_URL', 'Supabase')}
      ${generateEnvVarCheck('N8N_SUPABASE_KEY', 'Supabase')}

      const supabase = createClient(
        process.env.N8N_SUPABASE_URL!,
        process.env.N8N_SUPABASE_KEY!
      );

      const { data: result, error } = await supabase
        .from("${tableId}")
        .select("*")
        ${filterCode}
        ${limitCode};

      if (error) {
        throw new Error(\`[Supabase:getAll] \${error.message}\`);
      }

      return result || [];
  `.trim();
}

function mapSupabaseCondition(condition: string): string {
  const conditionMap: Record<string, string> = {
    eq: 'eq',
    neq: 'neq',
    gt: 'gt',
    gte: 'gte',
    lt: 'lt',
    lte: 'lte',
    like: 'like',
    ilike: 'ilike',
    is: 'is',
    in: 'in',
    contains: 'contains',
    containedBy: 'containedBy',
    equals: 'eq',
    notEquals: 'neq',
    greaterThan: 'gt',
    greaterThanOrEqual: 'gte',
    lessThan: 'lt',
    lessThanOrEqual: 'lte',
  };

  return conditionMap[condition] || 'eq';
}

/**
 * Firecrawl Node Converter
 * Converts n8n Firecrawl node (web scraping) to Inngest step
 */
export const firecrawlConverter: NodeConverter = {
  nodeTypes: [
    'n8n-nodes-firecrawl.firecrawl',
    '@mendable/n8n-nodes-firecrawl.firecrawl',
  ],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as FirecrawlNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const operation = params.operation || 'scrape';
    let code: string;

    switch (operation) {
      case 'scrape':
        code = generateFirecrawlScrape(params, dataAccess, context);
        break;
      case 'crawl':
        code = generateFirecrawlCrawl(params, dataAccess, context);
        break;
      case 'map':
        code = generateFirecrawlMap(params, dataAccess, context);
        break;
      case 'search':
        code = generateFirecrawlSearch(params, dataAccess, context);
        break;
      case 'extract':
        code = generateFirecrawlExtract(params, dataAccess, context);
        break;
      default:
        code = generateFirecrawlScrape(params, dataAccess, context);
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Firecrawl ${operation}: ${node.name}`,
      }],
    };
  },
};

function generateFirecrawlScrape(
  params: FirecrawlNodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const url = params.url ? convertN8nExpression(params.url, context) : `${dataAccess}.url`;
  const options = params.options || {};

  return `
      const data = ${dataAccess};
      const url = ${url};

      ${generateEnvVarCheck('N8N_FIRECRAWL_API_KEY', 'Firecrawl')}

      if (!url) {
        throw new Error("[Firecrawl:scrape] No URL provided");
      }

      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ${JSON.stringify(options.formats || ['markdown', 'html'])},
          onlyMainContent: ${options.onlyMainContent ?? true},
          ${options.includeTags ? `includeTags: ${JSON.stringify(options.includeTags)},` : ''}
          ${options.excludeTags ? `excludeTags: ${JSON.stringify(options.excludeTags)},` : ''}
          ${options.waitFor ? `waitFor: ${options.waitFor},` : ''}
          ${options.timeout ? `timeout: ${options.timeout},` : ''}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Firecrawl:scrape] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return result.data || result;
  `.trim();
}

function generateFirecrawlCrawl(
  params: FirecrawlNodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const url = params.url ? convertN8nExpression(params.url, context) : `${dataAccess}.url`;
  const options = params.options || {};

  return `
      const data = ${dataAccess};
      const url = ${url};

      ${generateEnvVarCheck('N8N_FIRECRAWL_API_KEY', 'Firecrawl')}

      if (!url) {
        throw new Error("[Firecrawl:crawl] No URL provided");
      }

      // Start crawl job
      const startResponse = await fetch("https://api.firecrawl.dev/v1/crawl", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          maxDepth: ${options.maxDepth || 2},
          limit: ${options.limit || 10},
        }),
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        throw new Error(\`[Firecrawl:crawl] Start failed: \${startResponse.status} - \${errorText}\`);
      }

      const { id: crawlId } = await startResponse.json();

      // Poll for completion
      let result;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const statusResponse = await fetch(\`https://api.firecrawl.dev/v1/crawl/\${crawlId}\`, {
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(\`[Firecrawl:crawl] Status check failed: \${statusResponse.status}\`);
        }

        result = await statusResponse.json();
        if (result.status === "completed") break;
        if (result.status === "failed") throw new Error("[Firecrawl:crawl] Crawl job failed");
      }

      return result?.data || result;
  `.trim();
}

function generateFirecrawlMap(
  params: FirecrawlNodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const url = params.url ? convertN8nExpression(params.url, context) : `${dataAccess}.url`;

  return `
      const data = ${dataAccess};
      const url = ${url};

      ${generateEnvVarCheck('N8N_FIRECRAWL_API_KEY', 'Firecrawl')}

      if (!url) {
        throw new Error("[Firecrawl:map] No URL provided");
      }

      const response = await fetch("https://api.firecrawl.dev/v1/map", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Firecrawl:map] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return result.links || result;
  `.trim();
}

function generateFirecrawlSearch(
  params: FirecrawlNodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const query = params.query ? convertN8nExpression(params.query, context) : `${dataAccess}.query`;
  const options = params.options || {};

  return `
      const data = ${dataAccess};
      const query = ${query};

      ${generateEnvVarCheck('N8N_FIRECRAWL_API_KEY', 'Firecrawl')}

      if (!query) {
        throw new Error("[Firecrawl:search] No search query provided");
      }

      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: ${options.limit || 5},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Firecrawl:search] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return result.data || result;
  `.trim();
}

function generateFirecrawlExtract(
  params: FirecrawlNodeParameters,
  dataAccess: string,
  context: ConversionContext
): string {
  const urls = params.urls ? JSON.stringify(params.urls) : `${dataAccess}.urls || [${dataAccess}.url]`;
  const options = params.options || {};

  return `
      const data = ${dataAccess};
      const urls = ${urls};

      ${generateEnvVarCheck('N8N_FIRECRAWL_API_KEY', 'Firecrawl')}

      const urlArray = Array.isArray(urls) ? urls : [urls];
      if (!urlArray.length || !urlArray[0]) {
        throw new Error("[Firecrawl:extract] No URLs provided");
      }

      const response = await fetch("https://api.firecrawl.dev/v1/extract", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_FIRECRAWL_API_KEY}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: urlArray,
          ${options.schema ? `schema: ${JSON.stringify(options.schema)},` : ''}
          ${options.prompt ? `prompt: ${JSON.stringify(options.prompt)},` : ''}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Firecrawl:extract] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return result.data || result;
  `.trim();
}

/**
 * HTTP Request Node Converter
 * Converts n8n HTTP Request node to fetch-based Inngest step
 */
export const httpRequestConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.httpRequest'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as HttpRequestParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const method = params.method || 'GET';
    const url = convertN8nExpression(params.url, context);

    // Build headers
    let headersCode = '{}';
    if (params.sendHeaders && params.headerParameters?.parameters) {
      const headers = params.headerParameters.parameters
        .map(h => `"${h.name}": ${convertN8nExpression(h.value, context)}`)
        .join(',\n          ');
      headersCode = `{\n          ${headers}\n        }`;
    }

    // Build query params
    let queryCode = '';
    if (params.sendQuery && params.queryParameters?.parameters) {
      const queryParams = params.queryParameters.parameters
        .map(q => `${q.name}=\${encodeURIComponent(${convertN8nExpression(q.value, context)})}`)
        .join('&');
      queryCode = `const queryString = \`${queryParams}\`;
      const urlWithQuery = \`\${url}\${url.includes('?') ? '&' : '?'}\${queryString}\`;`;
    }

    // Build body
    let bodyCode = 'undefined';
    if (params.sendBody) {
      if (params.body) {
        bodyCode = `JSON.stringify(${convertN8nExpression(params.body, context)})`;
      } else if (params.bodyParameters?.parameters) {
        const bodyParams = params.bodyParameters.parameters
          .map(b => `"${b.name}": ${convertN8nExpression(b.value, context)}`)
          .join(',\n          ');
        bodyCode = `JSON.stringify({\n          ${bodyParams}\n        })`;
      }
    }

    const code = `
      const data = ${dataAccess};
      const url = ${url};

      if (!url) {
        throw new Error("[HTTP:${method}] No URL provided");
      }
      ${queryCode}

      const response = await fetch(${queryCode ? 'urlWithQuery' : 'url'}, {
        method: "${method}",
        headers: {
          "Content-Type": "application/json",
          ...${headersCode},
        },
        ${method !== 'GET' && method !== 'HEAD' ? `body: ${bodyCode},` : ''}
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
 * Airtable Node Converter
 * Converts n8n Airtable node to Inngest step with Airtable REST API
 */
export const airtableConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.airtable'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const operation = (params.operation as string) || 'search';

    // Handle resource locator pattern for base and table
    const baseParam = params.base as { value?: string; __rl?: boolean } | string;
    const tableParam = params.table as { value?: string; __rl?: boolean } | string;

    const baseId = typeof baseParam === 'object' && baseParam?.value
      ? baseParam.value
      : (typeof baseParam === 'string' ? baseParam : 'BASE_ID');
    const tableId = typeof tableParam === 'object' && tableParam?.value
      ? tableParam.value
      : (typeof tableParam === 'string' ? tableParam : 'TABLE_ID');

    // Check if baseId or tableId are expressions
    const baseIdCode = baseId.startsWith('=') || baseId.includes('{{')
      ? convertN8nExpression(baseId, context)
      : `"${baseId}"`;
    const tableIdCode = tableId.startsWith('=') || tableId.includes('{{')
      ? convertN8nExpression(tableId, context)
      : `"${tableId}"`;

    let code: string;

    switch (operation) {
      case 'search':
      case 'list':
        code = generateAirtableSearch(params, dataAccess, baseIdCode, tableIdCode, context);
        break;
      case 'create':
      case 'append':
        code = generateAirtableCreate(params, dataAccess, baseIdCode, tableIdCode, context);
        break;
      case 'update':
        code = generateAirtableUpdate(params, dataAccess, baseIdCode, tableIdCode, context);
        break;
      case 'delete':
        code = generateAirtableDelete(params, dataAccess, baseIdCode, tableIdCode, context);
        break;
      case 'get':
        code = generateAirtableGet(params, dataAccess, baseIdCode, tableIdCode, context);
        break;
      default:
        code = generateAirtableSearch(params, dataAccess, baseIdCode, tableIdCode, context);
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Airtable ${operation}: ${node.name}`,
      }],
    };
  },
};

function generateAirtableSearch(
  params: Record<string, unknown>,
  dataAccess: string,
  baseIdCode: string,
  tableIdCode: string,
  context: ConversionContext
): string {
  const filterByFormula = params.filterByFormula as string || '';
  const filterCode = filterByFormula
    ? convertN8nExpression(filterByFormula, context)
    : '""';

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_AIRTABLE_TOKEN', 'Airtable')}

      const baseId = ${baseIdCode};
      const tableId = ${tableIdCode};

      const params = new URLSearchParams();
      const formula = ${filterCode};
      if (formula) {
        params.append("filterByFormula", formula);
      }

      const response = await fetch(
        \`https://api.airtable.com/v0/\${baseId}/\${tableId}?\${params.toString()}\`,
        {
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_AIRTABLE_TOKEN}\`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Airtable:search] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      return result.records || [];
  `.trim();
}

function generateAirtableCreate(
  params: Record<string, unknown>,
  dataAccess: string,
  baseIdCode: string,
  tableIdCode: string,
  context: ConversionContext
): string {
  const columns = params.columns as {
    mappingMode?: string;
    value?: Record<string, string>;
  } | undefined;

  let fieldsCode = 'data';
  if (columns?.mappingMode === 'defineBelow' && columns.value) {
    const fieldEntries = Object.entries(columns.value)
      .map(([key, value]) => `"${key}": ${convertN8nExpression(value, context)}`)
      .join(',\n          ');
    fieldsCode = `{\n          ${fieldEntries}\n        }`;
  }

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_AIRTABLE_TOKEN', 'Airtable')}

      const baseId = ${baseIdCode};
      const tableId = ${tableIdCode};

      const fields = ${fieldsCode};

      const response = await fetch(
        \`https://api.airtable.com/v0/\${baseId}/\${tableId}\`,
        {
          method: "POST",
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_AIRTABLE_TOKEN}\`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Airtable:create] Request failed: \${response.status} - \${errorText}\`);
      }

      return await response.json();
  `.trim();
}

function generateAirtableUpdate(
  params: Record<string, unknown>,
  dataAccess: string,
  baseIdCode: string,
  tableIdCode: string,
  context: ConversionContext
): string {
  const columns = params.columns as {
    mappingMode?: string;
    value?: Record<string, string>;
    matchingColumns?: string[];
  } | undefined;

  let fieldsCode = 'data';
  let recordIdCode = 'data.id';

  if (columns?.mappingMode === 'defineBelow' && columns.value) {
    // Check if id is in the value
    if (columns.value.id) {
      recordIdCode = convertN8nExpression(columns.value.id, context);
    }

    // Filter out id from fields
    const fieldEntries = Object.entries(columns.value)
      .filter(([key]) => key !== 'id')
      .map(([key, value]) => `"${key}": ${convertN8nExpression(value, context)}`)
      .join(',\n          ');
    fieldsCode = `{\n          ${fieldEntries}\n        }`;
  }

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_AIRTABLE_TOKEN', 'Airtable')}

      const baseId = ${baseIdCode};
      const tableId = ${tableIdCode};
      const recordId = ${recordIdCode};

      if (!recordId) {
        throw new Error("[Airtable:update] No record ID provided");
      }

      const fields = ${fieldsCode};

      const response = await fetch(
        \`https://api.airtable.com/v0/\${baseId}/\${tableId}/\${recordId}\`,
        {
          method: "PATCH",
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_AIRTABLE_TOKEN}\`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Airtable:update] Request failed: \${response.status} - \${errorText}\`);
      }

      return await response.json();
  `.trim();
}

function generateAirtableDelete(
  _params: Record<string, unknown>,
  dataAccess: string,
  baseIdCode: string,
  tableIdCode: string,
  _context: ConversionContext
): string {
  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_AIRTABLE_TOKEN', 'Airtable')}

      const baseId = ${baseIdCode};
      const tableId = ${tableIdCode};
      const recordId = data.id;

      if (!recordId) {
        throw new Error("[Airtable:delete] No record ID provided");
      }

      const response = await fetch(
        \`https://api.airtable.com/v0/\${baseId}/\${tableId}/\${recordId}\`,
        {
          method: "DELETE",
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_AIRTABLE_TOKEN}\`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Airtable:delete] Request failed: \${response.status} - \${errorText}\`);
      }

      return await response.json();
  `.trim();
}

function generateAirtableGet(
  params: Record<string, unknown>,
  dataAccess: string,
  baseIdCode: string,
  tableIdCode: string,
  context: ConversionContext
): string {
  const recordId = params.id as string || '';
  const recordIdCode = recordId
    ? convertN8nExpression(recordId, context)
    : 'data.id';

  return `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_AIRTABLE_TOKEN', 'Airtable')}

      const baseId = ${baseIdCode};
      const tableId = ${tableIdCode};
      const recordId = ${recordIdCode};

      if (!recordId) {
        throw new Error("[Airtable:get] No record ID provided");
      }

      const response = await fetch(
        \`https://api.airtable.com/v0/\${baseId}/\${tableId}/\${recordId}\`,
        {
          headers: {
            "Authorization": \`Bearer \${process.env.N8N_AIRTABLE_TOKEN}\`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Airtable:get] Request failed: \${response.status} - \${errorText}\`);
      }

      return await response.json();
  `.trim();
}

/**
 * Split Out Node Converter
 * Converts n8n Split Out node (splits array into individual items)
 */
export const splitOutConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.splitOut'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const fieldToSplitOut = params.fieldToSplitOut as string || 'items';

    const code = `
      const data = ${dataAccess};

      // Get the array to split
      const arrayToSplit = data.${fieldToSplitOut} || data["${fieldToSplitOut}"] || [];

      // Return array of individual items
      // In Inngest, this will be processed with step.run for each item
      return Array.isArray(arrayToSplit) ? arrayToSplit : [arrayToSplit];
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Split Out: ${node.name} (field: ${fieldToSplitOut})`,
      }],
    };
  },
};

/**
 * Aggregate Node Converter
 * Converts n8n Aggregate node (combines multiple items into arrays)
 */
export const aggregateConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.aggregate'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const aggregate = params.aggregate as string || 'aggregateAllItemData';
    const destinationFieldName = params.destinationFieldName as string || 'data';
    const fieldsToAggregate = params.fieldsToAggregate as { fieldToAggregate?: { values?: Array<{ fieldName: string }> } } | undefined;

    let code: string;

    if (aggregate === 'aggregateIndividualFields' && fieldsToAggregate?.fieldToAggregate?.values) {
      const fields = fieldsToAggregate.fieldToAggregate.values.map(v => v.fieldName);
      code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];

      // Aggregate specific fields
      const aggregated = {
        ${fields.map(f => `"${f}": items.map(item => item["${f}"] ?? item.json?.["${f}"])`).join(',\n        ')}
      };

      return aggregated;
      `.trim();
    } else {
      code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];

      // Aggregate all item data
      return { "${destinationFieldName}": items };
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Aggregate: ${node.name}`,
      }],
    };
  },
};

/**
 * Respond to Webhook Node Converter
 * Converts n8n Respond to Webhook node
 */
export const respondToWebhookConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.respondToWebhook'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const respondWith = params.respondWith as string || 'json';
    const responseBody = params.responseBody as string || '';
    const responseCode = params.responseCode as number || 200;

    let code: string;

    if (respondWith === 'json') {
      const bodyCode = responseBody
        ? convertN8nExpression(responseBody, context)
        : `JSON.stringify(${dataAccess})`;

      code = `
      const data = ${dataAccess};

      // In Inngest, webhook responses are handled via the function return
      // This step prepares the response data
      const responseData = ${bodyCode};

      return {
        statusCode: ${responseCode},
        body: typeof responseData === 'string' ? JSON.parse(responseData) : responseData,
      };
      `.trim();
    } else if (respondWith === 'text') {
      const bodyCode = responseBody
        ? convertN8nExpression(responseBody, context)
        : `String(${dataAccess})`;

      code = `
      const data = ${dataAccess};

      return {
        statusCode: ${responseCode},
        body: ${bodyCode},
      };
      `.trim();
    } else {
      code = `
      const data = ${dataAccess};

      return {
        statusCode: ${responseCode},
        body: data,
      };
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Respond to Webhook: ${node.name}`,
      }],
    };
  },
};

/**
 * Item Lists Node Converter
 * Converts n8n Item Lists node for list operations
 */
export const itemListsConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.itemLists'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const operation = params.operation as string || 'concatenateItems';

    let code: string;

    switch (operation) {
      case 'concatenateItems':
        code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      return items.flat();
        `.trim();
        break;
      case 'limit':
        const maxItems = params.maxItems as number || 10;
        code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      return items.slice(0, ${maxItems});
        `.trim();
        break;
      case 'removeDuplicates':
        const compareFields = params.fieldsToCompare as string[] || [];
        if (compareFields.length > 0) {
          code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      const seen = new Set();
      return items.filter(item => {
        const key = ${JSON.stringify(compareFields)}.map(f => item[f]).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
          `.trim();
        } else {
          code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      const seen = new Set();
      return items.filter(item => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
          `.trim();
        }
        break;
      case 'sort':
        const sortField = params.fieldToSortBy as string || 'id';
        const order = params.order as string || 'ascending';
        code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      return items.sort((a, b) => {
        const aVal = a["${sortField}"];
        const bVal = b["${sortField}"];
        const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return ${order === 'descending' ? '-result' : 'result'};
      });
        `.trim();
        break;
      default:
        code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];
      return items;
        `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Item Lists (${operation}): ${node.name}`,
      }],
    };
  },
};

/**
 * Loop Over Items (Split in Batches) Node Converter
 * Converts n8n splitInBatches node for batch processing
 */
export const splitInBatchesConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.splitInBatches'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const batchSize = params.batchSize as number || 10;

    const code = `
      const items = Array.isArray(${dataAccess}) ? ${dataAccess} : [${dataAccess}];

      // Split into batches
      const batches = [];
      for (let i = 0; i < items.length; i += ${batchSize}) {
        batches.push(items.slice(i, i + ${batchSize}));
      }

      // Process each batch (in Inngest, consider using step.run for each batch)
      const results = [];
      for (const batch of batches) {
        results.push(...batch);
      }

      return results;
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Split in Batches (size: ${batchSize}): ${node.name}`,
      }],
    };
  },
};

/**
 * DateTime Node Converter
 * Converts n8n DateTime node for date/time operations
 */
export const dateTimeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.dateTime'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const action = params.action as string || 'format';
    let code: string;

    switch (action) {
      case 'format':
        code = generateDateTimeFormat(params, dataAccess, context);
        break;
      case 'calculate':
        code = generateDateTimeCalculate(params, dataAccess, context);
        break;
      case 'getTimeBetweenDates':
        code = generateTimeBetweenDates(params, dataAccess, context);
        break;
      case 'extractDate':
        code = generateExtractDate(params, dataAccess, context);
        break;
      case 'roundDate':
        code = generateRoundDate(params, dataAccess, context);
        break;
      default:
        code = generateDateTimeFormat(params, dataAccess, context);
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `DateTime ${action}: ${node.name}`,
      }],
    };
  },
};

function generateDateTimeFormat(
  params: Record<string, unknown>,
  dataAccess: string,
  context: ConversionContext
): string {
  const date = params.date as string || '';
  const format = params.format as string || 'yyyy-MM-dd';
  const outputFieldName = params.outputFieldName as string || 'formattedDate';
  const toTimezone = params.toTimezone as string || '';

  const dateCode = date
    ? convertN8nExpression(date, context)
    : `${dataAccess}.date || new Date().toISOString()`;

  return `
      const data = ${dataAccess};
      const inputDate = new Date(${dateCode});

      // Format date - simple implementation
      // For complex formats, consider using date-fns or dayjs
      const pad = (n: number) => String(n).padStart(2, '0');

      const year = inputDate.getFullYear();
      const month = pad(inputDate.getMonth() + 1);
      const day = pad(inputDate.getDate());
      const hours = pad(inputDate.getHours());
      const minutes = pad(inputDate.getMinutes());
      const seconds = pad(inputDate.getSeconds());

      let formatted = "${format}"
        .replace('yyyy', String(year))
        .replace('MM', month)
        .replace('dd', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);

      return {
        ...data,
        "${outputFieldName}": formatted,
        originalDate: inputDate.toISOString(),
      };
  `.trim();
}

function generateDateTimeCalculate(
  params: Record<string, unknown>,
  dataAccess: string,
  context: ConversionContext
): string {
  const date = params.date as string || '';
  const operation = params.operation as string || 'add';
  const duration = params.duration as number || 0;
  const timeUnit = params.timeUnit as string || 'days';
  const outputFieldName = params.outputFieldName as string || 'calculatedDate';

  const dateCode = date
    ? convertN8nExpression(date, context)
    : `${dataAccess}.date || new Date().toISOString()`;

  return `
      const data = ${dataAccess};
      const inputDate = new Date(${dateCode});

      const duration = ${duration};
      const timeUnit = "${timeUnit}";
      const operation = "${operation}";

      const multipliers: Record<string, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000, // Approximation
        years: 365 * 24 * 60 * 60 * 1000, // Approximation
      };

      const ms = duration * (multipliers[timeUnit] || multipliers.days);
      const resultMs = operation === 'subtract'
        ? inputDate.getTime() - ms
        : inputDate.getTime() + ms;

      const resultDate = new Date(resultMs);

      return {
        ...data,
        "${outputFieldName}": resultDate.toISOString(),
      };
  `.trim();
}

function generateTimeBetweenDates(
  params: Record<string, unknown>,
  dataAccess: string,
  context: ConversionContext
): string {
  const date1 = params.date1 as string || '';
  const date2 = params.date2 as string || '';
  const unit = params.unit as string || 'days';
  const outputFieldName = params.outputFieldName as string || 'timeDifference';

  const date1Code = date1
    ? convertN8nExpression(date1, context)
    : `${dataAccess}.date1 || ${dataAccess}.startDate`;
  const date2Code = date2
    ? convertN8nExpression(date2, context)
    : `${dataAccess}.date2 || ${dataAccess}.endDate || new Date().toISOString()`;

  return `
      const data = ${dataAccess};
      const startDate = new Date(${date1Code});
      const endDate = new Date(${date2Code});

      const diffMs = endDate.getTime() - startDate.getTime();

      const divisors: Record<string, number> = {
        milliseconds: 1,
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
      };

      const difference = diffMs / (divisors["${unit}"] || divisors.days);

      return {
        ...data,
        "${outputFieldName}": Math.floor(difference),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        unit: "${unit}",
      };
  `.trim();
}

function generateExtractDate(
  params: Record<string, unknown>,
  dataAccess: string,
  context: ConversionContext
): string {
  const date = params.date as string || '';
  const outputFieldName = params.outputFieldName as string || 'extractedDate';

  const dateCode = date
    ? convertN8nExpression(date, context)
    : `${dataAccess}.date || new Date().toISOString()`;

  return `
      const data = ${dataAccess};
      const inputDate = new Date(${dateCode});

      const extracted = {
        year: inputDate.getFullYear(),
        month: inputDate.getMonth() + 1,
        day: inputDate.getDate(),
        hour: inputDate.getHours(),
        minute: inputDate.getMinutes(),
        second: inputDate.getSeconds(),
        dayOfWeek: inputDate.getDay(),
        dayOfYear: Math.floor((inputDate.getTime() - new Date(inputDate.getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000)),
        weekNumber: Math.ceil((((inputDate.getTime() - new Date(inputDate.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(inputDate.getFullYear(), 0, 1).getDay() + 1) / 7),
        isLeapYear: (inputDate.getFullYear() % 4 === 0 && inputDate.getFullYear() % 100 !== 0) || inputDate.getFullYear() % 400 === 0,
        timestamp: inputDate.getTime(),
        iso: inputDate.toISOString(),
      };

      return {
        ...data,
        "${outputFieldName}": extracted,
      };
  `.trim();
}

function generateRoundDate(
  params: Record<string, unknown>,
  dataAccess: string,
  context: ConversionContext
): string {
  const date = params.date as string || '';
  const mode = params.mode as string || 'roundDown';
  const toNearest = params.toNearest as string || 'day';
  const outputFieldName = params.outputFieldName as string || 'roundedDate';

  const dateCode = date
    ? convertN8nExpression(date, context)
    : `${dataAccess}.date || new Date().toISOString()`;

  return `
      const data = ${dataAccess};
      const inputDate = new Date(${dateCode});

      let result = new Date(inputDate);
      const mode = "${mode}";
      const toNearest = "${toNearest}";

      // Round based on unit
      switch (toNearest) {
        case 'minute':
          result.setSeconds(0, 0);
          if (mode === 'roundUp' && inputDate.getSeconds() > 0) {
            result.setMinutes(result.getMinutes() + 1);
          }
          break;
        case 'hour':
          result.setMinutes(0, 0, 0);
          if (mode === 'roundUp' && inputDate.getMinutes() > 0) {
            result.setHours(result.getHours() + 1);
          }
          break;
        case 'day':
          result.setHours(0, 0, 0, 0);
          if (mode === 'roundUp' && (inputDate.getHours() > 0 || inputDate.getMinutes() > 0)) {
            result.setDate(result.getDate() + 1);
          }
          break;
        case 'week':
          result.setHours(0, 0, 0, 0);
          const dayOfWeek = result.getDay();
          result.setDate(result.getDate() - dayOfWeek);
          if (mode === 'roundUp' && dayOfWeek > 0) {
            result.setDate(result.getDate() + 7);
          }
          break;
        case 'month':
          result.setDate(1);
          result.setHours(0, 0, 0, 0);
          if (mode === 'roundUp' && inputDate.getDate() > 1) {
            result.setMonth(result.getMonth() + 1);
          }
          break;
      }

      return {
        ...data,
        "${outputFieldName}": result.toISOString(),
      };
  `.trim();
}

/**
 * Slack Node Converter
 */
export const slackConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.slack'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as Record<string, unknown>;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const resource = params.resource as string || 'message';
    const operation = params.operation as string || 'post';
    const channel = params.channel as string || '';
    const text = params.text as string || '';

    let code: string;

    if (resource === 'message' && operation === 'post') {
      code = `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SLACK_BOT_TOKEN', 'Slack')}

      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${process.env.N8N_SLACK_BOT_TOKEN}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: "${channel}" || data.channel,
          text: ${convertN8nExpression(text, context)} || data.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`[Slack:postMessage] Request failed: \${response.status} - \${errorText}\`);
      }

      const result = await response.json();
      if (!result.ok) {
        throw new Error(\`[Slack:postMessage] API error: \${result.error}\`);
      }

      return result;
      `.trim();
    } else {
      code = `
      const data = ${dataAccess};

      ${generateEnvVarCheck('N8N_SLACK_BOT_TOKEN', 'Slack')}

      // TODO: Implement Slack ${resource}/${operation}
      const { WebClient } = await import("@slack/web-api");
      const client = new WebClient(process.env.N8N_SLACK_BOT_TOKEN);

      return { success: true, data };
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Slack ${resource}/${operation}: ${node.name}`,
      }],
    };
  },
};

// Export all integration converters
export const integrationConverters: NodeConverter[] = [
  supabaseConverter,
  firecrawlConverter,
  httpRequestConverter,
  slackConverter,
  airtableConverter,
  splitOutConverter,
  aggregateConverter,
  respondToWebhookConverter,
  itemListsConverter,
  splitInBatchesConverter,
  dateTimeConverter,
];

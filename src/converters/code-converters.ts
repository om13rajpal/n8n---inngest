/**
 * Code/Transform Node Converters
 * Converts n8n Code, Set, Function, and data transformation nodes
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
} from './base-converter.js';
import { CodeNodeParameters } from '../types/n8n.js';

/**
 * Code Node Converter
 * Converts n8n Code node JavaScript to Inngest step
 */
export const codeNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.code'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as unknown as CodeNodeParameters;
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Get the JavaScript code
    let jsCode = params.jsCode || 'return items;';

    // Convert n8n-specific variables to Inngest equivalents
    jsCode = convertN8nCodeToInngest(jsCode, context);

    const mode = params.mode || 'runOnceForAllItems';

    let code: string;
    if (mode === 'runOnceForEachItem') {
      code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      const results = [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const $json = items[itemIndex];
        const $input = { item: { json: $json }, all: () => items, first: () => items[0], last: () => items[items.length - 1] };

        // Original n8n code (converted):
        ${jsCode}

        // Collect result
        if (typeof result !== 'undefined') {
          results.push(result);
        }
      }

      return results;
      `.trim();
    } else {
      code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const $input = { all: () => items, first: () => items[0], last: () => items[items.length - 1] };

      // Original n8n code (converted):
      ${jsCode}
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Code: ${node.name}`,
      }],
    };
  },
};

/**
 * Function Node Converter (legacy)
 */
export const functionNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.function', 'n8n-nodes-base.functionItem'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as { functionCode?: string };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    let functionCode = params.functionCode || 'return items;';
    functionCode = convertN8nCodeToInngest(functionCode, context);

    const isItemMode = node.type === 'n8n-nodes-base.functionItem';

    let code: string;
    if (isItemMode) {
      code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      const results = items.map((item, index) => {
        const $json = item;
        const $item = item;
        const $index = index;

        // Original n8n function code:
        ${functionCode}
      });

      return results;
      `.trim();
    } else {
      code = `
      const items = ${dataAccess};

      // Original n8n function code:
      ${functionCode}
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Function: ${node.name}`,
      }],
    };
  },
};

/**
 * Set Node Converter
 * Converts n8n Set node to data assignment step
 */
export const setNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.set'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      mode?: string;
      duplicateItem?: boolean;
      include?: string;
      options?: Record<string, unknown>;
      assignments?: {
        assignments: Array<{
          id?: string;
          name: string;
          value: unknown;
          type?: string;
        }>;
      };
      // Legacy format
      values?: {
        string?: Array<{ name: string; value: string }>;
        number?: Array<{ name: string; value: number }>;
        boolean?: Array<{ name: string; value: boolean }>;
      };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Handle both new and legacy Set node formats
    let assignments: string[] = [];

    if (params.assignments?.assignments) {
      // New format
      assignments = params.assignments.assignments.map(a => {
        const value = convertN8nExpression(String(a.value), context);
        return `"${a.name}": ${value}`;
      });
    } else if (params.values) {
      // Legacy format
      if (params.values.string) {
        assignments.push(...params.values.string.map(v => {
          const value = convertN8nExpression(v.value, context);
          return `"${v.name}": ${value}`;
        }));
      }
      if (params.values.number) {
        assignments.push(...params.values.number.map(v => {
          return `"${v.name}": ${v.value}`;
        }));
      }
      if (params.values.boolean) {
        assignments.push(...params.values.boolean.map(v => {
          return `"${v.name}": ${v.value}`;
        }));
      }
    }

    const keepExisting = params.mode !== 'raw' && params.include !== 'none';

    let code: string;
    if (keepExisting) {
      code = `
      const inputData = ${dataAccess};
      const existingData = typeof inputData === 'object' && inputData !== null ? inputData : {};

      return {
        ...existingData,
        ${assignments.join(',\n        ')}
      };
      `.trim();
    } else {
      code = `
      return {
        ${assignments.join(',\n        ')}
      };
      `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Set: ${node.name}`,
      }],
    };
  },
};

/**
 * Filter Node Converter
 */
export const filterNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.filter'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      conditions?: {
        conditions: Array<{
          leftValue: string;
          rightValue: unknown;
          operator: { type: string; operation: string };
        }>;
        combinator: 'and' | 'or';
      };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    // Build filter condition
    let filterCondition = 'true';
    if (params.conditions?.conditions) {
      const conditions = params.conditions.conditions.map(c => {
        const left = convertN8nExpression(c.leftValue, context).replace(/\$\{data/g, '${item');
        const right = convertN8nExpression(String(c.rightValue), context);
        const op = mapFilterOperator(c.operator.operation);
        return `(item${left.includes('item') ? '' : '.'}${left} ${op} ${right})`;
      });
      filterCondition = conditions.join(params.conditions.combinator === 'and' ? ' && ' : ' || ');
    }

    const code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      return items.filter((item) => {
        return ${filterCondition};
      });
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Filter: ${node.name}`,
      }],
    };
  },
};

/**
 * Sort Node Converter
 */
export const sortNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.sort'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      sortFieldsUi?: {
        sortField: Array<{
          fieldName: string;
          order?: 'ascending' | 'descending';
        }>;
      };
      options?: {
        sortLocale?: boolean;
      };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const sortFields = params.sortFieldsUi?.sortField || [];
    const sortLogic = sortFields.map(f => {
      const direction = f.order === 'descending' ? -1 : 1;
      return `
        const aVal = a["${f.fieldName}"];
        const bVal = b["${f.fieldName}"];
        if (aVal < bVal) return ${-direction};
        if (aVal > bVal) return ${direction};
      `;
    }).join('\n');

    const code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? [...inputData] : [inputData];

      return items.sort((a, b) => {
        ${sortLogic || 'return 0;'}
        return 0;
      });
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Sort: ${node.name}`,
      }],
    };
  },
};

/**
 * Limit Node Converter
 */
export const limitNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.limit'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      maxItems?: number;
      keep?: 'firstItems' | 'lastItems';
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const maxItems = params.maxItems || 10;
    const keep = params.keep || 'firstItems';

    const code = keep === 'lastItems'
      ? `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      return items.slice(-${maxItems});
      `.trim()
      : `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      return items.slice(0, ${maxItems});
      `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Limit: ${node.name}`,
      }],
    };
  },
};

/**
 * Remove Duplicates Node Converter
 */
export const removeDuplicatesConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.removeDuplicates'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      compare?: 'allFields' | 'selectedFields';
      fieldsToCompare?: { fields: Array<{ fieldName: string }> };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    let compareFields: string[] = [];
    if (params.compare === 'selectedFields' && params.fieldsToCompare?.fields) {
      compareFields = params.fieldsToCompare.fields.map(f => f.fieldName);
    }

    const code = compareFields.length > 0
      ? `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const seen = new Set();

      return items.filter((item) => {
        const key = JSON.stringify([${compareFields.map(f => `item["${f}"]`).join(', ')}]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      `.trim()
      : `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const seen = new Set();

      return items.filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Remove Duplicates: ${node.name}`,
      }],
    };
  },
};

/**
 * Aggregate Node Converter
 */
export const aggregateConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.aggregate'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      aggregate?: string;
      fieldsToAggregate?: {
        fieldToAggregate: Array<{
          fieldToAggregate: string;
          renameField?: boolean;
          outputFieldName?: string;
        }>;
      };
      options?: {
        keepMissing?: boolean;
        keepOnlyUnique?: boolean;
      };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const fields = params.fieldsToAggregate?.fieldToAggregate || [];

    const code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      const result = {};
      ${fields.map(f => {
        const outputName = f.renameField && f.outputFieldName ? f.outputFieldName : f.fieldToAggregate;
        return `result["${outputName}"] = items.map(item => item["${f.fieldToAggregate}"]).filter(v => v !== undefined);`;
      }).join('\n      ')}

      return result;
    `.trim();

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
 * Item Lists Node Converter
 */
export const itemListsConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.itemLists'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      operation?: string;
      fieldToSplitOut?: string;
      include?: string;
      fieldToAggregate?: string;
      options?: Record<string, unknown>;
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    let code: string;
    switch (params.operation) {
      case 'splitOutItems':
        code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const field = "${params.fieldToSplitOut || ''}";

      return items.flatMap(item => {
        const values = item[field];
        if (Array.isArray(values)) {
          return values.map(v => ({ ...item, [field]: v }));
        }
        return item;
      });
        `.trim();
        break;

      case 'concatenateItems':
        code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];
      const field = "${params.fieldToAggregate || ''}";

      const values = items.map(item => item[field]).filter(v => v !== undefined);
      return { [field]: values };
        `.trim();
        break;

      case 'summarize':
        code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      return {
        count: items.length,
        items: items,
      };
        `.trim();
        break;

      default:
        code = `
      const inputData = ${dataAccess};
      return Array.isArray(inputData) ? inputData : [inputData];
        `.trim();
    }

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Item Lists (${params.operation || 'process'}): ${node.name}`,
      }],
    };
  },
};

/**
 * Rename Keys Node Converter
 */
export const renameKeysConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.renameKeys'],

  convert(node: ParsedNode, context: ConversionContext): ConversionResult {
    const params = node.parameters as {
      keys?: {
        key: Array<{
          currentKey: string;
          newKey: string;
        }>;
      };
    };
    const stepId = toStepId(node.name);
    const varName = toVariableName(node.name);
    const dataAccess = generateDataAccess(node, context);

    context.variableMap.set(node.name, varName);

    const keyMappings = params.keys?.key || [];
    const mappingCode = keyMappings.map(k =>
      `if ("${k.currentKey}" in result) { result["${k.newKey}"] = result["${k.currentKey}"]; delete result["${k.currentKey}"]; }`
    ).join('\n        ');

    const code = `
      const inputData = ${dataAccess};
      const items = Array.isArray(inputData) ? inputData : [inputData];

      return items.map(item => {
        const result = { ...item };
        ${mappingCode}
        return result;
      });
    `.trim();

    return {
      steps: [{
        type: 'run',
        id: stepId,
        code,
        comment: `Rename Keys: ${node.name}`,
      }],
    };
  },
};

/**
 * Convert n8n code variables to Inngest equivalents
 */
function convertN8nCodeToInngest(code: string, context: ConversionContext): string {
  let converted = code;

  // Replace n8n global variables
  converted = converted.replace(/\$input\.all\(\)/g, 'items');
  converted = converted.replace(/\$input\.first\(\)/g, 'items[0]');
  converted = converted.replace(/\$input\.last\(\)/g, 'items[items.length - 1]');
  converted = converted.replace(/\$input\.item/g, '$json');

  // Replace $env variables
  converted = converted.replace(/\$env\.(\w+)/g, 'process.env.$1');

  // Replace $now
  converted = converted.replace(/\$now/g, 'new Date()');

  // Replace $today
  converted = converted.replace(/\$today/g, 'new Date().toISOString().split("T")[0]');

  // Replace $execution
  converted = converted.replace(/\$execution\.id/g, '"execution-id"');
  converted = converted.replace(/\$execution\.mode/g, '"production"');

  // Replace $workflow
  converted = converted.replace(/\$workflow\.id/g, `"${context.workflowName}"`);
  converted = converted.replace(/\$workflow\.name/g, `"${context.workflowName}"`);

  // Replace node references $('NodeName')
  converted = converted.replace(
    /\$\(['"]([^'"]+)['"]\)\.(?:item\.)?json/g,
    (match, nodeName) => {
      const varName = context.variableMap.get(nodeName) || toVariableName(nodeName);
      return varName;
    }
  );

  return converted;
}

/**
 * Map filter operator
 */
function mapFilterOperator(operation: string): string {
  const opMap: Record<string, string> = {
    equals: '===',
    notEquals: '!==',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    contains: '.includes',
    notContains: '.indexOf',
    startsWith: '.startsWith',
    endsWith: '.endsWith',
  };
  return opMap[operation] || '===';
}

// Export all code converters
export const codeConverters: NodeConverter[] = [
  codeNodeConverter,
  functionNodeConverter,
  setNodeConverter,
  filterNodeConverter,
  sortNodeConverter,
  limitNodeConverter,
  removeDuplicatesConverter,
  aggregateConverter,
  itemListsConverter,
  renameKeysConverter,
];

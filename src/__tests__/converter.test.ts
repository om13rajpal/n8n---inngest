/**
 * Tests for n8n to Inngest Converter
 */

import { describe, it, expect } from 'vitest';
import { convertWorkflow } from '../converter/index.js';
import { parseWorkflow } from '../parser/workflow-parser.js';
import { N8nWorkflow } from '../types/n8n.js';

// Sample n8n workflow JSON for testing
const sampleWorkflow: N8nWorkflow = {
  meta: {
    instanceId: 'test-instance',
  },
  name: 'Test Workflow',
  nodes: [
    {
      id: '1',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    },
    {
      id: '2',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [450, 300],
      parameters: {
        url: 'https://api.example.com/data',
        method: 'GET',
        authentication: 'none',
      },
    },
    {
      id: '3',
      name: 'Process Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [650, 300],
      parameters: {
        jsCode: 'return items.map(item => ({ ...item, processed: true }));',
        mode: 'runOnceForAllItems',
      },
    },
  ],
  connections: {
    'Manual Trigger': {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
    },
    'HTTP Request': {
      main: [[{ node: 'Process Data', type: 'main', index: 0 }]],
    },
  },
};

describe('parseWorkflow', () => {
  it('should parse a basic workflow', () => {
    const parsed = parseWorkflow(sampleWorkflow);

    expect(parsed.name).toBe('Test Workflow');
    expect(parsed.triggers).toHaveLength(1);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.triggers[0].type).toBe('n8n-nodes-base.manualTrigger');
  });

  it('should identify trigger nodes correctly', () => {
    const parsed = parseWorkflow(sampleWorkflow);

    expect(parsed.triggers[0].category).toBe('trigger');
    expect(parsed.nodes.every(n => n.category !== 'trigger')).toBe(true);
  });

  it('should build execution graph', () => {
    const parsed = parseWorkflow(sampleWorkflow);

    expect(parsed.executionGraph.entryPoints).toContain('Manual Trigger');
    expect(parsed.executionGraph.edges.length).toBeGreaterThan(0);
  });
});

describe('convertWorkflow', () => {
  it('should convert a basic workflow', () => {
    const result = convertWorkflow(sampleWorkflow);

    expect(result.code).toBeDefined();
    expect(result.code).toContain('import { Inngest }');
    expect(result.code).toContain('createFunction');
    expect(result.functions).toHaveLength(1);
  });

  it('should generate valid TypeScript', () => {
    const result = convertWorkflow(sampleWorkflow);

    // Check for basic TypeScript validity
    expect(result.code).toContain('const inngest = new Inngest');
    expect(result.code).toContain('async');
    expect(result.code).toContain('await step.run');
  });

  it('should include comments when enabled', () => {
    const result = convertWorkflow(sampleWorkflow, { includeComments: true });

    expect(result.code).toContain('//');
  });

  it('should exclude comments when disabled', () => {
    const result = convertWorkflow(sampleWorkflow, { includeComments: false });

    // Should have fewer comment lines
    const commentLines = result.code.split('\n').filter(l => l.trim().startsWith('//'));
    // Some comments may still exist (like header), but should be minimal
    expect(commentLines.length).toBeLessThan(10);
  });
});

describe('Cron Trigger Conversion', () => {
  const cronWorkflow: N8nWorkflow = {
    name: 'Cron Workflow',
    nodes: [
      {
        id: '1',
        name: 'Cron Trigger',
        type: 'n8n-nodes-base.cron',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          triggerTimes: {
            item: [{ mode: 'everyHour', minute: 30 }],
          },
        },
      },
    ],
    connections: {},
  };

  it('should convert cron trigger to Inngest cron', () => {
    const result = convertWorkflow(cronWorkflow);

    expect(result.code).toContain('cron:');
    expect(result.code).toContain('30 * * * *');
  });
});

describe('IF Node Conversion', () => {
  const ifWorkflow: N8nWorkflow = {
    name: 'IF Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'Check Condition',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          conditions: {
            conditions: [
              {
                leftValue: '={{ $json.status }}',
                rightValue: 'active',
                operator: { type: 'string', operation: 'equals' },
              },
            ],
            combinator: 'and',
          },
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Check Condition', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert IF node to conditional step', () => {
    const result = convertWorkflow(ifWorkflow);

    expect(result.code).toContain('condition');
    expect(result.code).toContain('branch');
  });
});

describe('HTTP Request Conversion', () => {
  const httpWorkflow: N8nWorkflow = {
    name: 'HTTP Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'API Call',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [450, 300],
        parameters: {
          url: 'https://api.example.com/users',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'name', value: '={{ $json.name }}' },
              { name: 'email', value: '={{ $json.email }}' },
            ],
          },
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'API Call', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert HTTP request to fetch call', () => {
    const result = convertWorkflow(httpWorkflow);

    expect(result.code).toContain('fetch');
    expect(result.code).toContain('POST');
    expect(result.code).toContain('api.example.com');
  });
});

describe('Code Node Conversion', () => {
  const codeWorkflow: N8nWorkflow = {
    name: 'Code Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'Transform Data',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          jsCode: `
            const data = $input.all();
            return data.map(item => ({
              id: item.json.id,
              name: item.json.name.toUpperCase()
            }));
          `,
          mode: 'runOnceForAllItems',
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Transform Data', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert code node to step.run', () => {
    const result = convertWorkflow(codeWorkflow);

    expect(result.code).toContain('step.run');
    expect(result.code).toContain('toUpperCase');
  });
});

describe('Supabase Node Conversion', () => {
  const supabaseWorkflow: N8nWorkflow = {
    name: 'Supabase Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'Get Users',
        type: 'n8n-nodes-base.supabase',
        typeVersion: 1,
        position: [450, 300],
        parameters: {
          operation: 'getAll',
          tableId: 'users',
          returnAll: true,
        },
        credentials: {
          supabaseApi: { id: 'cred1', name: 'Supabase' },
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Get Users', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert Supabase node', () => {
    const result = convertWorkflow(supabaseWorkflow);

    expect(result.code).toContain('supabase');
    expect(result.code).toContain('from');
    expect(result.code).toContain('select');
    expect(result.credentials).toContainEqual(
      expect.objectContaining({ type: 'Supabase' })
    );
  });
});

describe('Credential Extraction', () => {
  const credWorkflow: N8nWorkflow = {
    name: 'Cred Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'OpenAI',
        type: 'n8n-nodes-base.openAi',
        typeVersion: 1,
        position: [450, 300],
        parameters: {
          resource: 'chat',
          model: 'gpt-4o',
        },
        credentials: {
          openAiApi: { id: 'cred1', name: 'OpenAI' },
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'OpenAI', type: 'main', index: 0 }]],
      },
    },
  };

  it('should extract credentials', () => {
    const result = convertWorkflow(credWorkflow);

    expect(result.credentials.length).toBeGreaterThan(0);
    expect(result.envVars).toContain('OPENAI_API_KEY');
  });
});

describe('Loop/Batch Conversion', () => {
  const loopWorkflow: N8nWorkflow = {
    name: 'Loop Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'Loop Over Items',
        type: 'n8n-nodes-base.splitInBatches',
        typeVersion: 3,
        position: [450, 300],
        parameters: {
          batchSize: 10,
        },
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert loop node with batch info', () => {
    const result = convertWorkflow(loopWorkflow);

    expect(result.code).toContain('batch');
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/loop|batch/i)
    );
  });
});

describe('Complex Workflow', () => {
  const complexWorkflow: N8nWorkflow = {
    name: 'Complex Data Pipeline',
    nodes: [
      {
        id: '1',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          rule: {
            interval: [{ field: 'hours', hoursInterval: 1 }],
          },
        },
      },
      {
        id: '2',
        name: 'Fetch Data',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [450, 300],
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      },
      {
        id: '3',
        name: 'Filter Active',
        type: 'n8n-nodes-base.filter',
        typeVersion: 1,
        position: [650, 300],
        parameters: {
          conditions: {
            conditions: [
              {
                leftValue: '={{ $json.status }}',
                rightValue: 'active',
                operator: { type: 'string', operation: 'equals' },
              },
            ],
            combinator: 'and',
          },
        },
      },
      {
        id: '4',
        name: 'Save to Supabase',
        type: 'n8n-nodes-base.supabase',
        typeVersion: 1,
        position: [850, 300],
        parameters: {
          operation: 'upsert',
          tableId: 'records',
        },
        credentials: {
          supabaseApi: { id: 'cred1', name: 'Supabase' },
        },
      },
    ],
    connections: {
      'Schedule Trigger': {
        main: [[{ node: 'Fetch Data', type: 'main', index: 0 }]],
      },
      'Fetch Data': {
        main: [[{ node: 'Filter Active', type: 'main', index: 0 }]],
      },
      'Filter Active': {
        main: [[{ node: 'Save to Supabase', type: 'main', index: 0 }]],
      },
    },
  };

  it('should convert complex workflow with multiple node types', () => {
    const result = convertWorkflow(complexWorkflow);

    expect(result.code).toContain('cron:');
    expect(result.code).toContain('fetch');
    expect(result.code).toContain('filter');
    expect(result.code).toContain('supabase');
    expect(result.functions).toHaveLength(1);
  });

  it('should maintain execution order', () => {
    const result = convertWorkflow(complexWorkflow);

    // Steps should be in order
    const fetchIndex = result.code.indexOf('fetch-data');
    const filterIndex = result.code.indexOf('filter-active');
    const saveIndex = result.code.indexOf('save-to-supabase');

    expect(fetchIndex).toBeLessThan(filterIndex);
    expect(filterIndex).toBeLessThan(saveIndex);
  });
});

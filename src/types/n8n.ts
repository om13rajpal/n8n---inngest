/**
 * n8n Workflow JSON Types
 * Based on n8n's workflow export format
 */

export interface N8nWorkflow {
  meta?: N8nMeta;
  nodes: N8nNode[];
  connections: N8nConnections;
  pinData?: Record<string, unknown>;
  settings?: N8nSettings;
  staticData?: unknown;
  name?: string;
  active?: boolean;
  id?: string;
  tags?: string[];
}

export interface N8nMeta {
  templateCredsSetupCompleted?: boolean;
  instanceId?: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, N8nCredential>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  webhookId?: string;
  extendsCredential?: string;
}

export interface N8nCredential {
  id: string;
  name: string;
}

export interface N8nConnections {
  [nodeName: string]: {
    main?: N8nConnectionArray[][];
    ai_agent?: N8nConnectionArray[][];
    ai_tool?: N8nConnectionArray[][];
    ai_languageModel?: N8nConnectionArray[][];
    ai_memory?: N8nConnectionArray[][];
    ai_outputParser?: N8nConnectionArray[][];
    ai_retriever?: N8nConnectionArray[][];
    ai_document?: N8nConnectionArray[][];
    ai_embedding?: N8nConnectionArray[][];
    ai_textSplitter?: N8nConnectionArray[][];
    ai_vectorStore?: N8nConnectionArray[][];
  };
}

export interface N8nConnectionArray {
  node: string;
  type: string;
  index: number;
}

export interface N8nSettings {
  executionOrder?: string;
  saveDataErrorExecution?: string;
  saveDataSuccessExecution?: string;
  saveManualExecutions?: boolean;
  callerPolicy?: string;
  errorWorkflow?: string;
  timezone?: string;
}

// n8n Node Type Categories
export type N8nNodeCategory =
  | 'trigger'
  | 'action'
  | 'flow'
  | 'transform'
  | 'core'
  | 'ai';

// Trigger Node Types
export const TRIGGER_NODE_TYPES = [
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.cron',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.errorTrigger',
  '@n8n/n8n-nodes-langchain.chatTrigger',
] as const;

// Control Flow Node Types
export const CONTROL_FLOW_NODE_TYPES = [
  'n8n-nodes-base.if',
  'n8n-nodes-base.switch',
  'n8n-nodes-base.merge',
  'n8n-nodes-base.splitInBatches',
  'n8n-nodes-base.wait',
  'n8n-nodes-base.noOp',
  'n8n-nodes-base.respondToWebhook',
] as const;

// Code/Transform Node Types
export const CODE_NODE_TYPES = [
  'n8n-nodes-base.code',
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
  'n8n-nodes-base.set',
  'n8n-nodes-base.itemLists',
  'n8n-nodes-base.aggregate',
  'n8n-nodes-base.filter',
  'n8n-nodes-base.sort',
  'n8n-nodes-base.limit',
  'n8n-nodes-base.removeDuplicates',
  'n8n-nodes-base.splitOut',
  'n8n-nodes-base.summarize',
  'n8n-nodes-base.renameKeys',
] as const;

// HTTP/API Node Types
export const HTTP_NODE_TYPES = [
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.graphql',
] as const;

// Database Node Types
export const DATABASE_NODE_TYPES = [
  'n8n-nodes-base.supabase',
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
  'n8n-nodes-base.mongodb',
  'n8n-nodes-base.redis',
  'n8n-nodes-base.airtable',
  'n8n-nodes-base.googleSheets',
] as const;

// AI/LLM Node Types
export const AI_NODE_TYPES = [
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.agentTool',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.chainRetrievalQa',
  '@n8n/n8n-nodes-langchain.chainSummarization',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  '@n8n/n8n-nodes-langchain.lmChatOllama',
  '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  '@n8n/n8n-nodes-langchain.toolCode',
  '@n8n/n8n-nodes-langchain.toolCalculator',
  '@n8n/n8n-nodes-langchain.toolHttpRequest',
  '@n8n/n8n-nodes-langchain.toolThink',
  '@n8n/n8n-nodes-langchain.toolWikipedia',
  '@n8n/n8n-nodes-langchain.toolVectorStore',
  '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  '@n8n/n8n-nodes-langchain.outputParserStructured',
  'n8n-nodes-base.openAi',
  'n8n-nodes-base.perplexityTool',
  'n8n-nodes-base.httpRequestTool',
] as const;

// Scraping/Web Node Types
export const SCRAPING_NODE_TYPES = [
  'n8n-nodes-firecrawl.firecrawl',
  '@mendable/n8n-nodes-firecrawl.firecrawl',
  'n8n-nodes-base.htmlExtract',
  'n8n-nodes-base.html',
  'n8n-nodes-base.rssFeedRead',
] as const;

// Utility function to check node category
export function getNodeCategory(nodeType: string): N8nNodeCategory {
  if (TRIGGER_NODE_TYPES.includes(nodeType as any)) return 'trigger';
  if (CONTROL_FLOW_NODE_TYPES.includes(nodeType as any)) return 'flow';
  if (CODE_NODE_TYPES.includes(nodeType as any)) return 'transform';
  if (AI_NODE_TYPES.includes(nodeType as any)) return 'ai';
  return 'action';
}

// Parameter type helpers for specific nodes
export interface IfNodeParameters {
  conditions: {
    options?: {
      caseSensitive?: boolean;
      leftValue?: string;
      typeValidation?: string;
    };
    conditions: Array<{
      id?: string;
      leftValue: string;
      rightValue: unknown;
      operator: {
        type: string;
        operation: string;
        name?: string;
      };
    }>;
    combinator: 'and' | 'or';
  };
  options?: Record<string, unknown>;
}

export interface SwitchNodeParameters {
  mode: 'rules' | 'expression';
  rules?: {
    conditions?: Array<{
      leftValue: string;
      rightValue: unknown;
      operator: {
        type: string;
        operation: string;
      };
    }>;
    output?: number;
  }[];
  expression?: string;
  fallbackOutput?: 'none' | 'extra';
}

export interface HttpRequestParameters {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  authentication?: 'none' | 'genericCredentialType' | 'predefinedCredentialType';
  genericAuthType?: string;
  sendHeaders?: boolean;
  headerParameters?: {
    parameters: Array<{ name: string; value: string }>;
  };
  sendQuery?: boolean;
  queryParameters?: {
    parameters: Array<{ name: string; value: string }>;
  };
  sendBody?: boolean;
  bodyParameters?: {
    parameters: Array<{ name: string; value: string }>;
  };
  contentType?: string;
  body?: string;
  options?: {
    redirect?: { redirect: { followRedirects: boolean } };
    response?: { response: { fullResponse: boolean } };
    timeout?: number;
  };
}

export interface CodeNodeParameters {
  jsCode?: string;
  mode?: 'runOnceForAllItems' | 'runOnceForEachItem';
  language?: 'javaScript' | 'python';
}

export interface CronNodeParameters {
  triggerTimes?: {
    item: Array<{
      mode: 'everyMinute' | 'everyHour' | 'everyDay' | 'everyWeek' | 'everyMonth' | 'custom';
      hour?: number;
      minute?: number;
      dayOfMonth?: number;
      weekday?: string;
      cronExpression?: string;
    }>;
  };
}

export interface ScheduleTriggerParameters {
  rule?: {
    interval: Array<{
      field: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'cronExpression';
      secondsInterval?: number;
      minutesInterval?: number;
      hoursInterval?: number;
      daysInterval?: number;
      weeksInterval?: number;
      monthsInterval?: number;
      cronExpression?: string;
      triggerAtHour?: number;
      triggerAtMinute?: number;
      triggerAtDay?: number;
    }>;
  };
}

export interface WebhookNodeParameters {
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  path: string;
  authentication?: 'none' | 'basicAuth' | 'headerAuth' | 'jwtAuth';
  responseMode?: 'onReceived' | 'lastNode' | 'responseNode';
  responseCode?: number;
  responseData?: 'allEntries' | 'firstEntryJson' | 'firstEntryBinary' | 'noData';
  options?: {
    binaryData?: boolean;
    rawBody?: boolean;
    responseHeaders?: { entries: Array<{ name: string; value: string }> };
  };
}

export interface SplitInBatchesParameters {
  batchSize: number;
  options?: {
    reset?: boolean;
  };
}

export interface WaitNodeParameters {
  resume?: 'timeInterval' | 'specificTime' | 'webhook';
  amount?: number;
  unit?: 'seconds' | 'minutes' | 'hours' | 'days';
  dateTime?: string;
  webhookSuffix?: string;
}

export interface MergeNodeParameters {
  mode: 'append' | 'combine' | 'chooseBranch' | 'multiplex';
  mergeByFields?: {
    values: Array<{ field1: string; field2: string }>;
  };
  join?: 'inner' | 'left' | 'right' | 'outer';
  options?: {
    clashHandling?: { values: { resolveClash: string; mergeMode: string } };
    fuzzyCompare?: boolean;
  };
  chooseBranch?: number;
}

export interface SupabaseNodeParameters {
  operation: 'create' | 'delete' | 'get' | 'getAll' | 'update' | 'upsert';
  tableId?: string;
  filters?: {
    conditions: Array<{
      keyName: string;
      condition: string;
      keyValue: string;
    }>;
  };
  fieldsUi?: {
    fieldValues: Array<{
      fieldId: string;
      fieldValue: string;
    }>;
  };
  returnAll?: boolean;
  limit?: number;
  matchingColumns?: string[];
}

export interface PerplexityToolParameters {
  model?: string;
  messages?: {
    message: Array<{
      content: string;
    }>;
  };
  options?: Record<string, unknown>;
}

export interface HttpRequestToolParameters {
  toolDescription?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url?: string;
  sendHeaders?: boolean;
  headerParameters?: {
    parameters: Array<{ name: string; value: string }>;
  };
  sendBody?: boolean;
  bodyParameters?: {
    parameters: Array<{ name: string; value: string }>;
  };
  options?: Record<string, unknown>;
}

export interface FirecrawlNodeParameters {
  operation: 'scrape' | 'crawl' | 'map' | 'search' | 'extract';
  url?: string;
  urls?: string[];
  query?: string;
  options?: {
    formats?: string[];
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    waitFor?: number;
    timeout?: number;
    maxDepth?: number;
    limit?: number;
    schema?: string;
    prompt?: string;
  };
}

export interface OpenAINodeParameters {
  resource: 'chat' | 'completion' | 'edit' | 'image' | 'embedding' | 'audio' | 'file' | 'fineTune' | 'moderation';
  operation?: string;
  model?: string;
  prompt?: string;
  messages?: {
    values: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export interface AIAgentNodeParameters {
  agent?: string;
  text?: string;
  options?: {
    systemMessage?: string;
    maxIterations?: number;
    returnIntermediateSteps?: boolean;
  };
}

export interface AirtableNodeParameters {
  operation: 'search' | 'list' | 'create' | 'append' | 'update' | 'delete' | 'get';
  base?: {
    __rl?: boolean;
    value?: string;
    mode?: string;
  } | string;
  table?: {
    __rl?: boolean;
    value?: string;
    mode?: string;
  } | string;
  filterByFormula?: string;
  columns?: {
    mappingMode?: 'defineBelow' | 'autoMapInputData';
    value?: Record<string, string>;
    matchingColumns?: string[];
    schema?: Array<{
      id: string;
      displayName: string;
      type?: string;
      required?: boolean;
    }>;
  };
  options?: {
    typecast?: boolean;
  };
  id?: string;
}

export interface SplitOutNodeParameters {
  fieldToSplitOut: string;
  include?: 'noOtherFields' | 'selectedOtherFields' | 'allOtherFields';
  fieldsToInclude?: string[];
  options?: Record<string, unknown>;
}

export interface AggregateNodeParameters {
  aggregate: 'aggregateAllItemData' | 'aggregateIndividualFields';
  destinationFieldName?: string;
  fieldsToAggregate?: {
    fieldToAggregate?: {
      values?: Array<{
        fieldName: string;
        renameField?: boolean;
        outputFieldName?: string;
      }>;
    };
  };
  include?: 'allFieldsExcept' | 'specifiedFields' | 'none';
  fieldsToExclude?: string[];
  fieldsToInclude?: string[];
  options?: Record<string, unknown>;
}

export interface RespondToWebhookNodeParameters {
  respondWith: 'allIncomingItems' | 'firstIncomingItem' | 'json' | 'text' | 'noData' | 'binary';
  responseBody?: string;
  responseCode?: number;
  responseHeaders?: {
    entries?: Array<{
      name: string;
      value: string;
    }>;
  };
  options?: {
    responseKey?: string;
  };
}

export interface ItemListsNodeParameters {
  operation: 'concatenateItems' | 'limit' | 'removeDuplicates' | 'sort' | 'summarize' | 'splitOutItems';
  maxItems?: number;
  fieldsToCompare?: string[];
  fieldToSortBy?: string;
  order?: 'ascending' | 'descending';
  options?: Record<string, unknown>;
}

export interface SplitInBatchesNodeParameters {
  batchSize: number;
  options?: {
    reset?: boolean;
  };
}

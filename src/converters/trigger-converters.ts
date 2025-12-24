/**
 * Trigger Node Converters
 * Converts n8n trigger nodes to Inngest function configurations
 */

import { ParsedNode } from '../parser/workflow-parser.js';
import {
  InngestFunctionConfig,
  InngestTrigger,
  InngestEventTrigger,
  InngestCronTrigger,
} from '../types/inngest.js';
import {
  CronNodeParameters,
  ScheduleTriggerParameters,
  WebhookNodeParameters,
} from '../types/n8n.js';
import { ConversionContext, toStepId } from './base-converter.js';

export interface TriggerConversionResult {
  config: Partial<InngestFunctionConfig>;
  trigger: InngestTrigger;
  eventTypeDef?: string;
}

/**
 * Convert n8n trigger node to Inngest trigger configuration
 */
export function convertTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  switch (node.type) {
    case 'n8n-nodes-base.manualTrigger':
      return convertManualTrigger(node, context);
    case 'n8n-nodes-base.webhook':
      return convertWebhookTrigger(node, context);
    case 'n8n-nodes-base.scheduleTrigger':
      return convertScheduleTrigger(node, context);
    case 'n8n-nodes-base.cron':
      return convertCronTrigger(node, context);
    case 'n8n-nodes-base.formTrigger':
      return convertFormTrigger(node, context);
    case 'n8n-nodes-base.errorTrigger':
      return convertErrorTrigger(node, context);
    case '@n8n/n8n-nodes-langchain.chatTrigger':
      return convertChatTrigger(node, context);
    default:
      return convertGenericTrigger(node, context);
  }
}

/**
 * Convert Manual Trigger to event-based trigger
 */
function convertManualTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const eventName = `${context.options.eventPrefix || 'app'}/${toStepId(context.workflowName)}.run`;

  return {
    config: {
      id: toStepId(context.workflowName),
      name: context.workflowName,
    },
    trigger: {
      type: 'event',
      event: eventName,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      data: 'Record<string, unknown>',
    }),
  };
}

/**
 * Convert Webhook Trigger to event-based trigger
 */
function convertWebhookTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const params = node.parameters as unknown as WebhookNodeParameters;
  const path = params.path || toStepId(context.workflowName);
  const method = params.httpMethod || 'POST';
  const eventName = `${context.options.eventPrefix || 'webhook'}/${path}.${method.toLowerCase()}`;

  // Generate event type definition based on webhook parameters
  const dataType = generateWebhookDataType(params);

  return {
    config: {
      id: `webhook-${path}`,
      name: `Webhook: ${path}`,
    },
    trigger: {
      type: 'event',
      event: eventName,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      data: dataType,
      headers: 'Record<string, string>',
      query: 'Record<string, string>',
      method: `"${method}"`,
    }),
  };
}

/**
 * Convert Schedule Trigger to cron trigger
 */
function convertScheduleTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const params = node.parameters as unknown as ScheduleTriggerParameters;
  const cronExpression = convertScheduleToCron(params);

  return {
    config: {
      id: toStepId(context.workflowName),
      name: `Scheduled: ${context.workflowName}`,
    },
    trigger: {
      type: 'cron',
      cron: cronExpression,
    },
  };
}

/**
 * Convert Cron Trigger to Inngest cron trigger
 */
function convertCronTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const params = node.parameters as unknown as CronNodeParameters;
  const cronExpression = convertCronParams(params);

  return {
    config: {
      id: toStepId(context.workflowName),
      name: `Cron: ${context.workflowName}`,
    },
    trigger: {
      type: 'cron',
      cron: cronExpression,
    },
  };
}

/**
 * Convert Form Trigger to event-based trigger
 */
function convertFormTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const eventName = `${context.options.eventPrefix || 'form'}/${toStepId(context.workflowName)}.submit`;

  return {
    config: {
      id: `form-${toStepId(context.workflowName)}`,
      name: `Form: ${context.workflowName}`,
    },
    trigger: {
      type: 'event',
      event: eventName,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      formData: 'Record<string, unknown>',
      submittedAt: 'string',
    }),
  };
}

/**
 * Convert Error Trigger to Inngest onFailure handler
 */
function convertErrorTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const eventName = `inngest/function.failed`;

  return {
    config: {
      id: `error-handler-${toStepId(context.workflowName)}`,
      name: `Error Handler: ${context.workflowName}`,
    },
    trigger: {
      type: 'event',
      event: eventName,
      expression: `event.data.function_id == "${context.workflowName}"`,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      function_id: 'string',
      error: '{ message: string; name: string; stack?: string }',
      run_id: 'string',
    }),
  };
}

/**
 * Convert Chat Trigger to event-based trigger
 */
function convertChatTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const eventName = `${context.options.eventPrefix || 'chat'}/${toStepId(context.workflowName)}.message`;

  return {
    config: {
      id: `chat-${toStepId(context.workflowName)}`,
      name: `Chat: ${context.workflowName}`,
    },
    trigger: {
      type: 'event',
      event: eventName,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      message: 'string',
      sessionId: 'string',
      userId: 'string',
      metadata: 'Record<string, unknown>',
    }),
  };
}

/**
 * Convert generic/unknown trigger to event-based trigger
 */
function convertGenericTrigger(
  node: ParsedNode,
  context: ConversionContext
): TriggerConversionResult {
  const eventName = `${context.options.eventPrefix || 'app'}/${toStepId(node.name)}.triggered`;

  return {
    config: {
      id: toStepId(context.workflowName),
      name: context.workflowName,
    },
    trigger: {
      type: 'event',
      event: eventName,
    },
    eventTypeDef: generateEventTypeDef(eventName, {
      data: 'Record<string, unknown>',
    }),
  };
}

/**
 * Convert n8n Schedule parameters to cron expression
 */
function convertScheduleToCron(params: ScheduleTriggerParameters): string {
  if (!params.rule?.interval?.[0]) {
    return '0 * * * *'; // Default: every hour
  }

  const interval = params.rule.interval[0];

  switch (interval.field) {
    case 'seconds':
      // Inngest doesn't support seconds, convert to minutes
      const seconds = interval.secondsInterval || 60;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `*/${minutes} * * * *`;

    case 'minutes':
      const minuteInterval = interval.minutesInterval || 1;
      return `*/${minuteInterval} * * * *`;

    case 'hours':
      const hourInterval = interval.hoursInterval || 1;
      const triggerAtMinute = interval.triggerAtMinute || 0;
      return `${triggerAtMinute} */${hourInterval} * * *`;

    case 'days':
      const dayInterval = interval.daysInterval || 1;
      const hour = interval.triggerAtHour || 0;
      const minute = interval.triggerAtMinute || 0;
      if (dayInterval === 1) {
        return `${minute} ${hour} * * *`;
      }
      return `${minute} ${hour} */${dayInterval} * *`;

    case 'weeks':
      const weekDay = interval.triggerAtDay || 1; // 1 = Monday
      const weekHour = interval.triggerAtHour || 0;
      const weekMinute = interval.triggerAtMinute || 0;
      return `${weekMinute} ${weekHour} * * ${weekDay}`;

    case 'months':
      const monthDay = interval.triggerAtDay || 1;
      const monthHour = interval.triggerAtHour || 0;
      const monthMinute = interval.triggerAtMinute || 0;
      const monthsInterval = interval.monthsInterval || 1;
      if (monthsInterval === 1) {
        return `${monthMinute} ${monthHour} ${monthDay} * *`;
      }
      return `${monthMinute} ${monthHour} ${monthDay} */${monthsInterval} *`;

    case 'cronExpression':
      return interval.cronExpression || '0 * * * *';

    default:
      return '0 * * * *';
  }
}

/**
 * Convert n8n Cron parameters to cron expression
 */
function convertCronParams(params: CronNodeParameters): string {
  if (!params.triggerTimes?.item?.[0]) {
    return '0 * * * *'; // Default: every hour
  }

  const item = params.triggerTimes.item[0];

  switch (item.mode) {
    case 'everyMinute':
      return '* * * * *';

    case 'everyHour':
      const minute = item.minute || 0;
      return `${minute} * * * *`;

    case 'everyDay':
      const dayHour = item.hour || 0;
      const dayMinute = item.minute || 0;
      return `${dayMinute} ${dayHour} * * *`;

    case 'everyWeek':
      const weekHour = item.hour || 0;
      const weekMinute = item.minute || 0;
      const weekday = item.weekday || '1'; // Monday
      return `${weekMinute} ${weekHour} * * ${weekday}`;

    case 'everyMonth':
      const monthDay = item.dayOfMonth || 1;
      const monthHour = item.hour || 0;
      const monthMinute = item.minute || 0;
      return `${monthMinute} ${monthHour} ${monthDay} * *`;

    case 'custom':
      return item.cronExpression || '0 * * * *';

    default:
      return '0 * * * *';
  }
}

/**
 * Generate webhook data type based on parameters
 */
function generateWebhookDataType(params: WebhookNodeParameters): string {
  // For now, return a generic type
  // Could be extended to parse expected body schema
  return 'Record<string, unknown>';
}

/**
 * Generate TypeScript event type definition
 */
function generateEventTypeDef(
  eventName: string,
  dataFields: Record<string, string>
): string {
  const fields = Object.entries(dataFields)
    .map(([key, type]) => `    ${key}: ${type};`)
    .join('\n');

  return `
type ${eventNameToTypeName(eventName)}Event = {
  name: "${eventName}";
  data: {
${fields}
  };
};
`.trim();
}

/**
 * Convert event name to TypeScript type name
 */
function eventNameToTypeName(eventName: string): string {
  return eventName
    .split(/[/.]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Check if multiple triggers should be combined
 */
export function shouldCombineTriggers(triggers: ParsedNode[]): boolean {
  // If all triggers are of the same type, they can potentially be combined
  const types = new Set(triggers.map(t => t.type));
  return types.size === 1 && triggers.length > 1;
}

/**
 * Generate combined trigger configuration
 */
export function generateCombinedTriggers(
  triggers: ParsedNode[],
  context: ConversionContext
): InngestTrigger[] {
  return triggers.map(trigger => {
    const result = convertTrigger(trigger, context);
    return result.trigger;
  });
}

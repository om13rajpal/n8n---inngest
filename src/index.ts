/**
 * n8n to Inngest Converter
 * Main entry point for programmatic usage
 */

// Re-export types
export * from './types/n8n.js';
export * from './types/inngest.js';

// Re-export parser
export {
  parseWorkflow,
  ParsedWorkflow,
  ParsedNode,
  ExecutionGraph,
  getExecutionOrder,
} from './parser/workflow-parser.js';

// Re-export converter
export {
  N8nToInngestConverter,
  convertWorkflow,
  ConversionOutput,
  GeneratedFunction,
  CredentialConfig,
} from './converter/index.js';

// Re-export base converter utilities
export {
  NodeConverter,
  ConversionContext,
  ConversionResult,
  ConverterRegistry,
  toVariableName,
  toStepId,
  convertN8nExpression,
  convertCondition,
} from './converters/base-converter.js';

// Default export for convenience
import { convertWorkflow } from './converter/index.js';
export default convertWorkflow;

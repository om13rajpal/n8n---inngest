/**
 * Enhanced n8n to Inngest Converter
 * Uses production-pattern enhanced AI converters with industry standards
 */

import { N8nWorkflow } from '../types/n8n.js';
import { CodeGenerationOptions } from '../types/inngest.js';
import {
  N8nToInngestConverter,
  ConversionOutput,
} from './index.js';
import { ConverterRegistry } from '../converters/base-converter.js';
import { controlFlowConverters } from '../converters/control-flow-converters.js';
import { httpConverters } from '../converters/http-converters.js';
import { codeConverters } from '../converters/code-converters.js';
import { integrationConverters } from '../converters/integration-converters.js';
import { enhancedAIConverters } from '../converters/ai-converters-enhanced.js';
import { aiConverters } from '../converters/ai-converters.js';
import {
  detectEnvVarsInCode,
  generateHeaderWithCredentials,
  fixTemplateLiteralSyntax,
  detectHardcodedSecrets,
} from './code-generator.js';

/**
 * Enhanced N8n to Inngest Converter with Production Patterns
 *
 * Enhancements over base converter:
 * - Uses enhanced AI converters with custom routers
 * - OpenRouter configuration with provider preferences
 * - Network state management
 * - Step wrapping in tools
 * - Performance optimizations
 * - Industry-standard code generation:
 *   - .env credentials documentation
 *   - Template literal syntax fixes
 *   - Hardcoded secret detection
 */
export class EnhancedN8nToInngestConverter extends N8nToInngestConverter {
  constructor(options: CodeGenerationOptions = {}) {
    super({
      ...options,
      useAgentKit: true, // Force AgentKit for production patterns
    });

    // Re-register with enhanced converters
    this.registerEnhancedConverters();
  }

  /**
   * Register enhanced converters
   * Replaces AI converters with enhanced versions
   */
  private registerEnhancedConverters(): void {
    const registry = (this as any).registry as ConverterRegistry;

    // Register enhanced AI converters (replaces original)
    enhancedAIConverters.forEach(c => registry.register(c));

    // Keep other converters as-is
    // (already registered in parent constructor)
  }

  /**
   * Override convert to apply industry-standard improvements
   */
  convert(workflow: N8nWorkflow): ConversionOutput {
    // Run base conversion
    const output = super.convert(workflow);

    // Validate conversion result
    this.validateConversionOutput(output, workflow);

    // Apply industry-standard improvements
    const improvedCode = this.applyIndustryStandards(output, workflow);

    return {
      ...output,
      code: improvedCode,
    };
  }

  /**
   * Validate conversion output to detect silent failures
   */
  private validateConversionOutput(output: ConversionOutput, workflow: N8nWorkflow): void {
    // Check if functions array is empty (only has boilerplate)
    const functionsArrayMatch = output.code.match(/export const functions = \[([\s\S]*?)\];/);
    if (functionsArrayMatch) {
      const functionsContent = functionsArrayMatch[1].trim();
      if (functionsContent === '') {
        const errorMessage = `Conversion produced no functions for workflow "${workflow.name}". This indicates a conversion failure. Possible causes:\n` +
          `- Unsupported trigger node type\n` +
          `- Broken workflow connections (references to non-existent nodes)\n` +
          `- Missing node converters for specific node types\n\n` +
          `Workflow has ${workflow.nodes?.length || 0} nodes. Please check if all node types are supported.`;

        throw new Error(errorMessage);
      }
    }

    // Check for extremely short output (less than 100 lines)
    const lineCount = output.code.split('\n').length;
    if (lineCount < 100 && workflow.nodes && workflow.nodes.length > 5) {
      output.warnings.push(
        `WARNING: Generated code is suspiciously short (${lineCount} lines) for a workflow with ${workflow.nodes.length} nodes. Please review for completeness.`
      );
    }
  }

  /**
   * Apply industry-standard improvements to generated code
   */
  private applyIndustryStandards(output: ConversionOutput, workflow: N8nWorkflow): string {
    let code = output.code;

    // Step 1: Fix template literal syntax issues
    code = fixTemplateLiteralSyntax(code);

    // Step 2: Detect environment variables used in code
    const detectedEnvVars = detectEnvVarsInCode(code);

    // Step 3: Detect hardcoded secrets and add warnings
    const hardcodedSecrets = detectHardcodedSecrets(code);
    if (hardcodedSecrets.length > 0) {
      hardcodedSecrets.forEach(secret => {
        output.warnings.push(
          `Line ${secret.line}: Hardcoded secret detected. ${secret.suggestion}`
        );
      });
    }

    // Step 4: Generate header with .env credentials documentation
    const header = generateHeaderWithCredentials({
      envVars: detectedEnvVars,
      workflowName: workflow.name || 'Unnamed Workflow',
      convertedDate: new Date().toISOString(),
    });

    // Step 5: Replace the original header with the enhanced header
    const headerEndIndex = code.indexOf('*/');
    if (headerEndIndex !== -1) {
      code = header + code.substring(headerEndIndex + 2);
    }

    return code;
  }
}

/**
 * Convenience function for enhanced conversion
 */
export function convertWorkflowEnhanced(
  workflow: N8nWorkflow,
  options?: CodeGenerationOptions
): ConversionOutput {
  const converter = new EnhancedN8nToInngestConverter(options);
  return converter.convert(workflow);
}

/**
 * Export enhanced converter as default
 */
export { EnhancedN8nToInngestConverter as default };

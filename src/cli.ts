#!/usr/bin/env node

/**
 * n8n to Inngest CLI
 * Command-line interface for converting n8n workflows to Inngest functions
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { N8nWorkflow } from './types/n8n.js';
import { convertWorkflow, ConversionOutput } from './converter/index.js';
import { CodeGenerationOptions } from './types/inngest.js';

interface CLIOptions {
  input: string;
  output?: string;
  useAgentKit?: boolean;
  eventPrefix?: string;
  includeComments?: boolean;
  format?: boolean;
}

const HELP_TEXT = `
n8n to Inngest Converter
========================

Convert n8n workflow JSON files to Inngest TypeScript functions.

Usage:
  npx n8n-to-inngest <input-file> [options]
  ts-node src/cli.ts <input-file> [options]

Arguments:
  input-file          Path to n8n workflow JSON file

Options:
  -o, --output <file>     Output file path (default: <input>-inngest.ts)
  -a, --use-agentkit      Use AgentKit for AI nodes (default: true)
  -p, --prefix <prefix>   Event name prefix (default: "app")
  -c, --no-comments       Exclude comments from output
  -f, --format            Format output with Prettier
  -h, --help              Show this help message

Examples:
  npx n8n-to-inngest workflow.json
  npx n8n-to-inngest workflow.json -o functions.ts
  npx n8n-to-inngest workflow.json --prefix myapp --no-comments

Output:
  The tool generates a TypeScript file containing:
  - Inngest client configuration
  - Event type definitions
  - Inngest functions for each trigger
  - Helper functions for credentials and utilities

Environment Variables:
  The generated code will reference environment variables for:
  - API keys (OPENAI_API_KEY, SUPABASE_KEY, etc.)
  - Authentication tokens
  - Service URLs

  Configure these in your .env file before running the functions.
`;

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    input: '',
    useAgentKit: true,
    eventPrefix: 'app',
    includeComments: true,
    format: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-a' || arg === '--use-agentkit') {
      options.useAgentKit = true;
    } else if (arg === '--no-agentkit') {
      options.useAgentKit = false;
    } else if (arg === '-p' || arg === '--prefix') {
      options.eventPrefix = args[++i];
    } else if (arg === '-c' || arg === '--no-comments') {
      options.includeComments = false;
    } else if (arg === '--comments') {
      options.includeComments = true;
    } else if (arg === '-f' || arg === '--format') {
      options.format = true;
    } else if (!arg.startsWith('-') && !options.input) {
      options.input = arg;
    }
  }

  return options;
}

/**
 * Read and parse n8n workflow JSON
 */
function readWorkflow(filePath: string): N8nWorkflow {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, 'utf-8');

  try {
    return JSON.parse(content) as N8nWorkflow;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${(error as Error).message}`);
  }
}

/**
 * Format code with Prettier (if available)
 */
async function formatCode(code: string): Promise<string> {
  try {
    const prettier = await import('prettier');
    return await prettier.format(code, {
      parser: 'typescript',
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      tabWidth: 2,
      printWidth: 100,
    });
  } catch {
    // Prettier not available, return as-is
    return code;
  }
}

/**
 * Generate output filename
 */
function getOutputPath(inputPath: string, outputPath?: string): string {
  if (outputPath) {
    return resolve(outputPath);
  }

  const dir = dirname(inputPath);
  const name = basename(inputPath, '.json');
  return resolve(dir, `${name}-inngest.ts`);
}

/**
 * Print conversion summary
 */
function printSummary(output: ConversionOutput, outputPath: string): void {
  console.log('\n✅ Conversion successful!\n');

  console.log(`📄 Output: ${outputPath}\n`);

  console.log('📊 Summary:');
  console.log(`   Functions: ${output.functions.length}`);
  console.log(`   Credentials: ${output.credentials.length}`);
  console.log(`   Environment Variables: ${output.envVars.length}`);

  if (output.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    output.warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (output.envVars.length > 0) {
    console.log('\n🔐 Required Environment Variables:');
    output.envVars.forEach(v => console.log(`   ${v}=`));
  }

  if (output.credentials.length > 0) {
    console.log('\n📝 Credential Setup Instructions:');
    output.credentials.forEach(c => {
      console.log(`   ${c.type}:`);
      console.log(`     ${c.instructions}`);
      c.envVars.forEach(v => console.log(`     - ${v}`));
    });
  }

  console.log('\n🚀 Next Steps:');
  console.log('   1. Install dependencies: npm install inngest @inngest/agent-kit');
  console.log('   2. Configure environment variables in .env');
  console.log('   3. Review and adjust the generated code');
  console.log('   4. Set up Inngest in your app: https://www.inngest.com/docs');
  console.log('');
}

/**
 * Generate .env.example file content
 */
function generateEnvExample(output: ConversionOutput): string {
  const lines = [
    '# Environment Variables for Inngest Functions',
    '# Generated from n8n workflow conversion',
    '',
  ];

  output.envVars.forEach(v => {
    lines.push(`${v}=`);
  });

  return lines.join('\n');
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(HELP_TEXT);
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.input) {
    console.error('Error: No input file specified\n');
    console.log('Usage: npx n8n-to-inngest <input-file> [options]');
    process.exit(1);
  }

  try {
    console.log(`\n🔄 Converting: ${options.input}\n`);

    // Read workflow
    const workflow = readWorkflow(options.input);
    console.log(`   Workflow: ${workflow.name || 'Unnamed'}`);
    console.log(`   Nodes: ${workflow.nodes.length}`);

    // Convert
    const conversionOptions: CodeGenerationOptions = {
      includeComments: options.includeComments,
      eventPrefix: options.eventPrefix,
      useAgentKit: options.useAgentKit,
      credentialsStrategy: 'env',
    };

    const output = convertWorkflow(workflow, conversionOptions);

    // Format if requested
    let code = output.code;
    if (options.format) {
      console.log('   Formatting with Prettier...');
      code = await formatCode(code);
    }

    // Write output
    const outputPath = getOutputPath(options.input, options.output);
    writeFileSync(outputPath, code, 'utf-8');

    // Generate .env.example
    const envExamplePath = resolve(dirname(outputPath), '.env.example');
    if (output.envVars.length > 0) {
      writeFileSync(envExamplePath, generateEnvExample(output), 'utf-8');
    }

    // Print summary
    printSummary(output, outputPath);

  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Run CLI
main().catch(console.error);

# n8n to Inngest Converter - System Architecture Document

## Executive Summary

This document outlines the architecture for a tool that converts n8n workflow JSON files into TypeScript code for Inngest functions. The converter enables migration from n8n's visual workflow editor to Inngest's code-first, event-driven orchestration platform.

**Version**: 1.0
**Date**: 2024-12-24
**Status**: Design Phase

---

## 1. System Overview

### 1.1 Purpose

The n8n to Inngest Converter translates declarative workflow definitions (n8n JSON) into imperative TypeScript code (Inngest functions), enabling:

- Migration from n8n to Inngest
- Learning Inngest patterns from existing n8n workflows
- Hybrid deployments where some workflows run on Inngest

### 1.2 Key Constraints

1. **Semantic Equivalence**: Generated Inngest code must preserve n8n workflow behavior
2. **Type Safety**: Generated TypeScript must be fully typed and pass strict type checking
3. **Extensibility**: Easy to add support for new n8n node types
4. **Human Readability**: Generated code should be maintainable by developers
5. **Security**: Credentials must be handled securely, never hardcoded

---

## 2. Architecture Decision Records (ADRs)

### ADR-001: Code Generation Strategy - Template-based Approach

**Decision**: Use template-based code generation over AST manipulation

**Rationale**:
- **Readability**: Templates produce more readable, idiomatic code
- **Maintainability**: Easier to modify templates than AST transformations
- **Debugging**: Generated code is easier to debug when it looks hand-written
- **Performance**: Template rendering is sufficient for this use case

**Trade-offs**:
- Less flexible than AST for complex transformations
- May produce some redundant code
- Requires careful template design for edge cases

**Alternatives Considered**:
- TypeScript AST manipulation (ts-morph): Too complex for maintenance
- String concatenation: Too error-prone, poor maintainability

---

### ADR-002: Node Mapping System - Plugin Architecture

**Decision**: Implement extensible plugin-based node mapper system

**Rationale**:
- n8n has 400+ node types; need incremental implementation
- Community contributions for less common nodes
- Different organizations may have custom n8n nodes
- Plugin isolation prevents one bad mapper from breaking others

**Architecture**:
```typescript
interface NodeMapper {
  nodeType: string;
  version?: string;
  canHandle(node: N8nNode): boolean;
  generateCode(node: N8nNode, context: CodeGenContext): CodeFragment;
  getDependencies(node: N8nNode): string[];
}
```

**Plugin Discovery**: Directory-based, auto-registered on startup

---

### ADR-003: Connection Resolution - Dependency Graph Analysis

**Decision**: Build DAG (Directed Acyclic Graph) and generate linear step execution

**Rationale**:
- n8n connections form a graph structure
- Inngest uses linear steps with data flow via `step.run()`
- Need topological sort to determine execution order
- Branch handling requires conditional step execution

**Algorithm**:
1. Parse n8n connections into adjacency list
2. Detect cycles (error condition)
3. Perform topological sort for execution order
4. Generate step functions in order
5. Handle branches with conditional logic

---

### ADR-004: Error Handling Strategy - Best-effort Mapping

**Decision**: Map n8n error workflows to Inngest retry policies with manual review flags

**Rationale**:
- n8n has visual error handling (error trigger nodes)
- Inngest uses declarative retry configuration + catch blocks
- Not all n8n patterns have direct Inngest equivalents
- Better to generate code + add TODO comments than fail conversion

**Mapping Strategy**:
```
n8n Error Workflow → Inngest onFailure handler
n8n Retry Settings → Inngest step retry configuration
n8n Continue on Fail → try/catch with logging
```

---

### ADR-005: Credential Handling - Environment Variable Placeholders

**Decision**: Replace credentials with environment variable references + generate .env.example

**Rationale**:
- Security: Never hardcode credentials in generated code
- Portability: Environment variables work across deployment targets
- Clarity: Developers can see what credentials are needed
- Best Practice: Aligns with 12-factor app methodology

**Implementation**:
```typescript
// Instead of: apiKey: "sk-123456"
// Generate: apiKey: process.env.OPENAI_API_KEY!
// .env.example: OPENAI_API_KEY=your_openai_key_here
```

---

## 3. Module Structure

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                         │
│                  (Commander.js + Inquirer)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Converter Orchestrator                    │
│              (Coordinates conversion pipeline)               │
└───┬───────────────┬───────────────┬────────────────┬────────┘
    │               │               │                │
    ▼               ▼               ▼                ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐
│ Parser  │  │  Graph   │  │ Code         │  │ Template    │
│ Module  │  │ Analyzer │  │ Generator    │  │ Engine      │
└────┬────┘  └─────┬────┘  └──────┬───────┘  └──────┬──────┘
     │             │               │                  │
     │             │               │                  │
     ▼             ▼               ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Node Mapper Registry                    │
│           (Plugin system for n8n → Inngest mapping)          │
└───────────────┬────────────────────────────────────┬─────────┘
                │                                    │
                ▼                                    ▼
    ┌───────────────────────┐          ┌────────────────────┐
    │ Built-in Node Mappers │          │ Custom Node Mappers│
    │  - HTTP Request       │          │  (User-provided)   │
    │  - Webhook            │          └────────────────────┘
    │  - Code Node          │
    │  - If/Switch          │
    │  - Set/Function       │
    │  - Loop               │
    └───────────────────────┘
```

---

## 4. Core Interfaces and Types

### 4.1 Parser Module Types

```typescript
/**
 * Represents a parsed n8n workflow with all metadata
 */
interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  active: boolean;
  settings?: WorkflowSettings;
  staticData?: Record<string, any>;
  tags?: string[];
  meta?: WorkflowMeta;
}

/**
 * Individual node in n8n workflow
 */
interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
  credentials?: Record<string, CredentialReference>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  continueOnFail?: boolean;
  onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';
}

/**
 * Connection graph between nodes
 */
interface N8nConnections {
  [sourceNodeName: string]: {
    [outputType: string]: Array<
      Array<{
        node: string;
        type: string;
        index: number;
      }>
    >;
  };
}

/**
 * Credential reference (not actual credentials)
 */
interface CredentialReference {
  id: string;
  name: string;
}
```

### 4.2 Graph Analyzer Types

```typescript
/**
 * Directed acyclic graph representation
 */
interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
  entryPoints: GraphNode[];
  executionOrder: GraphNode[];
  branches: BranchPoint[];
  loops: LoopStructure[];
}

interface GraphNode {
  id: string;
  n8nNode: N8nNode;
  inDegree: number;
  outDegree: number;
  predecessors: GraphNode[];
  successors: GraphNode[];
  executionIndex: number;
}

interface Edge {
  from: GraphNode;
  to: GraphNode;
  outputIndex: number;
  inputIndex: number;
  branchName?: string;
}

interface BranchPoint {
  node: GraphNode;
  branches: {
    condition: string;
    path: GraphNode[];
  }[];
}

interface LoopStructure {
  loopNode: GraphNode;
  itemsSource: GraphNode;
  iterationNodes: GraphNode[];
}
```

### 4.3 Code Generator Types

```typescript
/**
 * Context passed through code generation pipeline
 */
interface CodeGenContext {
  workflow: N8nWorkflow;
  graph: WorkflowGraph;
  generatedFunctions: Map<string, GeneratedFunction>;
  imports: Set<string>;
  environmentVars: Map<string, EnvVarMetadata>;
  warnings: ConversionWarning[];
  options: ConversionOptions;
}

interface GeneratedFunction {
  id: string;
  name: string;
  code: string;
  dependencies: string[];
  eventTrigger?: EventTriggerConfig;
  scheduleTrigger?: ScheduleTriggerConfig;
}

interface CodeFragment {
  stepName: string;
  stepCode: string;
  imports: string[];
  environmentVars: string[];
  comments: string[];
  warnings?: string[];
}

interface EnvVarMetadata {
  key: string;
  description: string;
  example: string;
  required: boolean;
  source: string; // n8n node that needs this
}

interface ConversionWarning {
  severity: 'info' | 'warning' | 'error';
  nodeId: string;
  message: string;
  suggestion?: string;
}

interface ConversionOptions {
  outputFormat: 'single-file' | 'multi-file';
  includeComments: boolean;
  includeOriginalJson: boolean;
  strictMode: boolean; // Fail on unsupported nodes
  targetInngestVersion: string;
}
```

### 4.4 Node Mapper Interface

```typescript
/**
 * Base interface for all node mappers
 */
interface NodeMapper {
  /**
   * n8n node type this mapper handles (e.g., "n8n-nodes-base.httpRequest")
   */
  nodeType: string;

  /**
   * Optional version constraint (e.g., ">=2.0.0")
   */
  supportedVersions?: string;

  /**
   * Check if this mapper can handle a specific node
   */
  canHandle(node: N8nNode): boolean;

  /**
   * Generate Inngest step code for this node
   */
  generateCode(node: N8nNode, context: CodeGenContext): CodeFragment;

  /**
   * Extract npm dependencies needed for this node
   */
  getDependencies(node: N8nNode): string[];

  /**
   * Extract environment variables needed
   */
  getEnvironmentVars(node: N8nNode): EnvVarMetadata[];

  /**
   * Validate node configuration
   */
  validate(node: N8nNode): ConversionWarning[];
}

/**
 * Registry for discovering and managing node mappers
 */
interface NodeMapperRegistry {
  register(mapper: NodeMapper): void;
  getMapper(node: N8nNode): NodeMapper | null;
  listMappers(): NodeMapper[];
  getSupportedNodeTypes(): string[];
}
```

---

## 5. Data Flow Diagram

```
Input: n8n Workflow JSON
         │
         ▼
    ┌────────────────┐
    │ Parse & Validate│
    │  - JSON Schema  │
    │  - Node Types   │
    └────────┬────────┘
             │
             ▼
    ┌────────────────┐
    │ Build Graph     │
    │  - Adjacency    │
    │  - Topo Sort    │
    │  - Detect Loops │
    └────────┬────────┘
             │
             ▼
    ┌────────────────┐
    │ Analyze Workflow│
    │  - Entry Points │
    │  - Branches     │
    │  - Error Flows  │
    └────────┬────────┘
             │
             ▼
    ┌────────────────────────────┐
    │  Node Mapping               │
    │  ┌──────────────────────┐  │
    │  │ For each node:       │  │
    │  │  1. Find mapper      │  │
    │  │  2. Generate code    │  │
    │  │  3. Collect deps     │  │
    │  │  4. Extract env vars │  │
    │  └──────────────────────┘  │
    └────────────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Code Assembly           │
    │  - Import statements    │
    │  - Inngest client       │
    │  - Function definition  │
    │  - Step orchestration   │
    │  - Error handling       │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Template Rendering      │
    │  - Apply templates      │
    │  - Format code          │
    │  - Add comments         │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Generate Artifacts      │
    │  - *.ts files           │
    │  - .env.example         │
    │  - README.md            │
    │  - package.json         │
    └────────────┬───────────┘
                 │
                 ▼
         Output: TypeScript Project
```

---

## 6. Code Generation Strategy

### 6.1 Template Structure

We use Handlebars templates for code generation with the following structure:

```
templates/
├── function-wrapper.hbs      # Main Inngest function boilerplate
├── client-config.hbs          # Inngest client initialization
├── step-runner.hbs            # Step execution orchestration
├── error-handler.hbs          # Error handling patterns
├── nodes/                     # Node-specific templates
│   ├── http-request.hbs
│   ├── webhook.hbs
│   ├── code-node.hbs
│   ├── if-node.hbs
│   ├── switch-node.hbs
│   ├── set-node.hbs
│   └── loop-node.hbs
└── helpers/                   # Reusable template partials
    ├── imports.hbs
    ├── type-definitions.hbs
    └── env-var-accessor.hbs
```

### 6.2 Template Example: HTTP Request Node

```handlebars
{{!-- templates/nodes/http-request.hbs --}}
// Step: {{stepName}}
{{#if node.notes}}
// Note: {{node.notes}}
{{/if}}
const {{varName}} = await step.run("{{stepName}}", async () => {
  const response = await fetch("{{node.parameters.url}}", {
    method: "{{node.parameters.method}}",
    headers: {
      {{#each node.parameters.headers}}
      "{{this.name}}": "{{this.value}}",
      {{/each}}
      {{#if credentials}}
      "Authorization": `Bearer ${process.env.{{credentialEnvVar}}}`,
      {{/if}}
    },
    {{#if hasBody}}
    body: JSON.stringify({{bodyExpression}}),
    {{/if}}
  });

  if (!response.ok) {
    throw new Error(`HTTP {{node.parameters.method}} failed: ${response.statusText}`);
  }

  return await response.json();
});
```

### 6.3 Generated Code Example

```typescript
// Generated from n8n workflow: "User Onboarding"
// Generated at: 2024-12-24T12:00:00Z
// Converter version: 1.0.0

import { Inngest } from "inngest";
import { z } from "zod";

// Initialize Inngest client
export const inngest = new Inngest({
  id: "user-onboarding",
  schemas: {
    events: {
      "user/created": {
        data: z.object({
          userId: z.string(),
          email: z.string().email(),
          name: z.string(),
        }),
      },
    },
  },
});

// Main workflow function
export const userOnboardingWorkflow = inngest.createFunction(
  {
    id: "user-onboarding-workflow",
    name: "User Onboarding Workflow",
    retries: 3, // Inherited from n8n workflow settings
  },
  { event: "user/created" },
  async ({ event, step }) => {
    // Step 1: Send welcome email (from n8n "Send Email" node)
    const emailResult = await step.run("send-welcome-email", async () => {
      const response = await fetch(process.env.EMAIL_SERVICE_URL!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
        },
        body: JSON.stringify({
          to: event.data.email,
          template: "welcome",
          variables: {
            name: event.data.name,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Email service failed: ${response.statusText}`);
      }

      return await response.json();
    });

    // Step 2: Create user in CRM (from n8n "HTTP Request" node)
    const crmResult = await step.run("create-crm-contact", async () => {
      const response = await fetch(`${process.env.CRM_API_URL}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.CRM_API_KEY!,
        },
        body: JSON.stringify({
          email: event.data.email,
          name: event.data.name,
          source: "app_signup",
        }),
      });

      if (!response.ok) {
        throw new Error(`CRM API failed: ${response.statusText}`);
      }

      return await response.json();
    });

    // Step 3: Wait 24 hours (from n8n "Wait" node)
    await step.sleep("wait-24-hours", "24h");

    // Step 4: Send follow-up email
    await step.run("send-followup-email", async () => {
      const response = await fetch(process.env.EMAIL_SERVICE_URL!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
        },
        body: JSON.stringify({
          to: event.data.email,
          template: "day-1-tips",
          variables: {
            name: event.data.name,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Email service failed: ${response.statusText}`);
      }

      return await response.json();
    });

    return {
      status: "completed",
      emailId: emailResult.id,
      crmContactId: crmResult.id,
    };
  }
);
```

---

## 7. File Structure Recommendation

### 7.1 Converter Project Structure

```
n8n-inngest-converter/
├── src/
│   ├── cli/
│   │   ├── index.ts                 # CLI entry point
│   │   ├── commands/
│   │   │   ├── convert.ts           # Convert command
│   │   │   ├── validate.ts          # Validate n8n JSON
│   │   │   └── list-mappers.ts      # List supported nodes
│   │   └── prompts.ts               # Interactive prompts
│   │
│   ├── parser/
│   │   ├── index.ts                 # Main parser export
│   │   ├── n8n-parser.ts            # n8n JSON parser
│   │   ├── validator.ts             # JSON schema validation
│   │   └── types.ts                 # Parser type definitions
│   │
│   ├── graph/
│   │   ├── index.ts
│   │   ├── graph-builder.ts         # Build DAG from connections
│   │   ├── topological-sort.ts      # Execution order
│   │   ├── branch-analyzer.ts       # Detect conditional branches
│   │   ├── loop-analyzer.ts         # Detect loop structures
│   │   └── types.ts
│   │
│   ├── codegen/
│   │   ├── index.ts
│   │   ├── orchestrator.ts          # Coordinates code generation
│   │   ├── template-engine.ts       # Handlebars wrapper
│   │   ├── code-assembler.ts        # Assembles final code
│   │   ├── formatters/
│   │   │   ├── prettier-formatter.ts
│   │   │   └── eslint-formatter.ts
│   │   └── types.ts
│   │
│   ├── mappers/
│   │   ├── index.ts                 # Mapper registry
│   │   ├── base-mapper.ts           # Abstract base class
│   │   ├── registry.ts              # Plugin discovery
│   │   ├── core/                    # Built-in mappers
│   │   │   ├── http-request.ts
│   │   │   ├── webhook.ts
│   │   │   ├── code-node.ts
│   │   │   ├── if-node.ts
│   │   │   ├── switch-node.ts
│   │   │   ├── set-node.ts
│   │   │   ├── function-node.ts
│   │   │   ├── wait-node.ts
│   │   │   ├── schedule-trigger.ts
│   │   │   └── email-send.ts
│   │   └── types.ts
│   │
│   ├── templates/                   # Handlebars templates
│   │   ├── function-wrapper.hbs
│   │   ├── client-config.hbs
│   │   ├── step-runner.hbs
│   │   ├── error-handler.hbs
│   │   └── nodes/
│   │       └── *.hbs
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── file-writer.ts
│   │   ├── env-var-generator.ts
│   │   └── package-json-generator.ts
│   │
│   └── types/
│       ├── n8n.ts                   # n8n type definitions
│       ├── inngest.ts               # Inngest type augmentations
│       └── common.ts                # Shared types
│
├── templates/                       # Template files (copied to dist)
├── test/
│   ├── fixtures/                    # Sample n8n workflows
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── examples/                        # Example conversions
│   ├── simple-webhook/
│   ├── scheduled-task/
│   └── complex-workflow/
│
├── docs/
│   ├── ARCHITECTURE.md              # This file
│   ├── NODE_MAPPING_GUIDE.md        # Guide for adding mappers
│   ├── API.md                       # API documentation
│   └── LIMITATIONS.md               # Known limitations
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
└── README.md
```

### 7.2 Generated Output Structure

When converting an n8n workflow, the tool generates:

```
output/
├── src/
│   ├── inngest/
│   │   ├── client.ts                # Inngest client config
│   │   └── functions/
│   │       └── user-onboarding.ts   # Generated function
│   └── types/
│       └── events.ts                # Event type definitions
│
├── .env.example                     # Environment variables template
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── README.md                        # Usage instructions
└── CONVERSION_REPORT.md             # Warnings, manual steps
```

---

## 8. Key Algorithms

### 8.1 Topological Sort for Execution Order

```typescript
/**
 * Kahn's algorithm for topological sorting
 * Determines the execution order of steps
 */
function topologicalSort(graph: WorkflowGraph): GraphNode[] {
  const sorted: GraphNode[] = [];
  const queue: GraphNode[] = [...graph.entryPoints];
  const inDegree = new Map<string, number>();

  // Initialize in-degree map
  graph.nodes.forEach((node) => {
    inDegree.set(node.id, node.inDegree);
  });

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    // Process successors
    for (const successor of node.successors) {
      const degree = inDegree.get(successor.id)! - 1;
      inDegree.set(successor.id, degree);

      if (degree === 0) {
        queue.push(successor);
      }
    }
  }

  // Check for cycles
  if (sorted.length !== graph.nodes.size) {
    throw new Error("Workflow contains cycles - cannot convert to linear Inngest steps");
  }

  return sorted;
}
```

### 8.2 Branch Detection and Code Generation

```typescript
/**
 * Detect conditional branches (IF/Switch nodes)
 * Generate appropriate conditional code
 */
function detectBranches(graph: WorkflowGraph): BranchPoint[] {
  const branches: BranchPoint[] = [];

  for (const node of graph.nodes.values()) {
    if (isConditionalNode(node.n8nNode)) {
      const branchPoint: BranchPoint = {
        node,
        branches: [],
      };

      // Analyze output connections
      const outputs = getNodeOutputs(node);
      for (const [index, output] of outputs.entries()) {
        const condition = extractCondition(node.n8nNode, index);
        const path = tracePath(output, graph);

        branchPoint.branches.push({ condition, path });
      }

      branches.push(branchPoint);
    }
  }

  return branches;
}

/**
 * Generate conditional code for branches
 */
function generateBranchCode(branch: BranchPoint, context: CodeGenContext): string {
  const conditions = branch.branches.map((b, idx) => {
    const pathCode = b.path.map((node) => generateNodeCode(node, context)).join("\n");

    if (idx === 0) {
      return `if (${b.condition}) {\n${pathCode}\n}`;
    } else if (idx === branch.branches.length - 1 && b.condition === "true") {
      return `else {\n${pathCode}\n}`;
    } else {
      return `else if (${b.condition}) {\n${pathCode}\n}`;
    }
  });

  return conditions.join(" ");
}
```

### 8.3 Loop Structure Detection

```typescript
/**
 * Detect loop structures (Loop Over Items node)
 * Generate appropriate iteration code
 */
function detectLoops(graph: WorkflowGraph): LoopStructure[] {
  const loops: LoopStructure[] = [];

  for (const node of graph.nodes.values()) {
    if (node.n8nNode.type === "n8n-nodes-base.splitInBatches") {
      const itemsSource = findItemsSource(node, graph);
      const iterationNodes = findIterationNodes(node, graph);

      loops.push({
        loopNode: node,
        itemsSource,
        iterationNodes,
      });
    }
  }

  return loops;
}

/**
 * Generate loop iteration code
 */
function generateLoopCode(loop: LoopStructure, context: CodeGenContext): string {
  return `
// Loop: Process items in batches
const items = ${getItemsExpression(loop.itemsSource)};
const batchSize = ${loop.loopNode.n8nNode.parameters.batchSize || 1};

for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);

  await step.run(\`process-batch-\${i / batchSize}\`, async () => {
    const results = [];

    for (const item of batch) {
      ${loop.iterationNodes.map((n) => generateNodeCode(n, context)).join("\n")}
    }

    return results;
  });
}
`;
}
```

---

## 9. Error Handling Strategy

### 9.1 n8n Error Patterns → Inngest Mapping

| n8n Pattern | Inngest Equivalent | Notes |
|-------------|-------------------|-------|
| Error Trigger Node | `onFailure` handler | Separate function triggered on failure |
| Retry on Fail | Step `retries` config | Declarative retry policy |
| Continue on Fail | `try/catch` with logging | Manual error handling |
| Stop on Error | Default behavior | Inngest stops by default |
| Error Output | Error event emission | Send error event for monitoring |

### 9.2 Generated Error Handling

```typescript
// Example: n8n node with "Continue on Fail" enabled
try {
  await step.run("risky-api-call", async () => {
    // API call that might fail
  });
} catch (error) {
  // Log error but continue workflow
  await step.run("log-error", async () => {
    console.error("API call failed, continuing:", error);
    return { error: error.message, continued: true };
  });
}

// Example: onFailure handler for error trigger
export const handleWorkflowFailure = inngest.createFunction(
  {
    id: "handle-workflow-failure",
    name: "Handle Workflow Failure",
  },
  {
    event: "inngest/function.failed",
    if: "event.data.function_id == 'user-onboarding-workflow'",
  },
  async ({ event, step }) => {
    // Send alert notification
    await step.run("send-alert", async () => {
      // Notification logic
    });
  }
);
```

---

## 10. Credential and Secret Management

### 10.1 Strategy

1. **Scan Phase**: Identify all credential references in n8n nodes
2. **Mapping Phase**: Create environment variable names following conventions
3. **Replacement Phase**: Replace credential IDs with `process.env.*` references
4. **Documentation Phase**: Generate `.env.example` with all required variables

### 10.2 Naming Convention

```typescript
function generateEnvVarName(credential: CredentialReference, node: N8nNode): string {
  // Example: "OpenAI Account" → "OPENAI_API_KEY"
  // Example: "Postgres Database" → "POSTGRES_CONNECTION_STRING"

  const base = credential.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_");

  // Add semantic suffix based on credential type
  const type = inferCredentialType(credential);
  const suffix = type === "api" ? "_API_KEY" : type === "database" ? "_URL" : "_SECRET";

  return base + suffix;
}
```

### 10.3 Generated .env.example

```bash
# Generated Environment Variables
# Generated from n8n workflow: "User Onboarding"

# Email Service (used in node: "Send Welcome Email")
EMAIL_SERVICE_URL=https://api.emailservice.com/v1/send
EMAIL_SERVICE_API_KEY=your_email_service_api_key_here

# CRM API (used in node: "Create CRM Contact")
CRM_API_URL=https://api.crm.com/v2
CRM_API_KEY=your_crm_api_key_here

# Inngest Configuration
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
describe("HTTPRequestMapper", () => {
  it("should generate GET request code", () => {
    const node: N8nNode = {
      id: "node1",
      name: "Fetch User",
      type: "n8n-nodes-base.httpRequest",
      parameters: {
        method: "GET",
        url: "https://api.example.com/users/123",
      },
    };

    const mapper = new HTTPRequestMapper();
    const result = mapper.generateCode(node, mockContext);

    expect(result.stepCode).toContain('method: "GET"');
    expect(result.stepCode).toContain("https://api.example.com/users/123");
  });
});
```

### 11.2 Integration Tests

```typescript
describe("Full Workflow Conversion", () => {
  it("should convert simple webhook workflow", async () => {
    const workflow = loadFixture("simple-webhook.json");
    const converter = new Converter();

    const result = await converter.convert(workflow);

    expect(result.files).toHaveLength(3);
    expect(result.files[0].path).toBe("src/inngest/functions/webhook-handler.ts");
    expect(result.warnings).toHaveLength(0);
  });
});
```

### 11.3 End-to-End Tests

```typescript
describe("E2E: Generated Code Execution", () => {
  it("should execute generated Inngest function", async () => {
    // 1. Convert n8n workflow
    const workflow = loadFixture("user-onboarding.json");
    const result = await converter.convert(workflow);

    // 2. Write to temp directory
    const tempDir = await createTempProject(result);

    // 3. Install dependencies
    await exec("npm install", { cwd: tempDir });

    // 4. Start Inngest dev server
    const inngestServer = await startInngestDev(tempDir);

    // 5. Send test event
    await inngestServer.send({
      name: "user/created",
      data: { userId: "123", email: "test@example.com" },
    });

    // 6. Verify execution
    const runs = await inngestServer.getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
  });
});
```

---

## 12. Performance Considerations

### 12.1 Optimization Strategies

1. **Lazy Loading**: Load node mappers on-demand, not all at startup
2. **Parallel Processing**: Process independent nodes in parallel during analysis
3. **Template Caching**: Cache compiled Handlebars templates
4. **Incremental Generation**: Support converting individual nodes for debugging

### 12.2 Scalability Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Workflow Size | Up to 100 nodes | Typical enterprise workflows |
| Conversion Time | < 5 seconds | For 50-node workflow |
| Memory Usage | < 500 MB | Peak during conversion |
| Concurrent Conversions | 10+ | CLI tool is stateless |

---

## 13. Extensibility and Plugin System

### 13.1 Custom Node Mapper Example

```typescript
// custom-mappers/slack-node.ts
import { NodeMapper, N8nNode, CodeGenContext, CodeFragment } from "n8n-inngest-converter";

export class SlackNodeMapper implements NodeMapper {
  nodeType = "n8n-nodes-base.slack";
  supportedVersions = ">=1.0.0";

  canHandle(node: N8nNode): boolean {
    return node.type === this.nodeType && node.typeVersion >= 1;
  }

  generateCode(node: N8nNode, context: CodeGenContext): CodeFragment {
    const { parameters } = node;

    return {
      stepName: this.sanitizeStepName(node.name),
      stepCode: `
        await step.run("${this.sanitizeStepName(node.name)}", async () => {
          const { WebClient } = await import('@slack/web-api');
          const client = new WebClient(process.env.SLACK_BOT_TOKEN);

          await client.chat.postMessage({
            channel: "${parameters.channel}",
            text: "${parameters.text}",
          });
        });
      `,
      imports: ["@slack/web-api"],
      environmentVars: ["SLACK_BOT_TOKEN"],
      comments: [`Slack: Post to #${parameters.channel}`],
    };
  }

  getDependencies(): string[] {
    return ["@slack/web-api"];
  }

  getEnvironmentVars(): EnvVarMetadata[] {
    return [
      {
        key: "SLACK_BOT_TOKEN",
        description: "Slack Bot Token for posting messages",
        example: "xoxb-your-token-here",
        required: true,
        source: "Slack node",
      },
    ];
  }

  validate(node: N8nNode): ConversionWarning[] {
    const warnings: ConversionWarning[] = [];

    if (!node.parameters.channel) {
      warnings.push({
        severity: "error",
        nodeId: node.id,
        message: "Slack channel is required",
      });
    }

    return warnings;
  }

  private sanitizeStepName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  }
}

// Register the mapper
import { registry } from "n8n-inngest-converter";
registry.register(new SlackNodeMapper());
```

### 13.2 Plugin Discovery

```typescript
// Load custom mappers from directory
async function loadCustomMappers(directory: string): Promise<void> {
  const files = await fs.readdir(directory);

  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".js")) {
      const mapperModule = await import(path.join(directory, file));

      // Auto-register exported mappers
      for (const exportedItem of Object.values(mapperModule)) {
        if (isNodeMapper(exportedItem)) {
          registry.register(exportedItem as NodeMapper);
        }
      }
    }
  }
}
```

---

## 14. Known Limitations and Future Work

### 14.1 Current Limitations

1. **Subworkflows**: n8n's "Execute Workflow" node requires manual refactoring
2. **Binary Data**: File uploads/downloads need case-by-case handling
3. **Custom Nodes**: Community nodes require custom mappers
4. **Complex Expressions**: n8n's expression syntax may not directly translate
5. **Webhooks**: Webhook responses require Inngest's HTTP serving setup
6. **Sticky Notes**: UI-only elements are lost in conversion

### 14.2 Future Enhancements

1. **AI-Assisted Mapping**: Use LLM to generate mappers for unknown nodes
2. **Interactive Mode**: CLI wizard to handle ambiguous conversions
3. **Bidirectional Sync**: Inngest → n8n for visualization
4. **Migration Assistant**: Compare n8n execution vs Inngest execution
5. **Cloud Service**: Web UI for drag-and-drop conversion
6. **IDE Plugin**: VSCode extension for in-editor conversion

---

## 15. Security Considerations

### 15.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Credential Leakage | Never write credentials to files; use env vars |
| Code Injection | Sanitize all user inputs in templates |
| Malicious Workflows | Validate JSON schema before processing |
| Dependency Confusion | Pin dependencies, use lock files |
| Template Injection | Use safe Handlebars helpers only |

### 15.2 Security Best Practices

1. **Input Validation**: Validate n8n JSON against strict schema
2. **Output Sanitization**: Escape all dynamic values in templates
3. **Dependency Audit**: Regular `npm audit` on generated projects
4. **Secrets Scanning**: Warn if hardcoded secrets detected in n8n JSON
5. **Least Privilege**: Generated code requests minimal permissions

---

## 16. Monitoring and Observability

### 16.1 Conversion Metrics

Track and log:
- Conversion success rate
- Time per node type
- Most used node mappers
- Warning frequency by type
- Unsupported node types encountered

### 16.2 Generated Code Observability

```typescript
// Add observability to generated code
export const userOnboardingWorkflow = inngest.createFunction(
  {
    id: "user-onboarding-workflow",
    name: "User Onboarding Workflow",
    retries: 3,
    // Add metadata for tracking
    metadata: {
      source: "n8n",
      originalWorkflowId: "workflow-123",
      convertedAt: "2024-12-24T12:00:00Z",
      converterVersion: "1.0.0",
    },
  },
  { event: "user/created" },
  async ({ event, step }) => {
    // Steps with rich logging
  }
);
```

---

## 17. Deployment and Distribution

### 17.1 NPM Package Structure

```json
{
  "name": "n8n-inngest-converter",
  "version": "1.0.0",
  "description": "Convert n8n workflows to Inngest TypeScript functions",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "n8n-to-inngest": "dist/cli/index.js"
  },
  "files": ["dist", "templates"],
  "scripts": {
    "build": "tsc && cp -r src/templates dist/templates",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  },
  "peerDependencies": {
    "inngest": "^3.0.0"
  },
  "dependencies": {
    "commander": "^11.0.0",
    "handlebars": "^4.7.8",
    "inquirer": "^9.0.0",
    "zod": "^3.22.0"
  }
}
```

### 17.2 CLI Usage

```bash
# Install globally
npm install -g n8n-inngest-converter

# Convert workflow
n8n-to-inngest convert workflow.json --output ./inngest-project

# Validate workflow without converting
n8n-to-inngest validate workflow.json

# List supported node types
n8n-to-inngest list-mappers

# Interactive mode
n8n-to-inngest convert --interactive
```

---

## 18. Documentation and Examples

### 18.1 Required Documentation

1. **README.md**: Quick start, installation, basic usage
2. **ARCHITECTURE.md**: This document
3. **NODE_MAPPING_GUIDE.md**: How to add custom node mappers
4. **API.md**: Programmatic API for integration
5. **LIMITATIONS.md**: What can't be converted and why
6. **MIGRATION_GUIDE.md**: Step-by-step n8n → Inngest migration

### 18.2 Example Workflows

Provide reference conversions:
- Simple HTTP webhook → Inngest function
- Scheduled task with email → Cron + Inngest
- Multi-step workflow with conditions → Complex Inngest function
- Error handling workflow → onFailure handler
- Loop over items → Batch processing

---

## 19. Success Metrics

### 19.1 Conversion Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Conversion Success Rate | > 90% | % of workflows converted without errors |
| Code Compilation Rate | 100% | Generated TypeScript must compile |
| Functional Equivalence | > 95% | Behavior matches n8n execution |
| Developer Satisfaction | > 4/5 | User survey rating |
| Time to Deploy | < 30 min | From conversion to production |

### 19.2 Adoption Metrics

- NPM downloads per month
- GitHub stars and forks
- Community-contributed mappers
- Documentation page views
- Support ticket volume

---

## 20. Conclusion

This architecture provides a robust, extensible foundation for converting n8n workflows to Inngest functions. The plugin-based node mapping system allows incremental implementation and community contributions, while the template-based code generation ensures readable, maintainable output.

**Key Architectural Strengths:**
1. **Modularity**: Clear separation between parsing, analysis, and generation
2. **Extensibility**: Plugin system for custom node types
3. **Type Safety**: Full TypeScript support throughout
4. **Security**: Environment-based credential management
5. **Developer Experience**: Human-readable generated code

**Next Steps:**
1. Implement core parser and graph analyzer
2. Build mapper registry and 10 core node mappers
3. Create template engine and code assembler
4. Develop CLI interface
5. Write comprehensive tests
6. Publish initial release

---

## Appendix A: n8n Node Type Priority

Based on usage frequency, implement mappers in this order:

**Phase 1 - Core (Week 1-2)**
1. HTTP Request
2. Webhook
3. Set/Function
4. If
5. Code Node

**Phase 2 - Common (Week 3-4)**
6. Switch
7. Wait
8. Schedule Trigger
9. Email Send
10. Loop Over Items

**Phase 3 - Integrations (Week 5-8)**
11. Slack
12. Google Sheets
13. Airtable
14. Notion
15. Stripe
16. OpenAI
17. Postgres
18. MongoDB
19. Redis
20. AWS S3

**Phase 4 - Advanced (Week 9-12)**
21. Execute Workflow
22. Split In Batches
23. Merge
24. Error Trigger
25. Sticky Note (documentation)

---

## Appendix B: Template Variables Reference

### Available in All Templates

```typescript
{
  workflow: N8nWorkflow;         // Full workflow object
  node: N8nNode;                 // Current node
  stepName: string;              // Sanitized step name
  varName: string;               // Variable name for results
  context: CodeGenContext;       // Full context
}
```

### HTTP Request Template Variables

```typescript
{
  method: string;                // GET, POST, etc.
  url: string;                   // Request URL
  headers: Array<{name, value}>; // HTTP headers
  hasBody: boolean;              // Whether request has body
  bodyExpression: string;        // Body content
  credentials?: {                // Optional credentials
    type: string;
    envVar: string;
  };
}
```

---

## Appendix C: References and Resources

### Research Sources

- [N8N Import Workflow JSON Guide](https://latenode.com/blog/low-code-no-code-platforms/n8n-setup-workflows-self-hosting-templates/n8n-import-workflow-json-complete-guide-file-format-examples-2025)
- [N8N Export/Import Workflows](https://latenode.com/blog/low-code-no-code-platforms/n8n-setup-workflows-self-hosting-templates/n8n-export-import-workflows-complete-json-guide-troubleshooting-common-failures-2025)
- [n8n Data Structure Documentation](https://docs.n8n.io/data/data-structure/)
- [n8n Export and Import Workflows](https://docs.n8n.io/workflows/export-import/)
- [N8N Json Workflow Structure](https://www.genspark.ai/spark/n8n-json-workflow-structure/74716edb-f7a6-4ee4-9312-3665549403da)
- [Inngest TypeScript Documentation](https://www.inngest.com/docs/typescript)
- [Inngest TypeScript SDK Reference](https://www.inngest.com/docs/reference/typescript)
- [TypeScript Orchestration Guide: Temporal vs. Trigger.dev vs. Inngest](https://medium.com/@matthieumordrel/the-ultimate-guide-to-typescript-orchestration-temporal-vs-trigger-dev-vs-inngest-and-beyond-29e1147c8f2d)

---

**Document Version**: 1.0
**Last Updated**: 2024-12-24
**Authors**: System Architecture Designer (Hive Mind Agent)
**Status**: Ready for Implementation

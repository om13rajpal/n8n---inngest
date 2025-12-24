# n8n to Inngest Converter - Architecture Summary

## Executive Overview

The n8n to Inngest Converter is a sophisticated TypeScript tool that transforms visual workflow definitions from n8n (JSON format) into production-ready Inngest TypeScript functions. This document provides a high-level summary of the architectural decisions and design patterns.

---

## Core Architecture Principles

### 1. Separation of Concerns

The system is divided into five distinct layers:

```
Input Layer → Parsing Layer → Analysis Layer → Generation Layer → Output Layer
```

**Benefits**:
- Each layer can be tested independently
- Easy to modify one layer without affecting others
- Clear data flow and transformation pipeline

### 2. Plugin-Based Extensibility

The node mapper system uses a plugin architecture where each n8n node type has a corresponding mapper:

```typescript
interface NodeMapper {
  nodeType: string;
  generateCode(node, context): CodeFragment;
}
```

**Benefits**:
- Support for 400+ n8n node types can be added incrementally
- Community can contribute custom node mappers
- Failing mappers don't crash the entire conversion

### 3. Template-Based Code Generation

Uses Handlebars templates instead of AST manipulation:

```handlebars
const {{varName}} = await step.run("{{stepName}}", async () => {
  {{#each operations}}
  {{this.code}}
  {{/each}}
});
```

**Benefits**:
- Generated code is human-readable and maintainable
- Easy to modify output format
- Simpler than AST transformations

---

## Key Design Decisions

### ADR-001: Template-Based Over AST-Based Generation

**Decision**: Use Handlebars templates for code generation

**Rationale**:
- Prioritizes readability of generated code
- Easier to maintain and modify templates
- Sufficient flexibility for this use case

**Trade-off**: Less programmatic control than AST manipulation

---

### ADR-002: Plugin Architecture for Node Mappers

**Decision**: Implement extensible, directory-based mapper discovery

**Rationale**:
- Impossible to support all 400+ n8n nodes in initial release
- Enables community contributions
- Organizations can add custom node support

**Implementation**: Auto-discover mappers in `mappers/` directory

---

### ADR-003: DAG-Based Execution Order

**Decision**: Build directed acyclic graph and use topological sort

**Rationale**:
- n8n uses graph-based flow, Inngest uses linear steps
- Need deterministic execution order
- Must detect cycles (invalid workflows)

**Algorithm**: Kahn's topological sort algorithm

---

### ADR-004: Environment Variable Credential Strategy

**Decision**: Replace all credentials with environment variable references

**Rationale**:
- Security: Never hardcode credentials
- Portability: Works across all deployment targets
- Best practice: 12-factor app methodology

**Implementation**: Generate `.env.example` with all required variables

---

### ADR-005: Best-Effort Error Mapping

**Decision**: Map n8n error handling to Inngest patterns with warnings

**Rationale**:
- Not all n8n patterns have direct Inngest equivalents
- Better to generate code + warnings than fail
- Developers can refine generated code

**Mapping**:
```
n8n Error Workflow → Inngest onFailure handler
n8n Retry Settings → Inngest retry configuration
n8n Continue on Fail → try/catch with logging
```

---

## System Components

### 1. Parser Module (`src/parser/`)

**Responsibility**: Parse and validate n8n workflow JSON

**Key Classes**:
- `N8nParser`: Main parser class
- `WorkflowValidator`: JSON schema validation using Zod

**Input**: n8n workflow JSON file
**Output**: Typed `N8nWorkflow` object

**Error Handling**: Validates schema, detects malformed JSON, reports clear errors

---

### 2. Graph Analyzer (`src/graph/`)

**Responsibility**: Convert n8n connections into execution graph

**Key Classes**:
- `GraphBuilder`: Constructs DAG from connections
- `TopologicalSort`: Determines execution order
- `BranchAnalyzer`: Detects conditional branches
- `LoopAnalyzer`: Detects loop structures

**Input**: `N8nWorkflow`
**Output**: `WorkflowGraph` with execution order

**Key Algorithm**: Kahn's topological sort to order nodes

---

### 3. Node Mapper System (`src/mappers/`)

**Responsibility**: Map n8n nodes to Inngest code fragments

**Key Classes**:
- `NodeMapperRegistry`: Singleton managing all mappers
- `BaseNodeMapper`: Abstract base class for mappers
- `HttpRequestMapper`, `WebhookMapper`, etc.: Concrete implementations

**Plugin Discovery**: Auto-loads mappers from directory

**Fallback Strategy**: `GenericNodeMapper` generates placeholder code for unsupported nodes

---

### 4. Code Generator (`src/codegen/`)

**Responsibility**: Assemble final TypeScript code from fragments

**Key Classes**:
- `CodeOrchestrator`: Coordinates generation pipeline
- `TemplateEngine`: Handlebars wrapper
- `CodeAssembler`: Combines fragments into complete functions
- `PrettierFormatter`: Formats generated code

**Process**:
1. For each node in execution order, get mapper
2. Generate code fragment
3. Collect imports and environment variables
4. Assemble into complete Inngest function
5. Format with Prettier

---

### 5. CLI Interface (`src/cli/`)

**Responsibility**: Command-line interface for users

**Key Commands**:
- `convert` - Convert n8n workflow to Inngest
- `validate` - Validate n8n JSON without converting
- `list-mappers` - Show supported node types
- `init` - Initialize output project

**Libraries**:
- Commander.js for CLI framework
- Inquirer for interactive prompts
- Ora for progress indicators

---

## Data Flow

```
1. INPUT: n8n workflow JSON
   ↓
2. PARSE: Extract nodes, connections, metadata
   ↓
3. BUILD GRAPH: Create adjacency list, calculate degrees
   ↓
4. ANALYZE: Topological sort, detect branches/loops
   ↓
5. MAP NODES: For each node, generate code fragment
   ↓
6. ASSEMBLE: Combine fragments into complete function
   ↓
7. FORMAT: Apply Prettier formatting
   ↓
8. OUTPUT: TypeScript project with all files
```

---

## Generated Output Structure

```
output/
├── src/
│   ├── inngest/
│   │   ├── client.ts              # Inngest client initialization
│   │   └── functions/
│   │       └── workflow-name.ts   # Generated Inngest function
│   └── types/
│       └── events.ts              # Event type definitions
├── .env.example                   # Environment variables template
├── package.json                   # Dependencies (inngest, etc.)
├── tsconfig.json                  # TypeScript configuration
├── README.md                      # Setup instructions
└── CONVERSION_REPORT.md           # Warnings and manual steps
```

---

## Example Conversion

### Input: n8n Workflow JSON

```json
{
  "name": "User Onboarding",
  "nodes": [
    {
      "id": "webhook-1",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "user-created",
        "method": "POST"
      }
    },
    {
      "id": "http-1",
      "name": "Send Welcome Email",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://api.sendgrid.com/v3/mail/send",
        "body": {
          "to": "{{ $json.email }}",
          "template": "welcome"
        }
      },
      "credentials": {
        "sendgridApi": { "id": "1", "name": "SendGrid Account" }
      }
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Send Welcome Email", "type": "main", "index": 0 }]] }
  }
}
```

### Output: Generated TypeScript

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "user-onboarding" });

export const userOnboardingWorkflow = inngest.createFunction(
  { id: "user-onboarding-workflow", name: "User Onboarding Workflow" },
  { event: "user/created" },
  async ({ event, step }) => {
    // Send Welcome Email
    const sendWelcomeEmail = await step.run("send-welcome-email", async () => {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
        },
        body: JSON.stringify({
          to: event.data.email,
          template: "welcome"
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP POST failed: ${response.statusText}`);
      }

      return await response.json();
    });

    return { status: "completed", emailId: sendWelcomeEmail.id };
  }
);
```

### Generated .env.example

```bash
# SendGrid API (used in: Send Welcome Email)
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Inngest Configuration
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

---

## Key Algorithms

### Topological Sort (Execution Order)

```typescript
function topologicalSort(graph: WorkflowGraph): GraphNode[] {
  const sorted = [];
  const queue = [...graph.entryPoints];
  const inDegree = new Map();

  // Initialize in-degrees
  for (const node of graph.nodes.values()) {
    inDegree.set(node.id, node.inDegree);
  }

  // Process nodes with zero in-degree
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);

    for (const successor of node.successors) {
      const degree = inDegree.get(successor.id) - 1;
      inDegree.set(successor.id, degree);

      if (degree === 0) {
        queue.push(successor);
      }
    }
  }

  // Check for cycles
  if (sorted.length !== graph.nodes.size) {
    throw new Error("Workflow contains cycles");
  }

  return sorted;
}
```

### Branch Detection

```typescript
function detectBranches(graph: WorkflowGraph): BranchPoint[] {
  const branches = [];

  for (const node of graph.nodes.values()) {
    if (node.isConditional) {
      // Group successors by output index
      const outputGroups = groupSuccessorsByOutput(node);

      // Create branch for each output
      const branchPoint = {
        node,
        branches: outputGroups.map((nodes, idx) => ({
          condition: extractCondition(node, idx),
          path: tracePath(nodes[0])
        }))
      };

      branches.push(branchPoint);
    }
  }

  return branches;
}
```

---

## Security Considerations

### Credential Handling

**Problem**: n8n JSON contains credential IDs (not values, but metadata)

**Solution**:
1. Scan for all credential references
2. Generate environment variable names
3. Replace credential access with `process.env.*`
4. Document required variables in `.env.example`

**Never**:
- Hardcode credential values
- Include credential IDs in generated code
- Commit `.env` files

### Input Validation

**Problem**: Malicious n8n JSON could inject code

**Solution**:
1. Validate against strict JSON schema
2. Sanitize all user inputs before templating
3. Use safe Handlebars helpers only
4. Escape special characters in generated code

### Code Injection Prevention

**Problem**: n8n expressions could contain malicious code

**Solution**:
1. Parse n8n expressions, don't eval them
2. Whitelist allowed expression patterns
3. Warn on suspicious patterns
4. Provide manual review option

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Parse 50-node workflow | <100ms | Parser benchmark |
| Build graph (100 nodes) | <100ms | Graph builder benchmark |
| Generate code (50 nodes) | <5s | End-to-end benchmark |
| Memory usage | <500MB | Peak memory during conversion |
| Generated code compilation | <3s | TypeScript tsc time |

---

## Testing Strategy

### Unit Tests (>90% coverage)

- Parser: Test with valid/invalid JSON
- Graph Builder: Test with linear, branched, cyclic workflows
- Mappers: Test each mapper with sample nodes
- Template Engine: Test template rendering

### Integration Tests

- Full workflow conversion (input JSON → output TypeScript)
- Generated code compilation (verify TypeScript validity)
- Multi-file output generation

### End-to-End Tests

- Convert sample workflows
- Install dependencies in generated project
- Run Inngest dev server
- Send test events
- Verify function execution

---

## Known Limitations

### Current Scope (v1.0)

**Supported**:
- Linear workflows
- Conditional branches (IF/SWITCH)
- Loops (Split in Batches)
- HTTP requests
- Webhooks
- Scheduled triggers
- Basic error handling

**Not Supported** (manual implementation required):
- Subworkflows (Execute Workflow node)
- Binary data (file uploads/downloads)
- Complex n8n expressions (some patterns)
- Custom community nodes (without custom mappers)
- n8n-specific features (sticky notes, workflow variables)

### Future Enhancements

- AI-assisted mapper generation
- Bidirectional conversion (Inngest → n8n)
- Web UI for conversion
- VSCode extension
- Real-time conversion preview

---

## Development Roadmap

### Phase 1: Foundation (Weeks 1-2)
- Project setup, type system, parser, graph builder

### Phase 2: Code Generation (Weeks 3-4)
- Template engine, mapper system, code assembler

### Phase 3: Advanced Features (Weeks 5-6)
- Branch/loop detection, error handling

### Phase 4: CLI & Integration (Weeks 7-8)
- CLI interface, file generation, additional mappers

### Phase 5: Testing & Polish (Weeks 9-10)
- Integration tests, documentation, optimization

### Phase 6: Release (Weeks 11-12)
- Beta release, feedback, v1.0 launch

**Total Timeline**: 12 weeks to v1.0

---

## Success Criteria

### Technical Quality
- Test coverage >85%
- Conversion success rate >90%
- Generated code compiles 100%
- Zero security vulnerabilities

### User Adoption
- 500+ npm downloads (month 1)
- 100+ GitHub stars (month 1)
- Active community discussions
- User satisfaction >4/5

---

## Technology Stack

### Core Dependencies
- **TypeScript**: Type-safe development
- **Handlebars**: Template engine
- **Zod**: Schema validation
- **Commander.js**: CLI framework
- **Inquirer**: Interactive prompts
- **Prettier**: Code formatting

### Development Tools
- **Jest**: Testing framework
- **ESLint**: Code linting
- **TypeDoc**: API documentation
- **GitHub Actions**: CI/CD

### Generated Project Dependencies
- **Inngest**: Workflow orchestration
- **TypeScript**: Type safety
- Standard Node.js libraries (fetch, etc.)

---

## File Structure Summary

```
n8n-inngest-converter/
├── src/
│   ├── cli/              # Command-line interface
│   ├── parser/           # n8n JSON parsing
│   ├── graph/            # Graph analysis
│   ├── codegen/          # Code generation
│   ├── mappers/          # Node mappers
│   ├── templates/        # Handlebars templates
│   ├── utils/            # Helper utilities
│   └── types/            # TypeScript types
├── test/
│   ├── fixtures/         # Sample n8n workflows
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── examples/             # Example conversions
├── docs/                 # Documentation
└── package.json
```

---

## Resources and References

### n8n Documentation
- [n8n Workflow JSON Structure](https://docs.n8n.io/workflows/export-import/)
- [n8n Data Structure](https://docs.n8n.io/data/data-structure/)
- [n8n Node Types](https://docs.n8n.io/integrations/)

### Inngest Documentation
- [Inngest TypeScript SDK](https://www.inngest.com/docs/typescript)
- [Inngest Function Reference](https://www.inngest.com/docs/reference/typescript)
- [Inngest Event-Driven Patterns](https://www.inngest.com/docs)

### Architecture Patterns
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Plugin Architecture](https://en.wikipedia.org/wiki/Plug-in_(computing))
- [Template Method Pattern](https://refactoring.guru/design-patterns/template-method)

---

## Contact and Contribution

**Repository**: (To be created on GitHub)
**NPM Package**: `n8n-inngest-converter` (to be published)
**Community**: Discord/Slack (to be set up)

**Contributing**: See `CONTRIBUTING.md` for guidelines on:
- Adding custom node mappers
- Reporting bugs
- Proposing features
- Submitting pull requests

---

**Document Version**: 1.0
**Last Updated**: 2024-12-24
**Status**: Ready for Implementation Review

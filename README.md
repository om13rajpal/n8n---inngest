# n8n to Inngest Converter - Architecture Documentation

## Overview

This repository contains the complete architectural design for an n8n to Inngest workflow converter tool. The converter transforms n8n's visual workflow JSON files into production-ready TypeScript code for the Inngest event-driven orchestration platform.

## Documentation Index

### Core Architecture Documents

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** (44KB)
   - Complete system architecture specification
   - Architecture Decision Records (ADRs)
   - Module structure and interfaces
   - Data flow diagrams
   - Code generation strategy
   - Security considerations
   - **Start here for comprehensive understanding**

2. **[ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md)** (17KB)
   - Executive overview
   - High-level design principles
   - Key design decisions
   - Component overview
   - Example conversions
   - **Best for quick overview**

3. **[TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md)** (29KB)
   - Detailed type system definitions
   - Core interfaces and types
   - Node mapper system design
   - Graph analysis algorithms
   - Template system architecture
   - **For implementation details**

### Implementation Guides

4. **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)** (16KB)
   - 12-week phased development plan
   - Sprint-by-sprint breakdown
   - Success metrics and KPIs
   - Risk management
   - Resource requirements
   - **For project planning**

5. **[CONVERSION_FLOW.md](./CONVERSION_FLOW.md)** (38KB)
   - Visual flow diagrams (ASCII art)
   - Decision trees
   - Process flowcharts
   - Node handling logic
   - Error handling flows
   - **For understanding conversion pipeline**

6. **[EXAMPLE_HTTP_MAPPER.ts](./EXAMPLE_HTTP_MAPPER.ts)** (14KB)
   - Complete HTTP Request node mapper implementation
   - Demonstrates best practices
   - Shows code generation patterns
   - Includes credential handling
   - **Template for building new mappers**

### Research and Reference

7. **[inngest-sdk-reference.md](./inngest-sdk-reference.md)** (32KB)
   - Inngest TypeScript SDK documentation
   - Event-driven patterns
   - Function configuration
   - Step orchestration
   - **Reference for Inngest API**

8. **[n8n-to-inngest-conversion-guide.md](./n8n-to-inngest-conversion-guide.md)** (43KB)
   - Mapping strategies
   - Pattern equivalences
   - Migration guide
   - **Conceptual conversion reference**

9. **[inngest-quick-reference.md](./inngest-quick-reference.md)** (13KB)
   - Quick lookup for Inngest concepts
   - Code snippets
   - Common patterns
   - **Quick reference guide**

10. **[research-summary.md](./research-summary.md)** (9.6KB)
    - Background research findings
    - Technology analysis
    - Design rationale
    - **Context and research**

---

## Quick Start Guide

### For Architects and Technical Leads

1. Read [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) for overview
2. Review key ADRs in [ARCHITECTURE.md](./ARCHITECTURE.md)
3. Check [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) for timeline

### For Developers

1. Read [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) for type system
2. Study [EXAMPLE_HTTP_MAPPER.ts](./EXAMPLE_HTTP_MAPPER.ts) for patterns
3. Reference [CONVERSION_FLOW.md](./CONVERSION_FLOW.md) for pipeline logic
4. Start implementing following [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)

### For Project Managers

1. Review [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) for timeline
2. Check success metrics and risk management sections
3. Read [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) for scope

---

## Architecture at a Glance

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Interface                        │
│                  (Commander + Inquirer)                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Converter Orchestrator                  │
└───┬────────────┬─────────────┬──────────────┬───────────┘
    │            │             │              │
    ▼            ▼             ▼              ▼
┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────────┐
│ Parser │  │ Graph  │  │   Code   │  │  Template   │
│ Module │  │Analyzer│  │Generator │  │   Engine    │
└────────┘  └────────┘  └──────────┘  └─────────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │ Node Mapper Registry   │
                │   (Plugin System)      │
                └────────────────────────┘
```

### Key Design Patterns

- **Pipeline Architecture**: Clear data transformation stages
- **Plugin System**: Extensible node mapper registry
- **Template Method**: Base mapper with customizable hooks
- **Strategy Pattern**: Different code generation strategies per node
- **Factory Pattern**: Node mapper creation and discovery
- **Singleton Pattern**: Mapper registry

### Core Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Type System | TypeScript | Type safety |
| Parsing | Zod | Schema validation |
| Graph Analysis | Custom Algorithm | Topological sort |
| Code Generation | Handlebars | Template rendering |
| CLI | Commander.js | Command interface |
| Testing | Jest | Unit/Integration tests |
| Formatting | Prettier | Code formatting |

---

## Key Features

### Phase 1 (v1.0)

- Parse and validate n8n workflow JSON
- Build execution graph with topological sort
- Support 50+ common n8n node types
- Template-based code generation
- Environment variable management
- Error handling mapping
- CLI with interactive mode
- Generate complete TypeScript project

### Future Phases (v2.0+)

- AI-assisted mapper generation
- Bidirectional conversion (Inngest → n8n)
- Web UI for drag-and-drop conversion
- VSCode extension
- Real-time migration assistance
- Enterprise features (batch conversion, SSO)

---

## Architecture Principles

### 1. Separation of Concerns
Each module has a single, well-defined responsibility.

### 2. Extensibility
Plugin-based architecture allows adding new node types without modifying core.

### 3. Type Safety
Comprehensive TypeScript types prevent runtime errors.

### 4. Testability
Each layer can be tested independently with clear interfaces.

### 5. Developer Experience
Generated code is readable, maintainable, and follows best practices.

### 6. Security First
Credentials are never hardcoded; always use environment variables.

---

## Key Decisions

### ADR-001: Template-Based Code Generation
**Chosen**: Handlebars templates
**Why**: Readable output, easier maintenance
**Trade-off**: Less flexible than AST manipulation

### ADR-002: Plugin Architecture for Mappers
**Chosen**: Directory-based auto-discovery
**Why**: Extensible, community-friendly
**Trade-off**: Requires consistent interface

### ADR-003: DAG-Based Execution Order
**Chosen**: Topological sort (Kahn's algorithm)
**Why**: Deterministic, detects cycles
**Trade-off**: No support for cyclic workflows

### ADR-004: Environment Variable Credentials
**Chosen**: `.env` file with placeholders
**Why**: Secure, portable, best practice
**Trade-off**: Manual credential setup required

### ADR-005: Best-Effort Error Mapping
**Chosen**: Generate code + warnings
**Why**: Better than conversion failure
**Trade-off**: May require manual refinement

---

## Success Metrics

### Technical Quality
- Test coverage: >85%
- Conversion success rate: >90%
- Generated code compilation: 100%
- Performance: <5s for 50-node workflow

### Adoption Metrics
- NPM downloads: 500+ (month 1)
- GitHub stars: 100+ (month 1)
- User satisfaction: >4/5
- Community engagement: Active discussions

---

## Development Timeline

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| Phase 1: Foundation | Weeks 1-2 | Parser, Graph Builder |
| Phase 2: Code Gen | Weeks 3-4 | Templates, Mappers, Assembler |
| Phase 3: Advanced | Weeks 5-6 | Branches, Loops, Error Handling |
| Phase 4: Integration | Weeks 7-8 | CLI, File Gen, More Mappers |
| Phase 5: Testing | Weeks 9-10 | Tests, Docs, Optimization |
| Phase 6: Release | Weeks 11-12 | Beta, Feedback, v1.0 |

**Total**: 12 weeks to v1.0 release

---

## File Structure (When Implemented)

```
n8n-inngest-converter/
├── src/
│   ├── cli/              # Command-line interface
│   ├── parser/           # n8n JSON parsing
│   ├── graph/            # Graph analysis
│   ├── codegen/          # Code generation
│   ├── mappers/          # Node mappers
│   │   ├── core/         # Built-in mappers
│   │   └── registry.ts   # Mapper registry
│   ├── templates/        # Handlebars templates
│   ├── utils/            # Helper utilities
│   └── types/            # TypeScript types
├── test/
│   ├── fixtures/         # Sample workflows
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── examples/             # Example conversions
├── docs/                 # Documentation (this folder)
└── package.json
```

---

## Example Conversion

### Input: n8n Workflow
```json
{
  "name": "User Onboarding",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": { "path": "user-created" }
    },
    {
      "name": "Send Email",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "{{process.env.EMAIL_API}}/send"
      }
    }
  ]
}
```

### Output: Inngest Function
```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "user-onboarding" });

export const userOnboarding = inngest.createFunction(
  { id: "user-onboarding-workflow" },
  { event: "user/created" },
  async ({ event, step }) => {
    const sendEmail = await step.run("send-email", async () => {
      const response = await fetch(`${process.env.EMAIL_API}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: event.data.email })
      });
      return await response.json();
    });

    return { status: "completed" };
  }
);
```

---

## Contributing

This is currently an architecture design phase. Implementation will begin following the roadmap.

### Adding Node Mappers

1. Extend `BaseNodeMapper` class
2. Implement `generateCode()` method
3. Register in mapper registry
4. Add tests
5. See [EXAMPLE_HTTP_MAPPER.ts](./EXAMPLE_HTTP_MAPPER.ts)

### Reporting Issues

- Architecture feedback: Open GitHub issue
- Design suggestions: Submit pull request
- Questions: Start a discussion

---

## Resources

### External Documentation
- [n8n Workflow Documentation](https://docs.n8n.io/workflows/export-import/)
- [Inngest TypeScript SDK](https://www.inngest.com/docs/typescript)
- [Handlebars Documentation](https://handlebarsjs.com/)

### Internal References
- See [research-summary.md](./research-summary.md) for background
- See [inngest-sdk-reference.md](./inngest-sdk-reference.md) for API details
- See [n8n-to-inngest-conversion-guide.md](./n8n-to-inngest-conversion-guide.md) for patterns

---

## License

To be determined (pending project creation)

---

## Contact

**Project**: n8n to Inngest Converter
**Status**: Architecture Design Phase
**Version**: 1.0.0-design
**Last Updated**: 2024-12-24

---

## Document Ownership

This architecture was designed by the Hive Mind System Architecture Designer agent. All documents are ready for implementation review and team discussion.

### Document Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2024-12-24 | Initial architecture design | System Architect Agent |

---

## Next Steps

1. **Review**: Technical team reviews architecture documents
2. **Approve**: Stakeholders approve design and roadmap
3. **Setup**: Initialize project repository
4. **Implement**: Begin Phase 1 development
5. **Iterate**: Refine based on implementation learnings

---

**Ready for Implementation**: This architecture is complete and ready for development to begin.

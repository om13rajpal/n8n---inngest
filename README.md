# n8n to Inngest Converter

Convert n8n workflows to production-ready Inngest functions automatically. Transform visual automation workflows into TypeScript code with intelligent AI agent support.

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/yourusername/n8n-inngest-converter)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)

## Features

- **59+ Node Types Supported**: Comprehensive coverage of n8n nodes including triggers, integrations, AI, control flow, and more
- **AI Agent Integration**: Built-in support for @inngest/agent-kit with OpenRouter, Perplexity, and Tavily
- **Production-Ready Code**: Generates clean, typed TypeScript with camelCase naming conventions
- **Silent Failure Detection**: Validates conversions and provides detailed error messages
- **Smart Retry Logic**: Automatically wraps steps for resilient execution
- **Security Best Practices**: Environment variable management, no hardcoded credentials
- **Comprehensive Validation**: Zod schema validation with detailed error reporting

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-inngest-converter.git
cd n8n-inngest-converter

# Install dependencies
npm install

# Build the project
npm run build
```

### Basic Usage

#### CLI Mode

```bash
# Convert a single workflow
npm start -- path/to/workflow.json

# Convert multiple workflows
npm start -- workflows/*.json

# Specify output directory
npm start -- workflow.json -o ./output
```

#### Programmatic Usage

```typescript
import { EnhancedN8nToInngestConverter } from './converter/index-enhanced';

const converter = new EnhancedN8nToInngestConverter();

// Convert a workflow
const result = await converter.convertWorkflow({
  name: 'My Workflow',
  nodes: [...],
  connections: {...}
});

console.log(result.code);
console.log(result.warnings);
```

## Supported Node Types

### Triggers (10+)
- `webhook` - HTTP webhooks with custom paths
- `scheduleTrigger` - Cron-based scheduling
- `manualTrigger` - Manual execution
- `emailTrigger` - Email-based triggers
- `googleDriveTrigger` - Google Drive file events ✨ NEW
- `googleSheetsTrigger` - Google Sheets changes ✨ NEW
- And more...

### Integrations (25+)
- **HTTP**: `httpRequest`, `curl`, `webhook`
- **Databases**: `postgres`, `mysql`, `mongodb`, `supabase`
- **AI Services**: `openAi`, `anthropic`, `perplexity`
- **Cloud Storage**: `googleDrive`, `s3`, `dropbox`
- **Communication**: `slack`, `discord`, `email`, `sms`
- **Image Processing**: `editImage` (crop, resize, rotate) ✨ NEW
- **Productivity**: `googleSheets`, `airtable`, `notion`
- **E-commerce**: `shopify`, `stripe`, `wooCommerce`
- And more...

### AI & Data Processing (10+)
- `llmChain` - LangChain integration
- `agent` - AI agent with tools (@inngest/agent-kit)
- `aggregate` - Data aggregation
- `code` - Custom JavaScript/Python
- `itemLists` - Array operations
- And more...

### Control Flow (8+)
- `if` - Conditional branching
- `switch` - Multi-way branching
- `merge` - Data merging
- `loop` - Iteration
- `wait` - Delays and pauses
- `error` - Error handling
- And more...

## Code Quality Features

### camelCase Naming Conventions ✨
All generated variable names follow JavaScript/TypeScript best practices:

```typescript
// ✅ Generated code uses camelCase
const processUserData = await step.run("process-user-data", async () => {...});
const sendWelcomeEmail = await step.run("send-welcome-email", async () => {...});

// ❌ No hyphens, underscores, or spaces in variable names
// process_user_data, process-user-data, Process User Data
```

### Validation & Error Detection
Silent failures are detected automatically:

```typescript
// Empty functions array triggers descriptive error:
// "Conversion produced no functions for workflow 'X'. Possible causes:
//  - Unsupported trigger node type
//  - Broken workflow connections
//  - Missing node converters"
```

### Production Monitoring
Generated code includes:
- Step-level error tracking
- Retry configuration
- Timeout management
- Network state handling

## Environment Configuration

Create a `.env` file with your credentials:

```bash
# Inngest Configuration
INNGEST_SIGNING_KEY=signkey-prod-your-key-here
INNGEST_EVENT_KEY=your-event-key-here
INNGEST_ENV=production

# AI Model APIs (if using AI features)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PERPLEXITY_API_KEY=pplx-your-key-here
TAVILY_API_KEY=tvly-your-key-here

# Databases
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
DATABASE_URL=postgresql://user:password@host:5432/database

# External Services
GOOGLE_SHEETS_API_KEY=your-api-key-here
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SHOPIFY_API_KEY=your-api-key-here
NOTION_API_KEY=secret_your-api-key-here
```

See [.env.example](./.env.example) for complete configuration reference.

## Example Conversion

### Input: n8n Workflow JSON

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
      "type": "n8n-nodes-base.sendEmail",
      "parameters": {
        "toEmail": "{{$json.email}}",
        "subject": "Welcome!"
      }
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Send Email" }]] }
  }
}
```

### Output: Inngest Function

```typescript
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "user-onboarding" });

export const userOnboardingWorkflow = inngest.createFunction(
  { id: "user-onboarding-workflow", name: "User Onboarding Workflow" },
  { event: "user-onboarding/webhook" },
  async ({ event, step }) => {
    // Webhook trigger - Event: user-onboarding/webhook
    const webhookData = event.data;

    // Send Email
    const sendEmail = await step.run("send-email", async () => {
      // Email sending logic with retry and error handling
      return { status: "sent", recipient: webhookData.email };
    });

    return { status: "completed", steps: { sendEmail } };
  }
);

export const functions = [userOnboardingWorkflow];
```

## Production Deployment

This converter is production-ready and can be deployed to:

- **Vercel** (Recommended): Serverless deployment with zero configuration
- **Railway**: Container-based hosting with automatic scaling
- **Custom Servers**: Node.js 18+ with PM2 or Docker

See [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

### Quick Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (follow prompts)
vercel

# Set environment variables
vercel env add INNGEST_SIGNING_KEY
vercel env add INNGEST_EVENT_KEY
```

## Production Monitoring

Set up comprehensive monitoring for your deployed functions:

- **Metrics**: Execution time, success rate, retry counts
- **Logging**: Structured logs with correlation IDs
- **Alerts**: Error rate thresholds, timeout alerts
- **Dashboards**: Real-time function performance

See [PRODUCTION_MONITORING.md](./PRODUCTION_MONITORING.md) for complete monitoring setup.

## Development

### Project Structure

```
n8n-inngest-converter/
├── src/
│   ├── converter/              # Core converter logic
│   │   ├── index-enhanced.ts   # Main converter class
│   │   └── base-converter.ts   # Utilities & helpers
│   ├── converters/             # Node type converters
│   │   ├── trigger-converters.ts
│   │   ├── integration-converters.ts
│   │   ├── ai-converters.ts
│   │   ├── code-converters.ts
│   │   └── control-flow-converters.ts
│   ├── types/                  # TypeScript definitions
│   └── index.ts                # Entry point
├── api/                        # Vercel API routes
├── frontend/                   # Web UI (optional)
├── .env.example                # Environment template
├── LICENSE                     # MIT License
└── README.md                   # This file
```

### Building from Source

```bash
# Install dependencies
npm install

# Run TypeScript compiler
npm run build

# Watch mode for development
npm run watch

# Type checking
npm run type-check
```

### Testing

```bash
# Run all tests
npm test

# Test specific workflow
npm start -- test-workflows/your-workflow.json
```

## Troubleshooting

### "Conversion produced no functions"

**Cause**: Unsupported trigger node or broken connections

**Solution**:
1. Check that your workflow has a supported trigger node
2. Verify all node connections reference existing nodes
3. Review conversion warnings for missing node types

### "Module not found: 'sharp'"

**Cause**: Image processing dependency missing

**Solution**:
```bash
npm install sharp
```

### camelCase Variable Names

**Configured**: All variable names use camelCase automatically

**Example**:
- Node name: "Process User Data" → Variable: `processUserData`
- Node name: "Send-Welcome-Email" → Variable: `sendWelcomeEmail`

### Environment Variables Not Loading

**Cause**: `.env` file not found or incorrectly formatted

**Solution**:
1. Copy `.env.example` to `.env`
2. Fill in your actual credentials
3. Ensure no quotes around values (unless value contains spaces)
4. Restart the application

## Edge Cases & Manual Review

Before deploying to production, review the checklist:

See [EDGE_CASE_REVIEW_CHECKLIST.md](./EDGE_CASE_REVIEW_CHECKLIST.md) for comprehensive pre-deployment review.

Key areas:
- Variable naming (camelCase verification)
- Error handling completeness
- Retry logic configuration
- Security (no hardcoded secrets)
- Performance optimization
- Type safety

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow existing code style (camelCase, TypeScript strict mode)
4. Add tests for new node converters
5. Update documentation
6. Submit a pull request

### Adding New Node Converters

```typescript
// src/converters/my-converter.ts
import { NodeConverter, ConversionResult } from '../types';

export const myNodeConverter: NodeConverter = {
  nodeTypes: ['n8n-nodes-base.myNode'],
  convert(node, context) {
    const params = node.parameters as any;
    const varName = toVariableName(node.name);
    const stepId = toStepId(node.name);

    const code = `const ${varName} = await step.run("${stepId}", async () => {
      // Your conversion logic here
      return { status: "success" };
    });`;

    return {
      steps: [{ type: 'run', id: stepId, code, comment: 'My custom node' }]
    };
  }
};
```

## Version History

### v1.2.0 - Production-Ready Edition (2026-01-04)
- ✅ Fixed workflow #5 (added googleDriveTrigger, editImage converters)
- ✅ Added silent failure detection with detailed error messages
- ✅ Fixed variable naming to camelCase (no hyphens/underscores/spaces)
- ✅ Production monitoring and deployment guides
- ✅ Edge case review checklist
- ✅ 59+ node types supported

### v1.1.0 - Enhanced Validation
- Added validation for empty functions array
- Improved error messages
- Enhanced type safety

### v1.0.0 - Initial Release
- Core conversion functionality
- 50+ node types supported
- CLI interface
- Basic validation

## License

MIT License - see [LICENSE](./LICENSE) file for details.

Copyright (c) 2026 n8n to Inngest Converter

## Resources

### Documentation
- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Production Monitoring Setup](./PRODUCTION_MONITORING.md)
- [Edge Case Review Checklist](./EDGE_CASE_REVIEW_CHECKLIST.md)
- [Environment Configuration](./.env.example)

### External Links
- [Inngest Documentation](https://www.inngest.com/docs)
- [n8n Workflow Export](https://docs.n8n.io/workflows/export-import/)
- [@inngest/agent-kit](https://github.com/inngest/agent-kit)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/n8n-inngest-converter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/n8n-inngest-converter/discussions)
- **Documentation**: See guides in repository root

---

**Status**: Production-Ready ✅
**Last Updated**: 2026-01-04
**Maintainer**: n8n to Inngest Converter Team

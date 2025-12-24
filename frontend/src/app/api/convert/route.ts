import { NextRequest, NextResponse } from 'next/server';

interface N8nWorkflow {
  name?: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    typeVersion: number;
    position: [number, number];
    parameters: Record<string, unknown>;
    credentials?: Record<string, { id: string; name: string }>;
    disabled?: boolean;
  }>;
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
  settings?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface ConversionOptions {
  includeComments: boolean;
  eventPrefix: string;
  useAgentKit: boolean;
}

// Import the converter dynamically to avoid bundling issues
async function convertWorkflow(workflow: N8nWorkflow, options: ConversionOptions) {
  // Since we can't easily import the converter from the parent package in Next.js,
  // we'll implement a simplified version here or call an external service

  // For now, let's implement a basic converter inline
  const { generateInngestCode } = await import('@/lib/converter');
  return generateInngestCode(workflow, options);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow, options } = body;

    if (!workflow) {
      return NextResponse.json(
        { error: 'No workflow provided' },
        { status: 400 }
      );
    }

    // Validate workflow structure
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      return NextResponse.json(
        { error: 'Invalid workflow: nodes array is required' },
        { status: 400 }
      );
    }

    const result = await convertWorkflow(workflow, {
      includeComments: options?.includeComments ?? true,
      eventPrefix: options?.eventPrefix ?? 'app',
      useAgentKit: options?.useAgentKit ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Conversion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Conversion failed' },
      { status: 500 }
    );
  }
}

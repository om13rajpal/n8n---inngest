import type { VercelRequest, VercelResponse } from '@vercel/node';
import { convertWorkflow } from '../src/converter/index';
import { parseWorkflow } from '../src/parser/workflow-parser';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workflow, options } = req.body;

    if (!workflow) {
      return res.status(400).json({ error: 'Workflow JSON is required' });
    }

    // Parse and convert the workflow
    const parsedWorkflow = parseWorkflow(workflow);
    const result = convertWorkflow(parsedWorkflow, options || {});

    return res.status(200).json({
      success: true,
      code: result.code,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Conversion error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed'
    });
  }
}

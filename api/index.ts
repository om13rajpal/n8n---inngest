import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    name: 'n8n to Inngest Converter API',
    version: '1.0.0',
    endpoints: {
      convert: {
        method: 'POST',
        path: '/api/convert',
        body: {
          workflow: 'n8n workflow JSON object',
          options: {
            functionName: 'string (optional)',
            eventName: 'string (optional)'
          }
        }
      }
    }
  });
}

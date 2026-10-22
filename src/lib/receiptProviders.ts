import { GoogleGenerativeAI } from '@google/generative-ai';
import { OCRFailure, type ReceiptInput, type ReceiptProvider } from './receiptOcr';
import { RECEIPT_PROMPT } from './receiptPrompt';

const endpoints = {
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  grok: 'https://api.x.ai/v1/responses',
};
export async function callReceiptProvider(provider: ReceiptProvider, input: ReceiptInput, signal: AbortSignal): Promise<string> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(22000)]);
  try {
    if (provider === 'gemini') {
      const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' } });
      const result = await model.generateContent([RECEIPT_PROMPT, { inlineData: { data: input.base64, mimeType: input.mimeType } }], { signal: requestSignal, timeout: 22000 });
      return result.response.text();
    }
    const image = `data:${input.mimeType};base64,${input.base64}`;
    const key = provider === 'qwen' ? process.env.QWEN_API_KEY : provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.XAI_API_KEY;
    const model = provider === 'qwen' ? process.env.QWEN_MODEL || 'qwen3-vl-flash' : provider === 'deepseek' ? process.env.DEEPSEEK_MODEL || 'deepseek-flash' : process.env.GROK_MODEL || 'grok-4.7';
    const body = provider === 'grok' ? {
      model, store: false, input: [{ role: 'user', content: [{ type: 'input_text', text: RECEIPT_PROMPT }, { type: 'input_image', image_url: image, detail: 'high' }] }], max_output_tokens: 1024,
    } : {
      model, messages: [{ role: 'user', content: [{ type: 'text', text: RECEIPT_PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
      response_format: { type: 'json_object' }, max_tokens: 1024, stream: false,
      ...(provider === 'qwen' ? { enable_thinking: false } : { thinking: { type: 'disabled' } }),
    };
    const response = await fetch(endpoints[provider], { method: 'POST', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); throw new OCRFailure([400, 401, 403, 408, 429, 500, 502, 503, 504].includes(response.status) ? response.status : 503, 'Provider request failed'); }
    const data = await response.json();
    if (provider === 'grok') {
      const text = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || [])
        .filter((item: { type: string }) => item.type === 'output_text').map((item: { text?: string }) => item.text || '').join('');
      if (typeof text !== 'string' || !text) throw new OCRFailure(422, 'Empty provider output');
      return text;
    }
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text) throw new OCRFailure(422, 'Empty provider output');
    return text;
  } catch (error) {
    signal.throwIfAborted();
    if (requestSignal.aborted) throw new OCRFailure(504, 'Provider timed out');
    if (error instanceof OCRFailure) throw error;
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 503;
    throw new OCRFailure([400, 401, 403, 408, 429, 500, 502, 503, 504].includes(status) ? status : 503, 'Provider unavailable');
  }
}

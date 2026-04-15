const OPENAI_API_BASE_URL = String(process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.4-mini').trim() || 'gpt-5.4-mini';

const isOpenAIConfigured = () => Boolean(String(process.env.OPENAI_API_KEY || '').trim());

const extractOutputText = (payload = {}) => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  const collectedText = outputItems
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => part?.text || part?.content || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  return collectedText;
};

const createOpenAITextResponse = async ({ prompt }) => {
  if (!isOpenAIConfigured()) {
    const error = new Error('OpenAI is not configured. Add OPENAI_API_KEY in server/.env.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: String(prompt || '').trim(),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      payload?.message ||
      `OpenAI request failed with status ${response.status}`;
    const error = new Error(apiMessage);
    error.statusCode = response.status;
    throw error;
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    const error = new Error('OpenAI returned an empty response.');
    error.statusCode = 502;
    throw error;
  }

  return {
    text: outputText,
    model: payload?.model || OPENAI_MODEL,
    responseId: payload?.id || null,
  };
};

module.exports = {
  isOpenAIConfigured,
  createOpenAITextResponse,
};

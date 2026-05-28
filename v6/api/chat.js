// Vercel Serverless — AI 对话端点（OpenAI 兼容）
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: '缺少对话内容' });

  const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/v1';
  const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
  const LLM_KEY = process.env.LLM_KEY;
  if (!LLM_KEY) return res.status(503).json({ error: 'LLM 未配置' });

  const SYSTEM_PROMPT = `你是校招岗位技能矩阵的AI助手。你可以帮助用户：1.分析岗位技能需求 2.推荐适合的岗位 3.解释技术栈含义 4.提供求职建议。当前系统中有以下公司的校招数据：字节跳动、阿里巴巴、腾讯、美团、百度。请用简洁专业的中文回答。`;

  try {
    const llmRes = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: 1024
      })
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      return res.status(502).json({ error: `LLM 异常 (${llmRes.status})` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reader = llmRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          res.write(line + '\n\n');
        }
      }
    }
    res.end();
  } catch (e) {
    res.status(502).json({ error: 'LLM 连接失败: ' + e.message });
  }
}

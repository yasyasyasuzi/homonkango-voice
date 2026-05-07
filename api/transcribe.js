export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OpenAI APIキーが設定されていません' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];

    if (!boundary) return res.status(400).json({ error: 'boundary が見つかりません' });

    const boundaryBuffer = Buffer.from('--' + boundary);
    const parts = splitBuffer(buffer, boundaryBuffer);

    let audioBuffer = null;
    let audioFilename = 'audio.webm';

    for (const part of parts) {
      if (part.length === 0) continue;
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const header = part.slice(0, headerEnd).toString();
      if (!header.includes('name="audio"')) continue;
      const filenameMatch = header.match(/filename="([^"]+)"/);
      if (filenameMatch) audioFilename = filenameMatch[1];
      audioBuffer = part.slice(headerEnd + 4);
      if (audioBuffer.slice(-2).toString() === '\r\n') audioBuffer = audioBuffer.slice(0, -2);
      break;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: '音声データが見つかりません' });
    }

    const formData = new FormData();
    const mimeType = audioFilename.includes('mp4') ? 'audio/mp4' : 'audio/webm';
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', audioBlob, audioFilename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Whisper APIエラー' });

    return res.status(200).json({ text: data.text });

  } catch (err) {
    console.error('transcribe error:', err);
    return res.status(500).json({ error: err.message || '文字起こしエラー' });
  }
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0, pos = 0;
  while (pos < buffer.length) {
    let match = true;
    for (let i = 0; i < delimiter.length; i++) {
      if (buffer[pos + i] !== delimiter[i]) { match = false; break; }
    }
    if (match) {
      parts.push(buffer.slice(start, pos));
      start = pos + delimiter.length;
      pos = start;
    } else pos++;
  }
  parts.push(buffer.slice(start));
  return parts;
}

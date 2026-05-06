import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false,
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
    const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    const file = files.audio?.[0];

    if (!file) return res.status(400).json({ error: '音声ファイルがありません' });

    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.filepath), {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Whisperエラー' });

    return res.status(200).json({ text: data.text });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '文字起こしエラー: ' + err.message });
  }
}

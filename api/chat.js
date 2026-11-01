// Dosya Yolu: karar-kuresi/api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, agent, systemPrompt, history = [], tts = true } = req.body;

    // ANAHTARLAR (Vercel Environment Variables kısmından otomatik çekilir)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "BURAYA_GEMINI_API_KEY_YAZABILIRSIN";
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
    const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://norvex998.app.n8n.cloud/webhook/karar-kuresi";

    // SEÇENEK 1: Eğer n8n Webhook bağladıysan tüm işi n8n'e devret
    if (N8N_WEBHOOK_URL) {
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, agent, systemPrompt, history, tts })
      });
      const n8nData = await n8nResponse.json();
      return res.status(200).json(n8nData);
    }

    // SEÇENEK 2: Doğrudan Google Gemini 2.5 Flash ile Yanıt Üret
    const contents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: (systemPrompt || "Sen Karar Küresi yapay zeka asistanısın.") + " Türkçe, net ve akıcı yanıt ver." }]
        },
        contents
      })
    });

    const geminiJson = await geminiRes.json();
    const reply = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "Çekirdek yanıt üretemedi.";

    // SES SENTEZİ: ElevenLabs API Anahtarı varsa cevabı MP3 Base64 sese çevir
    let audioBase64 = null;
    if (tts && ELEVENLABS_API_KEY) {
      const cleanForSpeech = reply.replace(/```[\s\S]*?```/g, ' Kod bloğu ekranda hazır. ').replace(/[*#`_~]/g, '').slice(0, 900);
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: cleanForSpeech,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });

      if (elRes.ok) {
        const arrayBuffer = await elRes.arrayBuffer();
        audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      }
    }

    return res.status(200).json({ reply, agent, audioBase64 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
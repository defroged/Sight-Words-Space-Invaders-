// /api/generate-audio.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing API key' });
  }

  const { words } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const VOICE_ID = 'EkK5I93UQWFDigLMpZcX';
  const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const MODEL_ID = 'eleven_v3'; 
  const audioMap = {};

  try {
    for (const rawWord of words) {
      // --- FIX 1: Capitalize First Letter + Add Period ---
      // This forces the AI to use "Citation Form" (falling intonation).
      // "are" -> "Are."
      const cleanWord = rawWord.trim();
      const textToSpeak = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1) + ".";

      console.log(`Processing: "${rawWord}" -> TTS Payload: "${textToSpeak}"`);
      
      const response = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: textToSpeak, 
          model_id: MODEL_ID,
          voice_settings: {
            // --- FIX 2: High Stability for Clarity ---
            // 0.80 makes the voice consistent and clear (less "acting").
            stability: 1
           },
        }),
      });

      if (!response.ok) {
        console.error(`Failed: ${response.statusText}`);
        if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        continue; 
      }

      const audioBuffer = await response.arrayBuffer();
      audioMap[rawWord] = Buffer.from(audioBuffer).toString('base64');
      
      await new Promise(resolve => setTimeout(resolve, 250)); 
    }

    res.status(200).json(audioMap);

 } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
}



// /api/generate-audio.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API key' });
  }

  const { words } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Invalid request: "words" array is required.' });
  }

  const VOICE_ID = 'RILOU7YmBhvwJGDGjNmP';
  const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const MODEL_ID = 'eleven_multilingual_v2';
  const audioMap = {}; 

  try {
    for (const word of words) {
      // 1. Create the payload string first
      const textToSpeak = `- ${word} -`;

      // 2. Log the ACTUAL string being sent
      console.log(`Processing word: "${word}" -> Sending to TTS: "${textToSpeak}"`);
      
      const response = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: textToSpeak, // 3. Use the variable here
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.4,
            style: 0,
            similarity_boost: 0.40,
            use_speaker_boost: true,
            speed: 1
           },
        }),
      });

      if (!response.ok) {
        console.error(`Failed to fetch audio for "${word}": ${response.statusText}`);
        if (response.status === 429) {
          console.warn('Rate limit hit. Pausing for 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        continue; 
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
       audioMap[word] = base64Audio;
      
      await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    console.log('All audio processing complete.');
    res.status(200).json(audioMap);

 } catch (error) {
    console.error('Error fetching from ElevenLabs:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
}
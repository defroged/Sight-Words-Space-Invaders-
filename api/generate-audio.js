// /api/generate-audio.js

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Get the API key from environment variables
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API key' });
  }

  // 3. Get the list of words from the request body
  const { words } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Invalid request: "words" array is required.' });
  }

  const VOICE_ID = 'O4fnkotIypvedJqBp4yb';
  const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const MODEL_ID = 'eleven_multilingual_v2';
  const audioMap = {}; // Collect all results here

  try {
    // 4. Loop through each word *sequentially* (one by one)
    for (const word of words) {
      console.log(`Processing word: ${word}...`);
      
      const response = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: `${word} ...`,
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
        // Log the error and skip this word
        console.error(`Failed to fetch audio for "${word}": ${response.statusText}`);
        // If we *still* get a rate limit, the only thing to do is wait
        if (response.status === 429) {
          console.warn('Rate limit hit. Pausing for 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        continue; // Go to the next word
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
       audioMap[word] = base64Audio;
      
      // 5. Add a small, mandatory pause between each request
      // This is the safest way to respect the rate limit.
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms pause
    }

    // 6. After all words are processed, send the complete map
    console.log('All audio processing complete.');
    res.status(200).json(audioMap);

 } catch (error) {
    console.error('Error fetching from ElevenLabs:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
}
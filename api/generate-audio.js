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
  const MODEL_ID = 'eleven_v3';
  
  // --- NEW: Batching variables ---
  const BATCH_SIZE = 8; // Process 8 requests at a time
  const audioMap = {}; // Collect all results here

  try {
    // 4. Loop through the words in batches
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batchWords = words.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i / BATCH_SIZE + 1}... Words: ${batchWords.join(', ')}`);

      // 5. Create fetch promises just for this batch
      const fetchPromises = batchWords.map(async (word) => {
        const response = await fetch(ELEVENLABS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text: word,
            model_id: MODEL_ID,
            voice_settings: {
              stability: 1
            },
          }),
        });

        if (!response.ok) {
          // Log the error but don't stop the whole process
          console.error(`Failed to fetch audio for "${word}": ${response.statusText}`);
          return null;
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        return { word, base64Audio };
      });

      // 6. Wait for the *current batch* to complete
      const results = await Promise.all(fetchPromises);

      // 7. Assemble the results for this batch into the main map
      for (const result of results) {
        if (result) {
          audioMap[result.word] = result.base64Audio;
        }
      }
      // The loop will now continue to the next batch
    }

    // 8. After all batches are done, send the complete map
    res.status(200).json(audioMap);

  } catch (error) {
    console.error('Error fetching from ElevenLabs:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
}
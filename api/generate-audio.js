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

  // --- ElevenLabs Configuration ---
  // Using "Rachel" (21m00Tcm4TlvDq8ikWAM) as a clear, default voice.
  // You can find other voice IDs in your ElevenLabs "Voice Lab".
  const VOICE_ID = 'O4fnkotIypvedJqBp4yb';
   const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  // --- UPDATED MODEL ID ---
  const MODEL_ID = 'eleven_v3'; // Was 'eleven_monolingual_v1'

  try {
    // 4. Create a fetch promise for each word
    // We use Promise.all to run all requests in parallel for speed.
    const fetchPromises = words.map(async (word) => {
      const response = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg' // We'll request MP3 audio
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
        console.error(`Failed to fetch audio for "${word}": ${response.statusText}`);
        return null; // Return null so Promise.all doesn't reject
      }

      // 5. Get the audio data as an ArrayBuffer
      const audioBuffer = await response.arrayBuffer();
      // 6. Convert the binary audio data to Base64
      // This is necessary to send binary data inside a JSON response.
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      
      return { word, base64Audio };
    });

    // 7. Wait for all fetch requests to complete
    const results = await Promise.all(fetchPromises);

     // 8. Assemble the final JSON object (e.g., {"the": "base64data..."})
    const audioMap = {};
    for (const result of results) {
      if (result) { // Only add if the fetch was successful
        audioMap[result.word] = result.base64Audio;
       }
    }

    // 9. Send the map of word:base64data back to the client
    res.status(200).json(audioMap);

  } catch (error) {
    console.error('Error fetching from ElevenLabs:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
}
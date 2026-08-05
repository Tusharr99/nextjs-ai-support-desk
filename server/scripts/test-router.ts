import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { CohereClient } from 'cohere-ai';

async function testRouter() {
  const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });
  const prompt = `You are an intent classifier. Categorize the user's message into one of three intents:
- "SMALL_TALK": Greetings, casual conversation, who you are.
- "TECHNICAL_QUERY": Technical help, code examples related to Next.js/React.
- "OUT_OF_SCOPE": Unrelated to software development.
Respond with a JSON object in this format: {"intent": "..."}`;

  const messages = ["Hello, who built you?", "How to fetch data?", "Give me a pizza recipe"];

  for (const msg of messages) {
    try {
      const res = await cohere.chat({
        model: 'command-r-08-2024',
        message: msg,
        preamble: prompt,
        // @ts-ignore
        responseFormat: { type: 'json_object' }
      });
      console.log(`Msg: "${msg}" -> `, res.text);
    } catch (e) {
      console.error(e);
    }
  }
}

testRouter().catch(console.error);

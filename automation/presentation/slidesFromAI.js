/**
 * Generates structured slide content using Ollama
 */

import fetch from "node-fetch";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0";

export async function generateSlides(topic) {
  const prompt = `
Create a professional presentation structure.

Topic: ${topic}

Return STRICT JSON in this format:
{
  "title": "Presentation title",
  "slides": [
    {
      "heading": "Slide title",
      "points": ["point 1", "point 2"]
    }
  ]
}
`;

  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false
    })
  });

  const data = await res.json();

  return JSON.parse(data.response);
}


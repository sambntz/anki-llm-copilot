const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AGC_GENERATE") return false;

  generateContent(message.apiKey, message.prompt, message.provider)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function generateContent(apiKey, prompt, provider = "gemini") {
  if (provider === "groq") {
    return generateWithGroq(apiKey, prompt);
  }
  return generateWithGemini(apiKey, prompt);
}

async function generateWithGemini(apiKey, prompt) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini respondió ${response.status}: ${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!text) throw new Error("Gemini no devolvió contenido.");
  return text;
}

async function generateWithGroq(apiKey, prompt) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq respondió ${response.status}: ${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq no devolvió contenido.");
  return text;
}

// src/index.ts (Final Clean Code)

// Define the complete Env interface to include variables from wrangler.jsonc
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  DYNAMIC_ROUTE_NAME: string; 
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT: string = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  const requestBody: { messages?: ChatMessage[] } = await request.json().catch(() => ({}));
  let messages: ChatMessage[] = requestBody.messages || [];

  if (!messages.some((msg) => msg.role === 'system')) {
    messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }
  
  // --- 1. CONSTRUCT THE UNIFIED GATEWAY URL using injected env variables ---
  // THIS IS THE KEY FIX: It uses env variables to build the URL securely.
  const GATEWAY_BASE_URL: string = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/compat/chat/completions`;

  const payload = {
    "model": `dynamic/${env.DYNAMIC_ROUTE_NAME}`, 
    "messages": messages,
    "max_tokens": 1024,
    "stream": true, 
    "metadata": {
        "source": "website_frontend",
        "user_tier": "pro" 
    }
  };

  // --- 2. EXECUTE THE FETCH CALL TO THE AI GATEWAY ---
  try {
    const aiResponse = await fetch(GATEWAY_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // --- 3. HANDLE ERRORS AND STREAM RESPONSE ---
    if (!aiResponse.ok) {
      // Log the exact error response from the upstream model/gateway for debugging
      const errorDetails = await aiResponse.text();
      console.error('AI Gateway Error:', aiResponse.status, errorDetails);
      // Return a generic 500 error to the client
      return new Response(
        JSON.stringify({ error: `AI service failed. Check Gateway logs (Error: ${aiResponse.status})` }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    
    return aiResponse;

  } catch (error) {
    console.error("Worker Connection Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal service error during connection." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

// Main Worker Handler Export
const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    
    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }
      return new Response("Method not allowed", { status: 405 });
    }
    
    return new Response("Not found", { status: 404 });
  }
};

export default worker;

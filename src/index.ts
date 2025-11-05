// src/index.ts

// --- Define Environment Interface for Type Safety ---
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  // Variables injected from wrangler.jsonc [vars]
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  DYNAMIC_ROUTE_NAME: string; 
  // Secret injected from wrangler.jsonc [secrets]
  OPENAI_API_KEY: string; 
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
  
  // --- 1. CONSTRUCT THE UNIFIED GATEWAY URL ---
  // Uses the 'compat' endpoint with injected IDs for multi-provider routing.
  const GATEWAY_BASE_URL: string = 
    `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/compat/chat/completions`;

  const payload = {
    // This tells the Gateway to execute the routing logic defined in the dashboard.
    "model": `dynamic/${env.DYNAMIC_ROUTE_NAME}`, 
    "messages": messages,
    "max_tokens": 1024,
    "stream": true, 
  };

  // --- 2. EXECUTE THE FETCH CALL WITH AUTHENTICATION ---
  try {
    const aiResponse = await fetch(GATEWAY_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // CRITICAL FIX: Passing the OpenAI API key securely via the Authorization header.
        // The Gateway uses this key to authenticate with OpenAI when the route dictates.
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // --- 3. HANDLE ERRORS AND STREAM RESPONSE ---
    if (!aiResponse.ok) {
      const errorDetails = await aiResponse.text();
      console.error('AI Gateway Error:', aiResponse.status, errorDetails);
      
      // The developer should review the log to see the actual 401/429 error from OpenAI
      return new Response(
        JSON.stringify({ error: `AI service failed. Status: ${aiResponse.status}. Check Gateway logs.` }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    
    // Return the response stream to the client
    return aiResponse;

  } catch (error) {
    console.error("Worker Connection Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal service error during connection." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

// --- Main Worker Handler Export ---
const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route logic for static assets vs. the chat API
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

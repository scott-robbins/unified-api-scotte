// src/index.ts (Final Code with Hardcoded IDs)

// --- 1. Define Environment Interface and Constants ---
// NOTE: We are hardcoding the IDs and Route Name directly into the URL/payload
// for simplicity, as requested, bypassing the 'env' injection for these values.
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  // CLOUDFLARE_AI_TOKEN?: string; // Optional token for authenticated Gateway
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT: string = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

// HARDCODED VALUES:
const ACCOUNT_ID: string = "3746ba19913534b7653b8af6a1299286";
const GATEWAY_NAME: string = "unified-api-gw";
const DYNAMIC_ROUTE_NAME: string = "hybrid_split"; 
// The full Unified API URL structure:
const GATEWAY_BASE_URL: string = `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/${GATEWAY_NAME}/compat/chat/completions`;

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  const requestBody: { messages?: ChatMessage[] } = await request.json().catch(() => ({}));
  let messages: ChatMessage[] = requestBody.messages || [];

  if (!messages.some((msg) => msg.role === 'system')) {
    messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }
  
  // --- 2. CONSTRUCT THE UNIFIED PAYLOAD ---
  const payload = {
    // The 'model' field directs the request to your specific Dynamic Route configuration
    "model": `dynamic/${DYNAMIC_ROUTE_NAME}`, 
    "messages": messages,
    "max_tokens": 1024,
    "stream": true, 
    
    // Optional: Metadata for routing or logging 
    "metadata": {
        "source": "website_frontend",
        "user_tier": "pro" 
    }
  };

  // --- 3. EXECUTE THE FETCH CALL TO THE AI GATEWAY ---
  try {
    const aiResponse = await fetch(GATEWAY_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'cf-aig-authorization': `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, 
      },
      body: JSON.stringify(payload),
    });

    // --- 4. HANDLE ERRORS AND STREAM RESPONSE ---
    if (!aiResponse.ok) {
      const errorDetails = await aiResponse.text();
      console.error('AI Gateway Error:', aiResponse.status, errorDetails);
      return new Response(
        JSON.stringify({ error: `AI service failed: ${aiResponse.statusText}. Check Gateway logs for details.` }),
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

// --- 5. Main Worker Handler Export ---
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

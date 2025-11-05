// src/index.js (Modified for Unified API / Dynamic Routing)

// The model ID is no longer a Workers AI specific binding but a pointer to our Dynamic Route.
// NOTE: These values must be defined in your wrangler.toml [vars] section.
// (We assume they are available via env.DYNAMIC_ROUTE_NAME and env.AI_GATEWAY_URL)
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

var index_default = {
  /**
   * Main request handler for the Worker
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // [ORIGINAL ROUTING LOGIC REMAINS]
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

async function handleChatRequest(request, env) {
  // Ensure the request body is valid JSON and retrieve the messages array
  const { messages = [] } = await request.json().catch(() => ({ messages: [] }));

  if (!messages.some((msg) => msg.role === "system")) {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  // --- 1. CONSTRUCT THE UNIFIED GATEWAY URL ---
  // We use the 'compat' endpoint for multi-provider Dynamic Routing.
  // The full URL structure is: BASE_URL/v1/{account_id}/{gateway_id}/compat/chat/completions
  const GATEWAY_BASE_URL = `https://gateway.ai.cloudflare.com/v1/3746ba19913534b7653b8af6a1299286/unified-api-gw/compat/chat/completions`;

  // --- 2. CONSTRUCT THE UNIFIED PAYLOAD ---
  const payload = {
    // We send the Dynamic Route name in the 'model' field.
    // The Gateway reads this name and executes the routing logic defined in the dashboard.
    "model": `dynamic/hybrid_split`, 
    "messages": messages,
    "max_tokens": 1024,
    "stream": true, // Enable streaming for better UX
    
    // Optional: Add custom metadata for routing/logging
    "metadata": {
        "source": "website_frontend",
        "user_tier": "pro" 
    }
  };

  // --- 3. EXECUTE THE FETCH CALL ---
  try {
    const aiResponse = await fetch(GATEWAY_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // If your Gateway requires a Cloudflare token (Authenticated Gateway), include it here
        // 'cf-aig-authorization': `Bearer hXVRn5aqz6r_VvVGDCsf_pC7pLPSsSAN9r2eVyMt`, 
      },
      body: JSON.stringify(payload),
    });

    // --- 4. HANDLE ERRORS AND STREAM RESPONSE ---
    if (!aiResponse.ok) {
      // The AI Gateway/model returned a non-200 status
      const errorDetails = await aiResponse.text();
      console.error('AI Gateway Error:', errorDetails);
      return new Response(
        JSON.stringify({ error: "AI service failed: " + aiResponse.statusText }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    
    // Return the streaming response directly to the client
    return aiResponse;

  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to Gateway." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

// Retain original exports for Worker environment
export {
  index_default as default
};

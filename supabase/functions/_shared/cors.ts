// A browser asks first (an OPTIONS request) whether a page of another address may call a function, and
// drops the real request unless the answer carries these headers. The functions that the web app
// calls answer with them; the ones called by a scheduler or by a calendar app do not need to.
// Any address may call: what protects a function is the caller's sign-in token, not where the page came from.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The answer to the browser's question, or undefined when `request` is a real request. */
export const preflight = (request: Request): Response | undefined =>
  request.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders }) : undefined;

/** A JSON answer that a browser on another address is allowed to read. */
export const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: corsHeaders });

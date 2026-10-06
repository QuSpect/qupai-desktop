// An OpenAI-compatible chat completions endpoint (as QuPai's "custom" model service calls one)
// that plays a fixed turn: it asks for one Bash command, then answers once the result is back.
// A request without tools (a conversation's title) gets a short text. It keeps what it was sent.
import { createServer } from "node:http";

export function fakeModel({ port, command }) {
  const seen = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    seen.push(body);
    const last = body.messages?.at(-1);
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    const chunk = (choice) => ({ id: "chatcmpl-smoke", object: "chat.completion.chunk", created: 0, model: body.model, choices: choice ? [choice] : [], ...(choice ? {} : { usage }) });
    const toolCall = body.tools?.length && last?.role !== "tool";
    const text = last?.role === "tool" ? "Done: the file is written." : "Windows smoke";
    const chunks = toolCall
      ? [chunk({ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_smoke", type: "function", function: { name: "Bash", arguments: JSON.stringify({ command, description: "Write the file" }) } }] }, finish_reason: null }),
         chunk({ index: 0, delta: {}, finish_reason: "tool_calls" }), chunk(null)]
      : [chunk({ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }), chunk({ index: 0, delta: {}, finish_reason: "stop" }), chunk(null)];
    if (!body.stream) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id: "chatcmpl-smoke", object: "chat.completion", created: 0, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage }));
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, seen })));
}

/** One conversation in a folder, one message, and the turn's end (or its wait for an approval). */
export async function turnInFolder(origin, token, folder, text = "Write the file, please.") {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const call = async (method, path, body) => {
    const r = await fetch(`${origin}${path}`, { method, headers: h, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const product = (await call("GET", "/v1/products")).items[0];
  const thread = await call("POST", "/v1/threads", { product_id: product.product_id, agent_id: product.agents[0].id, title: "Windows smoke", folder });
  const turn = await call("POST", `/v1/threads/${thread.id}/turns`, { input: { text } });
  for (let i = 0; i < 240; i++) {
    const now = await call("GET", `/v1/turns/${turn.id}`);
    if (["succeeded", "failed", "cancelled", "awaiting_approval"].includes(now.status)) return now;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the turn did not end in 2 minutes");
}

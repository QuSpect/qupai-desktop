// An OpenAI-compatible chat completions endpoint (as QuPai's "custom" model service calls one)
// that plays a fixed turn: it asks for one Bash command, or to Read the PDF when the message names
// it, then answers once the result is back. A request without tools (a conversation's title) gets
// a short text. It keeps what it was sent.
import { createServer } from "node:http";

export const PDF_NAME = "paper.pdf";

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
    const text = last?.role === "tool" ? "Done." : "Windows smoke";
    const call = JSON.stringify(last?.content ?? "").includes(PDF_NAME)
      ? { name: "Read", arguments: JSON.stringify({ file_path: PDF_NAME }) }
      : { name: "Bash", arguments: JSON.stringify({ command, description: "Write the file" }) };
    const chunks = toolCall
      ? [chunk({ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_smoke", type: "function", function: call }] }, finish_reason: null }),
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

const api = (origin, token) => async (method, path, body) => {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const r = await fetch(`${origin}${path}`, { method, headers: h, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

/** One conversation in a folder, one message, and the turn's end (or its wait for an approval). */
export async function turnInFolder(origin, token, folder, text = "Write the file, please.") {
  const call = api(origin, token);
  const product = (await call("GET", "/v1/products")).items[0];
  const thread = await call("POST", "/v1/threads", { product_id: product.product_id, agent_id: product.agents[0].id, title: "Windows smoke", folder });
  return { ...(await nextTurn(origin, token, thread.id, text)), thread_id: thread.id };
}

/** One more message in a conversation, and the turn's end (or its wait for an approval). */
export async function nextTurn(origin, token, threadId, text) {
  const call = api(origin, token);
  const turn = await call("POST", `/v1/threads/${threadId}/turns`, { input: { text } });
  for (let i = 0; i < 240; i++) {
    const now = await call("GET", `/v1/turns/${turn.id}`);
    if (["succeeded", "failed", "cancelled", "awaiting_approval"].includes(now.status)) return now;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the turn did not end in 2 minutes");
}

/** A one-page PDF with a text layer: the line given, in Helvetica. */
export function tinyPdf(line) {
  const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

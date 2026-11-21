// AI Engine server: অনেক provider-এর জন্য একটাই gateway।
// কোনো dependency লাগে না। Node 18+ হলেই চলবে।

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const PROVIDERS = require("./providers");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1"; // পাবলিক বা LAN সার্ভারে 0.0.0.0 দিন
const PUBLIC_DIR = path.join(__dirname, "public");
const ALLOW_PAID_ON_SERVER_KEY = process.env.ALLOW_PAID_ON_SERVER_KEY === "true";
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 20);
const LOOPBACK = ["127.0.0.1", "localhost", "::1"].includes(HOST);
const ALLOW_CUSTOM = process.env.ALLOW_CUSTOM ? process.env.ALLOW_CUSTOM === "true" : LOOPBACK;
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
const envName = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
const serverKey = (p) => process.env[envName(p.id)] || "";

// ---------- CORS (file://, localhost, LAN same-host, মোবাইল অ্যাপ WebView) ----------
function originAllowed(origin, req) {
  if (!origin) return true;
  if (origin === "null" || origin === "capacitor://localhost" || origin === "ionic://localhost") return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return true;
  // Same-host origin ফিক্স: LAN ব্রাউজার থেকে http://<LAN-IP>:3000 ওপেন করলে 403 ব্লক হবে না
  if (req && req.headers && req.headers.host) {
    try {
      const u = new URL(origin);
      // শুধু IP-literal হোস্ট (LAN); ডোমেইন নাম বাদ, যাতে DNS-rebinding না চলে
      const ipHost = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(String(req.headers.host));
      if (ipHost && (u.protocol === "http:" || u.protocol === "https:") && u.host.toLowerCase() === String(req.headers.host).toLowerCase()) {
        return true;
      }
    } catch {}
  }
  return EXTRA_ORIGINS.includes(origin);
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin, req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-key, x-provider, x-lang");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
}

// ---------- helpers ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Request too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function fetchTimeout(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

// provider সমাধান: নির্ধারিত provider (+ অঞ্চল প্রান্ত) অথবা custom (client থেকে base URL)
function resolveProvider(id, baseFromClient, regionId) {
  if (byId[id]) {
    const p = byId[id];
    const override = process.env[envName(id).replace(/_API_KEY$/, "_BASE_URL")];
    let resolvedBase = p.base;
    if (override) {
      resolvedBase = override;
    } else if (regionId && Array.isArray(p.regions)) {
      const reg = p.regions.find((r) => r.id === regionId);
      if (reg) resolvedBase = reg.base;
    }
    return { ...p, base: resolvedBase };
  }
  if (typeof id === "string" && id.startsWith("custom:")) {
    if (!ALLOW_CUSTOM) return { error: "এই সার্ভারে Custom provider বন্ধ আছে (ALLOW_CUSTOM=true দিন)।" };
    let u;
    try { u = new URL(baseFromClient); } catch { return { error: "Custom provider-এর base URL ঠিক নেই।" }; }
    if (!["http:", "https:"].includes(u.protocol)) return { error: "শুধু http/https URL চলবে।" };
    return { id, name: "Custom", base: baseFromClient.replace(/\/+$/, ""), list: "live", custom: true };
  }
  return { error: "অজানা provider: " + id };
}

// ---------- মডেল লিস্ট ----------
const cache = new Map();
const NON_CHAT = /embed|whisper|tts|speech|transcri|moderation|rerank|dall-e|image|diffusion|sdxl|flux|audio|video|ocr/i;

function isOpenCodeFreeModel(mOrId) {
  if (typeof mOrId === "object" && mOrId) {
    if (mOrId.free === true) return true;
    const p = mOrId.pricing;
    if (p && Number(p.prompt) === 0 && Number(p.completion) === 0) return true;
    mOrId = mOrId.id || "";
  }
  const id = String(mOrId || "").toLowerCase();
  return /-free$/.test(id) || /:free$/.test(id) || id === "big-pickle" || id === "gpt-5-nano";
}

function normalizeOpenRouter(m) {
  const prompt = parseFloat(m.pricing && m.pricing.prompt) || 0;
  const completion = parseFloat(m.pricing && m.pricing.completion) || 0;
  const free = m.id.endsWith(":free") || (prompt === 0 && completion === 0);
  return {
    id: m.id, name: m.name || m.id, free, freeKind: "exact",
    group: m.id.split("/")[0],
    promptPerM: prompt * 1e6, completionPerM: completion * 1e6,
    context: m.context_length || null,
    inputs: (m.architecture && m.architecture.input_modalities) || ["text"],
  };
}

function normalizeOpenCode(m) {
  const id = String(m.id).replace(/^opencode\//, "");
  const free = isOpenCodeFreeModel(m);
  const group = m.owned_by || (id.includes("-") ? id.split("-")[0] : "opencode");
  return {
    id,
    name: m.display_name || m.name || id,
    free,
    freeKind: "exact",
    group,
    promptPerM: null,
    completionPerM: null,
    context: m.context_length || m.context_window || null,
    inputs: ["text"],
  };
}

function normalizeGeneric(p, m) {
  const id = String(m.id).replace(/^models\//, "");
  return {
    id, name: m.display_name || m.name || id,
    free: Boolean(p.freeTier), freeKind: p.local ? "local" : p.freeTier ? "tier" : p.custom ? "unknown" : "none",
    group: id.includes("/") ? id.split("/")[0] : null,
    promptPerM: null, completionPerM: null,
    context: m.context_length || m.context_window || null,
    inputs: ["text"],
  };
}
const sortModels = (l) => l.sort((a, b) => a.name.localeCompare(b.name));
const staticList = (p) => sortModels((p.models || []).map((m) => (p.list === "opencode" ? normalizeOpenCode(m) : normalizeGeneric(p, m))));

async function listModels(p, key) {
  if (p.list === "static") return { source: "static", models: staticList(p) };
  const ck = [p.id, p.base, crypto.createHash("sha256").update(key || "").digest("hex").slice(0, 10)].join("|");
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;

  try {
    const auth = key || (p.id === "opencode" ? "public" : "");
    const headers = auth ? (p.id === "anthropic" ? { "x-api-key": auth, "anthropic-version": "2023-06-01" } : { Authorization: "Bearer " + auth }) : {};
    const r = await fetchTimeout(p.base.replace(/\/+$/, "") + "/models", { headers }, 12000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const arr = (Array.isArray(j) ? j : j.data || j.models || []).map((m) => (typeof m === "string" ? { id: m } : m)).filter((m) => m && m.id);
    let models;
    if (p.list === "openrouter") {
      models = arr.filter((m) => { const o = m.architecture && m.architecture.output_modalities; return !o || o.includes("text"); }).map(normalizeOpenRouter);
    } else if (p.list === "opencode") {
      models = arr.filter((m) => !NON_CHAT.test(String(m.id))).map(normalizeOpenCode);
    } else {
      models = arr.filter((m) => !NON_CHAT.test(String(m.id))).map((m) => normalizeGeneric(p, m));
    }
    if (!models.length) throw new Error("খালি লিস্ট");
    const data = { source: "live", models: sortModels(models) };
    cache.set(ck, { at: Date.now(), data });
    return data;
  } catch (e) {
    if (p.models) return { source: "static", models: staticList(p), note: "লাইভ লিস্ট আনা যায়নি (" + e.message + "), তাই সংরক্ষিত লিস্ট দেখানো হচ্ছে।" };
    const needsKey = !key && !p.local && !p.publicList;
    return { source: "none", models: [], note: needsKey ? "মডেল লিস্ট দেখতে এই provider-এর API key দিন।" : "মডেল লিস্ট আনা যায়নি (" + e.message + "). নিচে মডেলের ID হাতে লিখেও ব্যবহার করতে পারেন।" };
  }
}

// ---------- OpenCode Zen Multi-Protocol Helper ----------
function openCodeProtocol(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (/^(claude-|qwen3)/.test(id)) return "anthropic";
  if (/^gemini-/.test(id)) return "google";
  if (/^(gpt-|grok-4|muse-|o1|o3|o4)/.test(id)) return "responses";
  return "openai";
}

function flattenText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "string" ? c : c.text || "")).filter(Boolean).join("\n");
  }
  return String(content || "");
}

function writeSseDelta(res, delta) {
  res.write("data: " + JSON.stringify({ choices: [{ delta }] }) + "\n\n");
}

async function pipeTranslatedSSE(upstream, res, mode) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      buf += dec.decode(step.value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const raw of lines) {
        const ln = raw.trim();
        if (!ln.startsWith("data:")) continue;
        const data = ln.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let obj;
        try { obj = JSON.parse(data); } catch { continue; }
        if (mode === "anthropic") {
          if (obj.type === "content_block_delta" && obj.delta) {
            if (obj.delta.type === "text_delta" && obj.delta.text) writeSseDelta(res, { content: obj.delta.text });
            if (obj.delta.type === "thinking_delta" && obj.delta.thinking) writeSseDelta(res, { reasoning: obj.delta.thinking });
          } else if (obj.type === "error" && obj.error) {
            res.write("data: " + JSON.stringify({ error: obj.error }) + "\n\n");
          }
        } else if (mode === "google") {
          const parts = obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts;
          if (Array.isArray(parts)) {
            for (const pt of parts) {
              if (pt.thought && pt.text) writeSseDelta(res, { reasoning: pt.text });
              else if (pt.text) writeSseDelta(res, { content: pt.text });
            }
          }
        } else if (mode === "responses") {
          if (obj.type === "response.output_text.delta" && obj.delta) writeSseDelta(res, { content: obj.delta });
          else if ((obj.type === "response.reasoning_summary_text.delta" || obj.type === "response.reasoning.delta") && obj.delta) writeSseDelta(res, { reasoning: obj.delta });
          else if (obj.type === "error" && obj.error) res.write("data: " + JSON.stringify({ error: obj.error }) + "\n\n");
        }
      }
    }
    res.write("data: [DONE]\n\n");
  } catch {
    // aborted or closed by client
  } finally {
    try { res.end(); } catch {}
  }
}

// ---------- rate limit (শুধু সার্ভারের key ব্যবহার হলে) ----------
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

// ---------- /api/chat ----------

// ---------- /api/relay: ব্যবহারকারীর নিজের সাইটে (WordPress/Shopify/Wix) ড্রাফট/পাবলিশ ----------
// ব্রাউজারের CORS এড়াতে সার্ভার রিকোয়েস্ট ফরওয়ার্ড করে। ক্রেডেনশিয়াল সংরক্ষণ/লগ হয় না।
// ডিফল্টে শুধু লোকাল (loopback) সার্ভারে সব https হোস্ট; পাবলিক সার্ভারে শুধু Shopify ও Wix হোস্ট।
const RELAY_HEADERS = ["authorization", "content-type", "accept", "x-shopify-access-token", "wix-site-id"];
async function handleRelay(req, res) {
  let b;
  try { b = JSON.parse(await readBody(req, 3 * 1024 * 1024)); } catch { return sendJson(res, 400, { error: { message: "Invalid JSON body" } }); }
  let u;
  try { u = new URL(String(b.url || "")); } catch { return sendJson(res, 400, { error: { message: "Invalid URL" } }); }
  const host = u.hostname.toLowerCase();
  const isLoop = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const known = host.endsWith(".myshopify.com") || host === "www.wixapis.com";
  if (!(u.protocol === "https:" || (u.protocol === "http:" && isLoop))) return sendJson(res, 400, { error: { message: "শুধু https সাইট সমর্থিত" } });
  if (!ALLOW_CUSTOM && !known) return sendJson(res, 403, { error: { message: "এই সার্ভারে নিজস্ব সাইটে রিকোয়েস্ট বন্ধ (ALLOW_CUSTOM=true দিন)" } });
  const method = String(b.method || "POST").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) return sendJson(res, 400, { error: { message: "Method not allowed" } });
  const headers = {};
  Object.entries(b.headers || {}).forEach(([k, v]) => { if (RELAY_HEADERS.includes(k.toLowerCase())) headers[k] = String(v); });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(u.href, { method, headers, body: method === "GET" ? undefined : (typeof b.body === "string" ? b.body : JSON.stringify(b.body || {})), redirect: "manual", signal: ctl.signal });
    const text = (await r.text()).slice(0, 2 * 1024 * 1024);
    return sendJson(res, 200, { status: r.status, body: text });
  } catch (e) {
    return sendJson(res, 502, { error: { message: "সাইটে পৌঁছানো যায়নি: " + (e.name === "AbortError" ? "timeout" : e.message) } });
  } finally { clearTimeout(t); }
}

// ---------- /api/transcribe: মাইক রেকর্ডিং → Whisper (Groq বা OpenAI), ইউজারের নিজের key দিয়ে ----------
async function handleTranscribe(req, res) {
  const provider = String(req.headers["x-provider"] || "groq");
  const cfg = { groq: ["https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3-turbo"], openai: ["https://api.openai.com/v1/audio/transcriptions", "whisper-1"] }[provider];
  const key = String(req.headers["x-user-key"] || "").trim() || (byId[provider] ? serverKey(byId[provider]) : "");
  if (!cfg) return sendJson(res, 400, { error: { message: "provider must be groq or openai" } });
  if (!key) return sendJson(res, 401, { error: { message: provider + " API key লাগবে" } });
  let buf;
  try { buf = await readBodyBuffer(req, 12 * 1024 * 1024); } catch { return sendJson(res, 413, { error: { message: "Audio too large" } }); }
  const type = String(req.headers["content-type"] || "audio/webm").split(";")[0];
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), "audio." + (type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"));
  form.append("model", cfg[1]);
  const lang = String(req.headers["x-lang"] || "").slice(0, 2);
  if (/^[a-z]{2}$/.test(lang)) form.append("language", lang);
  try {
    const r = await fetch(cfg[0], { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
    const t = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(t);
  } catch (e) { return sendJson(res, 502, { error: { message: "Transcription failed: " + e.message } }); }
}
function readBodyBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("big")); req.destroy(); return; } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: { message: "Invalid JSON body" } }); }
  const { provider, base, region, model, messages, temperature, max_tokens } = body || {};
  if (typeof model !== "string" || !Array.isArray(messages) || !messages.length) {
    return sendJson(res, 400, { error: { message: "provider, model এবং messages লাগবে" } });
  }
  const p = resolveProvider(provider, base, region);
  if (p.error) return sendJson(res, 400, { error: { message: p.error } });

  const userKey = String(req.headers["x-user-key"] || "").trim();
  let key = userKey || serverKey(p);

  // OpenCode Zen ফ্রি মডেল হলে key ছাড়াও "public" টোকেনে চলবে
  const opencodePublicFree = p.id === "opencode" && !key && isOpenCodeFreeModel(model);
  if (opencodePublicFree) key = "public";

  if (!key && !p.local && !p.custom) {
    return sendJson(res, 401, { error: { message: p.name + "-এর API key নেই। Settings বা মডেল-পিকারে key দিন।" } });
  }

  // সার্ভারের key ব্যবহার হলে খরচ ও অপব্যবহার ঠেকানো
  if (!userKey && key && !opencodePublicFree) {
    if (limited(req.socket.remoteAddress || "unknown")) {
      return sendJson(res, 429, { error: { message: "অনেক বেশি রিকোয়েস্ট। একটু পরে চেষ্টা করুন।" } });
    }
    if (!ALLOW_PAID_ON_SERVER_KEY && !p.local) {
      let ok = false;
      if (p.id === "openrouter") {
        const l = await listModels(p, "").catch(() => ({ models: [] }));
        const m = l.models.find((x) => x.id === model);
        ok = Boolean(m && m.free);
      } else if (p.id === "opencode") {
        ok = isOpenCodeFreeModel(model);
      }
      if (!ok) return sendJson(res, 403, { error: { message: "এই সার্ভারের key দিয়ে শুধু ফ্রি মডেল চলে। চালাতে নিজের API key দিন।" } });
    }
  }

  const controller = new AbortController();
  res.on("close", () => { if (!res.writableFinished) controller.abort(); });

  const cleanBase = p.base.replace(/\/+$/, "");

  // Direct Anthropic (/v1/messages) routing
  if (p.id === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").map((m) => flattenText(m.content)).join("\n");
    const conv = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: flattenText(m.content) }));
    const aBody = { model, max_tokens: Number.isFinite(max_tokens) && max_tokens > 0 ? Math.floor(max_tokens) : 4096, messages: conv, stream: true };
    if (sys) aBody.system = sys;
    if (typeof temperature === "number") aBody.temperature = temperature;
    let upstream;
    try {
      upstream = await fetch(cleanBase + "/messages", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(aBody),
      });
    } catch (e) { return sendJson(res, 502, { error: { message: p.name + "-এ পৌঁছানো যায়নি: " + e.message } }); }
    if (!upstream.ok) { const t = await upstream.text(); res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" }); return res.end(t); }
    return await pipeTranslatedSSE(upstream, res, "anthropic");
  }

  // OpenCode Zen multi-protocol routing (GPT /responses, Claude+Qwen3 /messages, Gemini /models/:streamGenerateContent, অন্য সব /chat/completions)
  if (p.id === "opencode") {
    const proto = openCodeProtocol(model);
    if (proto === "anthropic") {
      const sys = messages.filter((m) => m.role === "system").map((m) => flattenText(m.content)).join("\n");
      const conv = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: flattenText(m.content) }));
      const aBody = { model, max_tokens: Number.isFinite(max_tokens) && max_tokens > 0 ? Math.floor(max_tokens) : 4096, messages: conv, stream: true };
      if (sys) aBody.system = sys;
      if (typeof temperature === "number") aBody.temperature = temperature;
      let upstream;
      try {
        upstream = await fetch(cleanBase + "/messages", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-api-key": key, Authorization: "Bearer " + key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(aBody),
        });
      } catch (e) { return sendJson(res, 502, { error: { message: p.name + "-এ পৌঁছানো যায়নি: " + e.message } }); }
      if (!upstream.ok) { const t = await upstream.text(); res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" }); return res.end(t); }
      return await pipeTranslatedSSE(upstream, res, "anthropic");
    }

    if (proto === "google") {
      const sys = messages.filter((m) => m.role === "system").map((m) => flattenText(m.content)).join("\n");
      const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: flattenText(m.content) }] }));
      const gBody = { contents };
      if (sys) gBody.systemInstruction = { parts: [{ text: sys }] };
      if (typeof temperature === "number" || (Number.isFinite(max_tokens) && max_tokens > 0)) {
        gBody.generationConfig = {};
        if (typeof temperature === "number") gBody.generationConfig.temperature = temperature;
        if (Number.isFinite(max_tokens) && max_tokens > 0) gBody.generationConfig.maxOutputTokens = Math.floor(max_tokens);
      }
      let upstream;
      try {
        upstream = await fetch(cleanBase + "/models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key, Authorization: "Bearer " + key },
          body: JSON.stringify(gBody),
        });
      } catch (e) { return sendJson(res, 502, { error: { message: p.name + "-এ পৌঁছানো যায়নি: " + e.message } }); }
      if (!upstream.ok) { const t = await upstream.text(); res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" }); return res.end(t); }
      return await pipeTranslatedSSE(upstream, res, "google");
    }

    if (proto === "responses") {
      const sys = messages.filter((m) => m.role === "system").map((m) => flattenText(m.content)).join("\n");
      const input = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: flattenText(m.content) }));
      const rBody = { model, input, stream: true };
      if (sys) rBody.instructions = sys;
      if (typeof temperature === "number") rBody.temperature = temperature;
      if (Number.isFinite(max_tokens) && max_tokens > 0) rBody.max_output_tokens = Math.floor(max_tokens);
      let upstream;
      try {
        upstream = await fetch(cleanBase + "/responses", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify(rBody),
        });
      } catch (e) { return sendJson(res, 502, { error: { message: p.name + "-এ পৌঁছানো যায়নি: " + e.message } }); }
      if (!upstream.ok) { const t = await upstream.text(); res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" }); return res.end(t); }
      return await pipeTranslatedSSE(upstream, res, "responses");
    }
  }

  // Standard OpenAI-compatible /chat/completions
  const payload = { model, messages, stream: true };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (Number.isFinite(max_tokens) && max_tokens > 0) payload.max_tokens = Math.floor(max_tokens);

  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = "Bearer " + key;
  if (p.id === "openrouter") { headers["HTTP-Referer"] = "http://localhost"; headers["X-Title"] = "AI Engine"; }

  let upstream;
  try {
    upstream = await fetch(cleanBase + "/chat/completions", {
      method: "POST", signal: controller.signal, headers, body: JSON.stringify(payload),
    });
  } catch (e) {
    return sendJson(res, 502, { error: { message: p.name + "-এ পৌঁছানো যায়নি: " + e.message } });
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(text);
  }
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const stream = Readable.fromWeb(upstream.body);
  stream.on("error", () => { try { res.end(); } catch {} });
  stream.pipe(res);
}

// ---------- static files ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split("?")[0]); } catch { res.writeHead(400); return res.end("Bad request"); }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.headers.origin && !originAllowed(req.headers.origin, req) && req.url.startsWith("/api/")) {
      return sendJson(res, 403, { error: { message: "এই origin-এর অনুমতি নেই" } });
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(res, 200, {
        allowCustom: ALLOW_CUSTOM,
        paidOnServerKey: ALLOW_PAID_ON_SERVER_KEY,
        providers: PROVIDERS.map((p) => ({
          id: p.id, name: p.name, aliases: p.aliases || [], colors: p.colors,
          freeTier: Boolean(p.freeTier), local: Boolean(p.local), verified: Boolean(p.verified),
          publicFreeChat: Boolean(p.publicFreeChat),
          info: p.info || "", regions: p.regions || null,
          keyUrl: p.keyUrl, serverKey: Boolean(serverKey(p)), publicList: Boolean(p.publicList),
        })),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      const p = resolveProvider(url.searchParams.get("provider"), url.searchParams.get("base"), url.searchParams.get("region"));
      if (p.error) return sendJson(res, 400, { error: { message: p.error } });
      const key = String(req.headers["x-user-key"] || "").trim() || serverKey(p);
      return sendJson(res, 200, await listModels(p, key));
    }
    if (req.method === "POST" && url.pathname === "/api/chat") return await handleChat(req, res);
    if (req.method === "POST" && url.pathname === "/api/relay") return await handleRelay(req, res);
    if (req.method === "POST" && url.pathname === "/api/transcribe") return await handleTranscribe(req, res);
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405);
    res.end("Method not allowed");
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: { message: e.message } });
    else res.end();
  }
});

function startServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const addr = server.address();
      resolve(addr && typeof addr === "object" ? addr.port : port);
    });
  });
}

if (require.main === module) {
  startServer(PORT, HOST).then((p) => {
    console.log("AI Engine চালু: http://" + (HOST === "0.0.0.0" ? "localhost" : HOST) + ":" + p);
    console.log("Provider: " + PROVIDERS.length + " টি | Custom provider: " + (ALLOW_CUSTOM ? "চালু" : "বন্ধ"));
  });
}
module.exports = { server, startServer, originAllowed };

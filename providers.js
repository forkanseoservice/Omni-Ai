// Provider registry. প্রতিটি provider OpenAI-compatible (/chat/completions) অথবা
// OpenCode Zen (multi-protocol: /chat/completions, /responses, /messages, /models) সমর্থন করে।
//
// list:
//   "openrouter" -> OpenRouter ফরম্যাট (মডেল-ভিত্তিক সঠিক FREE/PAID প্রাইসিংসহ)
//   "opencode"   -> OpenCode Zen ফরম্যাট (সব ফ্রি + পেইড মডেল, /zen/v1/models থেকে লাইভ)
//   "live"       -> GET {base}/models থেকে লাইভ লিস্ট (ব্যর্থ হলে `models` fallback)
//   "static"     -> নিচের `models` লিস্টই দেখানো হয়
// verified: ডক্স থেকে base URL যাচাই করা হয়েছে কি না (false হলে UI-তে "যাচাই হয়নি" নোট দেখাবে)
// freeTier: provider নিজে ফ্রি ব্যবহারের সুযোগ দেয় (লিমিটসহ)
// local: নিজের কম্পিউটারে চলা সার্ভার (key লাগে না)
// regions: অঞ্চল-বদ্ধ provider-এর (যেমন Alibaba Qwen) জন্য অনুমোদিত base URL তালিকা

module.exports = [
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1", list: "openrouter", verified: true,
    colors: ["#6467f2", "#b05cf6"], keyUrl: "https://openrouter.ai/keys", publicList: true },

  { id: "opencode", name: "OpenCode Zen", aliases: ["open code", "opencode", "zen"], base: "https://opencode.ai/zen/v1", list: "opencode", freeTier: true, verified: true,
    colors: ["#0ea5e9", "#6366f1"], keyUrl: "https://opencode.ai/zen", publicList: true, publicFreeChat: true,
    info: "OpenCode Zen API: ফ্রি মডেল (যেমন -free / big-pickle) key ছাড়াও (public) বা নিজের OpenCode API key দিয়ে চলে; পেইড মডেলের জন্য OpenCode Zen API key ও ব্যালেন্স লাগবে।",
    models: [
      { id: "big-pickle", name: "Big Pickle", free: true },
      { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", free: true },
      { id: "mimo-v2.5-free", name: "MiMo-V2.5 Free", free: true },
      { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", free: true },
      { id: "gpt-5-nano", name: "GPT 5 Nano", free: true },
      { id: "gpt-5.4", name: "GPT 5.4", free: false },
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex", free: false },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", free: false },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", free: false },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", free: false },
      { id: "qwen3.7-max", name: "Qwen 3.7 Max", free: false },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", free: false },
      { id: "kimi-k2.6", name: "Kimi K2.6", free: false },
      { id: "glm-5.1", name: "GLM 5.1", free: false },
      { id: "minimax-m2.7", name: "MiniMax M2.7", free: false },
    ] },

  { id: "nvidia", name: "NVIDIA", base: "https://integrate.api.nvidia.com/v1", list: "live", freeTier: true, verified: true,
    colors: ["#9be100", "#1f9e4a"], keyUrl: "https://build.nvidia.com/settings/api-keys", publicList: true },

  { id: "minimax", name: "MiniMax", base: "https://api.minimax.io/v1", list: "static", verified: true,
    colors: ["#ff4f7b", "#ffa03d"], keyUrl: "https://platform.minimax.io",
    models: [{ id: "MiniMax-M3", name: "MiniMax M3" }, { id: "MiniMax-M3.1-Flash", name: "MiniMax M3.1 Flash" }] },

  { id: "anthropic", name: "Anthropic", base: "https://api.anthropic.com/v1", list: "live", verified: true,
    colors: ["#d97757", "#f5b26b"], keyUrl: "https://platform.claude.com/settings/keys",
    info: "চ্যাটে সরাসরি API key দিয়ে চলে। মূল claude.ai ওয়েব অ্যাপে লগইন করে ব্যবহার করতে সাইডবারের Official Web Apps ব্যবহার করুন।",
    models: [
      { id: "claude-fable-5-2", name: "Claude Fable 5.2" },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    ] },

  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1", list: "live", verified: false,
    colors: ["#10a37f", "#45e0b4"], keyUrl: "https://platform.openai.com/api-keys",
    info: "API key দিয়ে চলে। মূল chatgpt.com ওয়েব অ্যাপ ব্যবহার করতে সাইডবারের Official Web Apps দেখুন।" },

  { id: "google", name: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", list: "live", freeTier: true, verified: true,
    colors: ["#4285f4", "#ea4335"], keyUrl: "https://aistudio.google.com/apikey",
    info: "API চ্যাটে AI Studio API key লাগে (Google AI Pro সাবস্ক্রিপশনে API কোটা নেই)। মূল gemini.google.com অ্যাপ ব্যবহার করতে সাইডবারের Official Web Apps খুলুন।" },

  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1", list: "live", verified: true,
    colors: ["#4d6bfe", "#2dd4ff"], keyUrl: "https://platform.deepseek.com/api_keys",
    models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }, { id: "deepseek-reasoner", name: "DeepSeek Reasoner" }] },

  { id: "qwen", name: "Alibaba Qwen", aliases: ["queen", "dashscope", "bailian"], base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", list: "live", verified: true,
    colors: ["#6a4cff", "#b39bff"], keyUrl: "https://bailian.console.alibabacloud.com",
    info: "Qwen (অনেকে Queen API বলে থাকেন) API key অঞ্চল-বদ্ধ। আপনার key যে অঞ্চলের, নিচে সেটি বাছাই করুন; workspace-নির্দিষ্ট ডোমেইন থাকলে Custom provider দিন।",
    regions: [
      { id: "sg", name: "Singapore (Intl)", base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
      { id: "us", name: "US (Virginia)", base: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" },
      { id: "cn", name: "Beijing (China)", base: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
      { id: "jp", name: "Tokyo (Japan)", base: "https://dashscope-jp.aliyuncs.com/compatible-mode/v1" },
    ],
    models: [
      { id: "qwen-max", name: "Qwen Max" },
      { id: "qwen-plus", name: "Qwen Plus" },
      { id: "qwen-turbo", name: "Qwen Turbo" },
      { id: "qwen2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B" },
      { id: "qwq-32b", name: "QwQ 32B" },
    ] },

  { id: "groq", name: "Groq", base: "https://api.groq.com/openai/v1", list: "live", freeTier: true, verified: false,
    colors: ["#f55036", "#ffa056"], keyUrl: "https://console.groq.com/keys" },

  { id: "mistral", name: "Mistral", base: "https://api.mistral.ai/v1", list: "live", freeTier: true, verified: false,
    colors: ["#ff6a00", "#ffc700"], keyUrl: "https://console.mistral.ai/api-keys" },

  { id: "xai", name: "xAI", base: "https://api.x.ai/v1", list: "live", verified: false,
    colors: ["#3a3f55", "#9aa0bf"], keyUrl: "https://console.x.ai",
    info: "API key দিয়ে চলে। মূল grok.com ওয়েব অ্যাপের জন্য Official Web Apps দেখুন।" },

  { id: "together", name: "Together AI", base: "https://api.together.xyz/v1", list: "live", verified: false,
    colors: ["#0f6fff", "#5ad0ff"], keyUrl: "https://api.together.ai/settings/api-keys" },

  { id: "cerebras", name: "Cerebras", base: "https://api.cerebras.ai/v1", list: "live", freeTier: true, verified: false,
    colors: ["#ef5a28", "#ff9d6e"], keyUrl: "https://cloud.cerebras.ai" },

  { id: "fireworks", name: "Fireworks AI", base: "https://api.fireworks.ai/inference/v1", list: "live", verified: false,
    colors: ["#7b2ff7", "#e05cff"], keyUrl: "https://fireworks.ai/account/api-keys" },

  { id: "perplexity", name: "Perplexity", base: "https://api.perplexity.ai/v1", list: "static", verified: true,
    colors: ["#1fa5b8", "#6ae6d2"], keyUrl: "https://www.perplexity.ai/settings/api",
    info: "ব্যবহার-ভিত্তিক API key বিলিং। মূল perplexity.ai অ্যাপের জন্য Official Web Apps দেখুন।",
    models: [
      { id: "sonar", name: "Sonar" }, { id: "sonar-pro", name: "Sonar Pro" },
      { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro" }, { id: "sonar-deep-research", name: "Sonar Deep Research" },
    ] },

  { id: "moonshot", name: "Moonshot (Kimi)", base: "https://api.moonshot.ai/v1", list: "live", verified: false,
    colors: ["#2f55ff", "#7d98ff"], keyUrl: "https://platform.moonshot.ai" },

  { id: "zai", name: "Z.ai (GLM)", base: "https://api.z.ai/api/paas/v4", list: "live", verified: false,
    colors: ["#2563ff", "#8a5cff"], keyUrl: "https://z.ai/manage-apikey/apikey-list" },

  { id: "siliconflow", name: "SiliconFlow", base: "https://api.siliconflow.com/v1", list: "live", freeTier: true, verified: false,
    colors: ["#7b5cff", "#ff6fd8"], keyUrl: "https://cloud.siliconflow.com/account/ak" },

  { id: "huggingface", name: "Hugging Face", base: "https://router.huggingface.co/v1", list: "live", freeTier: true, verified: false,
    colors: ["#ffb100", "#ff6f61"], keyUrl: "https://huggingface.co/settings/tokens" },

  { id: "sambanova", name: "SambaNova", base: "https://api.sambanova.ai/v1", list: "live", freeTier: true, verified: false,
    colors: ["#ee5a24", "#f7b733"], keyUrl: "https://cloud.sambanova.ai/apis" },

  { id: "ollama", name: "Ollama (local)", base: "http://localhost:11434/v1", list: "live", local: true, freeTier: true, verified: true,
    colors: ["#555b73", "#aab0ca"], keyUrl: "https://ollama.com/download" },

  { id: "lmstudio", name: "LM Studio (local)", base: "http://localhost:1234/v1", list: "live", local: true, freeTier: true, verified: true,
    colors: ["#5b6cff", "#a0aaff"], keyUrl: "https://lmstudio.ai" },
];

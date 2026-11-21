# AI Engine (Updated — Phase 1 & Phase 2)

আপনার আগের AI Engine-এর হুবহু ডিজাইন ও কালার অক্ষত রেখে আপডেট করা হয়েছে:

## নতুন যা যা যুক্ত হয়েছে
- **OpenCode Zen API (`https://opencode.ai/zen/v1`)**: সব ফ্রি (`-free`, `big-pickle`, `gpt-5-nano`) এবং পেইড (GPT-5.x, Claude, Gemini, Qwen, DeepSeek, Kimi, GLM, MiniMax) মডেল লাইভ লোড হয় এবং সঠিক এন্ডপয়েন্টে অটো-রাউট হয়।
- **Official Web Apps (মূল অ্যাপস)**: সাইডবারের **Official Web Apps** থেকে `claude.ai`, `gemini.google.com`, `chatgpt.com`, `chat.deepseek.com`, `chat.qwen.ai`, `grok.com`, `perplexity.ai` ও `opencode.ai/zen` সরাসরি অফিসিয়াল লগইনে ব্যবহার করা যায়।
- **সব মডেল (২৫০ সীমা নেই)**: `All providers` ভিউ + `Show more` + `Show all` বাটন।
- **Alibaba Qwen (Queen API) অঞ্চল বাছাই**: Singapore / US / Beijing / Tokyo।
- **ফ্রি লিমিট অটো-সুইচ**: প্রথম আউটপুটের আগে, সর্বোচ্চ ৪ বার, দৃশ্যমান নোটিসসহ (400/401/403 বা পলিসি এররে সুইচ নয়)।
- **LAN Same-Host Origin ফিক্স**: `HOST=0.0.0.0` দিয়ে LAN ব্রাউজারে চালালে আর 403 ব্লক হবে না।
- **Windows `.exe` + Android `.apk` (`build.yml`)**: GitHub-এ আপলোড করলেই **Actions** থেকে অটো `.exe` এবং `.apk` তৈরি হয়ে যাবে।

## GitHub Actions দিয়ে `.exe` ও `.apk` তৈরি
1. এই ZIP আনজিপ করে ভেতরের `ai-engine` ফোল্ডারের সব ফাইল (`.github/workflows/build.yml` সহ) আপনার GitHub রিপোজিটরিতে আপলোড করুন।
2. **Actions** ট্যাবে গিয়ে **Build Windows EXE & Android APK** রান হলে নিচে **Artifacts** থেকে `AI-Engine-Windows-EXE` এবং `AI-Engine-Android-APK` ডাউনলোড করুন।

<div align="center">

# 🛰️ Job Radar (Zero-Backend Edition)
**Fully client-side, hyper-targeted job discovery pipeline.**

Bypass algorithmic noise. Snipe Applicant Tracking Systems directly. Gatekeep leads with strict AI logic.

[Features](#features) • [Installation](#installation) • [Architecture](#architecture) • [Engineering Philosophy](#engineering-philosophy)

![Architecture Demo](https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1200)

</div>

## 💥 The Problem This Solves
Job boards like LinkedIn and Indeed are severely broken. They prioritize promoted listings, recycle "ghost jobs" from aggregator spam agencies (Turing, BairesDev), and obscure chronological freshness.

**Job Radar** is not a job board. It is an orchestration engine. It runs entirely locally in your browser, constructing atomic queries directly against major Application Tracking Systems (Greenhouse, Lever, Ashby) and passing the raw HTML through a strict, user-controlled LLM to mathematically penalize and filter out irrelevancy.

---

## ✨ Cutting-Edge Capabilities

### 1. 🎯 Atomic Source Sniping
We don't rely on RSS feeds. The engine breaks your target roles into combinatorial queries (e.g., `Product Manager jobs in New York site:boards.greenhouse.io`) to saturate API density limits and guarantee maximum recall precision.

### 2. 🛡️ The Semantic Gatekeeper
Your LLM isn't just a summarizer; it's a ruthless technical recruiter. Jobs are passed through a strict boolean gauntlet:
*   **Hard Geo-Penalty:** -15 penalty for ambiguous geographic matches.
*   **Seniority Enforcement:** Automatically calculates +/- 1 level variance (A Senior candidate will soft-reject Junior roles).
*   **Spam Blacklisting:** Hardcoded client-side blocklists instantly vaporize ghost jobs from known agencies before they burn your LLM tokens.

### 3. ⏱️ True Chronological Fetching
By wiring the Serper API into Google's native Time-Based Search (`tbs=qdr:w`), Job Radar mathematically enforces freshness constraints (Past 24H, Past Week) directly at the Google Server level instead of relying on brittle date-string parsing. 

### 4. 🧠 Bring Your Own Compute (BYOC)
Zero backends. Zero databases. Your configured API keys (OpenAI, Gemini, Anthropic, Serper) operate locally inside your browser's memory and are saved to your offline `LocalStorage`.

---

## 🚀 Getting Started

Job Radar requires Node.js `v18+`.

```bash
# Clone the repository
git clone https://github.com/adarshsenapati/AI-Job-Search-Tool-Free-main-antigravity.git job-radar
cd job-radar

# Install dependencies
npm install

# Start the Vite Dev Server
npm run dev
```

### Required API Keys
Upon launching `localhost:5173`, the UI will prompt you to configure:
1.  **Search Engine:** A [Serper.dev](https://serper.dev/) API Key (Google Search JSON API).
2.  **Intelligence:** An LLM API key. We support **Google Gemini**, **Perplexity**, **OpenAI**, and **Anthropic**. The engine restricts polling concurrency specifically to protect Free Tier API limits.

---

## 🏗️ Core Engineering Architecture

For external LLMs or senior developers aiming to modify the source code, please review the extensive [`comprehensive_architecture.md`](./comprehensive_architecture.md) document at the root of the project. A quick structural layout:

*   **`lib/discovery.ts`**: The query generation and algorithmic deduplication logic. Handles combinatorial ATS expansion and fingerprinting.
*   **`lib/scoring.ts`**: The heavily engineered LLM instructions and concurrent execution queue (`p-limit`).
*   **`lib/serper.ts`**: Deep integration with Google Search APIs involving specific `tbs` chronological targeting overrides.
*   **`components/DiscoveryFeed.tsx`**: The streaming orchestration dashboard displaying live jobs while asynchronous batching loops continue behind the scenes.

## 🔒 Privacy Guarantee
This is a purely stateless UI wrapper over standard JSON REST APIs. No analytics, tracking, or remote databases are wired into this client. If you clear your browser cache, your identity vanishes.

## 📜 License
MIT License - Open, extendable, and yours to modify.

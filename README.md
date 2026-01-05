# 🛰️ Job Radar + Outreach Copilot (v3.0)

> **The Inverse Engineering Job Search Platform.**
> Stop doom-scrolling LinkedIn. Start commanding your career search.

**Job Radar** is a local "Mission Control" center for your job search. Unlike standard job boards where you search for jobs, **Job Radar searches for YOU.**

![Dashboard](https://github.com/adarsh-senapati1993/AI-Job-Search-Tool-Free/raw/main/public/dashboard_preview.png)

## 💡 The Philosophy: "Inverse Engineering"

Standard job searching is **Pull-based**: You go to LinkedIn, type keywords, and scroll endlessly.
**Job Radar is Push-based**: You define a "Signal Profile," and the Agent scans the entire web to push relevant opportunities to you.

**Why this is superior:**
* **🔓 No Vendor Lock-in:** We don't just scrape LinkedIn. We use Google Dorks to simultaneously scan ATS systems (Greenhouse, Lever), company career pages, and regional boards.
* **🧠 Cognitive Offloading:** Instead of reading 100 job descriptions to find 5 matches, the AI reads 100 and presents the top 5 with a **"Glass Box" score** explaining *exactly* why they match.
* **🛡️ Privacy First:** Everything runs locally in your browser. Your resume and API keys never touch a 3rd party database.

---

## 🚀 NEW in Version 3.0 (Latest)

* **🕵️ Deep Analysis:** One-click "Deep Dive" on any job. The AI browses the web to generate a 3-part report: **Executive Summary**, **Culture Fit**, and **Interview Tips** specific to that company.
* **📸 Layout-Aware OCR:** Now accepts **Image Uploads (PNG/JPG)** of resumes alongside PDFs. It uses `tesseract.js` to preserve layout context.
* **♟️ Strategy Room V2:**
    * **Interactive Location Expansion:** Type "London" -> AI expands to "London, Reading, Cambridge" instantly. Direct edit support.
    * **Visual Logic:** See exactly which ATS and Regional Boards are being targeted.
* **🤝 Hiring Manager Copilot:**
    * **Auto-Find HM:** The AI hunts for the specific Hiring Manager (e.g., "VP Engineering") for the role.
    * **Contextual DM Generator:** Drafts a "Bridge Message" connecting *your* specific past achievement to *their* specific job requirement.
* **⚖️ Comparative Ranking:** After scoring, the AI performs a final "Tournament Pass" to rank the Top 5 candidates against each other, breaking ties with human-like intuition.

---

## ⚡ Quick Start Guide

### Prerequisites
1.  **Node.js (LTS Version):** [Download Here](https://nodejs.org/)
2.  **API Keys** (The "Fuel" for the AI - cost is <$5):
    *   **Perplexity API:** [Get Key](https://www.perplexity.ai/settings/api) (For reasoning & writing)
    *   **Serper API:** [Get Key](https://serper.dev/) (For Google Search access)

### Installation
1.  **Clone/Download** this repository.
2.  Open your terminal in the folder.
3.  Run:
    ```bash
    npm install
    npm run dev
    ```
4.  Open `http://localhost:5173` in your browser.

---

## 🎮 Workflow Guide

### 1. Mission Configuration
* **Upload Resume:** PDF, Text, or **scanned Images**. The AI extracts not just keywords, but *seniority context*.
* **Define Strategy:**
    * **Roles:** "Product Manager", "Staff Engineer".
    * **Locations:** Use the **✨ Expand** button to let AI find commuter towns and hubs.
    * **Depth:** Choose "Standard" (Fast) or "Max" (Comprehensive - 4x coverage).

### 2. The Strategy Room
* Review the **"Active Search Radar"**.
* Use the **Co-Pilot** (Chatbox) to tweak logic in plain English (e.g., *"Exclude crypto companies but include Fintech"*).
* Confirm to launch.

### 3. Active Discovery (The Scan)
* The agent searches 15+ clusters simultaneously:
    * **ATS Cluster:** Greenhouse, Lever, Ashby, etc. (Direct API-like search).
    * **Social Cluster:** LinkedIn Posts (Public web view).
    * **Regional Cluster:** Dynamically found local boards (e.g., *Wellfound* for Startups, *jobs.ch* for Swiss).
* **The Filter:** 
    * "Fingerprinting" removes duplicates.
    * "Seniority Guard" creates a hard filter before AI scoring.

### 4. Ranking & Deep Dive
* **Glass Box Scoring:** Click any Score Ring (e.g., "85") to see the rubric breakdown.
* **Borderline Leads:** Toggle **"🤔 Show Maybe"** to see leads the AI wasn't sure about (score 40-60).
* **Deep Analyze:** Click `🕵️` to run a background check on the company culture and interview process.

### 5. Automated Outreach
* Click **"✨ Draft Outreach"**.
* Click **"🔍 Auto-Find HM"** to locate the potential boss.
* The AI writes a highly specific, non-generic message for LinkedIn/Email.

---

## 🏗️ Architecture (For Developers)

* **Frontend:** React + TypeScript + Vite + TailwindCSS.
* **State Management:** LocalStorage (Persistence) + React Context.
* **AI Layer:** 
    * **Reasoning:** Perplexity `sonar-reasoning` (or `sonar-pro`).
    * **Search:** Serper (Google wrapper).
    * **OCR:** Tesseract.js (Client-side WASM).
* **Logic:**
    * **Two-Pass Scoring:** fast regex filter -> cheap AI score -> expensive AI ranking.
    * **Hallucination Guard:** Scoring is strictly grounded in the provided text snippet.

## 🛡️ Privacy
This tool runs **100% Client-Side**. No data is sent to our servers. Your API keys are stored in your browser's LocalStorage.

---

**Built with ❤️ for the Job Hunt Grind.**
*v3.0 - "The Agentic Era"*

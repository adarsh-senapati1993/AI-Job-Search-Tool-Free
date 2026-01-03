# 🛰️ Job Radar + Outreach Copilot (v2.2)

> **The Inverse Engineering Job Search Platform.** > Stop doom-scrolling LinkedIn. Start commanding your career search.

**Job Radar** is a local "Mission Control" center for your job search. Unlike standard job boards where you search for jobs, **Job Radar searches for YOU.**

## 💡 The Philosophy: "Inverse Engineering"

Standard job searching is **Pull-based**: You go to LinkedIn, type keywords, and scroll endlessly.
**Job Radar is Push-based**: You define a "Signal Profile," and the Agent scans the entire web to push relevant opportunities to you.

**Why this is superior:**
* **🔓 No Vendor Lock-in:** We don't just scrape LinkedIn. We use Google Dorks to simultaneously scan ATS systems (Greenhouse, Lever), company career pages, and regional boards.
* **🧠 Cognitive Offloading:** Instead of reading 100 job descriptions to find 5 matches, the AI reads 100 and presents the top 5 with a **"Glass Box" score** explaining *exactly* why they match.
* **🛡️ Privacy First:** Everything runs locally in your browser (React + LocalStorage). Your resume and API keys never touch a 3rd party database.

---

## 🚀 New Features (v2.2)

* **📡 Strategy Room:** Visual confirmation of all search clusters (ATS, Regional, Web) before you launch.
* **🧠 Intelligent Location Hierarchy (V4.2 - Type-First Strictness):** The Brain (AI) now performs a strict classification step before expansion to prevent "context bleeding".
    * **City Level (Strict):** "Bengaluru" → "Bengaluru", "Bangalore", "BLR". (Explicitly **BLOCKS** neighbors like Hyderabad or Chennai).
    * **State Level (Regional):** "Karnataka" → "Bengaluru", "Mysuru", "Mangaluru" (Expands only within political borders).
    * **Country Level (National):** "India" → "Bengaluru", "Delhi", "Mumbai", "Hyderabad" (Expands to major national hubs).
    * **Multi-Country Density Check:** If you enter multiple countries (e.g., "Japan, Taiwan"), the AI automatically limits expansion to the **Top 3-4 Hubs** per country to prevent search query explosion.
* **🌍 Deep Regional Search:** Now discovers 8-12 regional boards and **Local ATS Systems** specific to your target country (e.g., finding *Personio* in Germany or *Snaphunt* in Asia).
* **🔍 High-Density Mode:** Targets 8+ global ATS platforms (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, etc.) for maximum recall.

---

## 🏗️ Under the Hood: Architecture & Logic

For the engineers and product minds, here is how the system operates. The pipeline uses distinct "Gates" to ensure quality and reduce cost.

### 1. The Data Pipeline

#### Phase A: The Calibration Gate (ProfileConfig)
* **Input:** PDF Resume + LinkedIn URL.
* **The AI Task:** Perplexity Sonar extracts structured metadata (Seniority, Domain, Hard Skills).
* **Role Normalization:** It maps your resume titles to standard market titles to ensure the search terms match what recruiters are actually posting.

#### Phase B: The Discovery Engine (The "Eyes")
* **Technology:** Serper API (Google Search Wrapper).
* **Mechanism:** The system constructs complex Boolean strings on the fly:
    ```
    site:greenhouse.io ("Product Manager" OR "PM") ("Remote" OR "London") -intitle:resume after:2024-01-01
    ```
* **Cluster Strategy:** We execute parallel searches across 4 distinct clusters:
    1.  **ATS Direct:** Scans Greenhouse, Lever, Ashby, Workable directly.
    2.  **Deep LinkedIn:** Scans public LinkedIn post pages (bypassing the login wall).
    3.  **Regional Satellites:** Dynamically identified local boards (e.g., `jobs.ch` in Swiss or `naukri.com` in India).
    4.  **Web Discovery:** Catch-all for `site:careers.*` pages.

#### Phase C: Filtration & Deduplication
Before paying for AI scoring, we use deterministic code to clean the data:
* **Fingerprinting:** We create a unique hash of `Company + Title + Snippet`. If "Stripe PM" is found on both LinkedIn and Greenhouse, we merge them (prioritizing the direct Greenhouse link).
* **The "Bouncer":** A lightweight client-side check. If the title is "Sales Rep" but you want "Engineer," it is discarded immediately without using LLM tokens.
* **Novelty Check:** The system checks LocalStorage to see if this URL was processed in the last 7 days. If yes, it hides it.

#### Phase D: The Scoring Engine (The "Brain")
* **Technology:** Perplexity Sonar.
* **The "Ruthless Recruiter" Prompt:** We instruct the AI to be adversarial, not helpful.
    * *Rule 1:* Seniority mismatch? **Score 0.**
    * *Rule 2:* "Hybrid" location when user wants "Remote"? **Score 0.**
    * *Rule 3:* Found a "Red Line" keyword (e.g., "Crypto")? **Score 0.**

### 2. Hallucination Prevention Strategy
Hallucination is the biggest risk in AI tools. We mitigate this via **Separation of Concerns**:

| Task | Component | Why? |
| :--- | :--- | :--- |
| **Finding URLs** | Serper (Google) | LLMs cannot browse the live web reliably. Google is the source of truth for "Does this link exist?" |
| **Reading Text** | Perplexity | LLMs are excellent at reading text *provided* to them. |
| **Decisions** | TypeScript Code | We don't ask AI "Is this duplicate?" We use code hashing. We don't ask AI "Is this link valid?" We use URL regex. |

**The "Glass Box" Rule:**
In the UI, every score is clickable. If the AI claims a skill match, you can click the score to see the exact reasoning. Transparency is the only cure for hallucination.

---

## ⚡ Quick Start Guide (For Absolute Beginners)

You do not need to be a coder to use this. Follow these steps exactly.

### Phase 1: Preparation

1.  **Install Node.js (The Runtime)**
    * Go to [nodejs.org](https://nodejs.org/).
    * Download the **LTS Version** (Left button).
    * Install it just like you install any other program (Click Next, Next, Finish).

2.  **Get Your API Keys (The "Fuel")**
    * *Why do I need these?* This app creates a direct connection between your computer and the AI. There is no middleman server. You need these keys to "pay" for the AI usage (usually less than $5 total).
    
    **A. The Brain (Perplexity AI)**
    * Go to [Perplexity API Settings](https://www.perplexity.ai/settings/api).
    * Add a payment method and add **$5 credit**.
    * Click **Generate API Key**.
    * Copy the code that starts with `pplx-...`. Save it in a text file for later.

    **B. The Eyes (Serper Google Search)**
    * Go to [Serper.dev](https://serper.dev/).
    * Sign up (Free).
    * You get 2,500 free searches. Copy the **API Key** from the dashboard.

---

## 🛠️ Installation (Step-by-Step)

### Step 1: Download the App
1.  Scroll to the top of this GitHub page.
2.  Click the green **<> Code** button.
3.  Click **Download ZIP**.
4.  Find the ZIP file in your Downloads folder and **Unzip/Extract** it.

### Step 2: Open the Terminal
* **On Mac:** Press `Command + Space`, type `Terminal`, and hit Enter.
* **On Windows:** Press the `Windows Key`, type `PowerShell`, and hit Enter.

### Step 3: Go to the Folder
1.  In the terminal, type `cd ` (type **cd** followed by a **space**).
2.  **Drag and drop** the unzipped folder from your desktop into the terminal window.
3.  It should look like: `cd /Users/yourname/Downloads/job-radar-main`.
4.  Press **Enter**.

### Step 4: Install Dependencies (The "Scary" Part)
1.  Type `npm install` and press **Enter**.
2.  **What you will see:**
    * You will see text scrolling and progress bars.
    * ⚠️ **IGNORE YELLOW WARNINGS:** You might see text like `npm warn deprecated` or `found 3 vulnerabilities`. **This is normal.** It just means some sub-tools are older. As long as you see the line **"added X packages"** at the end, it worked.
    * *Do not run `npm audit fix` unless you know what you are doing.*

### Step 5: Launch the App 🚀
1.  Type `npm run dev` and press **Enter**.
2.  You should see green text saying:
    ```
    ➜  Local:   http://localhost:5173/
    ```
3.  **Hold Command (Mac) or Ctrl (Windows)** and click that link.
4.  The app will open in your browser!

---

## 🎮 How to Use Job Radar

### 1. Setup Wizard
* Paste your **Perplexity Key** (The Brain) and click Connect.
* Paste your **Serper Key** (The Eyes) and click Activate.

### 2. Configure Your Mission
* **Upload Resume:** Click the box and select your PDF. The AI will auto-read your skills.
* **Target Roles:** Be specific! (e.g., "Senior Product Manager", "React Developer").
* **Locations:**
    * Type any location (e.g., "London", "HongKong", "Berlin", "Remote").
    * **Smart Discovery:** The AI automatically detects the best local job boards/ATS for that region (e.g., `jobs.ch` for Switzerland, `jobsdb.com` for HK) and adds them to the search.

### 3. Strategy Room (NEW)
* Before launching, review the **"Active Search Radar"** panel.
* Verify that the correct Regional Boards are listed.
* Use the AI Co-Pilot to tweak filters (e.g., "Exclude crypto companies").

### 4. The Dashboard (Active Radar)
* Click **"Launch Mission"**.
* **Wait 30-60 seconds.** The app is searching the live internet.
* **The Score Ring:**
    * 🟢 **Green (>80):** High Match.
    * 🟡 **Yellow (50-79):** Decent Match.
    * 🔴 **Red (<50):** Likely Mismatch.
* **Glass Box Scoring:** Click the Score Ring to see *exactly* why the AI gave that score (e.g., "Role Fit: 30/30", "Location: 0/20").

### 5. Outreach Copilot
* Found a job? Click **"✨ Draft Outreach"**.
* (Optional) Paste the Hiring Manager's name if you know it.
* Click **Generate**. The AI will write a personalized email bridging *your* specific past experience to *their* job requirements.

---

## ❓ Troubleshooting

**"I see 'npm warn deprecated' in the terminal!"**
* **Ignore it.** This is just a notification for developers. If the command finished and you can type again, it was successful.

**"The app says 'Quota Exceeded'"**
* You ran out of API credits. Check your Perplexity or Serper dashboard.

**"It's not finding local job boards"**
* The system discovers regional boards during the "Save" phase. Check the Mission Logs during search to see which "Regional Satellites" were activated.

**"I want to change my API keys or fix a connection error"**
* Click **Reset Session** in the top navigation bar. This will disconnect your current session and take you back to the Setup Wizard without deleting your saved profile data.

**"I want to delete everything and start fresh"**
* Click the **Settings** button in the top right, then click **Factory Reset**. This completely wipes all keys, profile data, and caches.

---

## 🛡️ Privacy Note
This app runs **locally on your computer**. We (the developers) cannot see your resume, your keys, or your job search. You are in full control.

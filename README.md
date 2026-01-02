# 🛰️ Job Radar + Outreach Copilot (v2.1)

> **The Inverse Engineering Job Search Platform.**  
> Stop doom-scrolling LinkedIn. Start commanding your career search.

**Job Radar** is a local "Mission Control" center for your job search. Unlike standard job boards where you search for jobs, **Job Radar searches for YOU.**

## 🚀 New Features (v2.1)
*   **📡 Strategy Room:** Visual confirmation of all search clusters (ATS, Regional, Web) before you launch.
*   **🧠 Intelligent Location Expansion (V2):** The Brain (AI) now uses strategic hierarchical logic to expand your location search.
    *   **Country Input:** "India" → Expands to "Bengaluru", "Mumbai", "Delhi", "Pune", "Hyderabad" (finding jobs that only list the city, not the country).
    *   **Region Input:** "Europe" → Expands to "London", "Berlin", "Amsterdam", "Paris".
    *   **City Input:** "SF" → Expands to "San Francisco", "Bay Area".
*   **🌍 Deep Regional Search:** Now discovers 8-12 regional boards and **Local ATS Systems** specific to your target country (e.g., finding *Personio* in Germany or *Snaphunt* in Asia).
*   **🔍 High-Density Mode:** Targets 8+ global ATS platforms (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, etc.) for maximum recall.

---

## ⚡ Quick Start Guide (For Absolute Beginners)

You do not need to be a coder to use this. Follow these steps exactly.

### Phase 1: Preparation

1.  **Install Node.js (The Runtime)**
    *   Go to [nodejs.org](https://nodejs.org/).
    *   Download the **LTS Version** (Left button).
    *   Install it just like you install any other program (Click Next, Next, Finish).

2.  **Get Your API Keys (The "Fuel")**
    *   *Why do I need these?* This app creates a direct connection between your computer and the AI. There is no middleman server. You need these keys to "pay" for the AI usage (usually less than $5 total).
    
    **A. The Brain (Perplexity AI)**
    *   Go to [Perplexity API Settings](https://www.perplexity.ai/settings/api).
    *   Add a payment method and add **$5 credit**.
    *   Click **Generate API Key**.
    *   Copy the code that starts with `pplx-...`. Save it in a text file for later.

    **B. The Eyes (Serper Google Search)**
    *   Go to [Serper.dev](https://serper.dev/).
    *   Sign up (Free).
    *   You get 2,500 free searches. Copy the **API Key** from the dashboard.

---

## 🛠️ Installation (Step-by-Step)

### Step 1: Download the App
1.  Scroll to the top of this GitHub page.
2.  Click the green **<> Code** button.
3.  Click **Download ZIP**.
4.  Find the ZIP file in your Downloads folder and **Unzip/Extract** it.

### Step 2: Open the Terminal
*   **On Mac:** Press `Command + Space`, type `Terminal`, and hit Enter.
*   **On Windows:** Press the `Windows Key`, type `PowerShell`, and hit Enter.

### Step 3: Go to the Folder
1.  In the terminal, type `cd ` (type **cd** followed by a **space**).
2.  **Drag and drop** the unzipped folder from your desktop into the terminal window.
3.  It should look like: `cd /Users/yourname/Downloads/job-radar-main`.
4.  Press **Enter**.

### Step 4: Install Dependencies (The "Scary" Part)
1.  Type `npm install` and press **Enter**.
2.  **What you will see:**
    *   You will see text scrolling and progress bars.
    *   ⚠️ **IGNORE YELLOW WARNINGS:** You might see text like `npm warn deprecated` or `found 3 vulnerabilities`. **This is normal.** It just means some sub-tools are older. As long as you see the line **"added X packages"** at the end, it worked.
    *   *Do not run `npm audit fix` unless you know what you are doing.*

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
*   Paste your **Perplexity Key** (The Brain) and click Connect.
*   Paste your **Serper Key** (The Eyes) and click Activate.

### 2. Configure Your Mission
*   **Upload Resume:** Click the box and select your PDF. The AI will auto-read your skills.
*   **Target Roles:** Be specific! (e.g., "Senior Product Manager", "React Developer").
*   **Locations:**
    *   Type any location (e.g., "London", "HongKong", "Berlin", "Remote").
    *   **Smart Discovery:** The AI automatically detects the best local job boards/ATS for that region (e.g., `jobs.ch` for Switzerland, `jobsdb.com` for HK) and adds them to the search.

### 3. Strategy Room (NEW)
*   Before launching, review the **"Active Search Radar"** panel.
*   Verify that the correct Regional Boards are listed.
*   Use the AI Co-Pilot to tweak filters (e.g., "Exclude crypto companies").

### 4. The Dashboard (Active Radar)
*   Click **"Launch Mission"**.
*   **Wait 30-60 seconds.** The app is searching the live internet.
*   **The Score Ring:**
    *   🟢 **Green (>80):** High Match.
    *   🟡 **Yellow (50-79):** Decent Match.
    *   🔴 **Red (<50):** Likely Mismatch.
*   **Glass Box Scoring:** Click the Score Ring to see *exactly* why the AI gave that score (e.g., "Role Fit: 30/30", "Location: 0/20").

### 5. Outreach Copilot
*   Found a job? Click **"✨ Draft Outreach"**.
*   (Optional) Paste the Hiring Manager's name if you know it.
*   Click **Generate**. The AI will write a personalized email bridging *your* specific past experience to *their* job requirements.

---

## ❓ Troubleshooting

**"I see 'npm warn deprecated' in the terminal!"**
*   **Ignore it.** This is just a notification for developers. If the command finished and you can type again, it was successful.

**"The app says 'Quota Exceeded'"**
*   You ran out of API credits. Check your Perplexity or Serper dashboard.

**"It's not finding local job boards"**
*   The system discovers regional boards during the "Save" phase. Check the Mission Logs during search to see which "Regional Satellites" were activated.

**"I want to reset everything"**
*   Click the **Settings** button in the top right, then click **Factory Reset**. This deletes all keys and data so you can start fresh.

---

## 🛡️ Privacy Note
This app runs **locally on your computer**. We (the developers) cannot see your resume, your keys, or your job search. You are in full control.
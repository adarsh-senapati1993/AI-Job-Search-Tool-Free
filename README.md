# 🛰️ Job Radar + Outreach Copilot (v2.0)

> **The Inverse Engineering Job Search Platform.**  
> Stop doom-scrolling LinkedIn. Start commanding your career search.

**Job Radar** is a local "Mission Control" center for your job search. Unlike standard job boards where you search for jobs, **Job Radar searches for YOU.**

1.  **It Scans the Entire Web:** Accesses ATS systems (Greenhouse, Lever), LinkedIn, and **Regional Portals (Naukri, Instahyre)**.
2.  **It Filters Out Noise:** Intelligently ignores "Junior" roles if you are "Senior", or "Sales" roles if you want "Engineering".
3.  **It Scores Every Job (0-100):** Uses AI to read the job description against your resume and gives you a **"Glass Box" breakdown** of why you match (or don't).
4.  **It Writes Your Outreach:** Generates hyper-personalized Cold Emails and LinkedIn DMs to hiring managers using your specific experience.

---

## ⚡ Quick Start Guide (For Non-Coders)

You do not need to be a programmer to use this. You just need to run it on your computer.

### 1. Prerequisites
Before you start, ensure you have **Node.js** installed on your computer.
-   [Download Node.js here](https://nodejs.org/) (Choose the "LTS" version).
-   Install it like a normal program.

### 2. Get Your API Keys (The "Fuel")
This app is "Bring Your Own Key" (BYOK). This ensures your data stays private and you only pay for what you use (usually < $5/month).

#### 🔑 Key 1: The Brain (Perplexity AI)
This powers the reasoning engine that reads resumes and writes emails.
1.  Go to [Perplexity API Settings](https://www.perplexity.ai/settings/api).
2.  You will need to add a payment method (credits). Start with **$5** (this lasts for hundreds of searches).
3.  Click **"Generate API Key"**.
4.  Copy the key (starts with `pplx-...`). **Save this somewhere safe.**

#### 🔑 Key 2: The Eyes (Serper Google Search)
This allows the app to search the live internet for new jobs.
1.  Go to [Serper.dev](https://serper.dev/).
2.  Sign up (it's free!). You get **2,500 free searches** immediately.
3.  On the dashboard, copy your **API Key**.

---

## 🛠️ Installation & Launch

1.  **Download this Project**:
    *   Click the green **"Code"** button at the top right of this GitHub page -> **"Download ZIP"**.
    *   Unzip the folder.

2.  **Open Terminal / Command Prompt**:
    *   **Mac:** Press `Cmd + Space`, type "Terminal", press Enter.
    *   **Windows:** Press `Win`, type "PowerShell", press Enter.

3.  **Navigate to the folder**:
    *   Type `cd ` (with a space) and then **drag and drop the unzipped folder** into the terminal window.
    *   Press **Enter**.

4.  **Install Dependencies**:
    *   Type `npm install` and press **Enter**.
    *   Wait for it to finish (you'll see a bunch of text scrolling).

5.  **Run the App**:
    *   Type `npm run dev` and press **Enter**.
    *   You will see a link like `http://localhost:5173`.
    *   **Ctrl + Click** that link (or copy-paste it into your browser).

---

## 🎮 How to Use Job Radar

### Phase 1: System Initialization
When you first open the app, you will see a setup wizard.
1.  **Paste your Perplexity Key** -> Click "Connect Brain".
2.  **Paste your Serper Key** -> Click "Activate Eyes".

### Phase 2: Mission Configuration
This is where you tell the AI who you are.
1.  **Upload Resume:** Click the box and select your PDF resume. The AI will instantly read it and extract your skills.
2.  **Target Roles:** Be specific.
    *   *Good:* "Senior Product Manager", "Founding Engineer", "Staff Backend Developer".
    *   *Bad:* "Manager", "Tech Job".
3.  **Locations:**
    *   **Critical:** If you want jobs in India, type `India`, `Bengaluru`, `Delhi`, etc.
    *   *Note:* Adding Indian cities automatically activates the **"India Cluster"** (searching Naukri, Instahyre, Cutshort).
    *   If you want `Remote`, type "Remote".
4.  **Red Lines (Avoid):** Keywords that mean instant rejection (e.g., "Gambling", "Unpaid", "Consulting").

### Phase 3: The Dashboard (Active Radar)
Once configured, click **"Launch Mission"**. The app will now:
1.  **Search:** It runs ~15 complex Google searches across LinkedIn, ATS boards (Greenhouse/Lever), and regional sites.
2.  **Filter:** It removes duplicates and roles that are obviously wrong (e.g., "Sales" when you want "Product").
3.  **Score:** The AI reads the remaining job descriptions.

#### 🟢 Reading the Results
*   **The Score Ring (0-100):**
    *   **Green (>80):** Perfect match. High priority.
    *   **Yellow (50-79):** Good match, but maybe missing one skill or years of experience.
    *   **Red (<50):** Likely a mismatch.
*   **✨ The Glass Box Feature:**
    *   **Click on the Score Ring** to see *why* it got that score.
    *   It will show bars for: **Role Fit**, **Location**, **Experience**, and **Domain**.
    *   *Example:* You might see "Role Fit: 30/30" but "Location: 0/20". This means the job is great, but they don't hire in your country.

### Phase 4: Outreach Copilot
Found a job you like? Don't just apply. **Network.**
1.  Click **"✨ Draft Outreach"** on the job card.
2.  (Optional) Enter the Hiring Manager's name if you found it on LinkedIn.
3.  Click **"Generate Personalized Pitch"**.
4.  The AI will generate:
    *   A **Cold Email** bridging your specific past achievements to their company needs.
    *   A **LinkedIn DM** shorter and punchier for connection requests.

---

## ❓ Troubleshooting & FAQs

**Q: I see "No leads found matching criteria."**
*   **Fix:** Your search might be too narrow.
    *   Try removing "Red Lines".
    *   Try adding broader locations (e.g., instead of just "Berlin", try "Germany" or "Remote").
    *   Check your "Target Roles" - ensure you include synonyms (e.g., "Product Owner" AND "Product Manager").

**Q: The AI says "Quota Exceeded".**
*   **Fix:** You ran out of credits on either Perplexity or Serper. Go to their websites and check your usage. Serper gives 2,500 free queries, but they eventually run out.

**Q: It's not finding jobs in India.**
*   **Fix:** Ensure your **Locations** field explicitly contains `India`, `Bengaluru`, `Mumbai`, etc. The system detects these keywords to enable the "India Portals" search cluster.

**Q: I refreshed the page and my results are gone!**
*   **Feature:** For privacy, we store data in your browser's "Local Storage".
*   **Fix:** The app *does* save your latest run. If you refresh, it should reload the last results. However, if you clear your browser cache, the data is deleted. **Always save your API keys in a password manager.**

---

## 🛡️ Privacy & Security

*   **Local-First:** This app runs entirely in your browser.
*   **No Database:** We (the developers) cannot see your resume, your API keys, or your job search history.
*   **Direct Connection:** Your browser talks directly to Perplexity and Google. No middleman server.

---

## 🤝 Contributing

Found a bug? Want to add a new feature?
1.  Open an Issue on GitHub.
2.  Submit a Pull Request.

Happy Hunting! 🎯

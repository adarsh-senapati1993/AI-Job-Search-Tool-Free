# Job Radar + Outreach Copilot 🛰️

> **The Inverse Engineering Job Search Platform.**  
> Stop searching. Start commanding.

Job Radar is an AI-powered mission control center that autonomously scans the web for high-signal job opportunities, analyzes them against your specific profile, and generates hyper-personalized outreach strategies.

## 🌟 Features

-   **Deep Web Discovery**: Uses Google Search API (Serper) to find jobs across ATS systems (Greenhouse, Lever), LinkedIn, and niche boards.
-   **AI Suitability Scoring**: Analyzes every job description against your resume/profile to assign a 0-100 match score.
-   **Deduplication Engine**: Uses deterministic ID tracking to ensure you never see the same job twice.
-   **Outreach Copilot**: Generates "Hiring Manager Ready" cold emails and LinkedIn DMs based on specific job context.
-   **Strategy Room**: Fine-tune your search parameters with natural language (e.g., "Focus on Series B fintech startups").

---

## 🚀 Getting Started

### Prerequisites

You need **Node.js** (v18+) installed on your machine.

You also need two API keys (Paid/Free tiers available):
1.  **Perplexity API (The Brain):** Used for reasoning and content generation. [Get Key](https://www.perplexity.ai/)
2.  **Serper API (The Eyes):** Used for real-time Google Search results. [Get Key](https://serper.dev/) (Includes 2,500 free queries).

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/job-radar.git
    cd job-radar
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

4.  Open your browser to `http://localhost:5173`.

---

## 📖 Usage Guide

### 1. System Initialization
On first launch, the **Setup Wizard** will ask for your API keys. These are stored locally in your browser (LocalStorage) and never sent to our servers.

### 2. Profile Configuration
-   **Upload Resume:** Supports PDF parsing to auto-fill your skills and bio.
-   **Target Roles:** Be specific (e.g., "Senior Product Manager", "Founding Engineer").
-   **Red Lines:** Define what you want to avoid (e.g., "Crypto", "Unpaid", "Consulting").

### 3. Mission Control (Discovery)
Click **"Initialize Discovery"** to start a run.
-   **Phase 1 (Search):** The system constructs complex boolean queries to scan the web.
-   **Phase 2 (Filter):** Removing duplicates and "seen" jobs.
-   **Phase 3 (Scoring):** The AI reads every job description and scores it based on your profile.

### 4. Outreach
Click on any high-scoring lead to open the **Outreach Copilot**.
-   Enter the Hiring Manager's name (if known).
-   The AI will generate a personalized connection request and cold email draft.

---

## 🛠️ Troubleshooting

-   **Error: Quota Exceeded:** Check your Serper.dev dashboard. The free tier has limits.
-   **No Results Found:** Go to **Settings** and broaden your "Target Roles" or "Locations".
-   **PDF Parsing Error:** Ensure your resume is text-based, not an image scan.

---

## 🔒 Privacy

This application runs **client-side**. Your resume data and API keys stay in your browser's local storage. We do not maintain a database of your data.

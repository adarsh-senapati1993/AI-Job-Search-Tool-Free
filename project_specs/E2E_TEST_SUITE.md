# Phase 2: Master E2E Test Suite (Engineering + Product + Production)

**Status:** FINAL MASTER SPECIFICATION
**Objective:** Rigorous validation of the Job Radar pipeline. This suite covers "Hard Engineering Constraints", "User Value Propositions", and "Production Readiness" requirements.

---

## PART 1: SYSTEM & ENGINEERING CONSTRAINTS (Suites 1-5)

## Suite 1: Advanced Discovery & Query Engineering
**Goal:** Verify the system finds relevant leads without "Query Explosion" or duplication, and handles the messiness of web search.

### Feature: Smart Query Construction
**Scenario 1: Role Normalization & Synonym Expansion**
  *   **Given** the user's target roles are `["Lead PM", "Product Manager","Growth Product Manager", "Senior Product Manager","Principal PM", "Group Product Manager", "Head of Product"]`.
  *   **When** the Discovery Engine constructs search queries.
  *   **Then** it generates normalized boolean queries (e.g., `(Principal OR "Group Product Manager" OR "Head of Product")`).
  *   **And** it **DOES NOT** generate redundant queries (e.g., separate queries for "Principal PM" and "Principal Product Manager" if the search engine handles synonyms).
  *   **And** it applies the "50% Context Rule" (at least half of queries include domain keywords like "Fintech" or "Payments").

**Scenario 2: Keyword Injection Safety (The "SQL Injection" of Search)**
  *   **Given** the user background contains special characters: `Web3 "payments" & BNPL (India)`.
  *   **When** the query builder runs.
  *   **Then** it escapes special characters to prevent search syntax errors.
  *   **And** produces a valid search string: `... AND ("Web3" OR "BNPL")`.

**Scenario 3: Negative Keyword Balance**
  *   **Given** "Gambling" is a Red Line.
  *   **When** queries are generated.
  *   **Then** the system appends `-casino -gambling` to broader queries to reduce noise.
  *   **But** it verifies (via a "yield check") that this doesn't result in 0 results for legitimate "Payments" queries.

### Feature: Result Fetching & Pagination
**Scenario 4: Pagination & Recency Integrity**
  *   **Given** the search API returns 20 results (Page 1) and indicates more pages exist.
  *   **When** Page 1 contains posts from "Today" and Page 2 contains posts from "3 weeks ago".
  *   **Then** the system fetches Page 2.
  *   **But** correctly applies the `Max_Age_Days: 14` filter, discarding the old posts *before* wasting tokens on extraction.

**Scenario 5: Canonical Deduplication**
  *   **Given** the same job is found via three URLs:
    1. `linkedin.com/posts/hiring-pm-123`
    2. `linkedin.com/posts/hiring-pm-123?trk=feed`
    3. `mobile.linkedin.com/posts/hiring-pm-123`
  *   **When** the Ingestion phase runs.
  *   **Then** only **ONE** canonical record is created in `Signals_Raw`.
  *   **And** the source URL is cleaned of tracking parameters.

---

## Suite 2: Nuanced Ranking & Qualification Logic
**Goal:** The AI must handle ambiguity (Hybrid vs. Remote, Title Inflation) like a human recruiter.

### Feature: Location Logic (The Hardest Part)
**Scenario 6: The "Fake Remote" Trap**
  *   **Given** the user wants "Remote" or "Bengaluru".
  *   **And** a job text says "Remote (Must reside in US only)" or "Hybrid (3 days onsite in London)".
  *   **When** the Ranking Engine scores the lead.
  *   **Then** the lead is **REJECTED** (Score 0).
  *   **And** the `Reason` is explicitly "Geo-fenced: US Only" or "Hybrid Mismatch: London".

**Scenario 7: Multi-Location Parsing**
  *   **Given** a job posts says "Locations: Bengaluru, Singapore, or Remote".
  *   **When** processed.
  *   **Then** it is **ACCEPTED** because "Bengaluru" matches the user's preference.
  *   **And** the `Score_Breakdown` notes "Location Match: Bengaluru".

### Feature: Seniority & Domain Context
**Scenario 8: Title Inflation Check**
  *   **Given** a role titled "Senior Product Manager".
  *   **But** the description asks for "2 years of experience" or "recent grad".
  *   **When** the Ranking Engine runs.
  *   **Then** the Score is penalized (e.g., < 60).
  *   **And** the `Reason` flags "Experience Mismatch: Role appears junior (2 years)".

**Scenario 9: Adversarial Red Lines (False Positives)**
  *   **Given** "Gambling" is a Red Line.
  *   **And** a "Fintech PM" role mentions "Experience with high-risk verticals (e.g., crypto, gaming) is a plus".
  *   **When** scored.
  *   **Then** the system **DOES NOT** auto-reject it (Context implies payments for gaming, not making slot machines).
  *   **But** if the company description explicitly says "We are a leading Online Casino", **THEN** it rejects.

### Feature: Score Integrity
**Scenario 10: Deterministic Scoring**
  *   **Given** the same Job and Candidate Profile.
  *   **When** scored twice in two different runs.
  *   **Then** the `Match_Score` varies by no more than 5 points.
  *   **And** the top 3 `Pros` and `Cons` remain identical.

---

## Suite 3: System Resilience & Failure Recovery
**Goal:** Prove the pipeline recovers from crashes, partial writes, and API outages.

### Feature: Error Handling Strategies
**Scenario 11: Retry vs. Pause (Circuit Breaker)**
  *   **Given** the Search API returns a `503 Service Unavailable`.
  *   **When** the fetcher encounters the error.
  *   **Then** it retries 3 times with exponential backoff (1s, 2s, 4s).
  *   **If** it still fails, it logs "Dependency Down" and pauses the batch.
  *   **BUT** if it returns `401 Unauthorized`, it stops **IMMEDIATELY** (no retries).

**Scenario 12: Partial Write Recovery (Checkpointing)**
  *   **Given** a batch of 10 leads.
  *   **And** the system successfully writes 5 to Google Sheets, but crashes on the 6th (Network Error).
  *   **When** the "Run Now" button is clicked again.
  *   **Then** the system detects the 5 existing rows.
  *   **And** resumes processing from Lead #6.
  *   **And** **DOES NOT** create duplicate rows for 1-5.

---

## Suite 4: End-to-End Value Delivery
**Goal:** Verify the system can deliver value at scale, not just for one item.

### Feature: Batch Processing
**Scenario 13: Multiple Perfect Matches**
  *   **Given** the discovery phase finds 5 "Staff PM" roles at top-tier Fintech companies.
  *   **When** the pipeline completes.
  *   **Then** 5 distinct rows appear in `Leads_Scored`.
  *   **And** 5 distinct Gmail Drafts are created.
  *   **And** the drafts use the correct Company Name in the Subject Line for each (no copy-paste errors).

**Scenario 14: Near-Miss Handling**
  *   **Given** a role scores 65/100 (Good fit, but location is "Hybrid - Negotiable").
  *   **When** processed.
  *   **Then** it is added to Sheets with Status "Review".
  *   **And** **NO** draft is auto-generated (Drafts only for Score > 80).
  *   **And** the User can manually click "Approve" in the UI to generate the draft later.

---

## Suite 5: UX, Compliance & Auditability
**Goal:** Verify the user is in control and can trust the "Black Box".

### Feature: Audit Trails & Explainability
**Scenario 15: "Why Rejected?"**
  *   **Given** a lead is Auto-Rejected for "Location".
  *   **When** the user hovers over the "Rejected" status in the UI.
  *   **Then** a tooltip shows the *exact snippet* of text that triggered the rejection (e.g., "Extracted: 'Must reside in London'").

### Feature: Compliance & Safety
**Scenario 16: PII & Token Safety**
  *   **Given** the system logs debug info.
  *   **When** an error occurs during parsing.
  *   **Then** the logs show "Parsing failed for Item #123".
  *   **And** the logs **DO NOT** contain the raw full HTML body or the user's full API Key.

**Scenario 17: Draft Permissions Guardrail**
  *   **Given** the Gmail Token has expired or lacks `compose` scope.
  *   **When** attempting to draft.
  *   **Then** the system flags the error "Permissions Missing".
  *   **And** provides a direct link to the "Re-authenticate" flow.
  *   **And** preserves the Lead in Sheets so the user doesn't lose the opportunity.

---

## PART 2: USER VALUE & PRODUCT EXPERIENCE (Suites 6-15)

## Suite 6: Onboarding & Initial Setup
**Goal:** Ensure new users can configure the system correctly and understand what it will do.

### Feature: Guided Setup Wizard
**Scenario 18: First-Time User Happy Path**
  *   **Given** a user signs up for the first time.
  *   **When** they land on the Dashboard.
  *   **Then** they see a "Get Started" wizard with 5 steps: Profile → Target Roles → Location → Red Lines → Connect Gmail.
  *   **And** each step shows progress (Step 2 of 5).
  *   **And** the "Start Searching" button is disabled until all required fields are complete.

**Scenario 19: Configuration Preview**
  *   **Given** user completes the wizard with: "Staff PM", "Principal PM" | "Remote, Bengaluru" | "Fintech, Payments".
  *   **When** they reach the final step.
  *   **Then** the system shows a preview: "We'll search for: Staff/Principal PM roles in Fintech/Payments, Remote or Bengaluru-based, posted in the last 14 days."
  *   **And** shows expected query volume: "~15 queries per run, ~3 runs/day max."

**Scenario 20: Resume/LinkedIn Import**
  *   **Given** user pastes resume text containing "8.5 years", "Product Manager at Transak", "ZestMoney", "Payment orchestration".
  *   **When** they click "Auto-Extract Background".
  *   **Then** the system populates:
      *   Years of Experience: 8.5
      *   Key Skills: Payments, Fintech, BNPL, Web3
      *   Suggested Target Roles: "Staff PM", "Principal PM", "Lead PM"
  *   **And** prompts: "Review and edit before saving."

**Scenario 21: Invalid Configuration Warning**
  *   **Given** user selects: "Remote Only" + "Must be in SF Office".
  *   **When** they try to proceed.
  *   **Then** the system shows a warning: "⚠️ These filters conflict and may yield zero results. Suggested: Choose 'Hybrid' or remove office requirement."

---

## Suite 7: Results Quality & Relevance
**Goal:** Prove the system finds good jobs and filters out noise.

### Feature: Recall & Precision Benchmarks
**Scenario 22: Known Job Recall Test**
  *   **Given** a test fixture of 10 known high-quality jobs (e.g., Stripe Principal PM posted yesterday on LinkedIn, Revolut Staff PM on their careers page).
  *   **When** the discovery engine runs with a matching configuration.
  *   **Then** at least 8 of the 10 jobs appear in `Signals_Raw`.
  *   **And** at least 7 of them score > 75 in `Leads_Scored`.
  *   **Acceptance Criteria:** 80%+ recall on known-good jobs.

**Scenario 23: False Positive Rate Control**
  *   **Given** a discovery run yields 50 leads.
  *   **When** evaluated against ground truth labels (manual review or test fixtures).
  *   **Then** at least 35 leads (70%) are "Actually Relevant" (correct role, location, seniority).
  *   **And** no more than 5 leads (10%) are duplicates or dead links.

**Scenario 24: Freshness Enforcement**
  *   **Given** the configuration specifies `Max_Age_Days: 14`.
  *   **When** a discovery run completes.
  *   **Then** 100% of leads in `Leads_Scored` have `Posted_Date` within the last 14 days.
  *   **And** any results older than 14 days are discarded during ingestion with a log entry: "Filtered 12 stale results."

**Scenario 25: Source Diversity Check**
  *   **Given** a full discovery run.
  *   **When** examining `Leads_Scored`.
  *   **Then** results come from at least 3 different sources (e.g., LinkedIn, company careers pages, AngelList).
  *   **And** no single source accounts for > 60% of results (prevents over-reliance on one platform).

---

## Suite 8: User Control & Feedback Loops
**Goal:** Enable users to tune the system and teach it their preferences.

### Feature: Lead Feedback & Learning
**Scenario 26: Thumbs Down Feedback**
  *   **Given** a lead for "Principal PM at Robinhood" with high equity, low base salary.
  *   **When** user clicks "Not Interested" and selects reason: "Compensation structure doesn't match my preference".
  *   **Then** the system tags the lead as `User_Rejected`.
  *   **And** future leads from companies with similar comp patterns (high equity %) get a -10 score adjustment.
  *   **And** the Dashboard shows: "🧠 Learning: You prefer higher base salaries."

**Scenario 27: Positive Signal Reinforcement**
  *   **Given** user marks 3 "Staff PM" roles at Series B Fintech companies as "High Priority".
  *   **When** the next run executes.
  *   **Then** Series B stage companies get a +5 score boost.
  *   **And** the score breakdown shows: "Stage Preference Match: Series B (+5)."

**Scenario 28: Custom Role Expansion**
  *   **Given** user realizes the system isn't finding "Growth PM" or "Platform PM" roles.
  *   **When** they add these to Target Roles in Settings and click "Save".
  *   **Then** the next run includes queries for these roles.
  *   **And** after completion, the UI shows: "✨ Added 'Growth PM' → 8 new leads found."

**Scenario 29: Source Filtering**
  *   **Given** user is frustrated with low-quality leads from "jobs.example.com".
  *   **When** they add "jobs.example.com" to the "Muted Sources" list.
  *   **Then** future discovery runs exclude that domain.
  *   **And** existing leads from that source are marked `Status: Muted` (not deleted, allowing undo).

---

## Suite 9: Email Draft Quality & Personalization
**Goal:** Ensure drafts are compelling, accurate, and ready to send.

### Feature: Contextual Personalization
**Scenario 30: Relevant Experience Highlighting**
  *   **Given** a lead for "Staff PM, Payments" at Stripe.
  *   **And** user background includes "Built payment orchestration at Transak, scaled BNPL at ZestMoney".
  *   **When** the draft is generated.
  *   **Then** the body includes a specific talking point: "At Transak, I built payment orchestration handling $X in volume, which aligns with Stripe's embedded finance infrastructure."
  *   **And** it **DOES NOT** include generic phrases like "I'm passionate about product management."

**Scenario 31: Company-Specific Hook**
  *   **Given** a lead from Rippling (HR/Payroll SaaS).
  *   **And** user has no direct HR experience but has Fintech/Compliance background.
  *   **When** draft is generated.
  *   **Then** it bridges the gap: "While my background is in Fintech compliance, I've worked extensively with KYC/onboarding flows, which directly translates to Rippling's HR automation challenges."

**Scenario 32: No Hallucinations**
  *   **Given** user's resume states "Led a team of 3 engineers".
  *   **When** drafts are generated across 10 leads.
  *   **Then** NONE of the drafts claim "Led a team of 20" or "Managed $50M budget" (facts not in the resume).
  *   **And** all quantitative claims (team size, revenue, users) are traceable to the input profile.

**Scenario 33: Tone Consistency**
  *   **Given** user has set communication style to "Professional, Direct, Concise".
  *   **When** drafts are generated.
  *   **Then** they avoid:
      *   Overly formal: "I am writing to express my utmost interest in the aforementioned position."
      *   Overly casual: "Hey! Saw you're hiring, would love to chat!"
  *   **And** average draft length is 150-200 words (not 500-word essays).

**Scenario 34: Subject Line Consistency**
  *   **Given** 5 leads across different companies.
  *   **When** drafts are created.
  *   **Then** all subject lines follow the format: "Adarsh Senapati | [Role] ([YOE], [Domain])"
      *   Examples:
      *   "Adarsh Senapati | Staff PM (8.5 YOE, Fintech/Payments)"
      *   "Adarsh Senapati | Principal PM (Payments/Web3)"
  *   **And** company name appears in the body, not the subject (to avoid spam filters).

---

## Suite 10: Competitive Intelligence & Context
**Goal:** Help users evaluate opportunities with rich context.

### Feature: Company Enrichment
**Scenario 35: Funding & Stage Context**
  *   **Given** a lead from "PayGlocal" (a company user previously researched).
  *   **When** the lead is displayed in the Dashboard.
  *   **Then** it shows enriched data:
      *   Stage: Series B
      *   Funding: $25M (Dec 2024)
      *   Headcount: 150-200
  *   **And** a link to Crunchbase/LinkedIn company page.

**Scenario 36: Recent News Signals**
  *   **Given** a lead from a company that recently announced a major partnership (e.g., "Stripe partners with Shopify").
  *   **When** the lead is displayed.
  *   **Then** the UI shows a "📰 Recent News" badge.
  *   **And** clicking it reveals: "Stripe announced Shopify integration (2 days ago)—high-growth signal."

**Scenario 37: Glassdoor Integration**
  *   **Given** a lead from a company with a Glassdoor rating.
  *   **When** displayed.
  *   **Then** it shows: "Glassdoor: 4.2/5 (based on 200 reviews)."
  *   **And** highlights top pros/cons from reviews (e.g., "Pros: Great work-life balance. Cons: Slow decision-making").

### Feature: Role Comparison
**Scenario 38: Side-by-Side Comparison View**
  *   **Given** 5 "Principal PM" leads in `Leads_Scored`.
  *   **When** user selects 3 and clicks "Compare".
  *   **Then** the UI displays a table with columns: Company, Role, Comp Range, Stage, Team Size, Location, Match Score.

**Scenario 39: Compensation Benchmarking**
  *   **Given** 10 leads with salary data.
  *   **When** user views the Dashboard.
  *   **Then** it shows a summary: "Avg salary for Staff PM (Fintech, Remote): $180-240K. Your leads range: $150-280K."
  *   **And** highlights outliers: "Stripe comp is in top 10% for this role."

---

## Suite 11: Notifications & Alerting
**Goal:** Keep users informed without overwhelming them.

### Feature: Smart Digest Emails
**Scenario 40: Daily Digest for New Leads**
  *   **Given** the system runs at 9 AM and finds 4 new leads (2 with Score > 85, 2 with Score 70-85).
  *   **When** the run completes.
  *   **Then** user receives an email by 9:15 AM with subject: "Job Radar: 4 New Leads (2 High Priority)."
  *   **And** the email includes:
      *   Summary table (Company, Role, Score)
      *   "Review Now" button linking to Dashboard
      *   Top lead preview: "🔥 Stripe Principal PM (Score: 92)"

**Scenario 41: No Spam on Zero Results**
  *   **Given** a scheduled run finds 0 new leads.
  *   **When** the run completes.
  *   **Then** user receives **NO** email (to avoid notification fatigue).
  *   **But** the Dashboard shows: "Last run: Today at 9 AM (0 new leads)."

**Scenario 42: High-Priority Instant Alert**
  *   **Given** user has enabled "Instant Alerts for Score > 90".
  *   **When** a lead scores 94 (e.g., "Principal PM at Coinbase, Remote").
  *   **Then** user receives a Slack/email notification within 5 minutes: "🚨 Hot Lead: Principal PM @ Coinbase (Score: 94). Review now: [link]."

### Feature: Slack/Telegram Integration
**Scenario 43: Slack Channel Posting**
  *   **Given** user has connected their Slack workspace.
  *   **When** a lead with Score > 85 is found.
  *   **Then** a message posts to the configured channel.

---

## Suite 12: Application Tracking & Lifecycle
**Goal:** Help users manage the full job search funnel, not just discovery.

### Feature: Application Status Management
**Scenario 44: Marking as Applied**
  *   **Given** user sends a draft email from Gmail.
  *   **When** they click "Mark as Applied" in the Dashboard (next to the lead).
  *   **Then** the row in `Leads_Scored` updates:
      *   Status: "Applied"
      *   Applied_Date: Today
      *   Last_Updated: Timestamp
  *   **And** a follow-up reminder is auto-scheduled: "Follow up in 7 days if no response."

**Scenario 45: Interview Scheduling**
  *   **Given** user receives an interview invite for "Stripe Principal PM".
  *   **When** they click "Log Interview" and enter date/time.
  *   **Then** the lead moves to `Status: Interview Scheduled`.
  *   **And** the system sends a reminder 24 hours before: "Interview tomorrow: Stripe Principal PM. [Prep Guide]."
  *   **And** suggests prep resources: "Stripe PM Interview Guide", "System Design for Payments".

**Scenario 46: Rejection Tracking & Learning**
  *   **Given** user marks a lead as "Rejected (by company)".
  *   **When** they select a reason: "Not enough experience with X".
  *   **Then** the system logs the feedback.
  *   **And** suggests: "Consider adding [X skill] to your profile or targeting roles with less emphasis on X."

**Scenario 47: Offer Comparison**
  *   **Given** user has 2 leads in `Status: Offer Received`.
  *   **When** they view the Dashboard.
  *   **Then** it highlights: "🎉 You have 2 offers! Compare: [Stripe vs Rippling]."
  *   **And** the comparison shows: Base, Equity, Benefits, Team Size, Growth Stage.

---

## Suite 13: Transparency & Trust-Building
**Goal:** Make the "black box" transparent so users trust the system.

### Feature: Search Coverage Reports
**Scenario 48: Post-Run Summary**
  *   **Given** a discovery run completes.
  *   **When** user opens the Dashboard.
  *   **Then** it shows a summary card:
      *   📊 Last Run: Dec 29, 9:00 AM - Searched: LinkedIn (50 results), AngelList (20), Hacker News (5), 4 careers pages - Found: 75 raw signals - Qualified: 12 leads (Score > 70) - Rejected: 63 (28 location, 20 too junior, 15 red lines)

**Scenario 49: False Negative Investigation**
  *   **Given** user manually pastes a URL: "Why didn't you find this Fintech PM role at Mercury?"
  *   **When** they click "Analyze URL".
  *   **Then** the system fetches and scores the role retroactively.
  *   **And** shows: "This role was found but rejected. Reason: Hybrid (SF only). Your filter requires Remote. Update your location preferences to include Hybrid SF roles."

**Scenario 50: Scoring Breakdown Drill-Down**
  *   **Given** a lead with `Match_Score: 72`.
  *   **When** user clicks "Why this score?"
  *   **Then** a modal shows:
      *   Match Score Breakdown: ✅ Role Match (Principal): +30 ✅ Domain Match (Fintech/Payments): +25 ⚠️ Location (Hybrid SF, not Remote): -10 ✅ Experience Fit (8+ YOE): +20 ❌ Comp Below Target ($150K vs $180K+): -15 ✅ Company Stage (Series B, funded): +10 ⚠️ Team Size (Small, 3 PMs): -5 --- Final Score: 72/100

### Feature: Query Transparency
**Scenario 51: Show Search Queries**
  *   **Given** user wants to understand what the system is searching for.
  *   **When** they click "View Queries" in Settings.
  *   **Then** it displays the exact search strings being used.
  *   **And** allows user to test queries: "Preview Results" button opens a new tab with Google Search for that exact query.

---

## Suite 14: Performance & UX Responsiveness
**Goal:** Ensure the tool feels fast and responsive, not a slow batch process.

### Feature: Progressive Results Loading
**Scenario 52: Streaming Results**
  *   **Given** user clicks "Run Now".
  *   **When** the discovery phase is running.
  *   **Then** the UI updates every 5 seconds with: "⏳ Searching... Found 15 signals so far..."
  *   **And** leads appear in the table incrementally as they're scored (not all at once after 10 minutes).

**Scenario 53: Background Runs Don't Block UI**
  *   **Given** a scheduled run is executing.
  *   **When** user opens the Dashboard.
  *   **Then** the UI is fully interactive (they can review past leads, edit settings, read drafts).
  *   **And** a status bar shows: "⏳ Background run in progress: 30% complete."

**Scenario 54: Mobile Responsiveness**
  *   **Given** user opens the Dashboard on a mobile device (iOS Safari, 375px width).
  *   **When** viewing the Leads table.
  *   **Then** columns stack vertically or become horizontally scrollable.
  *   **And** buttons are at least 44x44px (tappable).
  *   **And** drafts are readable without horizontal scrolling.

**Scenario 55: Lazy Loading for Large Datasets**
  *   **Given** the `Leads_Scored` sheet has 500 rows.
  *   **When** user opens the Dashboard.
  *   **Then** only the first 50 rows load initially.
  *   **And** scrolling to the bottom triggers: "Load more..." and fetches the next 50.

---

## Suite 15: Error Recovery & User Communication
**Goal:** When things break, users understand why and what to do.

### Feature: User-Friendly Error Messages
**Scenario 56: API Quota Exceeded (Search)**
  *   **Given** the Search API returns 429 Too Many Requests.
  *   **When** the error is caught.
  *   **Then** the Dashboard shows a banner: "⚠️ Search quota exceeded. We've paused to save your results. Next run available in: 1 hour. [Upgrade Plan]."
  *   **Not:** "Error 429: Resource exhausted."

**Scenario 57: Gmail Draft Failure with Remediation**
  *   **Given** Gmail API returns 403 Insufficient Permissions.
  *   **When** attempting to create a draft.
  *   **Then** the UI shows: "❌ Couldn't create drafts. Your Gmail connection needs 'Compose' permission. [Re-authenticate Gmail]."
  *   **And** the leads are preserved in Sheets with `Draft_Status: Pending Permissions`.

**Scenario 58: Stuck Run Auto-Recovery**
  *   **Given** a run has been "In Progress" for 90 minutes (timeout threshold: 60 minutes).
  *   **When** the system checks status.
  *   **Then** it auto-marks the run as "Failed (timeout)".
  *   **And** shows a prompt: "⚠️ Last run timed out. This may indicate an API issue. [Retry] [View Logs]."

**Scenario 59: Partial Success Transparency**
  *   **Given** a batch processes 10 leads, but extraction fails for 2 (website down).
  *   **When** the run completes.
  *   **Then** the Dashboard shows: "✅ 8/10 leads processed. 2 failed (sites unreachable). [View Failed Items]."
  *   **And** failed items are logged with URLs so user can manually check later.

---

## PART 3: PRODUCTION READINESS & ADVANCED FEATURES (Suites 16-35)

## Suite 16: Data Privacy, Security & GDPR Compliance
**Goal:** Ensure user data is protected, erasable, and handled according to legal standards.

**Scenario 60: Data Deletion (Right to be Forgotten)**
  *   **Given** user requests account deletion.
  *   **When** they confirm in the UI.
  *   **Then** all personal data (profile, resume, leads, drafts, logs) is purged within 30 days.
  *   **And** Google Sheets rows are anonymized (replace name with "User_[ID]_Deleted").
  *   **And** OAuth tokens are revoked.
  *   **And** user receives confirmation email: "Your data has been deleted."

**Scenario 61: Data Export (GDPR Article 20)**
  *   **Given** user clicks "Export My Data".
  *   **Then** system generates a ZIP file containing: profile JSON, all leads CSV, draft history, interaction logs.
  *   **And** download link expires after 48 hours.

**Scenario 62: OAuth Token Refresh Failure**
  *   **Given** Gmail refresh token expires (user revoked access).
  *   **When** system attempts to create drafts.
  *   **Then** it catches the error and prompts re-authentication.
  *   **And** DOES NOT retry indefinitely or leak the failed token in logs.

**Scenario 63: Cross-Site Scripting (XSS) Protection**
  *   **Given** a malicious job post contains: `<script>alert('XSS')</script>` in the title.
  *   **When** displayed in the Dashboard.
  *   **Then** the script tag is escaped/sanitized and rendered as plain text.

**Scenario 64: SQL Injection in Search Filters**
  *   **Given** user enters `; DROP TABLE leads; --` in a custom filter field.
  *   **Then** the input is sanitized and treated as a literal string, not SQL.

## Suite 17: Multi-User & Team Scenarios
**Goal:** Support collaboration and multiple user profiles.

**Scenario 65: Team Workspace (Multiple Job Seekers)**
  *   **Given** a career coach manages profiles for 5 clients.
  *   **When** they switch between profiles in the UI.
  *   **Then** leads, settings, and drafts are isolated per profile (no data leakage).

**Scenario 66: Shared Lead Collaboration**
  *   **Given** User A finds a lead they want to share with User B.
  *   **When** they click "Share Lead".
  *   **Then** User B receives a notification and can view (but not edit) the lead.

**Scenario 67: Role-Based Access Control (RBAC)**
  *   **Given** a "Viewer" role user.
  *   **Then** they can see leads but cannot trigger runs, edit settings, or send drafts.

## Suite 18: Data Retention, Archival & Cleanup
**Goal:** Maintain system performance and hygiene over long periods.

**Scenario 68: Auto-Archival of Old Leads**
  *   **Given** a lead has been in "Rejected" status for 90 days.
  *   **When** the cleanup job runs.
  *   **Then** the lead is moved to an "Archived" sheet (not deleted).
  *   **And** Dashboard shows only active leads by default (with "Show Archived" toggle).

**Scenario 69: Duplicate Lead Over Time**
  *   **Given** the same job is re-posted 30 days later (new URL).
  *   **When** discovered again.
  *   **Then** system detects similarity (same company, role, description 90%+ match).
  *   **And** shows: "⚠️ Similar to a lead you rejected 30 days ago. [View Previous]."

**Scenario 70: Historical Trend Analysis**
  *   **Given** user has been using the tool for 3 months.
  *   **When** they view Analytics.
  *   **Then** it shows: "Trends: Avg leads/week: 12 → 8 → 15. Most active source: LinkedIn (60%)."

## Suite 19: Cost Management & Budget Tracking
**Goal:** Prevent unexpected API costs.

**Scenario 71: API Cost Tracking**
  *   **Given** user has consumed 10K Gemini tokens and 500 Search API calls this month.
  *   **When** they view Settings → Usage.
  *   **Then** it shows: "Estimated cost: $15.20 this month. Budget: $20. [Set Alerts]."

**Scenario 72: Budget Limit Enforcement**
  *   **Given** user sets a monthly budget of $20.
  *   **And** usage reaches $19.50.
  *   **When** next run is triggered.
  *   **Then** it pauses and alerts: "⚠️ Approaching budget limit. Approve to continue or wait until next month."

**Scenario 73: Free Tier Rate Limiting**
  *   **Given** free-tier user has made 3 runs today (daily limit).
  *   **When** they click "Run Now" a 4th time.
  *   **Then** UI shows: "Daily limit reached (3/3). Next run available in 6 hours. [Upgrade to Pro]."

## Suite 20: Integration Health Monitoring
**Goal:** Ensure dependencies are healthy and alert on failures.

**Scenario 74: Integration Status Dashboard**
  *   **Given** Gmail API is experiencing downtime (outside of a run).
  *   **When** user opens Dashboard.
  *   **Then** a status bar shows: "⚠️ Gmail API: Degraded. Drafts may be delayed."
  *   **And** links to a status page or retry timeline.

**Scenario 75: Proactive Health Checks**
  *   **Given** the system hasn't successfully written to Sheets in 12 hours.
  *   **Then** it sends an admin alert: "Sheets integration unhealthy. Check permissions."

## Suite 21: Content Parsing Robustness
**Goal:** Handle diverse and messy job post formats.

**Scenario 76: Non-English Job Posts**
  *   **Given** a job post is entirely in Spanish.
  *   **When** processed.
  *   **Then** system either translates (using Gemini) or tags Language: Spanish and skips scoring.

**Scenario 77: PDF Job Descriptions**
  *   **Given** a job post links to a PDF (not HTML text).
  *   **When** system attempts extraction.
  *   **Then** it uses a PDF-to-text parser.
  *   **Or** logs: "PDF content—manual review required" and marks for user review.

**Scenario 78: Image-Only Job Posts**
  *   **Given** a job is posted as an image (no extractable text, e.g., Instagram).
  *   **Then** system tags it: "Image post—OCR needed" or skips with explanation.

**Scenario 79: Paywalled Content**
  *   **Given** a job post is behind a Medium paywall or requires login.
  *   **Then** system detects partial content and logs: "Paywalled—extraction incomplete."

**Scenario 80: Malformed HTML/Unicode Issues**
  *   **Given** a job post contains broken encoding (e.g., MÃ¼nchen instead of München).
  *   **Then** system normalizes Unicode and logs: "Fixed encoding issues."

## Suite 22: Browser & Device Compatibility
**Goal:** Ensure consistent experience across platforms.

**Scenario 81: Cross-Browser Testing**
  *   **Given** user accesses Dashboard on Safari, Chrome, Firefox, Edge.
  *   **Then** all core features (viewing leads, generating drafts, editing settings) work identically.

**Scenario 82: Offline Mode (PWA)**
  *   **Given** user loses internet connection while viewing Dashboard.
  *   **Then** cached leads remain viewable (read-only).
  *   **And** UI shows: "⚠️ Offline. Changes will sync when reconnected."

## Suite 23: Accessibility (A11y)
**Goal:** Make the tool usable for everyone.

**Scenario 83: Screen Reader Support**
  *   **Given** a user navigating with NVDA/JAWS screen reader.
  *   **Then** all buttons, links, and form fields have descriptive labels (ARIA).
  *   **And** lead scores are announced: "Match score: 72 out of 100."

**Scenario 84: Keyboard Navigation**
  *   **Given** user navigates using only Tab/Enter/Escape keys.
  *   **Then** all interactive elements are reachable and actionable.
  *   **And** focus indicators are visible.

**Scenario 85: High Contrast Mode**
  *   **Given** user enables high-contrast mode (OS-level).
  *   **Then** Dashboard respects user preference and remains readable.

## Suite 24: Settings Validation & Edge Cases
**Goal:** Prevent user errors in complex configurations.

**Scenario 86: Extreme Query Volume Warning**
  *   **Given** user configures 20 target roles × 10 locations × 5 domains.
  *   **Then** system warns: "⚠️ This will generate 1000+ queries per run. Recommended: < 50. [Optimize Config]."

**Scenario 87: Contradictory Red Lines**
  *   **Given** user sets Red Line: "No Crypto" but Target Domain: "Web3".
  *   **Then** system flags the conflict: "⚠️ 'No Crypto' may eliminate most 'Web3' roles."

**Scenario 88: Resume Too Large**
  *   **Given** user uploads a 50-page resume (500KB).
  *   **Then** system prompts: "⚠️ Resume too long. Use a 1-2 page summary for better results."

## Suite 25: Advanced Filtering & Search
**Goal:** Empower users to manage large volumes of leads.

**Scenario 89: Search Within Leads**
  *   **Given** user has 200 leads in Sheets.
  *   **When** they search "Stripe" in Dashboard.
  *   **Then** only leads with "Stripe" in company name or description appear.

**Scenario 90: Bulk Actions**
  *   **Given** user selects 10 leads.
  *   **When** they click "Bulk Archive".
  *   **Then** all 10 are moved to Archived status in one action.

**Scenario 91: Custom Tags**
  *   **Given** user wants to tag certain leads "Follow-up Needed".
  *   **When** they add a custom tag.
  *   **Then** the tag appears on the lead and is filterable: "Show all 'Follow-up Needed' leads."

## Suite 26: Resume & Portfolio Attachments
**Goal:** Handle supplemental application materials.

**Scenario 92: Resume File Upload**
  *   **Given** user uploads a PDF resume.
  *   **Then** system extracts text and stores the file link.
  *   **And** drafts include: "Resume attached" (if Gmail supports attachments).

**Scenario 93: Portfolio Link Validation**
  *   **Given** user enters a portfolio URL: "htps://portfolio.com" (typo).
  *   **Then** system validates and suggests: "Did you mean https://portfolio.com?"

## Suite 27: Network & Referral Tracking
**Goal:** Leverage social connections for job search.

**Scenario 94: Referral Source Tracking**
  *   **Given** user applies to a role via a referral from "John Doe".
  *   **When** they log the application.
  *   **Then** they can note: "Referred by: John Doe (LinkedIn connection)."
  *   **And** system tracks: "Referrals → 30% higher response rate."

**Scenario 95: LinkedIn Connection Import**
  *   **Given** user connects LinkedIn.
  *   **When** a lead is from a company where they have 2nd-degree connections.
  *   **Then** UI shows: "💼 You have 2 connections at Stripe. [Ask for Referral]."

## Suite 28: Machine Learning Quality & Drift
**Goal:** Ensure AI scoring remains accurate over time.

**Scenario 96: Model Performance Monitoring**
  *   **Given** user marks 10 leads as "Great Match" but all scored < 70.
  *   **Then** system flags: "⚠️ Model may be under-scoring. Admin review needed."

**Scenario 97: A/B Testing Prompts**
  *   **Given** system is testing two prompt versions for scoring.
  *   **When** user participates in A/B test (randomly assigned).
  *   **Then** their feedback (thumbs up/down) is logged per prompt version for later analysis.

## Suite 29: Calendar Integration
**Goal:** seamless scheduling management.

**Scenario 98: Google Calendar Sync**
  *   **Given** user logs an interview for Dec 30, 2 PM.
  *   **When** they enable Calendar Sync.
  *   **Then** a calendar event is auto-created: "Interview: Stripe Principal PM."
  *   **And** includes prep links in the event description.

**Scenario 99: Interview Rescheduling**
  *   **Given** an interview is moved from Dec 30 → Jan 5.
  *   **When** user updates the date.
  *   **Then** the calendar event is updated (not duplicated).

## Suite 30: Email Integration Beyond Drafts
**Goal:** Track communication effectiveness.

**Scenario 100: Email Tracking (Read Receipts)**
  *   **Given** user sends a draft via Gmail.
  *   **When** recipient opens the email.
  *   **Then** system logs: "Email opened: Dec 29, 10:05 AM" (requires tracking pixel or Gmail extension).

**Scenario 101: Follow-Up Automation**
  *   **Given** user hasn't received a response in 7 days.
  *   **When** the follow-up reminder triggers.
  *   **Then** system suggests: "Send a polite follow-up? [Draft Follow-Up Email]."

## Suite 31: Performance Under Load
**Goal:** Verify scalability.

**Scenario 102: Concurrent Runs (Stress Test)**
  *   **Given** 100 users trigger runs simultaneously.
  *   **Then** all runs complete without crashing.
  *   **And** average response time < 10 seconds per run.

**Scenario 103: Large Batch Processing**
  *   **Given** a single run discovers 500 raw signals.
  *   **Then** system processes them in batches of 50 (to avoid memory issues).
  *   **And** progress updates every batch.

## Suite 32: Internationalization (i18n)
**Goal:** Support global users.

**Scenario 104: UI Language Selection**
  *   **Given** user is in India and prefers Hindi.
  *   **When** they select "हिन्दी" in Settings.
  *   **Then** all UI text (buttons, labels, errors) displays in Hindi.
  *   **But** job post content remains in original language.

**Scenario 105: Currency Localization**
  *   **Given** a job post lists salary as "£80K".
  *   **When** displayed to a user in India.
  *   **Then** system shows: "£80K (~₹84L)" with conversion rate and date.

## Suite 33: Compliance & Legal
**Goal:** Meet legal requirements.

**Scenario 106: Terms of Service Acceptance**
  *   **Given** a new user signs up.
  *   **Then** they must accept ToS and Privacy Policy (checkbox + link).
  *   **And** acceptance is logged with timestamp.

**Scenario 107: Age Gate (COPPA Compliance)**
  *   **Given** user enters birthdate indicating age < 13.
  *   **Then** signup is blocked: "You must be 13+ to use this service."

## Suite 34: Edge Cases in Scoring Logic
**Goal:** Handle subtle scoring nuances.

**Scenario 108: Missing Salary Data**
  *   **Given** a job post doesn't mention compensation.
  *   **Then** scoring skips the comp component (neutral, not penalty).
  *   **And** score breakdown notes: "Compensation: Not disclosed."

**Scenario 109: Ambiguous Seniority (IC vs Manager)**
  *   **Given** a "Principal PM" role requires "people management experience".
  *   **And** user profile is IC-focused.
  *   **Then** score is adjusted: "Management requirement may not align (-10)."

**Scenario 110: Startup Stage Ambiguity**
  *   **Given** a company is "Series A" but description says "5 years old, profitable".
  *   **Then** system flags inconsistency: "⚠️ Stage data conflict. Verify manually."

## Suite 35: User Engagement & Retention
**Goal:** Keep users active and motivated.

**Scenario 111: Gamification (Streak Tracking)**
  *   **Given** user has applied to 1+ role for 7 consecutive days.
  *   **Then** Dashboard shows: "🔥 7-day streak! Keep it up."

**Scenario 112: Weekly Summary Email**
  *   **Given** user has been inactive for 7 days.
  *   **Then** they receive: "You have 5 unreviewed leads. [Review Now]."

**Scenario 113: Success Stories**
  *   **Given** user marks a lead as "Offer Accepted".
  *   **Then** system prompts: "🎉 Congrats! Share your success story? [Optional Survey]."

---


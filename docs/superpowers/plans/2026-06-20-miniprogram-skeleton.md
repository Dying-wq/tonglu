# Campus Mutual Aid Miniprogram Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable WeChat Mini Program skeleton for the campus mutual aid platform, including core pages, cloud function placeholders, and tested shared business rules.

**Architecture:** The app uses native WeChat Mini Program files at the repository root and places reusable constants and pure business logic under `miniprogram/utils`. Cloud functions live under `cloudfunctions`, with each function owning a focused operation. Tests run in Node against pure JavaScript utilities so the most important rules can be verified outside WeChat DevTools.

**Tech Stack:** Native WeChat Mini Program, WeChat Cloud Development, JavaScript, Node built-in test runner.

---

## File Structure

- `project.config.json`: WeChat DevTools project metadata.
- `app.js`, `app.json`, `app.wxss`: global app setup, routing, tab bar, shared styles.
- `miniprogram/utils/constants.js`: service types, statuses, rank thresholds, risk words.
- `miniprogram/utils/rank.js`: rank calculation, review score calculation, monthly rank decay.
- `miniprogram/utils/risk.js`: chat risk keyword detection.
- `miniprogram/utils/mock-data.js`: local demo data for first-screen pages.
- `miniprogram/pages/home/*`: home page with five service entrances and previews.
- `miniprogram/pages/messages/*`: conversation list page.
- `miniprogram/pages/publish/*`: publish type selection and simple form.
- `miniprogram/pages/profile/*`: user profile, rank, records, admin entrance.
- `miniprogram/pages/service-list/*`: shared list page for five service types.
- `miniprogram/pages/service-detail/*`: shared detail page with action button and risk prompt.
- `miniprogram/pages/chat/*`: polling-style chat UI scaffold and WeChat exchange request action.
- `miniprogram/pages/order-detail/*`: order state scaffold and confirm complete action.
- `miniprogram/pages/review/*`: review action scaffold showing score impact.
- `miniprogram/pages/admin/*`: mini-program admin entrance scaffold.
- `cloudfunctions/*/index.js`: cloud function placeholders for the agreed operations.
- `test/*.test.js`: Node tests for rank and risk utilities.

## Task 1: Tested Core Rules

**Files:**
- Create: `package.json`
- Create: `test/rank.test.js`
- Create: `test/risk.test.js`
- Create: `miniprogram/utils/constants.js`
- Create: `miniprogram/utils/rank.js`
- Create: `miniprogram/utils/risk.js`

- [ ] **Step 1: Write failing tests**

Create tests for rank thresholds, review score changes, monthly rank decay, and risk keyword detection.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because the utility files do not exist yet.

- [ ] **Step 3: Implement minimal utility code**

Implement constants, rank helpers, and risk detection.

- [ ] **Step 4: Run tests and verify pass**

Run: `npm test`

Expected: PASS.

## Task 2: Native Mini Program Skeleton

**Files:**
- Create: `project.config.json`
- Create: `app.js`
- Create: `app.json`
- Create: `app.wxss`
- Create: page files under `miniprogram/pages/**`
- Create: `miniprogram/utils/mock-data.js`

- [ ] **Step 1: Create app configuration**

Define all MVP pages and tab bar routes.

- [ ] **Step 2: Create shared mock data**

Add demo services, posts, conversations, orders, and user profile data.

- [ ] **Step 3: Create pages**

Add WXML, WXSS, JS, and JSON files for the core pages.

- [ ] **Step 4: Run static sanity checks**

Run: `node --check` for all JavaScript files.

Expected: no syntax errors.

## Task 3: Cloud Function Placeholders

**Files:**
- Create: `cloudfunctions/login/index.js`
- Create: `cloudfunctions/createPost/index.js`
- Create: `cloudfunctions/acceptOrder/index.js`
- Create: `cloudfunctions/sendMessage/index.js`
- Create: `cloudfunctions/confirmComplete/index.js`
- Create: `cloudfunctions/submitReview/index.js`
- Create: `cloudfunctions/requestWechatExchange/index.js`
- Create: `cloudfunctions/respondWechatExchange/index.js`
- Create: `cloudfunctions/createComplaint/index.js`
- Create: `cloudfunctions/adminUpdateStatus/index.js`
- Create: `cloudfunctions/monthlyRankDecay/index.js`

- [ ] **Step 1: Add focused function stubs**

Each cloud function validates required input lightly and returns a clear placeholder response.

- [ ] **Step 2: Run syntax checks**

Run: `node --check` for each function.

Expected: no syntax errors.

## Self-Review

- Spec coverage: This plan covers the first MVP foundation: project config, pages, tested rank rules, tested risk rules, and cloud function placeholders. It does not implement real cloud database writes yet; that belongs in the next implementation plan.
- Placeholder scan: The only placeholders are intentional cloud function stubs that return explicit `not_implemented`-style scaffold responses for future implementation.
- Type consistency: Service types, statuses, rank names, and review ratings are centralized in `constants.js`.

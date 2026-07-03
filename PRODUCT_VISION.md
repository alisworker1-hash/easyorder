# EasyOrder - Product Vision

> This document is the primary product vision. All development should align to it.
> Companion docs: [ARCHITECTURE.md](ARCHITECTURE.md), [PROCUREMENT_MVP.md](PROCUREMENT_MVP.md),
> [ROADMAP.md](ROADMAP.md), [INTEGRATIONS.md](INTEGRATIONS.md).

## North Star

**EasyOrder exists to help buyers discover the best supplier - not the biggest supplier -
for every procurement need.** The best answer may come from a national retailer, a regional
distributor, or a local family-owned business. EasyOrder's job is to intelligently discover
those suppliers, gather the information needed to compare them, and recommend the best
procurement path based on the buyer's priorities. That mission guides every architectural
decision.

EasyOrder is **not** trying to become another Amazon or Home Depot, and it does **not** try
to own the transaction. Discovery is the value.

## What EasyOrder Is

EasyOrder is an **AI-powered Procurement Discovery Platform** - the operating system for
purchasing. It searches for **solutions, not products**: a need ("I need a replacement
window screen") expands into the kinds of businesses that could solve it (screen-repair
services, glass companies, window companies, hardware stores, mobile repair, handymen,
manufacturers), then finds and ranks the specific suppliers that best fit the buyer's
priorities.

Two engines power it (see [ARCHITECTURE.md](ARCHITECTURE.md) and [DISCOVERY.md](DISCOVERY.md)):
**Supplier Discovery** determines who should even be considered (the universe, before
pricing); **Procurement Intelligence** determines who should win (the recommendation, after
information is gathered).

Its job is to eliminate the friction between **identifying a need** and **acquiring the
right product or service**. Whether someone is buying groceries, building a shed,
remodeling a bathroom, replacing a window screen, or sourcing materials for a commercial
job, EasyOrder guides them through the entire procurement process.

The core question EasyOrder answers is:

> "I know what I need. What is the **best way** to acquire it?"

Not merely "where is it cheapest?" EasyOrder optimizes across:

- Price
- Availability
- Distance
- Delivery
- Lead time
- Number of suppliers
- Convenience
- User preferences

**EasyOrder is NOT a shopping website. It is NOT a price-comparison tool. It is an
AI-assisted procurement workspace.**

## Two Products - One Platform

EasyOrder is always one platform serving two customer groups, sharing **one procurement
engine** (see [ARCHITECTURE.md](ARCHITECTURE.md)).

### EasyOrder Home (Free) - consumers
Shopping lists, price comparison, window-screen replacement, automotive parts, home
improvement, furniture, electronics, marketplace comparisons.

### EasyOrder Pro (Subscription) - businesses
General contractors, remodelers, property managers, electricians, plumbers, landscapers,
small businesses. Value: procurement, quote management, supplier management, RFQs, purchase
planning, team workflows.

## Launch Focus

Long term includes consumers. **Immediate priority is the business procurement platform** -
EasyOrder as an AI business procurement assistant. **First pilot customer: a general
contractor.** The MVP must solve a real contractor workflow before expanding to consumers.

## The Universal Command Bar

The central entry point. On opening EasyOrder, the user doesn't pick a module first - they
answer one question: **"What do you need today?"**

Examples:
- Build an 8x12 shed
- Replace a window screen
- Compare flooring prices
- Send RFQs for bathroom fixtures
- Show outstanding quotes
- Find the cheapest pressure-treated lumber
- Open the Smith Remodel project

The AI **determines intent and launches the appropriate workflow**, then hands off to a
**rich UI** - the user keeps working in real workspaces, not trapped in a chat. The AI
**orchestrates the platform; it does not replace the interface.**

## Primary Navigation (target state)

Connected workspaces, not isolated tools:

- Dashboard
- Projects
- Shopping Lists
- RFQs
- Suppliers
- Orders
- AI Assistant

Flows: Shopping List → Generate RFQs · Project → Shopping Lists · RFQ → Compare Quotes ·
Quotes → Orders. **Projects** contain shopping lists, RFQs, orders, notes, suppliers, and
files. **Shopping Lists** also exist independently for simple tasks.

## Supplier Strategy

Design around: Home Depot, Lowe's, Floor & Decor, Wayfair, Amazon, Target, Walmart, local
suppliers, lumber yards, specialty vendors.

**No scraping. No bypassing authentication. No account linking yet.** Architect so future
integrations connect through official APIs, partner programs, affiliate feeds, email
workflows, or other supported methods (see [INTEGRATIONS.md](INTEGRATIONS.md)).

**Discover suppliers, don't just list the ones the buyer named.** Given a need, EasyOrder
discovers candidates across many supplier categories - industrial distributors, hardware
stores, auto parts stores, big-box retailers, local bolt houses, machine shops, wholesalers,
specialty manufacturers, service providers - and ranks them by fit and proximity.

**Local businesses are part of the mission.** EasyOrder actively surfaces local suppliers a
buyer would otherwise never find, so they compete on service, expertise, responsiveness, and
proximity - not advertising budget. This is a core company value, encoded in discovery
ranking (see [DISCOVERY.md](DISCOVERY.md)).

**Never hide an option.** If a price, dimension, or detail is missing, EasyOrder shows the
supplier, explains what is missing, and recommends the next best action - it never drops a
supplier just because one field is unconfirmed.

## Development Principles

- Preserve existing functionality - the current app is our first working prototype, kept.
- Prefer additive changes over rewrites.
- Keep the architecture modular.
- Separate demo data from future live integrations.
- Keep business logic independent of UI.
- Build reusable procurement components.
- Optimize for future expansion over short-term hacks.

# EasyOrder - Product Vision

> This document is the primary product vision. All development should align to it.
> Companion docs: [ARCHITECTURE.md](ARCHITECTURE.md), [PROCUREMENT_MVP.md](PROCUREMENT_MVP.md),
> [ROADMAP.md](ROADMAP.md), [INTEGRATIONS.md](INTEGRATIONS.md).

## What EasyOrder Is

EasyOrder is an **AI-powered procurement platform** - the operating system for purchasing.

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

## Development Principles

- Preserve existing functionality - the current app is our first working prototype, kept.
- Prefer additive changes over rewrites.
- Keep the architecture modular.
- Separate demo data from future live integrations.
- Keep business logic independent of UI.
- Build reusable procurement components.
- Optimize for future expansion over short-term hacks.

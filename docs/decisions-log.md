# Decisions Log – Blackjack Card Counting Trainer

This document records all architectural and product decisions made during the project. Each decision is numbered, dated, and includes rationale.

---

## D-001: MVP includes all 5 Training Modes
**Date:** 2026-02-16
**Decision:** The MVP will include all 5 training modes: Speed Counting Drill, Table Counting with error correction, Deviation Training, Bet Spread Exercise, and Deck Estimation.
**Rationale:** The owner wants a comprehensive trainer from day one. Deck Estimation in particular fills a gap that only Casino Vérité currently addresses.
**Impact:** Phase 4 is the largest phase. Consider implementing modes in order of complexity (Speed Drill first, Deck Estimation last).

---

## D-002: Supabase for Persistence
**Date:** 2026-02-16
**Decision:** Use Supabase for user authentication, cloud-synced progress tracking, and session statistics. Include localStorage fallback for offline-first capability.
**Rationale:** Cloud sync enables cross-device progress. Supabase offers free tier with PostgreSQL, Auth, and Row-Level Security.
**Impact:** Adds F-008 (Supabase Auth & Persistence) to Phase 3. Service layer (`src/services/`) abstracts storage to allow fallback.

---

## D-003: English UI with Casino-Realistic Theme
**Date:** 2026-02-16
**Decision:** UI language is English. Visual theme is casino-realistic: green felt table, dark background, gold accents, realistic card rendering.
**Rationale:** English maximizes global reach. Casino-realistic theme provides immersive training experience closer to real casino conditions.
**Impact:** Tailwind config needs custom color palette (see CLAUDE.md UI Theme Constants). SVG cards should look realistic, not cartoon-style.

---

## D-004: React + Vite + TypeScript Stack
**Date:** 2026-02-16 (from PRD research)
**Decision:** React 18+ with Vite, TypeScript strict mode, Tailwind CSS, Zustand for state, Framer Motion for animations.
**Rationale:** Best AI code generation quality for React. Zustand is lightweight (~1KB) with no boilerplate. Vite provides fast HMR. TypeScript strict mode catches bugs in game logic early.
**Alternatives considered:** SvelteKit (30% faster loads, 40% less code, but smaller ecosystem and weaker AI code generation).

---

## D-005: Engine/UI Separation
**Date:** 2026-02-16 (from PRD research)
**Decision:** Game engine (`src/engine/`) is pure TypeScript with zero React dependencies. UI consumes engine through Zustand stores only.
**Rationale:** Enables 100% unit test coverage of game logic without DOM/React overhead. Claude Code generates better code for isolated logic. Allows potential future reuse (CLI, mobile, etc.).

---

## D-006: Array with Index Pointer for Shoe
**Date:** 2026-02-16 (from PRD research)
**Decision:** Shoe uses a pre-shuffled array with `dealIndex` pointer instead of `shift()`/`splice()`.
**Rationale:** O(1) per deal operation vs O(n). Cards with index < dealIndex are implicitly in the discard tray. Simpler, faster, more memory-efficient.

---

## D-007: Gamification Deferred to Post-MVP
**Date:** 2026-02-16
**Decision:** Achievements, streaks, leaderboards, and adaptive difficulty are NOT in MVP scope.
**Rationale:** Focus MVP on core training functionality. Gamification can be added incrementally after core features are solid and tested.

---

*Add new decisions below this line, maintaining sequential numbering.*

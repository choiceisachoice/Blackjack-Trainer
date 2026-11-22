# The level curve, read against three learners — 21 Nov 2026

No threshold was changed for this. The 25 levels (`LEVELS` in
`services/level-system.ts`) are as they were; this is a reading of how fast a
learner climbs them under the XP rules as they stand today, including the
weekly rewards added on the same day.

## How the numbers were made

`services/xp-curve.ts` walks a learner through the plan week by week and asks
the real code what each step pays: the day is the one `buildDayPlan` hands
out, a stage is finished when `deriveCurriculum` says so (sessions **and**
days), a session is worth what `sessionXP` returns (2 / 3 / 12 XP per correct
answer, ×1.25 from 85 %, ×1.5 from 95 %, 150 XP per mode and day), stages pay
`stageXP` (150–450, 1,950 for the whole road), a kept week pays 60 and the
week streak 50 / 100 / 200 / 400 at 2 / 4 / 8 / 12 weeks.

To print the tables again after changing a rule:

```bash
XP_CURVE_OUT=curve.md npx vitest run src/services/xp-curve.test.ts
```

**Assumed, because it is a person and not a rule**

- Every planned day is trained and every block of it is done. Nobody is this
  regular; read the weeks as a lower bound on time.
- One block is one drill at its default size: 20 flashcards, 5 Speed Drill
  runs, 20 deck estimates, 20 bet-spread questions, a 15-minute table sit of
  40 decisions.
- Accuracy averages 80 %. Where a stage's bar is higher (basic strategy 85 %,
  Hi-Lo 90 %, bet spread 85 %), two runs in three clear it and the third
  falls short by as much as keeps the average — the same two-in-three the
  plan's own forecast uses.
- Pro, from the first stage to the last.
- **Core** = sessions, stages, weekly goal, week streak. **+ challenges**
  adds a habit that is a guess and is stated here so it can be argued with:
  1 × 10 min — an easy daily (50) every fourth training day, no weekly;
  3 × 20 min — a medium daily (100) every second training day, a 300 weekly
  every second week; 7 × 60 min — a medium daily every day, a 500 weekly
  every week.
- Left out: achievement XP (all awards together are about 8,400 XP, once —
  roughly one level around level 10) and personal bests (50 XP each; the
  simulated learner repeats the same scores, so it never sets one; a real
  learner sets a handful per mode).
- Simulated for three years (156 weeks). A week marked `~` is beyond that and
  projected at the pace of the last twelve simulated weeks.

## Summary

| | 1 day × 10 min | 3 days × 20 min | 7 days × 60 min |
|---|---:|---:|---:|
| XP per week while on the plan (core) | 216 | 742 | 2,888 |
| XP per week after the plan (core) | 130 | 562 | 3,321 |
| XP per week after the plan (+ challenges) | 143 | 862 | 4,525 |
| **Plan finished in week** | **37** | **10** | **4** |
| **Level when the plan is finished (core)** | **10** | **10** | **10** |
| XP when the plan is finished (core) | 7,980 | 7,030 | 8,607 |
| Level when the plan is finished (+ challenges) | 10 | 11 | 11 |
| Level 25 reached in week (core / + challenges) | ~1,591 / ~1,452 | ~372 / ~242 | 64 / 47 |

Where the XP comes from, core, over the simulated run (156 / 156 / 64 weeks):

| | 1 day × 10 min | 3 days × 20 min | 7 days × 60 min |
|---|---:|---:|---:|
| Sessions | 11,447 | 77,438 | 204,260 |
| Stages | 1,950 | 1,950 | 1,950 |
| Weekly goal (60 a week) | 9,360 | 9,360 | 3,840 |
| Week streak (once) | 750 | 750 | 750 |
| Share of the weekly goal in a week after the plan | 46 % | 11 % | 2 % |

What one five-minute block pays at these scores: flashcards 38, Speed Drill
68, deck estimation 32, bet spread 38, deviations 32, the table 32 (96 for
the 15-minute sit).

## Week in which each level is reached

| Level | XP | 1 × 10 core | + chall. | 3 × 20 core | + chall. | 7 × 60 core | + chall. |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 |
| 2 | 50 | 1 | 1 | 1 | 1 | 1 | 1 |
| 3 | 200 | 2 | 2 | 1 | 1 | 1 | 1 |
| 4 | 450 | 4 | 4 | 1 | 1 | 1 | 1 |
| 5 | 850 | 6 | 6 | 2 | 2 | 1 | 1 |
| 6 | 1,400 | 8 | 8 | 3 | 2 | 1 | 1 |
| 7 | 2,200 | 11 | 11 | 4 | 3 | 2 | 1 |
| 8 | 3,300 | 14 | 14 | 5 | 4 | 2 | 2 |
| 9 | 4,800 | 24 | 22 | 7 | 5 | 3 | 2 |
| 10 | 6,800 | 33 | 31 | 10 | 8 | 3 | 2 |
| 11 | 9,400 | 48 | 44 | 13 | 10 | 4 | 3 |
| 12 | 12,800 | 74 | 68 | 19 | 13 | 5 | 4 |
| 13 | 17,000 | 107 | 97 | 27 | 18 | 6 | 5 |
| 14 | 22,000 | 145 | 132 | 36 | 24 | 8 | 6 |
| 15 | 28,000 | ~191 | ~174 | 47 | 30 | 9 | 7 |
| 16 | 35,500 | ~249 | ~227 | 60 | 39 | 12 | 9 |
| 17 | 44,500 | ~318 | ~290 | 76 | 50 | 14 | 11 |
| 18 | 55,000 | ~399 | ~364 | 95 | 62 | 17 | 13 |
| 19 | 67,500 | ~495 | ~452 | 117 | 76 | 21 | 16 |
| 20 | 82,000 | ~606 | ~553 | 143 | 94 | 26 | 19 |
| 21 | 99,000 | ~737 | ~673 | ~173 | 113 | 31 | 23 |
| 22 | 119,000 | ~891 | ~813 | ~209 | 136 | 37 | 27 |
| 23 | 143,000 | ~1,076 | ~981 | ~252 | ~164 | 44 | 32 |
| 24 | 172,000 | ~1,299 | ~1,185 | ~304 | ~198 | 53 | 39 |
| 25 | 210,000 | ~1,591 | ~1,452 | ~372 | ~242 | 64 | 47 |

## Reading

**The plan ends at level 10, whatever the pace.** One day a week or seven,
the last stage is finished with 7,000–8,600 XP. That is a property worth
keeping: almost all XP is paid per correct answer and the road is the same
length for everyone, so "finished the plan" and "level 10" are the same
place on the ladder. It also means the plan is the first two fifths of the
levels and four per cent of the XP: fifteen levels lie behind it.

**For a product that takes months, the middle is sensible.** At three days a
week the plan takes about ten weeks and the learner gains a level every one
to three weeks throughout it. At an hour a day the whole ladder is fifteen
months (eleven with challenges). Both are paces at which a level still means
something and still arrives.

**It races in the first week.** Level 4 in the first week at 3 × 20, level
6 in the first week at 7 × 60. Levels 2–6 need 50 / 200 / 450 / 850 / 1,400
XP and one ordinary day pays 150–470. Those five levels are an onboarding
gift rather than a measure. That is a property of the thresholds, which are
not to be raised; it is named here, not proposed against.

**It stalls after the plan for anyone who is not there every day.**

- 3 × 20 min: level 10 in week 10, then 11 in week 13, 13 in week 27, 15 in
  week 47, 20 in week 143 — and from level 15 on a level takes three to eight
  months. Level 25 is about seven years away (4½ with challenges).
- 1 × 10 min: level 10 in week 33, level 11 in week 48, level 12 in week 74,
  level 13 after two years. After the plan this learner earns 130 XP a week,
  and 60 of it is the weekly goal.

  The cause is the same in both cases: once the last stage is paid, nothing
  large is left to earn. Stages (the only "mastery" award of size) stop at
  1,950 XP in total, and what remains is answers at 2 XP each against steps of
  5,000 to 38,000.

**The flat weekly goal does what the brief asked, and shows its limit.** It is
46 % of a ten-minute learner's week and 2 % of a daily learner's — the
occasional learner gets something for keeping a promise, the heavy learner is
not paid twice. But it also means the lightest learner's level is now half
"turned up" and half "answered correctly".

**One drill pays twice the others.** A Speed Drill block is worth 68 XP at
these scores against 32–38 for every other five minutes, because a run is 12
XP and five perfect runs are multiplied by 1.5. It does not distort the plan
(the day limit of 150 per mode catches it after three blocks), but it makes
Hi-Lo warm-ups the best-paid minutes in the app.

## Options — XP sources only, none of them built

1. **Something to master after the plan: keep a stage sharp, month by month.**
   A finished stage that is drilled again to its own bar in a calendar month
   (say three qualifying sessions on two days) pays a part of its stage XP —
   e.g. 40 %, 60–180 XP per stage, 780 XP if all six are kept. Recorded like
   the weeks, as `sharp:<stage>:<yyyy-mm>` in the same union-merged set, so it
   cannot be collected twice. Estimated effect after the plan: +180 XP a week
   at most — the ten-minute learner cannot keep six stages in four sessions a
   month, so perhaps +50–90 there (130 → ~200), 3 × 20 goes from 562 to ~740
   (level 15 in about week 40 instead of 47), and the daily learner gains
   5 %. It pays exactly what a counter has to keep doing anyway, which is why
   it is first.

2. **Let the week streak go on.** Today it pays four times and then never
   again: a learner in week 13 of an unbroken run has no further milestone.
   Paying 100 XP for every further four weeks adds 25 XP a week, flat — +19 %
   for the ten-minute learner after the plan, +4 % at 3 × 20, under 1 % daily.
   Cheap, and it rewards the one behaviour that predicts finishing. On its own
   it does not close the gap; with option 1 the lightest learner is at roughly
   230–250 XP a week instead of 130, and level 12 comes about half a year
   sooner.

3. **Even out the drills: Speed Drill at 8 XP a run instead of 12.** A block
   would pay about 45 instead of 68, in line with the rest. It lowers the
   daily learner's week by roughly 8–10 % (level 25 in about 70 weeks instead
   of 64) and barely moves the others. Nobody loses a level — totals are never
   reduced — but future runs pay less, so this is the one option that takes
   something away and should only be taken if the imbalance is felt.

Not proposed: raising the per-answer rates across the board. It would shorten
the tail for everyone by the same factor, make the first week race even
faster, and leave the shape — quick, sensible, then flat — exactly as it is.

## Limits of this reading

- A learner who trains every planned day for three years does not exist; real
  weeks are lost, and a lost week costs the 60 and resets the streak.
- 80 % is one number. A learner at 95 % earns ×1.5 on every proven session and
  clears every bar at once; one at 70 % never finishes basic strategy.
- The challenge habit is a guess. At 3 × 20 it is the largest single lever in
  the table (562 → 862 a week), so the "+ challenges" columns are only as good
  as that guess.
- The free tier is not modelled: its road stops where the paywall begins.

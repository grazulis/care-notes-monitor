# Care Notes Monitor — implementation plan (hackday prototype)

A local web app that reads the notes and charts a care home's staff write every shift, compares
each resident's **last 24 hours and last few days against their own normal**, and gives the
morning handover a short, explained list: *who needs a clinical review today, who needs watching,
and why.*

> **Decision support, not diagnosis.** The app flags patterns and shows its evidence. The nurse
> decides. Wording throughout is "consider…" / "pattern consistent with…", never "has a UTI".
> It is a hackday demo on synthetic data: no auth, no privacy controls, and it runs locally.

---

## 1. The demo story (what we are building towards)

1. It's **07:30 handover, Thursday 25 September**. The nurse in charge opens the app.
2. **Handover board:** 30 residents, sorted by priority. 3 red, 5 amber, the rest green, with a
   one-line reason on each card: *"Hilda Entwistle: night toilet visits 1 → 6, new confusion,
   stinging on passing urine, T 37.9. Pattern consistent with UTI. Consider clinical review
   today."*
3. **Click Hilda:** 6-week sparklines (fluids, night toilet visits, wakings, meals) with her
   normal range shaded, so the change is obvious at a glance. Below them, the evidence list, each
   item linked to the note it came from, and her notes with the matched phrases highlighted.
4. **Replay:** drag the "as of" date back to 18 September. Everyone is green. Step forward a day
   at a time and watch Hilda go green → amber → red, and see *when* the app would first have
   noticed. This is the headline: **earlier than a busy team reading notes would have spotted it.**
5. **Trust:** open Peggy (COPD). She coughs every day, and the app knows that's her normal and
   says so. Same with Edna on furosemide. **The app compares each person with themselves, not
   with a textbook.**
6. **Live input:** type a new night note for Irene ("coughing all night, green phlegm, breathless")
   and her card moves from amber to red while you watch.

## 2. Clinical grounding (keeps rules defensible, and good for the pitch)

| Source | What we borrow |
|---|---|
| **RESTORE2 / "soft signs"** (UK care-home deterioration tool) | Soft signs: *not themselves*, new confusion, eating/drinking less, drowsy, falls. The framing of the whole app |
| **NEWS2** | Scored whenever obs exist. Aggregate ≥5 or any single parameter scoring 3 → red. Use SpO2 Scale 2 when the care plan says COPD with a target of 88–92% |
| **UKHSA: UTI in over-65s** | Care-home residents: **don't dipstick**. Look for new frequency/urgency, dysuria, new incontinence, new or worse confusion, temperature, rigors |
| **PINCH ME** (delirium causes) | For new confusion with no obvious cause: Pain, Infection, Constipation, Hydration, Medication, Environment. The app points at whichever of these it has evidence for |
| **Hydration** | Change against the person's own baseline matters more than the generic 1500ml target (see Gladys, the low drinker) |

## 3. Data (done: `npm run generate`)

Details in [`README.md`](README.md). In short:

- **30 residents** aged 80–100 across two units (Rose, Willow), with conditions, medications,
  mobility, continence, cognition, fluid target, and care-plan lines where "normal" is unusual.
- **3,780 shift records**: 42 care days × 3 shifts (early 07–14, late 14–21, night 21–07).
  Each record has **charted values** (fluids, meals %, toilet visits, incontinence, night
  wakings, bowels, falls, obs when taken) plus a **free-text note**.
- **Symptoms appear only in the free text**, as they do in real care notes: cough, sputum,
  breathlessness, confusion, dysuria, urine, sore mouth, abdominal pain. That's why the app needs
  text extraction as well as number-crunching.
- **13 scripted residents**, whose answers are in `ground-truth.json`:

| Resident | Scenario | Expected |
|---|---|---|
| R18 Hilda Entwistle | UTI developing over 4 days | 🔴 red |
| R06 Joan Schofield | Chest infection / pneumonia over 5 days, NEWS2 7 today | 🔴 red |
| R15 Mavis Duckworth | Dehydration, fluids halved over a week, dizzy today | 🔴 red (amber acceptable) |
| R23 Margaret Haworth | Early UTI, 2 nights, no obs yet | 🟠 amber |
| R28 Irene Heywood | New cough, worsening over 3 days | 🟠 amber |
| R14 Vera Crompton | Eating and drinking less: sore mouth | 🟠 amber |
| R02 Eileen Sutcliffe | Constipation: bowels not opened for 6 days | 🟠 amber |
| R08 Norman Whittaker | New confusion + 2 falls, cause unclear (delirium) | 🟠 amber |
| R03 Peggy Hargreaves | COPD: chronic cough, SpO2 92%, **stable** | 🟢 must not flag |
| R17 Edna Greenhalgh | Furosemide: frequent toileting, **stable** | 🟢 must not flag |
| R04 Gladys Barlow | Always drinks ~950ml, **stable** | 🟢 must not flag |
| R30 Stanley Marsden | Chest infection 3 weeks ago, recovered | 🟢 must not flag |
| R12 Sylvia Nuttall | One bad night last night, cause written in the note | 🟢 (amber tolerated, never red) |

The other 17 are well, with realistic noise: a one-off cough, a bad meal, an extra trip to the
toilet at night. A system that fires on any change will fail on them.

## 4. Architecture

Local only. No backend is required for the core demo.

```
Vite + React + TypeScript  (npm run dev → http://localhost:5173)
src/
  engine/        pure functions, no React, no I/O. Most tests live here
    features.ts    shift records → one row per resident per care day
    extract.ts     free text → symptom flags (lexicon + negation)
    baseline.ts    robust personal baseline (median / MAD) + recent windows
    news2.ts       NEWS2 score from an obs set
    rules/         one file per risk: uti, chest, hydration, bowels, delirium-falls
    score.ts       combine rule outputs → priority + ordered evidence
  data/          loads /data/*.json; holds notes added during the demo (in memory/localStorage)
  ui/            HandoverBoard, ResidentDetail, Sparkline, NoteList, AsOfScrubber, NoteEntry
data/            generated dataset (served statically)
```

- **Charts:** hand-rolled SVG sparklines, a shaded band for the baseline range and a vertical
  line for "as of". Around 60 lines, no charting dependency.
- **Tests:** Vitest. The engine is pure, so the ground-truth evaluation is an ordinary unit test.
- **Optional LLM layer (stretch, off by default so the demo runs offline):** a tiny Vite
  server-middleware proxy to the Claude API (`claude-sonnet-5`) for (a) a two-sentence handover
  summary per flagged resident and (b) cross-checking the lexicon extractor. The rules still
  decide the priority. The LLM only words it, so the demo stays explainable and repeatable.

## 5. The engine: how "today vs before" works

### 5.1 Features per resident per care day
From the charts: `fluidMl`, `mealPct` (mean of 2), `dayToilet`, `nightToilet`, `nightWakings`,
`incontinence`, `bowelsOpened`, `daysSinceBowels`, `falls`, latest `obs` + `news2`.
From the text (§5.2): `cough` (0/1/2), `sputum` (+colour), `breathless`, `confusionIncreased`,
`dysuria`, `urineChange`, `reluctantToDrink`, `soreMouth`, `drowsy`, `abdominalPain`,
plus `explainedDisturbance` (e.g. "woken by another resident").

### 5.2 Text extraction
A lexicon of phrases per symptom (`cough ++`, `chesty`, `phlegm`, `stings when passing urine`,
`not herself`, `not recognising staff`, …) with **NegEx-style negation** ("no cough", "nil
confusion", "denies pain": a negation word within ~4 tokens before the match cancels it). Also:

- **"usual"/"as normal"/"no change" qualifiers** mark a mention as chronic, e.g. Peggy's
  *"usual productive cough"*. Chronic mentions go into the baseline and never count as new.
- **Baseline-confusion phrases** ("pleasantly confused", "usual confusion") are *not* increased
  confusion.
- **Checked against `note-labels.json`**: a unit test asserts precision and recall ≥ 0.95 for each
  symptom. That's the extractor's contract.

### 5.3 Baseline
For as-of date *D*: **baseline window = D−42 … D−8**, **recent = D−2 … D** (3 days), **today = D**.
Baseline statistic = median, spread = MAD × 1.4826, with a floor per feature so a perfectly flat
baseline doesn't turn tiny changes into huge z-scores (fluids 120ml, toilet visits 0.7, wakings
0.7, meals 8%). For symptoms, the baseline is the *rate* (the share of days the symptom was
mentioned) and a chronic flag. The median shrugs off Stanley's old chest infection without
special-casing it.

### 5.4 Rules (each returns `{ risk, level: 0–3, evidence[] }`)

| Risk | Amber when… | Red when… |
|---|---|---|
| **UTI** | 2 of: night toilet z ≥ 2 on ≥ 2 of last 3 nights · day toilet z ≥ 2 · new incontinence · urine change · dysuria | amber **plus** any of: new confusion, T ≥ 37.9 (or +1.0 over personal baseline), rigors, NEWS2 ≥ 5 |
| **Chest** | new cough (baseline cough rate < 20%) on ≥ 2 days, **or** cough escalating from occasional to frequent | cough **plus** 2 of: sputum yellow/green · breathless · RR ≥ 21 · SpO2 ≤ personal baseline − 3 · T ≥ 38 · drowsy · NEWS2 ≥ 5 |
| **Hydration** | 3-day mean fluid < 75% of baseline, **or** falling 7-day trend of ≤ −60ml/day with the 3-day mean < 85%, **or** reluctant to drink / sore mouth on ≥ 2 shifts | fluid < 60% of baseline **plus** any of: dizziness, drowsiness, dark urine, fewer toilet visits, low BP |
| **Bowels** | days since opened > max(3, 2 × usual interval) | plus abdominal pain **and** eating falling (or vomiting) |
| **Delirium / falls** | new confusion on ≥ 2 shifts, **or** any fall in 72h | ≥ 2 falls in 7 days **with** new confusion, **or** NEWS2 C = 3 |
| **NEWS2** (any obs) | 1–4, or a single 3 → amber | ≥ 5 → red |

**Resident priority** = the highest level from any rule. Two ambers together don't add up to red,
but the card lists both. Every evidence item holds `{ text, value, baseline, noteIds[] }` so the
UI can say "*night toilet visits 6 last night (usual 1)*" and link to the source note.

**Dampers:** a signal on a single shift with an explaining phrase in the same note (Sylvia's
corridor noise) is capped at "watch". A delirium flag names any PINCH ME causes the other rules
have found (e.g. "constipation, 6 days"), so it points somewhere useful.

### 5.5 Evaluation = the definition of done
`engine.eval.test.ts` runs the engine as of 2026-09-25 for all 30 residents and asserts:
- every resident's priority is within `acceptablePriorities` from `ground-truth.json`;
- **no healthy resident is red**, and no more than 2 of the 17 are amber;
- replay: every red scenario is at least amber by D−1 (**early warning**, the pitch number).

The test also prints a confusion table. Put it on a slide.

## 6. UI

| Screen | Content |
|---|---|
| **Handover board** (home) | Header: as-of date, unit filter (Rose / Willow / all). Cards sorted red → amber → green, then by score. Each card shows name, room, age, priority chip, the 1–3 main risks as plain phrases, and "since when". Green residents collapse to one compact row, so the page is about the people who need attention |
| **Resident detail** | Care-plan lines at the top ("normal for her"). Sparklines with baseline bands. Evidence list by risk, each item linking to its note. Last 7 days of notes, newest first, matched phrases highlighted by symptom colour. Obs table with NEWS2 |
| **As-of scrubber** | Slider over the 42 days plus ◀ ▶ buttons. The whole engine re-runs; it's pure and fast (30 × 42 rows) |
| **Add a note** | A shift note form: charted fields + free text. It gets appended to the in-memory dataset and everything re-scores instantly. Reset button to restore the generated data |
| **Actions** (stretch) | "Reviewed / GP called / monitoring" per flag, stored in localStorage. Print-friendly handover sheet |

Visual rules: red/amber/green always come with a text label (never colour alone), large type
suitable for a wall screen or tablet, and no animation beyond the replay.

## 7. Build order (≈ 1 hackday, 2–3 people)

| # | Step | Est. | Done when |
|---|---|---|---|
| 0 | ~~Synthetic dataset~~ | done | `npm run generate` gives identical output on every run |
| 1 | ~~Scaffold Vite + React + TS + Vitest; load `/data`~~ | done | Board lists 30 names |
| 2 | ~~`features.ts` + `baseline.ts` + `news2.ts`~~ | done | NEWS2 unit tests (Joan today = 7, Hilda = 5, scale 2) |
| 3 | ~~`extract.ts` lexicon + negation~~ | done | Precision/recall ≥ 0.95 for every symptom vs `note-labels.json` |
| 4 | ~~Rules + `assess.ts`~~ | done | `assess.eval.test.ts` green: all 30 residents, early warning, 3-week replay |
| 5 | ~~Handover board~~ | done | Red/amber cards with reasons |
| 6 | ~~Resident detail: sparklines, evidence, highlighted notes~~ | done | Can explain Hilda's flag from the screen alone |
| 7 | ~~As-of scrubber + edit-a-note~~ | done | Replay and live-typing stories both work (checked in a browser) |
| 8 | Stretch: LLM handover summaries; actions; print view | — | — |
| 9 | Rehearse the §1 demo script | 30m | — |

Parallel split for a team: **A** does steps 2–4 (engine + tests), **B** does steps 1, 5–7 (UI)
against a stub that returns canned flags, and they meet at step 4's interface
(`assess(residentId, asOf) → { priority, risks[], evidence[] }`). Agree that interface first.

## 8. Risks and honest caveats (worth saying in the pitch)

- **Synthetic data is kind to the rules.** The generator and the rules were designed together.
  Real notes are messier: abbreviations, typos, missing charts. The lexicon approach will need
  tuning, and this is where an LLM extractor would likely earn its place.
- **Missing data isn't "normal".** A shift with no fluid chart shouldn't read as 0ml, or as fine.
  Treat it as "not recorded" and surface gaps ("no fluids charted overnight").
- **Alert fatigue** is the real failure mode. Hence baselines per person, the healthy-resident
  amber cap in the eval test, and at most three reasons per card.
- **Not a medical device.** In the real world this would fall under UK MDR / DCB0129 clinical
  safety requirements before it touched care.

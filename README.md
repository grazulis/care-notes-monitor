# Care Notes Monitor (hackday prototype)

Reviews the shift notes a residential care home writes, compares each resident's recent days with
their own normal, and flags who may need clinical review: possible UTI, chest infection,
dehydration, constipation, delirium or falls. The plan is in [`PLAN.md`](PLAN.md).

**All data is synthetic.** No real person, resident or staff member is represented.

## Run it

```
npm install
npm run dev      # http://localhost:5173
npm run check    # typecheck + all tests, including the ground-truth evaluation
```

| Where | What |
|---|---|
| `src/engine/` | Pure logic, no React: `extract.ts` (text → symptoms), `features.ts` (a resident's day), `baseline.ts` (their normal), `rules.ts` (one function per risk), `assess.ts` (priority + evidence), `news2.ts` |
| `src/ui/` | Handover board, resident detail (sparklines, symptom strip, highlighted notes), note editor |
| `src/engine/*.test.ts` | NEWS2, extractor vs `note-labels.json`, and the whole engine vs `ground-truth.json` |

Edited notes are kept in the browser's localStorage; the header has a button to reset them.

## Regenerate the dataset

```
npm run generate
```

This is seeded (`SEED` in `scripts/generate-data.mjs`), so every run produces identical files.
Change the seed to get a different care home.

## Data files (`data/`)

| File | What it is | Used by |
|---|---|---|
| `residents.json` | 30 residents: demographics, unit/room, conditions, medications, mobility, continence, cognition, fluid target, `carePlanNotes` | the app |
| `notes.json` / `notes.csv` | 3,780 shift records, 2026-08-15 → 2026-09-25, 3 shifts a day | the app |
| `ground-truth.json` | Scenario per resident, onset date, expected and acceptable priority, the signals to look for | **tests only**. The app must not read it |
| `note-labels.json` | What each note's free text actually mentions (cough, confusion, dysuria, …, negated mentions) | **tests only**, for the text extractor |

### A shift record

```jsonc
{
  "id": "N03708",
  "residentId": "R18",
  "careDate": "2026-09-25",        // care day: early + late on this date, night runs into the next
  "shift": "early",                 // early 07–14 · late 14–21 · night 21–07
  "recordedAt": "2026-09-25T13:41", // local time
  "author": "LT (Carer)",
  "fluidIntakeMl": 480,
  "mealsEatenPct": 85,              // null on nights
  "toiletVisits": 6,
  "incontinenceEpisodes": 4,
  "nightWakings": null,             // nights only
  "bowelsOpened": false,
  "fall": false,
  "obs": {                          // null unless taken: weekly routine, or when someone was worried
    "tempC": 37.9, "pulse": 102, "respRate": 20, "spo2": 95,
    "systolicBp": 122, "diastolicBp": 68, "consciousness": "C"   // ACVPU; C = new confusion
  },
  "note": "Assisted Hilda with a shower this morning. … Says it stings when passing urine. Urine dark and strong-smelling. Obs: T 37.9, P 102, …"
}
```

Symptoms (cough, sputum, breathlessness, confusion, dysuria, urine appearance, sore mouth,
abdominal pain) appear **only in the free text**, which is where they appear in real care notes.

### Scripted residents

Thirteen residents have something scripted. Eight are developing a problem the app should find.
Five are **confounders**: things that look alarming in absolute terms but are normal for that
person (chronic COPD cough, diuretic toileting, a habitual low drinker, a chest infection that
has resolved, one explained bad night). The other 17 are well, with everyday noise. The table is
in [`PLAN.md` §3](PLAN.md#3-data-done-npm-run-generate).

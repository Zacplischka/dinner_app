---
name: yolo-grill
description: Run a /grill-with-docs session against a Codex agent in a sibling Herdr pane — Codex is the grillee, Claude grills and decides as Zac's proxy with no human in the loop. Use when the user says "yolo grill" or wants a plan stress-tested without sitting through the interview. Requires a Herdr-managed pane (HERDR_ENV=1).
disable-model-invocation: true
---

# Yolo Grill

A `/grill-with-docs` session where the grillee is a Codex agent in a
neighboring Herdr pane instead of the user. You grill, Codex answers, and
every decision the grilling skill would normally put to the user, you make
yourself — in Zac's best interest, the way he would want it. Never block
waiting on human input; that's the yolo.

The topic is whatever plan, design, or idea the user passed as arguments —
or the current conversation's subject if they didn't.

## Workflow

### 1. Herdr up

Invoke the `herdr` skill (Skill tool) and follow it: verify `HERDR_ENV=1`
(stop and say so if not inside Herdr), then learn the current CLI from
`herdr --help` and the relevant command groups.

### 2. Spawn the grillee

Per the herdr skill's rules: split the current pane with `--no-focus`
(direction from the pane's geometry), rename the new pane
`grillee (codex)`, launch plain interactive `dex` (the codex alias — no
argv prompt, no flags), and wait for `agent_status` `idle` before sending
anything.

### 3. Both panes visible

Both panes stay visible side by side for the whole session: same tab, no
new tab or workspace, don't zoom or close either pane. Zac watches the
grilling live even though he isn't answering.

### 4. Grill

Run `/grill-with-docs` (Skill tool) with Codex as the interviewee:

- Open by sending Codex the topic and its role: it is being grilled about
  this plan; answer one question at a time with reasoning and a
  recommendation.
- One question per `herdr pane run`; wait for `idle`/`done`, read the
  answer with `pane read --source recent-unwrapped`, then continue down
  the decision tree per the grilling skill — one question at a time,
  dependencies resolved in order.
- Facts: look them up in the repo/environment yourself; don't ask Codex.
- Decisions: where /grilling says the decisions belong to the user, act
  as Zac's proxy — challenge weak or hand-wavy answers, accept solid
  ones, and pick what Zac would pick. Record each decision as settled.
- Write the docs as you go (ADRs + glossary) exactly as /grill-with-docs
  and /domain-modeling prescribe.

### 5. Wrap

When shared understanding is reached, summarize the decisions made and
docs written in the main pane. Leave the Codex pane open unless asked to
close it.

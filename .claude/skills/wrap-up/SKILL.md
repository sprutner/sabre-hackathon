---
name: wrap-up
description: Close out a work session in the Night Desk repo — update STATE.md, commit with the project convention, and push. Use when finishing a phase or feature, before switching tasks, or when asked to "commit this" / "wrap up".
---

# Wrap up a session

STATE.md is the single source of truth: **if it isn't in there, it didn't happen.** Multiple people and Claude sessions work this repo in parallel — always `git pull` / re-read STATE.md before writing, and append rather than rewrite.

## 1. Update STATE.md
- Append one entry to **SESSION LOG** (`## SESSION LOG`, above the `[append below as work happens]` line): day + what you did, results with real numbers (latency, counts, error strings), and any finding — good or bad.
- If you resolved an open question, strike it through in **OPEN QUESTIONS** with the resolution inline (see existing rows for the pattern).
- If you learned something that contradicts STATE.md or a locked decision: **flag Seth, never silently diverge.**
- New blockers → also add to the README "Current blockers" list so it stays truthful.

## 2. Commit
- One commit per phase/feature: `phase-N: <thing> — <result>` or a `docs:`/`fix:` prefix. The git log is part of the record — write the *result* in the message, not just the activity.
- Never commit `.env` or any secret value. If in doubt, `git diff --staged | grep -iE 'key|secret|token|bearer'` before committing.
- `git pull --rebase` before pushing (parallel sessions are real), then push.

## 3. Report
End with a short summary: what changed, what's verified working (with the command you verified it with), what's still open and who unblocks it.
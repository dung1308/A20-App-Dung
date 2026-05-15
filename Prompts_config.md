# Prompts Config

This project stores versioned prompt text in the `prompts` database table.

## Runtime Prompt Keys

Use these `agent_name` values when adding a new prompt in the admin Database page:

| Agent name | Used by | Purpose |
|---|---|---|
| `advisor` | `AdvisorAgent.system_prompt` | General student guidance chat. |
| `advisor_match` | `AdvisorAgent.match_prompt` | Wizard Top 3 major matching prompt. |
| `crm` | `CRMAgent.system_prompt` | Profile-aware chat using the student's stored profile. |
| `rag` | `RAGAgent.system_prompt` | Grounded admissions answers with source context. |
| `router` | `LLMRouter.system_prompt` | Classifies chat route: `rag`, `crm`, `advisor`, or `fallback`. |
| `judge_safety` | `JudgeAgent.system_prompt` | Final safety and quality gate before responding to the user. |
| `judge_gold` | `JudgeAgentGoldenAns.system_prompt` | Golden-answer evaluation used by offline/eval flows. |

## Naming Notes

- `judge_safety` is the correct prompt key for the live safety judge.
- `judge_gold` is not the same as the live safety judge; it is for golden-answer QA evaluation.
- `crm` is still the correct key and now loads through `PromptService`.
- `judge` is legacy/ambiguous. Use `judge_safety` for new prompt versions.
- `cv_parser` and `cv_agent` are currently deterministic code paths, not `PromptService` prompt-backed agents.

## Seed Script

Initial prompt versions are seeded by:

```bash
cd app/backend
python services/seed_prompts.py
```

The seed script currently writes the prompt keys listed above.

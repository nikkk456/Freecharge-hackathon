"""The analysis prompt.

Design notes, because these choices are load-bearing:

* **The function list is supplied, not invented.** The model picks from the 18 real
  departments by code. Anything it returns that is not a known code is dropped by the
  caller — the model cannot invent an owner.
* **The full circular text is sent.** Gemini's context is 1M tokens; an RBI circular is
  ~6k. Chunking here would buy nothing and would lose cross-references between
  paragraphs, which is exactly where obligations hide.
* **No citations yet.** Quotes and their character offsets are Stage 3. Asking for them
  now would produce unverified quotes, which is worse than none.
* **Rating criteria are spelled out.** Left to itself the model calls everything HIGH,
  which makes the rating meaningless.
"""
from __future__ import annotations

from dataclasses import dataclass

SYSTEM = """You are a compliance analyst at an Indian payments and lending company \
regulated by the RBI. You read regulatory circulars and produce a factual, conservative \
impact assessment for internal review.

Rules you must follow:
- Report only what the circular actually says. Never infer obligations it does not state.
- Write plainly, for a business reader. No regulatory boilerplate, no hedging.
- If the circular does not state something (a deadline, a penalty), say nothing rather \
than guessing.
- Your output is a DRAFT for a human reviewer. It is never final.
- Reply with a single JSON object and nothing else."""


@dataclass(frozen=True)
class FunctionChoice:
    code: str
    name: str
    description: str


def _function_block(functions: list[FunctionChoice]) -> str:
    return "\n".join(f"  {f.code} | {f.name} — {f.description}" for f in functions)


RISK_GUIDANCE = """Choose the risk rating using these criteria:
- CRITICAL: a new prohibition or licence-threatening obligation; non-compliance risks \
enforcement action, penalty, or business suspension.
- HIGH: substantive new obligations needing process, system, or contract changes before \
a hard deadline.
- MEDIUM: changes to existing procedure, disclosure, or reporting that need work but no \
structural change.
- LOW: clarification, extension of an existing rule, or an update with no operational \
impact on us.
Most circulars are MEDIUM. Reserve CRITICAL for genuine business-threatening cases."""


SCHEMA = """Return exactly this JSON shape:
{
  "title": "the circular's official title, as printed in the document",
  "summary": "3-5 sentences in plain English: what changed, who it binds, from when",
  "risk_rating": "LOW | MEDIUM | HIGH | CRITICAL",
  "risk_reasoning": "2-3 sentences justifying the rating against the criteria",
  "confidence": 0.0,
  "effective_date": "YYYY-MM-DD or null — the date the circular says it takes effect",
  "impacted_functions": [
    {
      "code": "F06",
      "confidence": 0.0,
      "reasoning": "one sentence on why this department is affected"
    }
  ],
  "action_items": [
    {
      "description": "one concrete thing the company must do, as an instruction",
      "priority": "LOW | MEDIUM | HIGH",
      "owner_function": "F06",
      "due_date": "YYYY-MM-DD or null - only if the circular states a deadline"
    }
  ]
}

Field rules:
- confidence: 0.0-1.0, how sure you are. Be honest; low confidence is useful information.
- impacted_functions: only genuinely affected departments, most affected first. Usually \
1-4. Do not list a department just because it is tangentially mentioned.
- action_items: concrete and checkable ("Obtain IIBF certification for all recovery \
agents"), never vague ("ensure compliance"). Typically 3-10. Every owner_function must \
be one of the codes given.
- Use only the department codes provided. Never invent a code."""


def build_analysis_prompt(
    *,
    circular_text: str,
    functions: list[FunctionChoice],
    ref_no: str | None = None,
    issued_date: str | None = None,
) -> str:
    header = "\n".join(
        part
        for part in (
            f"Reference number: {ref_no}" if ref_no else "",
            f"Issued: {issued_date}" if issued_date else "",
        )
        if part
    )
    return f"""Analyse the regulatory circular below.

DEPARTMENTS you may assign impact to (use the code exactly):
{_function_block(functions)}

{RISK_GUIDANCE}

{SCHEMA}

--- CIRCULAR{f" ({header})" if header else ""} ---
{circular_text}
--- END OF CIRCULAR ---"""

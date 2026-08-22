"""The analysis prompt.

Design notes, because these choices are load-bearing:

* **The function list is supplied, not invented.** The model picks from the 18 real
  departments by code. Anything it returns that is not a known code is dropped by the
  caller — the model cannot invent an owner.
* **The full circular text is sent.** Gemini's context is 1M tokens; an RBI circular is
  ~6k. Chunking here would buy nothing and would lose cross-references between
  paragraphs, which is exactly where obligations hide.
* **Quotes, never offsets.** Every claim must carry a verbatim `evidence` string copied
  from the circular. We deliberately do NOT ask for character positions: models invent
  those confidently, and verifying a model's own offsets would mean trusting the thing
  under test. `ai/grounding.py` finds the real offsets by searching for the quote.
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
- Every finding must be backed by an `evidence` quote copied WORD FOR WORD from the \
circular text you were given. Copy the characters exactly as they appear. Do not \
paraphrase, do not summarise, do not repair typos, do not join separate sentences, and \
never use an ellipsis. Your quote is checked against the source automatically, and a \
quote that cannot be found is rejected.
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
  "risk_evidence": "one sentence copied word for word from the circular that most \
supports this rating",
  "confidence": 0.0,
  "effective_date": "YYYY-MM-DD or null — the date the circular says it takes effect",
  "impacted_functions": [
    {
      "code": "F06",
      "confidence": 0.0,
      "reasoning": "one sentence on why this department is affected",
      "evidence": "one sentence copied word for word from the circular showing this \
department is affected"
    }
  ],
  "action_items": [
    {
      "description": "one concrete thing the company must do, as an instruction",
      "priority": "LOW | MEDIUM | HIGH",
      "owner_function": "F06",
      "due_date": "YYYY-MM-DD or null - only if the circular states a deadline",
      "evidence": "the sentence copied word for word from the circular that imposes \
this obligation"
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
- Use only the department codes provided. Never invent a code.
- evidence: ONE continuous sentence, copied exactly, at least 20 characters. It must \
appear verbatim in the circular above. If you genuinely cannot find a supporting \
sentence, use an empty string rather than inventing or paraphrasing one."""


@dataclass(frozen=True)
class ControlChoice:
    code: str
    name: str
    description: str
    owner_code: str | None
    owner_name: str | None
    kci_name: str | None
    kci_status: str | None


RCM_SYSTEM = """You are a compliance risk analyst at an Indian payments and lending \
company. You turn a regulatory circular into a Risk & Control Matrix: the risks the \
circular creates, and whether the company's existing controls already answer them.

Rules you must follow:
- Work only from the circular text supplied. Never invent an obligation.
- Match a risk to an existing control only when that control genuinely addresses it. \
Saying a risk is covered when it is not is the worst possible error here: it hides work \
that a regulator will later find undone.
- A risk with no matching control is a GAP. Gaps are the most valuable output. Do not \
force a weak match to avoid reporting one.
- Every risk must carry an `evidence` quote copied WORD FOR WORD from the circular. \
Quotes are checked against the source automatically; one that cannot be found is rejected.
- Reply with a single JSON object and nothing else."""


def _control_block(controls: list[ControlChoice]) -> str:
    lines = []
    for control in controls:
        owner = f" [owner {control.owner_code} {control.owner_name}]" if control.owner_code else ""
        kci = (
            f" [KCI: {control.kci_name} — {control.kci_status}]"
            if control.kci_name
            else " [no KCI]"
        )
        lines.append(f"  {control.code} | {control.name}{owner}{kci}\n      {control.description}")
    return "\n".join(lines)


RCM_SCHEMA = """Return exactly this JSON shape:
{
  "rows": [
    {
      "risk_text": "the risk in one sentence, phrased as what could go wrong",
      "control_text": "the control that addresses it, phrased as what the company does",
      "mapped_control": "C-006 or null",
      "coverage": "COVERED | PARTIAL | GAP",
      "confidence": 0.0,
      "reasoning": "one sentence on why this control does or does not answer the risk",
      "evidence": "the sentence from the circular that creates this risk, copied exactly"
    }
  ]
}

Field rules:
- coverage COVERED: the named existing control fully addresses the risk as written.
- coverage PARTIAL: the named control addresses part of it but must be strengthened. \
Say what is missing in `reasoning`.
- coverage GAP: no existing control addresses it. `mapped_control` MUST be null, and \
`control_text` describes the control that would need to be built.
- mapped_control must be one of the codes listed above, or null. Never invent a code.
- Produce one row per distinct risk, typically 4-10. Do not split one risk into near \
duplicates, and do not merge two unrelated risks into one row."""


def build_rcm_prompt(
    *,
    circular_text: str,
    controls: list[ControlChoice],
    summary: str | None = None,
    risk_rating: str | None = None,
    action_items: list[str] | None = None,
) -> str:
    """The approved analysis is included as context, not as gospel.

    The matrix is built from the circular itself — the analysis is there so the model
    reaches the same conclusions a human already approved, rather than re-deriving a
    different set of risks and confusing the reviewer.
    """
    context = []
    if summary:
        context.append(f"Approved summary: {summary}")
    if risk_rating:
        context.append(f"Approved risk rating: {risk_rating}")
    if action_items:
        joined = "\n".join(f"  - {item}" for item in action_items)
        context.append(f"Approved action items:\n{joined}")
    context_block = ("\n\n" + "\n".join(context)) if context else ""

    return f"""Build a Risk & Control Matrix for the circular below.

EXISTING CONTROL LIBRARY (match against these; use the code exactly):
{_control_block(controls)}

{RCM_SCHEMA}{context_block}

--- CIRCULAR ---
{circular_text}
--- END OF CIRCULAR ---"""


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

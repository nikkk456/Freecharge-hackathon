"""The model layer: one provider-agnostic client and the prompts that drive it.

Kept out of `modules/` on purpose — a feature module should ask for "an analysis of
this text", not know which vendor is answering. Swapping `LLM_MODEL` in .env from
Gemini to an on-prem model changes nothing outside this package.
"""

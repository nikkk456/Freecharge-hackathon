"""Read-only access to the foundation layer: functions, controls and KCIs.

This is the reference data every later stage leans on — Stage 2 asks the model which
*function* a circular hits, Stage 5 matches risks against these *controls*. Seeded by
`python -m scripts.seed`; nothing here mutates.
"""

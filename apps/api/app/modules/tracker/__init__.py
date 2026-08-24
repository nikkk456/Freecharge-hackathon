"""The action-item tracker.

Owns everything about an action item once it exists: who owns it, when it is due,
what state it is in, and how it gets closed. Stage 2 extracts these items from a
circular; this module is where the work actually gets done and signed off.

Two rules shape the whole module:

* **Nothing closes itself.** CLOSED requires a human, evidence, and a legal transition.
  The overdue sweep can raise an alarm; it can never move work forward.
* **Overdue is derived, not stored.** An item is late because of its due date, not
  because someone set a status — so being late never overwrites what was happening.
"""

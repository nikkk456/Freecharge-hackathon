"""Append-only, hash-chained audit trail.

Every AI suggestion and every human decision lands here as one immutable row whose
hash covers the previous row's hash. Alter or delete any row and every hash after it
stops matching, which `verify_chain` detects and localises.

Nothing in this package ever updates or deletes an audit row. That is the point.
"""

"""Risk & Control Matrix.

Takes an approved analysis and asks: for each risk this circular creates, does a
control already exist that answers it? The whole 36-row control library goes into the
prompt — at that size in-context matching beats vector search, costs nothing, and has
no rate-limit failure mode. The pgvector columns stay in the schema so the same design
scales when the library does.

Like an analysis, an RCM is a DRAFT until a human approves it, and frozen afterwards.
"""

"""Circular ingestion: upload a regulatory PDF, store it, extract its text.

Deliberately contains no AI. Parsing is fast and deterministic, so it runs inline
on the request; the slow, retryable model work lives in the ARQ worker from Stage 2.
"""

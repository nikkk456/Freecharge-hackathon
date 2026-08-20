"""Object storage (MinIO/S3). Stores raw PDFs; swaps to real S3 in prod by config only."""
from __future__ import annotations

import uuid

import boto3
from botocore.client import Config

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.storage")


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket() -> None:
    s3 = _client()
    existing = {b["Name"] for b in s3.list_buckets().get("Buckets", [])}
    if settings.s3_bucket not in existing:
        s3.create_bucket(Bucket=settings.s3_bucket)
        log.info("bucket_created", bucket=settings.s3_bucket)


def put_pdf(data: bytes, filename: str) -> str:
    """Store a PDF and return its object key."""
    key = f"circulars/{uuid.uuid4()}/{filename}"
    _client().put_object(
        Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="application/pdf"
    )
    return key


def get_object(key: str) -> bytes:
    return _client().get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()


def presigned_url(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=expires
    )

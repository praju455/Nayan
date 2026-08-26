import re
from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import HTTPException, status

FORBIDDEN_KEYS = frozenset({"rawscreenshot", "rawframe", "rawdom", "rawhtml", "rawocr", "rawtext", "password", "rawsecret", "unredactedframe", "plaintexttokenvalue", "tokenvault", "localsecretmap", "imagedata"})
TOKEN = re.compile(r"<(?:[A-Z_]+)_[A-Za-z0-9_-]+>|<PASSWORD_FIELD>")
PII = re.compile(r"(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)|\b[A-Z]{5}\d{4}[A-Z]\b)", re.IGNORECASE)


def _visit(value: Any, path: str = "$") -> None:
    if isinstance(value, str):
        if PII.search(TOKEN.sub("", value)):
            raise ValueError(f"plaintext PII detected at {path}")
    elif isinstance(value, Mapping):
        for key, child in value.items():
            if str(key).lower() in FORBIDDEN_KEYS:
                raise ValueError(f"forbidden artifact field: {key}")
            _visit(child, f"{path}.{key}")
    elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        for index, child in enumerate(value):
            _visit(child, f"{path}[{index}]")


def enforce_privacy_boundary(payload: Mapping[str, Any]) -> None:
    try:
        _visit(payload)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Payload rejected by privacy boundary") from error

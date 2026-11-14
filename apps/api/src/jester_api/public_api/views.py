"""Module objects -> JSON shapes of public-api.yaml (camelCase, ISO dates, string ids)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from ..auth import ApiKey, Session, User
from ..render_service import Retention, Run
from ..template_store import Asset, Draft, TemplateSummary, TextFile, Version, VersionFiles
from .problems import problem_dict


class Body(BaseModel):
    """Request bodies: unknown fields are rejected, like additionalProperties: false in the contract."""

    model_config = ConfigDict(extra="forbid")


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def user(u: User) -> dict[str, Any]:
    return {
        "id": str(u.id),
        "username": u.username,
        "createdAt": iso(u.created_at),
        "lastLoginAt": iso(u.last_login_at),
    }


def session(s: Session) -> dict[str, Any]:
    return {"token": s.token, "expiresAt": iso(s.expires_at), "user": user(s.user)}


def api_key(k: ApiKey) -> dict[str, Any]:
    return {
        "id": str(k.id),
        "name": k.name,
        "prefix": k.prefix,
        "createdAt": iso(k.created_at),
        "createdBy": k.created_by,
        "lastUsedAt": iso(k.last_used_at),
    }


def run_summary(r: Run) -> dict[str, Any]:
    return {
        "id": r.id,
        "status": r.status,
        "errorCode": r.error_code,
        "pages": r.pages,
        "createdAt": iso(r.created_at),
    }


def run(r: Run) -> dict[str, Any]:
    return {
        **run_summary(r),
        "kind": r.kind,
        "templateId": r.template_id,
        "version": r.version,
        "draftRevision": r.draft_revision,
        "caller": {"type": r.caller.type, "id": r.caller.id, "name": r.caller.name},
        "requestId": r.request_id,
        "durationMs": r.duration_ms,
        "provenance": r.provenance,
        "problems": r.problems,
    }


def template(t: TemplateSummary, last: Run | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": t.id,
        "name": t.name,
        "publishedVersion": t.published_version,
        "latestVersion": t.latest_version,
        "draftRevision": t.draft_revision,
        "draftChangedSincePublish": t.draft_changed_since_publish,
        "lastRun": run_summary(last) if last else None,
        "updatedAt": iso(t.updated_at),
    }
    if t.orientation:
        out["page"] = {"size": "A4", "orientation": t.orientation}
    return out


def text_file(f: TextFile) -> dict[str, Any]:
    return {"name": f.name, "content": f.content, "sha256": f.sha256}


def asset(a: Asset) -> dict[str, Any]:
    return {"name": a.name, "contentType": a.content_type, "size": a.size, "sha256": a.sha256}


def draft(d: Draft) -> dict[str, Any]:
    return {
        "templateId": d.template_id,
        "revision": d.revision,
        "basedOnVersion": d.based_on_version,
        "files": [text_file(f) for f in d.files],
        "assets": [asset(a) for a in d.assets],
        "updatedAt": iso(d.updated_at),
        "updatedBy": d.updated_by,
    }


def version(v: Version) -> dict[str, Any]:
    return {
        "templateId": v.template_id,
        "version": v.version,
        "publishedAt": iso(v.published_at),
        "publishedBy": v.published_by,
        "note": v.note,
        "sha256": v.sha256,
        "isPublished": v.is_published,
    }


def version_files(v: VersionFiles) -> dict[str, Any]:
    return {
        **version(v.version),
        "files": [text_file(f) for f in v.files],
        "assets": [asset(a) for a in v.assets],
    }


def retention(r: Retention) -> dict[str, Any]:
    return {"days": r.days, "setBy": r.set_by, "setAt": iso(r.set_at), "wouldDelete": r.would_delete}


def problems(items: list[Any]) -> list[dict[str, Any]]:
    return [problem_dict(p) for p in items]

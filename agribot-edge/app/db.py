"""Postgres access (asyncpg pool) + the handful of queries the hub needs."""

import json
from pathlib import Path
from typing import Any, Optional

import asyncpg

from .config import settings

_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"
_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    async with _pool.acquire() as conn:
        await conn.execute(sql)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _require_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call init_pool() first")
    return _pool


async def insert_reading(payload: dict[str, Any]) -> None:
    """Store one sensor snapshot. Accepts either {ts, espIP, data} or a raw reading."""
    ts_ms = payload.get("ts")
    esp_ip = payload.get("espIP") or payload.get("esp_ip")
    data = payload.get("data", payload)
    pool = _require_pool()
    async with pool.acquire() as conn:
        if ts_ms:
            await conn.execute(
                "INSERT INTO sensor_readings (ts, esp_ip, data) "
                "VALUES (to_timestamp($1::double precision / 1000.0), $2, $3::jsonb)",
                ts_ms, esp_ip, json.dumps(data),
            )
        else:
            await conn.execute(
                "INSERT INTO sensor_readings (esp_ip, data) VALUES ($1, $2::jsonb)",
                esp_ip, json.dumps(data),
            )


async def recent_readings(limit: int = 100) -> list[dict[str, Any]]:
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, extract(epoch FROM ts) * 1000 AS ts, esp_ip, data, synced "
            "FROM sensor_readings ORDER BY ts DESC LIMIT $1",
            limit,
        )
    return [
        {
            "id": r["id"],
            "ts": int(r["ts"]),
            "espIP": r["esp_ip"],
            "data": json.loads(r["data"]),
            "synced": r["synced"],
        }
        for r in rows
    ]


async def unsynced_readings(limit: int = 100) -> list[dict[str, Any]]:
    pool = _require_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, extract(epoch FROM ts) * 1000 AS ts, esp_ip, data "
            "FROM sensor_readings WHERE synced = FALSE ORDER BY id ASC LIMIT $1",
            limit,
        )
    return [
        {"id": r["id"], "ts": int(r["ts"]), "espIP": r["esp_ip"], "data": json.loads(r["data"])}
        for r in rows
    ]


async def mark_synced(ids: list[int]) -> None:
    if not ids:
        return
    pool = _require_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sensor_readings SET synced = TRUE WHERE id = ANY($1::bigint[])", ids
        )


async def log_command(command: str, source: str = "phone", mode: str = "offline") -> None:
    pool = _require_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO command_log (source, command, mode) VALUES ($1, $2, $3)",
            source, command, mode,
        )

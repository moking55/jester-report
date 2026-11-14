"""Account recovery on the server: `python -m jester_api.auth reset-password <username>` (SPEC-auth.md).

For people who can already reach the server (like reading the setup token from the log); not a render CLI.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from psycopg_pool import AsyncConnectionPool

from .service import Auth, AuthError


async def _reset(database_url: str, username: str) -> str:
    async with AsyncConnectionPool(database_url, min_size=1, max_size=1, open=False) as pool:
        return await Auth(pool).reset_password(username)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m jester_api.auth")
    commands = parser.add_subparsers(dest="command", required=True)
    reset = commands.add_parser("reset-password", help="set a new random password and sign the user out")
    reset.add_argument("username")
    args = parser.parse_args(argv)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    if sys.platform == "win32":  # psycopg's async connections need a selector loop
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        password = asyncio.run(_reset(database_url, args.username))
    except AuthError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    print(f"New password for {args.username}: {password}")
    print("It is shown only this once. Every session of this user has been signed out.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

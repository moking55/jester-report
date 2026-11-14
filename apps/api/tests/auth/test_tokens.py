import hashlib

from jester_api.auth.tokens import API_KEY_PREFIX, SESSION_PREFIX, display_prefix, new_token, sha256_hex


def test_tokens_are_prefixed_long_and_unique():
    tokens = {new_token(SESSION_PREFIX) for _ in range(1000)}
    assert len(tokens) == 1000
    assert all(t.startswith("jrs_") and len(t) - 4 >= 43 for t in tokens)
    assert new_token(API_KEY_PREFIX).startswith("jrk_")


def test_hash_and_display_prefix():
    key = new_token(API_KEY_PREFIX)
    assert sha256_hex(key) == hashlib.sha256(key.encode()).hexdigest()
    assert display_prefix(key) == key[:8] and display_prefix(key).startswith("jrk_")

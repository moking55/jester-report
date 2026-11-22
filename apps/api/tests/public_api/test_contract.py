"""The app and public-api.yaml must agree: same operations, same auth rules, fitting responses."""

import re
from pathlib import Path

import yaml
from fastapi.routing import APIRoute
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from jester_api.public_api import Settings, create_app
from jester_api.public_api.security import render_caller, session_caller

CONTRACT_PATH = Path(__file__).parents[2] / "openapi" / "public-api.yaml"
CONTRACT = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
METHODS = {"get", "post", "put", "patch", "delete"}
_REGISTRY = Registry().with_resource("urn:contract", Resource(CONTRACT, specification=DRAFT202012))


def schema_validator(name: str) -> Draft202012Validator:
    return Draft202012Validator({"$ref": f"urn:contract#/components/schemas/{name}"}, registry=_REGISTRY)


def assert_fits(name: str, value: object) -> None:
    errors = sorted(schema_validator(name).iter_errors(value), key=lambda e: list(e.path))
    assert not errors, f"{name}: " + "; ".join(f"{list(e.path)} {e.message}" for e in errors[:5])


def contract_operations() -> dict[tuple[str, str], dict]:
    return {
        (method.upper(), path): operation
        for path, item in CONTRACT["paths"].items()
        for method, operation in item.items()
        if method in METHODS
    }


def _api_routes(routes: list) -> list[APIRoute]:
    found = []
    for route in routes:
        if isinstance(route, APIRoute):
            found.append(route)
        elif (inner := getattr(route, "original_router", None)) is not None:  # FastAPI keeps included routers
            found += _api_routes(inner.routes)
    return found


def app_routes() -> dict[tuple[str, str], APIRoute]:
    app = create_app(Settings("x", "x", "x", "x", "x", "x"))
    return {(method, route.path): route for route in _api_routes(app.routes) for method in route.methods}


def dependencies(route: APIRoute) -> set:
    found, todo = set(), list(route.dependant.dependencies)
    while todo:
        dep = todo.pop()
        found.add(dep.call)
        todo.extend(dep.dependencies)
    return found


def test_every_contract_operation_has_a_route_and_nothing_more():
    assert set(app_routes()) == set(contract_operations())


def test_auth_rules_match_the_contract():
    routes = app_routes()
    for key, operation in contract_operations().items():
        deps = dependencies(routes[key])
        public = operation.get("security") == []
        api_key_allowed = {"ApiKeyAuth": []} in operation.get("security", [])
        if public:
            assert not deps & {session_caller, render_caller}, f"{key} is public in the contract"
        elif api_key_allowed:
            assert render_caller in deps and session_caller not in deps, key
        else:
            assert session_caller in deps, f"{key} must require a session"


def test_routes_with_path_ids_use_the_contract_names():
    for _, path in contract_operations():
        for name in re.findall(r"{(\w+)}", path):
            assert name in {
                "templateId",
                "fileName",
                "assetName",
                "version",
                "userId",
                "keyId",
                "runId",
                "themeId",
            }


def test_schema_checker_catches_a_wrong_response():
    assert list(schema_validator("DraftRevision").iter_errors({"revision": "two"}))
    assert not list(schema_validator("DraftRevision").iter_errors({"revision": 2}))


# ---- v1.12: the contract is the API docs, so every operation explains itself with examples ------------

JSON_TYPES = {"application/json", "application/problem+json"}


def _escape(part: str) -> str:
    return part.replace("~", "~0").replace("/", "~1")


def _deref(node: dict, pointer: str) -> tuple[dict, str]:
    """Follow a local `$ref` (one level is all the contract uses) and say where the node really lives."""
    ref = node.get("$ref")
    if not ref:
        return node, pointer
    target: object = CONTRACT
    for part in ref.removeprefix("#/").split("/"):
        target = target[part.replace("~1", "/").replace("~0", "~")]  # type: ignore[index]
    return target, ref.removeprefix("#")  # type: ignore[return-value]


def json_media() -> list[tuple[str, str, dict]]:
    """(label, pointer of the media object, media object) for every JSON request and response body."""
    found = []
    for path, item in CONTRACT["paths"].items():
        for method, operation in item.items():
            if method not in METHODS:
                continue
            base = f"/paths/{_escape(path)}/{method}"
            bodies = []
            if "requestBody" in operation:
                bodies.append(("request", *_deref(operation["requestBody"], f"{base}/requestBody")))
            for status, response in operation["responses"].items():
                bodies.append((status, *_deref(response, f"{base}/responses/{status}")))
            for what, body, where in bodies:
                for media_type, media in body.get("content", {}).items():
                    if media_type in JSON_TYPES:
                        found.append((f"{method.upper()} {path} {what}", f"{where}/content/{_escape(media_type)}", media))
    return found


def media_examples(media: dict) -> list[object]:
    if "example" in media:
        return [media["example"]]
    return [_deref(e, "")[0]["value"] for e in media.get("examples", {}).values()]


def test_every_operation_has_a_summary_and_a_description():
    missing = [f"{m} {p}" for (m, p), op in contract_operations().items() if not (op.get("summary") and op.get("description"))]
    assert not missing, missing


def test_every_json_body_has_an_example():
    missing = [label for label, _, media in json_media() if not media_examples(media)]
    assert not missing, f"{len(missing)} bodies without an example: {missing[:20]}"


def test_every_example_fits_its_schema():
    wrong = []
    for label, where, media in json_media():
        validator = Draft202012Validator({"$ref": f"urn:contract#{where}/schema"}, registry=_REGISTRY)
        for example in media_examples(media):
            wrong += [f"{label}: {list(e.path)} {e.message}" for e in validator.iter_errors(example)]
    assert not wrong, "; ".join(wrong[:10])


def test_the_example_checker_catches_a_wrong_example():
    validator = Draft202012Validator({"$ref": "urn:contract#/components/schemas/Problem"}, registry=_REGISTRY)
    assert list(validator.iter_errors({"type": "x", "title": "x", "status": "422", "code": "INPUT_INVALID"}))

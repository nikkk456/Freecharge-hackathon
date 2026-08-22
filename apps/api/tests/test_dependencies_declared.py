"""Every third-party import must be declared in pyproject.toml.

This exists because it already went wrong: `litellm` was pip-installed during
development and never added to `pyproject.toml`. Everything worked on the machine
that installed it, and the first person to clone the repo hit
`No module named 'litellm'` the moment they pressed Analyse.

A transitive dependency is not a promise. `pypdfium2` arrives via pdfplumber and
`numpy` via rapidocr, but we import both directly — if either upstream drops them, a
clean install breaks. So anything imported is declared, and this test enforces it
rather than trusting a habit.
"""
from __future__ import annotations

import ast
import sys
import tomllib
from importlib.metadata import packages_distributions
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = ("app", "scripts")


def _normalise(name: str) -> str:
    """PEP 503 name normalisation — `Pillow`, `pillow` and `PIL`'s distribution all
    have to compare equal to what is written in pyproject."""
    return name.lower().replace("_", "-").replace(".", "-")


def _declared() -> set[str]:
    data = tomllib.loads((API_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    project = data["project"]
    specs = list(project.get("dependencies", []))
    for extra in project.get("optional-dependencies", {}).values():
        specs.extend(extra)

    names = set()
    for spec in specs:
        # "uvicorn[standard]>=0.32" -> "uvicorn"
        head = spec.split(";")[0].strip()
        for separator in ("[", ">", "<", "=", "!", "~", " "):
            head = head.split(separator)[0]
        names.add(_normalise(head))
    return names


def _imported_top_level_modules() -> set[str]:
    modules: set[str] = set()
    for directory in SOURCE_DIRS:
        for path in (API_ROOT / directory).rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules.update(alias.name.split(".")[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    # `level > 0` is a relative import — always first-party.
                    if node.level == 0 and node.module:
                        modules.add(node.module.split(".")[0])
    return modules


def _third_party(modules: set[str]) -> set[str]:
    return {
        module
        for module in modules
        if module not in sys.stdlib_module_names
        and module != "app"  # our own package
        and not module.startswith("_")
    }


def test_every_imported_package_is_declared():
    distributions = packages_distributions()
    declared = _declared()
    undeclared: list[str] = []

    for module in sorted(_third_party(_imported_top_level_modules())):
        providers = distributions.get(module)
        if not providers:
            # Not installed, so it cannot be resolved to a distribution. That is a
            # different failure and the import itself would already have blown up.
            continue
        if not any(_normalise(name) in declared for name in providers):
            undeclared.append(f"{module} (from {', '.join(providers)})")

    assert not undeclared, (
        "These modules are imported but not declared in pyproject.toml, so a fresh "
        "clone will fail with ImportError:\n  " + "\n  ".join(undeclared)
    )


@pytest.mark.parametrize(
    "package",
    ["litellm", "pdfplumber", "pypdfium2", "rapidocr", "onnxruntime", "numpy", "structlog"],
)
def test_the_packages_that_have_bitten_us_stay_declared(package: str):
    """Named explicitly so a careless edit to pyproject fails loudly rather than
    quietly reintroducing the bug a colleague already hit."""
    assert _normalise(package) in _declared()

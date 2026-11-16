"""Plug-in discovery and profiles. Every `plugins/*.py` (not `_*.py`, not `base.py`) is imported and
each `Plugin` subclass defined in it with a `name` is registered: new models are new files. A
profile (TOML) picks which plug-ins run and passes each its options:

    [server]
    port = 8190
    [plugins.pixal3d]            # enabled: the table exists (may be empty)
    repo = "~/models/Pixal3D"
    isolate = true               # optional: override the plug-in's own `isolate`

Errors are loud: a plug-in file that fails to import, two plug-ins with one name, a profile naming
an unknown plug-in, or an enabled plug-in that is not available here all stop the server.
"""

from __future__ import annotations

import hashlib
import importlib.util
import inspect
import sys
import tomllib
from pathlib import Path
from typing import Any

from isolated import Isolated
from plugins.base import TASKS, Plugin

HERE = Path(__file__).resolve().parent
PLUGIN_DIR = HERE / "plugins"


class RegistryError(Exception):
    pass


def _import(path: Path) -> Any:
    tag = hashlib.sha1(str(path).encode()).hexdigest()[:8]
    name = f"plugins.{path.stem}" if path.parent == PLUGIN_DIR else f"t3d_plugin_{path.stem}_{tag}"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RegistryError(f"{path}: not importable")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    try:
        spec.loader.exec_module(mod)
    except Exception as e:
        del sys.modules[name]
        raise RegistryError(f"{path}: import failed: {type(e).__name__}: {e}") from e
    return mod


def discover(dirs: list[Path] | None = None) -> dict[str, type[Plugin]]:
    """Plug-in classes by name from every plug-in file in `dirs` (default: plugins/)."""
    found: dict[str, type[Plugin]] = {}
    for d in dirs or [PLUGIN_DIR]:
        for path in sorted(d.glob("*.py")):
            if path.name.startswith("_") or path.name == "base.py":
                continue
            mod = _import(path)
            for _, cls in inspect.getmembers(mod, inspect.isclass):
                if not (issubclass(cls, Plugin) and cls.__module__ == mod.__name__ and cls.name):
                    continue
                if cls.task not in TASKS:
                    raise RegistryError(f"{path}: {cls.name}.task '{cls.task}' is not one of {TASKS}")
                if not cls.licence.strip():
                    raise RegistryError(f"{path}: {cls.name} declares no licence")
                if cls.name in found:
                    raise RegistryError(f"{path}: plug-in name '{cls.name}' is already taken")
                found[cls.name] = cls
    return found


def load_profile(path: Path) -> dict[str, Any]:
    try:
        with open(path, "rb") as f:
            profile = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError) as e:
        raise RegistryError(f"profile {path}: {e}") from e
    if not isinstance(profile.get("plugins"), dict) or not profile["plugins"]:
        raise RegistryError(f"profile {path}: needs at least one [plugins.<name>] table")
    return profile


def enable(profile: dict[str, Any], classes: dict[str, type[Plugin]]) -> dict[str, Plugin]:
    """Instantiate the profile's plug-ins; every one must exist and be available here."""
    out: dict[str, Plugin] = {}
    for name, options in profile["plugins"].items():
        cls = classes.get(name)
        if cls is None:
            raise RegistryError(f"profile enables '{name}'; known plug-ins: {', '.join(sorted(classes))}")
        opts = options if isinstance(options, dict) else {}
        plugin = cls(opts)
        why = plugin.available()
        if why:
            raise RegistryError(f"plug-in '{name}' cannot run here: {why}")
        out[name] = Isolated(plugin) if opts.get("isolate", cls.isolate) else plugin
    return out

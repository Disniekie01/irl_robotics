# ruff: noqa: I001
from . import motors
from .sim import PyBulletSimulation, get_sim
from .base import BaseManipulator, BaseMobileRobot, BaseRobot
from .koch11 import KochHardware
from .remote_robot import RemoteRobot
from .so100 import SO100Hardware
from .urdfloader import URDFLoader

# Optional hardware (extra native / WebRTC deps). Loaded on demand.
_OPTIONAL_EXPORTS = {
    "UnitreeD1Arm": ".d1_arm",
    "UnitreeGo2": ".go2",
    "LeKiwi": ".lekiwi",
    "PiperHardware": ".piper",
    "WX250SHardware": ".wx250s",
}

__all__ = [
    "motors",
    "PyBulletSimulation",
    "get_sim",
    "BaseManipulator",
    "BaseMobileRobot",
    "BaseRobot",
    "KochHardware",
    "RemoteRobot",
    "SO100Hardware",
    "URDFLoader",
    *_OPTIONAL_EXPORTS,
]


def __getattr__(name: str):
    if name in _OPTIONAL_EXPORTS:
        import importlib

        mod = importlib.import_module(_OPTIONAL_EXPORTS[name], __name__)
        return getattr(mod, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

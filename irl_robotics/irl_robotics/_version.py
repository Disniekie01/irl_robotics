import importlib.metadata

try:
    __version__ = importlib.metadata.version("irl-robotics")
except importlib.metadata.PackageNotFoundError:
    try:
        # Fallback: try the old package name for backward compatibility
        __version__ = importlib.metadata.version("irl_robotics")
    except importlib.metadata.PackageNotFoundError:
        print("PackageNotFoundError: No package metadata was found for 'irl-robotics'.")
        __version__ = "unknown"

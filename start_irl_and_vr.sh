#!/usr/bin/env bash
# Wrapper at repo root — delegates to the inner copy.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/IRL-ROBOTICS-MANAGER-haptic/scripts/start_irl_and_vr.sh" "$@"

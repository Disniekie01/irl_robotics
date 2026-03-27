# Makefile for IRL Robotics - running simulation and launching server

# Where this Makefile lives (repo root). Use this so targets work from any cwd.
REPO_ROOT := $(dir $(abspath $(firstword $(MAKEFILE_LIST))))
# App expects the dashboard at irl_robotics/resources/dist (same as get_resources_path() / "dist")
FRONTEND_DEST := $(REPO_ROOT)irl_robotics/resources/dist

# Default output filename when running `make build`
OUTPUT_FILENAME ?= main.bin

# Default target
all: prod

# Run the server for prod settings (able to connect to the Meta Quest). If npm is not installed, it will skip the build step.
prod:
	cd ./dashboard && (npm i && npm run build && mkdir -p ../irl_robotics/resources/dist/ && cp -r ./dist/* ../irl_robotics/resources/dist/)
	cd irl_robotics && uv run --python 3.10 irlrobotics run --simulation=headless --no-crash-telemetry

prod_back:
	cd irl_robotics && MESA_GL_VERSION_OVERRIDE=3.3 uv run --python 3.10 irlrobotics run --simulation=headless --no-crash-telemetry

# Chat agent run
chat:
	cd irl_robotics && uv run --python 3.10 irlrobotics run --chat --simulation=headless --no-crash-telemetry

# Same as prod, but with the simulation GUI (useful when adding new robots to test)
prod_gui:
	cd ./dashboard && (npm i && npm run build && mkdir -p ../irl_robotics/resources/dist/ && cp -r ./dist/* ../irl_robotics/resources/dist/)
	cd irl_robotics && MESA_GL_VERSION_OVERRIDE=3.3 uv run --python 3.10 irlrobotics run --simulation=gui --no-crash-telemetry

# Trick for raspberrypi : pretend opengl>=3.2 so that pybullet will run in a gui
prod_gui_back:
	cd irl_robotics && MESA_GL_VERSION_OVERRIDE=3.3 uv run --python 3.10 irlrobotics run --simulation=gui --no-crash-telemetry


# Run the server for prod settings (able to connect to the Meta Quest) but with telemetry disabled. If npm is not installed, it will skip the build step.
prod_no_telemetry:
	cd ./dashboard && ((npm i && npm run build && mkdir -p ../irl_robotics/resources/dist/ && cp -r ./dist/* ../irl_robotics/resources/dist/) || echo "npm command failed, continuing anyway") 
	cd irl_robotics && uv run irlrobotics run --simulation=headless --no-telemetry

# Run the server for prod settings with the simulation enabled
prod_sim:
	cd ./irl_robotics && uv run irlrobotics run --simulation=gui --no-telemetry

# Run info command for prod settings
prod_info:
	cd ./irl_robotics && uv run irlrobotics info --opencv --servos

# Run localhost server for dev settings
local:
	cd ./irl_robotics && uv run irlrobotics run --simulation=gui --port=8080 --host=127.0.0.1 --no-telemetry

# Run with simulated robot (shows as "Connected" in dashboard; no real hardware)
sim:
	cd irl_robotics && uv run --python 3.10 irlrobotics run --simulation=headless --only-simulation --simulate-cameras --no-crash-telemetry

# For running integration tests
test_server:
	cd ./irl_robotics && uv run irlrobotics run --simulation=headless --only-simulation --simulate-cameras --port=8080 --host=127.0.0.1 --no-telemetry &

# For running the built app in test mode
run_bin_test:
	./irl_robotics/dist/main.bin run --simulation=headless --simulate-cameras --port=8080 --host=127.0.0.1 --no-telemetry &

# For running the built app in prod mode
run_bin:
	./irl_robotics/dist/main.bin run --simulation=headless

# To have the information about the software and the hardware from the built app
info_bin:
	./irl_robotics/dist/main.bin info


# Don't use sudo uv run, it will break CICD
build_pyinstaller:
	cd irl_robotics && \
	WASMTIME_PATH=$$(uv run python -c "import wasmtime; import os; print(os.path.dirname(wasmtime.__file__))") && \
	uv run pyinstaller \
	--onefile \
	--name $(OUTPUT_FILENAME) \
	--add-data "resources:resources" \
	--add-data "$$WASMTIME_PATH:wasmtime" \
	--additional-hooks-dir "./hooks" \
	--hidden-import irl_robotics \
	--collect-all irl_robotics \
	--collect-all wasmtime \
	--clean -c \
	irl_robotics/main.py \

clean_build:
	cd ./irl_robotics && rm -rf main.build main.dist main.onefile-build $(OUTPUT_FILENAME)

build_frontend:
	@echo "Building dashboard and copying to $(FRONTEND_DEST)"
	cd "$(REPO_ROOT)dashboard" && npm i && npm run build && \
	mkdir -p "$(FRONTEND_DEST)" && \
	cp -r ./dist/* "$(FRONTEND_DEST)/" && \
	echo "Done. Dashboard is at $(FRONTEND_DEST)"

# Clean up
stop:
	echo "Checking for uv process..."
	ps -ef | grep uv || echo "No uv process running."
	echo "Checking for Python processes..."
	ps -ef | grep python || echo "No Python processes found."
	-killall uv || echo "No uv process found."
	-killall python3 || echo "No python3 process found."
	-killall python3.8 || echo "No python3.8 process found."
	echo "Cleanup complete."

# Clean up hard (kill processes on ports 80 and 8080)
stop_hard:
	echo "Killing all processes listening on port 80..."
	-sudo lsof -i :80 -t | xargs -r sudo kill -9
	echo "Killing all processes listening on port 8020..."
	-sudo lsof -i :8020 -t | xargs -r sudo kill -9
	echo "Killing all processes listening on port 8080..."
	-sudo lsof -i :8080 -t | xargs -r sudo kill -9
	echo "Forceful cleanup of all processes on ports 80, 8020 and 8080 complete."


submodule:
	git submodule update --init --recursive

types: 
	cd irl_robotics && uv run mypy . --check-untyped-defs --disallow-untyped-defs --ignore-missing-imports --follow-imports=silent

sort:
	cd irl_robotics && uv run ruff check --select I --fix .

tests:
	cd irl_robotics && uv run pytest tests/irl_robotics/ -n 5


.PHONY: all dev prod prod_gui stop stop_hard dataset_annotate dataset_convert dataset_push robot_watch test_server build clean_build build_pyinstaller run_bin run_bin_test info_bin
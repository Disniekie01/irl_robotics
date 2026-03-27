"""
Local AI training endpoints.
Runs SmolVLA (via lerobot) and gr00t training directly on the host machine
without requiring Modal cloud infrastructure.
"""

import asyncio
import os
import platform
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from irl_robotics.am.base import (
    TrainingParamsGr00T,
    TrainingParamsSmolVLA,
    TrainingRequest,
    generate_readme,
    resize_dataset,
)
from irl_robotics.models.lerobot_dataset import InfoModel
from irl_robotics.utils import get_hf_token, get_home_app_path

router = APIRouter(tags=["local-training"])


class LocalTrainingRequest(BaseModel):
    model_type: str = Field(
        ..., description="Model type: 'smolvla' or 'gr00t'"
    )
    dataset_name: str = Field(
        ..., description="HuggingFace dataset repo ID (e.g. user/dataset-name)"
    )
    model_name: Optional[str] = Field(
        default=None,
        description="Output model name on HuggingFace. If None, saved locally only.",
    )
    training_params: Optional[dict] = Field(
        default=None, description="Training hyperparameters (JSON)"
    )
    upload_to_hf: bool = Field(
        default=False,
        description="Whether to upload the trained model to HuggingFace",
    )
    hf_token: Optional[str] = Field(
        default=None, description="HuggingFace token (falls back to saved token)"
    )
    wandb_api_key: Optional[str] = Field(
        default=None, description="Optional WandB API key for experiment tracking"
    )


class LocalTrainingResponse(BaseModel):
    status: str
    message: str
    log_file: Optional[str] = None
    output_dir: Optional[str] = None


def _build_smolvla_command(
    dataset_name: str,
    dataset_path: str,
    output_dir: str,
    params: TrainingParamsSmolVLA,
    wandb_enabled: bool,
    wandb_run_id: str,
) -> list[str]:
    cmd = [
        "python", "-m", "lerobot.scripts.train",
        f"--dataset.repo_id={dataset_name}",
        f"--dataset.root={dataset_path}",
        "--policy.type=smolvla",
        "--policy.push_to_hub=false",
        "--policy.device=cuda",
        f"--output_dir={output_dir}",
        f"--wandb.project=irl_robotics-SMOLVLA",
        f"--wandb.run_id={wandb_run_id}",
        f"--wandb.enable={str(wandb_enabled).lower()}",
        f"--job_name={wandb_run_id}",
    ]
    params_dict = params.model_dump(by_alias=True, exclude_none=True)
    for key, value in params_dict.items():
        cmd.append(f"--{key}={value}")
    return cmd


def _build_groot_command(
    dataset_path: str,
    output_dir: str,
    params: TrainingParamsGr00T,
    action_space: int,
    num_cameras: int,
    wandb_enabled: bool,
    validation_path: Optional[str] = None,
) -> list[str]:
    cmd = [
        "python", "-m", "gr00t.scripts.gr00t_finetune",
        "--dataset-path", dataset_path,
        "--num-gpus", "1",
        "--output-dir", output_dir,
        "--action_space", str(action_space),
        "--num-cams", str(num_cameras),
        "--report_to", "wandb" if wandb_enabled else "tensorboard",
        "--video_backend", "torchvision_av",
    ]
    if validation_path:
        cmd.extend(["--validation-dataset-path", validation_path])

    params_dict = params.model_dump(
        by_alias=True,
        exclude_none=True,
        exclude={"data_dir": True, "output_dir": True, "validation_data_dir": True},
    )
    for key, value in params_dict.items():
        cmd.extend([f"--{key}", str(value)])
    return cmd


async def _run_training_process(
    cmd: list[str],
    log_path: str,
    env_extra: Optional[dict] = None,
) -> None:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)

    with open(log_path, "w") as f:
        f.write(f"Training started at {time.ctime()}\n")
        f.write(f"Command: {' '.join(cmd)}\n\n")
        f.flush()

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
            limit=512 * 1024,
        )

        assert process.stdout is not None
        async for line in process.stdout:
            decoded = line.decode(errors="replace")
            f.write(decoded)
            f.flush()

        await process.wait()
        f.write(f"\nProcess completed with return code {process.returncode}\n")
        if process.returncode == 0:
            f.write("Training completed successfully!\n")
        else:
            f.write("Training failed. See errors above.\n")


async def _local_train_smolvla(
    request: LocalTrainingRequest,
    log_path: str,
) -> None:
    from huggingface_hub import snapshot_download, HfApi

    hf_token = request.hf_token or get_hf_token()
    home = get_home_app_path()
    data_dir = home / "local_training" / "data" / request.dataset_name.replace("/", "_")
    output_dir = home / "local_training" / "outputs" / f"smolvla_{int(time.time())}"
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    logger.info(f"Downloading dataset {request.dataset_name} to {data_dir}")
    dataset_path = Path(snapshot_download(
        repo_id=request.dataset_name,
        repo_type="dataset",
        local_dir=str(data_dir),
        token=hf_token,
    ))

    resized_ok, _, details = resize_dataset(dataset_path, resize_to=(320, 240))
    if not resized_ok:
        logger.error(f"Resize failed: {details}")

    params = TrainingParamsSmolVLA(**(request.training_params or {}))
    if params.batch_size is None:
        info = InfoModel.from_json(meta_folder_path=str(dataset_path / "meta"))
        n_cams = len(info.features.observation_images)
        params.batch_size = 120 // n_cams if n_cams > 0 else 100
    if params.steps is None:
        params.steps = min(800_000 // params.batch_size, 8_000)

    wandb_enabled = request.wandb_api_key is not None
    run_id = f"local_smolvla_{int(time.time())}"

    cmd = _build_smolvla_command(
        dataset_name=request.dataset_name,
        dataset_path=str(dataset_path),
        output_dir=str(output_dir),
        params=params,
        wandb_enabled=wandb_enabled,
        wandb_run_id=run_id,
    )

    env_extra = {}
    if request.wandb_api_key:
        env_extra["WANDB_API_KEY"] = request.wandb_api_key
    if hf_token:
        env_extra["HF_TOKEN"] = hf_token

    await _run_training_process(cmd, log_path, env_extra)

    if request.upload_to_hf and request.model_name and hf_token:
        try:
            api = HfApi(token=hf_token)
            api.create_repo(request.model_name, exist_ok=True)
            api.upload_folder(
                repo_id=request.model_name,
                folder_path=str(output_dir),
                repo_type="model",
            )
            readme = generate_readme(
                model_type="smolvla",
                dataset_repo_id=request.dataset_name,
                training_params=params,
                return_readme_as_bytes=True,
            )
            api.upload_file(
                repo_id=request.model_name,
                path_or_fileobj=readme,
                path_in_repo="README.md",
                repo_type="model",
            )
            logger.info(f"Model uploaded to https://huggingface.co/{request.model_name}")
        except Exception as e:
            logger.error(f"Failed to upload model: {e}")


async def _local_train_groot(
    request: LocalTrainingRequest,
    log_path: str,
) -> None:
    import json
    from huggingface_hub import snapshot_download, HfApi

    hf_token = request.hf_token or get_hf_token()
    home = get_home_app_path()
    data_dir = home / "local_training" / "data" / request.dataset_name.replace("/", "_")
    output_dir = home / "local_training" / "outputs" / f"groot_{int(time.time())}"
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    logger.info(f"Downloading dataset {request.dataset_name} to {data_dir}")
    dataset_path = Path(snapshot_download(
        repo_id=request.dataset_name,
        repo_type="dataset",
        local_dir=str(data_dir),
        token=hf_token,
    ))

    resized_ok, _, details = resize_dataset(dataset_path, resize_to=(224, 224))
    if not resized_ok:
        logger.error(f"Resize failed: {details}")

    # Generate modality.json
    with open(dataset_path / "meta" / "info.json", "r") as f:
        metadata = json.load(f)
    image_keys = [k for k in metadata["features"] if "image" in k]
    action_space = metadata["features"]["action"]["shape"][0]
    num_cameras = len(image_keys)

    camera_names = [f"image_cam_{i}" for i in range(num_cameras)]
    video_structure = {camera_names[i]: {"original_key": image_keys[i]} for i in range(num_cameras)}
    modality_json = {
        "state": {"action_space": {"start": 0, "end": action_space}},
        "action": {"action_space": {"start": 0, "end": action_space}},
        "video": video_structure,
        "annotation": {"human.task_description": {"original_key": "task_index"}},
    }
    with open(dataset_path / "meta" / "modality.json", "w") as f:
        json.dump(modality_json, f, indent=4)

    params = TrainingParamsGr00T(**(request.training_params or {}))
    wandb_enabled = request.wandb_api_key is not None

    cmd = _build_groot_command(
        dataset_path=str(data_dir),
        output_dir=str(output_dir),
        params=params,
        action_space=action_space,
        num_cameras=num_cameras,
        wandb_enabled=wandb_enabled,
    )

    env_extra = {}
    if request.wandb_api_key:
        env_extra["WANDB_API_KEY"] = request.wandb_api_key
    if hf_token:
        env_extra["HF_TOKEN"] = hf_token

    await _run_training_process(cmd, log_path, env_extra)

    if request.upload_to_hf and request.model_name and hf_token:
        try:
            api = HfApi(token=hf_token)
            api.create_repo(request.model_name, exist_ok=True)
            api.upload_folder(
                repo_id=request.model_name,
                folder_path=str(output_dir),
                repo_type="model",
            )
            readme = generate_readme(
                model_type="gr00t",
                dataset_repo_id=request.dataset_name,
                training_params=params,
                return_readme_as_bytes=True,
            )
            api.upload_file(
                repo_id=request.model_name,
                path_or_fileobj=readme,
                path_in_repo="README.md",
                repo_type="model",
            )
            logger.info(f"Model uploaded to https://huggingface.co/{request.model_name}")
        except Exception as e:
            logger.error(f"Failed to upload model: {e}")


@router.post("/training/start-local", response_model=LocalTrainingResponse)
async def start_local_training(
    request: LocalTrainingRequest,
    background_tasks: BackgroundTasks,
) -> LocalTrainingResponse:
    """
    Start a local training job for SmolVLA or gr00t.
    Training runs in the background on the host machine's GPU.
    Returns a log file name that can be streamed via /training/logs/{log_file}.
    """
    if request.model_type not in ("smolvla", "gr00t"):
        raise HTTPException(
            status_code=400,
            detail=f"Local training supports 'smolvla' and 'gr00t', got '{request.model_type}'",
        )

    log_file_name = f"local_training_{request.model_type}_{int(time.time())}.log"
    log_dir = get_home_app_path() / "logs"
    os.makedirs(log_dir, exist_ok=True)
    log_path = str(log_dir / log_file_name)

    output_dir = str(
        get_home_app_path()
        / "local_training"
        / "outputs"
        / f"{request.model_type}_{int(time.time())}"
    )

    if request.model_type == "smolvla":
        background_tasks.add_task(_local_train_smolvla, request, log_path)
    else:
        background_tasks.add_task(_local_train_groot, request, log_path)

    return LocalTrainingResponse(
        status="started",
        message=f"Local {request.model_type} training started. Stream logs at /training/logs/{log_file_name}",
        log_file=log_file_name,
        output_dir=output_dir,
    )


@router.get("/training/local/status")
async def local_training_status() -> dict:
    """Check if any local training logs exist and their status."""
    log_dir = get_home_app_path() / "logs"
    if not log_dir.exists():
        return {"active_jobs": []}

    jobs = []
    for f in sorted(log_dir.glob("local_training_*.log"), reverse=True):
        content = f.read_text(errors="replace")
        completed = "Process completed with return code" in content
        success = "Training completed successfully" in content
        jobs.append({
            "log_file": f.name,
            "completed": completed,
            "success": success if completed else None,
        })
    return {"active_jobs": jobs[:10]}

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .server import StatusResponse


class TrainingInfoRequest(BaseModel):
    model_id: Optional[str] = Field(
        None, description="Hugging Face model id to get training info"
    )
    model_type: Literal["pi0.5", "gr00t", "ACT", "ACT_BBOX", "smolvla", "custom"]


class TrainingInfoResponse(BaseModel):
    status: Literal["ok", "error"]
    message: Optional[str] = None
    training_body: Optional[dict] = None


class ModelConfigurationRequest(BaseModel):
    model_id: str = Field(
        ...,
        description="Hugging Face model id to use",
        examples=["PLB/GR00T-N1-lego-pickup-mono-2"],
        pattern=r"^\s*\S.*$",
    )
    model_type: Literal["gr00t", "ACT", "ACT_BBOX", "pi0.5", "smolvla"] = Field(
        ...,
        description="Type of model to use.",
    )


class ModelConfigurationResponse(BaseModel):
    video_keys: List[str] = Field(
        ...,
        description="List of video keys for the model.",
        examples=[["video_0", "video_1"]],
    )
    checkpoints: List[str] = Field(
        default_factory=list,
        description="List of available checkpoints for the model.",
        examples=[["100", "500"]],
    )


class ModelStatusResponse(BaseModel):
    model_url: str
    model_status: Literal["Done", "In progress", "Not started", "Failed"]


class ModelStatusRequest(BaseModel):
    model_url: str = Field(..., description="Hugging Face model URL")


class SupabaseTrainingModel(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    status: Literal["succeeded", "failed", "running", "canceled"]
    user_id: str
    dataset_name: str
    model_name: str
    requested_at: str
    terminated_at: Optional[str]
    used_wandb: Optional[bool]
    model_type: str
    training_params: Optional[dict] = None
    modal_function_call_id: Optional[str] = None
    session_count: int = 0
    success_rate: Optional[float] = None


class TrainingsList(BaseModel):
    models: list[SupabaseTrainingModel]


class StartTrainingResponse(StatusResponse):
    training_id: Optional[int] = Field(
        ...,
        description="ID of the training to start.",
    )
    model_url: Optional[str] = Field(
        None,
        description="URL to the Hugging Face model card.",
    )


class CancelTrainingRequest(BaseModel):
    training_id: int = Field(..., description="ID of the training to cancel.")


class CustomTrainingRequest(BaseModel):
    custom_command: str = Field(
        ...,
        description="Will run this custom command as a subprocess when pressing the train button.",
    )

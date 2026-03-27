from typing import Dict, List, Literal, Optional, Tuple, Union

from pydantic import BaseModel, Field

from irl_robotics.types import VideoCodecs


class RecordingStartRequest(BaseModel):
    dataset_name: Optional[str] = Field(
        None,
        description="Name of the dataset to save the episode in.",
        examples=["example_dataset"],
    )
    episode_format: Optional[Literal["json", "lerobot_v2", "lerobot_v2.1"]] = Field(
        None,
        description="Format to save the episode.",
        examples=["lerobot_v2.1"],
    )
    video_codec: Optional[VideoCodecs] = Field(
        None,
        description="Codec to use for the video saving.",
        examples=["avc1"],
    )
    freq: Optional[int] = Field(
        None,
        description="Records steps of the robot at this frequency.",
        examples=[30],
    )
    branch_path: Optional[str] = Field(
        None,
        description="Path to the branch to push the dataset to.",
    )
    target_video_size: Optional[Tuple[int, int]] = Field(
        None,
        description="Target video size for the recording.",
        examples=[(320, 240)],
    )
    cameras_ids_to_record: Optional[List[int]] = Field(
        None,
        description="List of camera ids to record.",
        examples=[[0, 1]],
    )
    instruction: Optional[str] = Field(
        None,
        description="A text describing the recorded task.",
        examples=["Pick up the orange brick and put it in the black box."],
    )
    robot_serials_to_ignore: Optional[List[str]] = Field(
        None,
        description="List of robot serial ids to ignore.",
        examples=[["/dev/ttyUSB0"]],
    )
    enable_rerun_visualization: bool = Field(
        False,
        description="Enable rerun",
    )
    leader_arm_ids: Optional[List[str]] = Field(
        None,
        description="Serial numbers of the leader arms used during the recording",
        examples=[["/dev/ttyUSB0"]],
    )
    save_cartesian: bool = Field(
        False,
        description="Record cartesian positions of the robots as well.",
    )
    add_metadata: Optional[Dict[str, list]] = Field(
        None,
        description="Passing a dictionnary will store the value in each row of the recorded dataset.",
        examples=[{"bbox_position": [0.5, 1.0, 0.0, 0.5]}],
    )


class RecordingStopRequest(BaseModel):
    save: bool = Field(
        True,
        description="Whether to save the episode to disk.",
    )


class RecordingStopResponse(BaseModel):
    episode_folder_path: Optional[str] = Field(
        ...,
        description="Path to the folder where the episode is saved.",
    )
    episode_index: Optional[int] = Field(
        ...,
        description="Index of the recorded episode in the dataset.",
    )


class RecordingPlayRequest(BaseModel):
    dataset_format: Literal["lerobot_v2", "lerobot_v2.1"] = Field(
        "lerobot_v2.1",
        description="Format of the dataset to play.",
    )
    dataset_name: Optional[str] = Field(
        None,
        description="Name of the dataset to play the episode from.",
        examples=["example_dataset"],
    )
    episode_id: Optional[int] = Field(
        None,
        description="ID of the episode to play.",
        examples=[0],
    )
    episode_path: Optional[str] = Field(
        None,
        description="Path to the .parquet file of the episode to play.",
        examples=[
            "~/irl_robotics/lerobot_v2/example_dataset/chunk-000/episode_000000.json"
        ],
    )
    robot_id: Optional[Union[int, List[int]]] = Field(
        None,
        description="ID of the robot to play the episode on.",
        examples=[0, [0, 1]],
    )
    robot_serials_to_ignore: Optional[List[str]] = Field(
        None,
        description="List of robot serial ids to ignore.",
        examples=[["/dev/ttyUSB0"]],
    )
    replicate: bool = Field(
        True,
        description="If True, extra robots will replicate movements of the robots in the episode.",
    )
    playback_speed: float = Field(
        1.0,
        ge=0,
        description="Speed of the playback.",
    )
    interpolation_factor: int = Field(
        4,
        ge=1,
        description="Smoothen the playback by interpolating between frames.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "dataset_name": "example_dataset",
                    "episode_id": 0,
                },
                {
                    "episode_path": "~/irl_robotics/lerobot_v2/example_dataset/chunk-000/episode_000000.json",
                    "robot_id": [0, 1],
                    "replicate": False,
                },
            ]
        }
    }


class HFDownloadDatasetRequest(BaseModel):
    dataset_name: str


class DatasetRepairRequest(BaseModel):
    dataset_path: str = Field(
        ...,
        description="Path to the dataset to repair",
        examples=["/lerobot_v2.1/example_dataset"],
    )


class DatasetSplitRequest(BaseModel):
    dataset_path: str = Field(
        ...,
        description="Path to the dataset to split",
        examples=["/lerobot_v2.1/example_dataset"],
    )
    split_ratio: float = Field(
        0.8,
        ge=0,
        le=1,
        description="Ratio of the dataset to use for the first split.",
    )
    first_split_name: str = Field(
        ...,
        description="Name of the first split.",
        examples=["/lerobot_v2.1/example_dataset_training"],
    )
    second_split_name: str = Field(
        ...,
        description="Name of the second split.",
        examples=["/lerobot_v2.1/example_dataset_validation"],
    )


class DatasetShuffleRequest(BaseModel):
    dataset_path: str = Field(
        ...,
        description="Path to the dataset to shuffle",
        examples=["/lerobot_v2.1/example_dataset"],
    )


class MergeDatasetsRequest(BaseModel):
    first_dataset: str = Field(
        ...,
        description="Path to the first dataset to merge",
        examples=["/lerobot_v2.1/example_dataset"],
    )
    second_dataset: str = Field(
        ...,
        description="Path to the second dataset to merge",
        examples=["/lerobot_v2.1/example_dataset_to_merge_with"],
    )
    new_dataset_name: str = Field(
        ...,
        description="Name of the new dataset to create",
        examples=["/lerobot_v2.1/example_dataset_merged"],
    )
    image_key_mappings: Dict[str, str] = Field(
        ...,
        description="Mapping of the image keys from the first dataset to the second dataset.",
        examples=[
            {"wrist_camera": "wrist_camera_2", "context_camera": "context_camera_2"}
        ],
    )


class DatasetListResponse(BaseModel):
    pushed_datasets: List[str]
    local_datasets: List[str]

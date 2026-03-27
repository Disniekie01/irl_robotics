from typing import List, Optional

from pydantic import BaseModel, Field


class ItemInfo(BaseModel):
    name: str
    path: str
    absolute_path: str
    is_dir: bool
    is_dataset_dir: bool = False
    browseUrl: Optional[str] = None
    downloadUrl: Optional[str] = None
    previewUrl: Optional[str] = None
    huggingfaceUrl: Optional[str] = None
    canDeleteDataset: bool = False
    deleteDatasetAction: Optional[str] = None


class BrowseFilesResponse(BaseModel):
    directoryTitle: str
    tokenError: Optional[str] = None
    items: List[ItemInfo]
    episode_ids: List[int] = []
    episode_paths: List[str] = []


class BrowserFilesRequest(BaseModel):
    path: str


class DeleteEpisodeRequest(BaseModel):
    path: str
    episode_id: int

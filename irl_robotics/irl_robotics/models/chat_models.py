import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    chat_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for the chat session.",
    )
    prompt: str = Field(
        ...,
        description="The task to be performed by the robot, described in natural language.",
    )
    images: Optional[List[str]] = Field(
        None, description="base64 encoded images to be sent with the request."
    )
    command_history: Optional[List[str]] = Field(
        None, description="List of previous commands to provide context for the chat."
    )


class ChatResponse(BaseModel):
    command: Optional[str] = Field(
        ...,
        description="The command to be executed by the robot.",
    )
    endpoint: Optional[str] = Field(None, description="The endpoint to call.")
    endpoint_params: Optional[Dict[str, Any]] = Field(
        None, description="Parameters to pass to the endpoint."
    )

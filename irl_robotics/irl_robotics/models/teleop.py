from pydantic import BaseModel, Field


class TeleopSettings(BaseModel):
    vr_scaling: float = Field(
        ...,
        description="VR scaling factor for teleoperation control.",
        gt=0,
        examples=[1.0, 0.5, 2.0],
    )


class TeleopSettingsRequest(BaseModel):
    vr_scaling: float = Field(
        ...,
        description="VR scaling factor for teleoperation control.",
        gt=0,
        examples=[1.0, 0.5, 2.0],
    )


class UDPServerInformationResponse(BaseModel):
    host: str
    port: int


class AddZMQCameraRequest(BaseModel):
    tcp_address: str = Field(
        ...,
        description="TCP address of the ZMQ publisher. Format: 'tcp://<host>:<port>'.",
        examples=["tcp://localhost:5555"],
    )
    topic: str | None = Field(
        None,
        description="Topic to subscribe to.",
        examples=["cabin_view", "wrist_camera"],
    )

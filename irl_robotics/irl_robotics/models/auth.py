from typing import Optional

from pydantic import BaseModel, Field

from .server import StatusResponse


class Session(BaseModel):
    """
    Session model for storing supabase session details.
    """

    user_id: str
    user_email: str
    email_confirmed: bool
    access_token: str
    refresh_token: str
    expires_at: int


class SessionReponse(BaseModel):
    message: str
    session: Optional[Session] = None
    is_pro_user: Optional[bool] = None


class AuthResponse(BaseModel):
    authenticated: bool
    session: Optional[Session] = None
    is_pro_user: Optional[bool] = None


class LoginCredentialsRequest(BaseModel):
    email: str
    password: str


class VerifyEmailCodeRequest(BaseModel):
    email: str
    token: str


class ConfirmRequest(BaseModel):
    access_token: str
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    access_token: str = Field(..., description="Access token from the reset email")
    refresh_token: str = Field(..., description="Refresh token from the reset email")
    new_password: str = Field(..., description="New password to set for the user")


class HuggingFaceTokenRequest(BaseModel):
    token: str


class WandBTokenRequest(BaseModel):
    token: str


class NetworkCredentials(BaseModel):
    ssid: str
    password: str

from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel


class Organization(BaseModel):
    id: str
    name: str
    slug: str
    createdAt: str


class User(BaseModel):
    id: str
    organizationId: str
    email: str
    role: str
    createdAt: str


class EvalSpec(BaseModel):
    id: str
    organizationId: str
    name: str
    description: Optional[str] = None
    scenarios: list[dict[str, Any]]
    version: int
    createdAt: str


class Run(BaseModel):
    id: str
    organizationId: str
    evalSpecId: str
    status: str  # pending | running | completed | failed
    decision: Optional[str] = None  # pass | warn | fail
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class Dataset(BaseModel):
    id: str
    organizationId: str
    name: str
    description: Optional[str] = None
    itemCount: int
    createdAt: str


class Agent(BaseModel):
    id: str
    organizationId: str
    name: str
    description: Optional[str] = None
    version: int
    createdAt: str


class PersonalAccessToken(BaseModel):
    id: str
    name: str
    scopes: list[str]
    createdAt: str
    expiresAt: Optional[str] = None
    lastUsedAt: Optional[str] = None


class CreateTokenRequest(BaseModel):
    name: str
    ttlDays: Optional[int] = 90
    scopes: Optional[list[str]] = None


class CreateTokenResponse(BaseModel):
    id: str
    name: str
    token: str  # raw PAT, shown once
    scopes: list[str]
    createdAt: str
    expiresAt: Optional[str] = None

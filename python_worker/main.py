#!/usr/bin/env python3
"""
OpenAI Evals Python Worker - Enhanced Reliability Version
A FastAPI-based worker service that integrates OpenAI's Evals framework
with the EvalOps platform for advanced LLM evaluation capabilities.

Enhanced with:
- Robust error handling and recovery
- Health checks and monitoring
- Fallback mechanisms for API failures
- Circuit breaker patterns
- Resource management and cleanup
- Task timeout and cancellation
"""

import os
import asyncio
import json
import logging
import signal
import time
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import uuid
import traceback
from concurrent.futures import ThreadPoolExecutor
import psutil
import gc

from fastapi import FastAPI, HTTPException, BackgroundTasks, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader, HTTPBearer
import hashlib
import hmac
from pydantic import BaseModel, Field, field_validator
import openai
import uvicorn
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Enhanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/tmp/python_worker.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)

# Configuration constants
MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "10"))
TASK_TIMEOUT_SECONDS = int(os.getenv("TASK_TIMEOUT_SECONDS", "1800"))  # 30 minutes
MAX_MEMORY_MB = int(os.getenv("MAX_MEMORY_MB", "2048"))
HEALTH_CHECK_INTERVAL = 60  # seconds

# Thread-safe circuit breaker with atomic operations and comprehensive metrics
import threading
from dataclasses import dataclass
from enum import Enum

class CircuitBreakerState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

@dataclass
class CircuitBreakerMetrics:
    failure_count: int = 0
    success_count: int = 0
    trip_count: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    last_trip_time: Optional[float] = None
    total_requests: int = 0

class ThreadSafeCircuitBreaker:
    """Production-ready thread-safe circuit breaker with comprehensive metrics and observability"""
    
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 300, success_threshold: int = 3):
        self._lock = threading.RLock()  # Reentrant lock for nested operations
        self._state = CircuitBreakerState.CLOSED
        self._metrics = CircuitBreakerMetrics()
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._success_threshold = success_threshold  # Successes needed in HALF_OPEN to close
        self._half_open_successes = 0
        self._half_open_semaphore = None  # Will be initialized in async context
        
    async def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection"""
        # Initialize semaphore if not already done
        if self._half_open_semaphore is None:
            self._half_open_semaphore = asyncio.Semaphore(1)
        
        with self._lock:
            self._metrics.total_requests += 1
            
            # Check if circuit should transition from OPEN to HALF_OPEN
            if self._state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    self._transition_to_half_open()
                else:
                    raise CircuitBreakerOpenError("Circuit breaker is OPEN - service temporarily unavailable")
        
        # Gate HALF_OPEN state to allow only one probe at a time
        if self._state == CircuitBreakerState.HALF_OPEN:
            # Try to acquire semaphore for HALF_OPEN state gating
            if not self._half_open_semaphore.locked():
                async with self._half_open_semaphore:
                    return await self._execute_with_monitoring(func, *args, **kwargs)
            else:
                # Another request is already probing in HALF_OPEN, reject this one
                raise CircuitBreakerOpenError("Circuit breaker is HALF_OPEN - only one probe allowed")
        else:
            return await self._execute_with_monitoring(func, *args, **kwargs)
    
    async def _execute_with_monitoring(self, func, *args, **kwargs):
        """Execute function with monitoring and error handling"""
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure(e)
            raise
        finally:
            # Record call duration for metrics
            duration = time.time() - start_time
            logger.debug(f"Circuit breaker call completed in {duration:.3f}s")
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset from OPEN to HALF_OPEN"""
        if self._metrics.last_failure_time is None:
            return True
        return time.time() - self._metrics.last_failure_time > self._recovery_timeout
    
    def _transition_to_half_open(self):
        """Transition from OPEN to HALF_OPEN state"""
        self._state = CircuitBreakerState.HALF_OPEN
        self._half_open_successes = 0
        logger.info("Circuit breaker transitioned to HALF_OPEN - attempting recovery")
    
    def _record_success(self):
        """Record successful execution"""
        with self._lock:
            self._metrics.success_count += 1
            self._metrics.last_success_time = time.time()
            
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._half_open_successes += 1
                if self._half_open_successes >= self._success_threshold:
                    self._close_circuit()
            elif self._state == CircuitBreakerState.CLOSED:
                # Reset failure count on successful operation
                self._metrics.failure_count = 0
    
    def _record_failure(self, exception: Exception):
        """Record failed execution"""
        with self._lock:
            self._metrics.failure_count += 1
            self._metrics.last_failure_time = time.time()
            
            # Always transition to OPEN on failure if in HALF_OPEN
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._open_circuit()
            elif self._state == CircuitBreakerState.CLOSED:
                # Transition to OPEN if failure threshold exceeded
                if self._metrics.failure_count >= self._failure_threshold:
                    self._open_circuit()
            
            logger.warning(f"Circuit breaker recorded failure: {exception}")
    
    def _open_circuit(self):
        """Transition to OPEN state"""
        self._state = CircuitBreakerState.OPEN
        self._metrics.trip_count += 1
        self._metrics.last_trip_time = time.time()
        self._half_open_successes = 0
        logger.error(f"Circuit breaker OPENED after {self._metrics.failure_count} failures")
    
    def _close_circuit(self):
        """Transition to CLOSED state"""
        self._state = CircuitBreakerState.CLOSED
        self._metrics.failure_count = 0
        self._half_open_successes = 0
        logger.info("Circuit breaker CLOSED - service recovered")
    
    def get_state(self) -> dict:
        """Get current circuit breaker state and metrics (thread-safe)"""
        with self._lock:
            return {
                "state": self._state.value,
                "metrics": {
                    "failure_count": self._metrics.failure_count,
                    "success_count": self._metrics.success_count,
                    "trip_count": self._metrics.trip_count,
                    "total_requests": self._metrics.total_requests,
                    "last_failure_time": self._metrics.last_failure_time,
                    "last_success_time": self._metrics.last_success_time,
                    "last_trip_time": self._metrics.last_trip_time
                },
                "config": {
                    "failure_threshold": self._failure_threshold,
                    "recovery_timeout": self._recovery_timeout,
                    "success_threshold": self._success_threshold
                }
            }
    
    def force_open(self):
        """Force circuit breaker to OPEN state (for testing/emergency)"""
        with self._lock:
            self._open_circuit()
    
    def force_close(self):
        """Force circuit breaker to CLOSED state (for testing/emergency)"""
        with self._lock:
            self._close_circuit()

class CircuitBreakerOpenError(Exception):
    """Exception raised when circuit breaker is open"""
    pass

circuit_breaker = ThreadSafeCircuitBreaker()

# Enhanced task management with cancellation and bounded execution
class EnhancedTaskManager:
    def __init__(self):
        self.active_tasks = {}
        self.cancelled_tasks = set()  # Track cancelled tasks
        self.task_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_TASKS)
        self.cleanup_interval = 60  # 1 minute cleanup cycle
        self.last_cleanup = time.time()
        self._cleanup_lock = threading.Lock()
        self._cancellation_events = {}  # Task ID -> asyncio.Event
        
        # Resource monitoring
        self.resource_check_interval = 30  # seconds
        self.last_resource_check = time.time()
        self.resource_warnings = 0
    
    def can_accept_task(self) -> bool:
        """Check if we can accept new tasks based on resource constraints"""
        if len(self.active_tasks) >= MAX_CONCURRENT_TASKS:
            return False
            
        # Check memory constraints
        memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
        if memory_mb > MAX_MEMORY_MB * 0.8:  # 80% threshold
            logger.warning(f"Memory usage high ({memory_mb:.2f}MB), rejecting new tasks")
            return False
            
        return True
    
    def create_cancellation_event(self, task_id: str) -> asyncio.Event:
        """Create cancellation event for a task"""
        event = asyncio.Event()
        self._cancellation_events[task_id] = event
        return event
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task"""
        if task_id not in self.active_tasks:
            return False
            
        self.cancelled_tasks.add(task_id)
        
        # Signal cancellation event
        if task_id in self._cancellation_events:
            self._cancellation_events[task_id].set()
            
        logger.info(f"Task {task_id} marked for cancellation")
        return True
    
    def is_cancelled(self, task_id: str) -> bool:
        """Check if task is cancelled"""
        return task_id in self.cancelled_tasks
    
    def add_task(self, task_id: str, task_data: dict):
        """Add task with enhanced tracking"""
        process = psutil.Process()
        self.active_tasks[task_id] = {
            **task_data,
            "start_time": time.time(),
            "memory_start": process.memory_info().rss / 1024 / 1024,
            "cpu_start": process.cpu_percent(),
            "last_heartbeat": time.time(),
            "progress": 0.0
        }
        
        # Create cancellation event
        self.create_cancellation_event(task_id)
        
        logger.info(f"Task {task_id} added to active tasks")
    
    def update_task_progress(self, task_id: str, progress: float, metadata: dict = None):
        """Update task progress and heartbeat"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id].update({
                "progress": progress,
                "last_heartbeat": time.time(),
                "metadata": metadata or {}
            })
    
    def remove_task(self, task_id: str):
        """Remove task with comprehensive cleanup"""
        # Remove from active tasks
        if task_id in self.active_tasks:
            del self.active_tasks[task_id]
        
        # Remove from cancelled tasks
        self.cancelled_tasks.discard(task_id)
        
        # Clean up cancellation event
        if task_id in self._cancellation_events:
            del self._cancellation_events[task_id]
            
        # Force garbage collection for memory cleanup
        gc.collect()
        
        logger.info(f"Task {task_id} removed with cleanup")
    
    def cleanup_old_tasks(self):
        """Enhanced cleanup with better resource management"""
        now = time.time()
        
        with self._cleanup_lock:
            if now - self.last_cleanup < self.cleanup_interval:
                return
            
            # Find expired and stale tasks
            expired_tasks = []
            stale_tasks = []
            
            for task_id, task_data in self.active_tasks.items():
                task_age = now - task_data.get("start_time", now)
                last_heartbeat = task_data.get("last_heartbeat", task_data.get("start_time", now))
                heartbeat_age = now - last_heartbeat
                
                if task_age > TASK_TIMEOUT_SECONDS:
                    expired_tasks.append(task_id)
                elif heartbeat_age > 300:  # 5 minutes without heartbeat
                    stale_tasks.append(task_id)
            
            # Clean up expired tasks
            for task_id in expired_tasks:
                logger.warning(f"Cleaning up expired task: {task_id} (age: {now - self.active_tasks[task_id]['start_time']:.1f}s)")
                if task_id in evaluation_tasks:
                    evaluation_tasks[task_id]["status"] = "timeout"
                    evaluation_tasks[task_id]["error"] = "Task timed out"
                    evaluation_tasks[task_id]["updated_at"] = datetime.now().isoformat()
                self.remove_task(task_id)
            
            # Clean up stale tasks
            for task_id in stale_tasks:
                logger.warning(f"Cleaning up stale task: {task_id} (no heartbeat for {now - self.active_tasks[task_id]['last_heartbeat']:.1f}s)")
                if task_id in evaluation_tasks:
                    evaluation_tasks[task_id]["status"] = "failed"
                    evaluation_tasks[task_id]["error"] = "Task became unresponsive"
                    evaluation_tasks[task_id]["updated_at"] = datetime.now().isoformat()
                self.remove_task(task_id)
            
            self.last_cleanup = now
    
    def check_resource_constraints(self):
        """Monitor and handle resource constraints"""
        now = time.time()
        if now - self.last_resource_check < self.resource_check_interval:
            return
            
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024
        cpu_percent = process.cpu_percent()
        
        # Check memory constraints
        if memory_mb > MAX_MEMORY_MB:
            self.resource_warnings += 1
            logger.error(f"Memory limit exceeded: {memory_mb:.2f}MB > {MAX_MEMORY_MB}MB")
            
            # Force aggressive cleanup
            gc.collect()
            
            # If still over limit, cancel oldest tasks
            if memory_mb > MAX_MEMORY_MB * 1.1:  # 10% over limit
                oldest_tasks = sorted(
                    self.active_tasks.items(), 
                    key=lambda x: x[1]['start_time']
                )[:2]  # Cancel 2 oldest tasks
                
                for task_id, _ in oldest_tasks:
                    logger.warning(f"Cancelling task {task_id} due to memory pressure")
                    self.cancel_task(task_id)
        
        # Check CPU constraints
        if cpu_percent > 90:  # High CPU usage
            logger.warning(f"High CPU usage: {cpu_percent:.2f}%")
        
        self.last_resource_check = now
    
    def get_status(self) -> dict:
        """Get comprehensive task manager status"""
        process = psutil.Process()
        return {
            "active_tasks": len(self.active_tasks),
            "cancelled_tasks": len(self.cancelled_tasks),
            "max_concurrent": MAX_CONCURRENT_TASKS,
            "memory_usage_mb": round(process.memory_info().rss / 1024 / 1024, 2),
            "memory_limit_mb": MAX_MEMORY_MB,
            "cpu_usage_percent": round(process.cpu_percent(), 2),
            "resource_warnings": self.resource_warnings,
            "can_accept_tasks": self.can_accept_task(),
            "task_details": {
                task_id: {
                    "progress": task_data.get("progress", 0.0),
                    "age_seconds": round(time.time() - task_data.get("start_time", time.time()), 1),
                    "memory_usage": round(task_data.get("memory_start", 0), 2)
                }
                for task_id, task_data in self.active_tasks.items()
            }
        }

task_manager = EnhancedTaskManager()

# Enhanced health monitoring
class HealthMonitor:
    def __init__(self):
        self.last_health_check = time.time()
        self.health_status = {
            "service": "healthy",
            "openai_api": "unknown",
            "memory_usage": 0,
            "cpu_usage": 0,
            "active_tasks": 0,
            "circuit_breaker": "CLOSED",
            "last_check": datetime.now().isoformat()
        }
    
    async def check_health(self):
        """Comprehensive health check"""
        try:
            # Check system resources
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            cpu_percent = process.cpu_percent()
            
            # Check OpenAI API connectivity
            openai_status = await self._check_openai_api()
            
            # Update health status
            self.health_status = {
                "service": "healthy" if memory_mb < MAX_MEMORY_MB else "degraded",
                "openai_api": openai_status,
                "memory_usage": round(memory_mb, 2),
                "cpu_usage": round(cpu_percent, 2),
                "active_tasks": len(task_manager.active_tasks),
                "total_tasks": len(evaluation_tasks),
                "circuit_breaker": circuit_breaker.get_state()["state"],
                "last_check": datetime.now().isoformat(),
                "uptime_seconds": time.time() - startup_time
            }
            
            self.last_health_check = time.time()
            return self.health_status
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            self.health_status["service"] = "unhealthy"
            self.health_status["error"] = str(e)
            return self.health_status
    
    async def _check_openai_api(self):
        """Check OpenAI API connectivity with thread-safe circuit breaker"""
        try:
            # Use circuit breaker to protect health check
            async def api_check():
                client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=10.0)
                await asyncio.to_thread(client.models.list)
                return "healthy"
            
            return await circuit_breaker.call(api_check)
            
        except CircuitBreakerOpenError:
            return "circuit_open"
        except Exception as e:
            logger.warning(f"OpenAI API health check failed: {e}")
            return "degraded"

health_monitor = HealthMonitor()

# Global startup time
startup_time = time.time()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Python worker starting up...")
    
    # Startup tasks
    try:
        await health_monitor.check_health()
        logger.info("Initial health check completed")
    except Exception as e:
        logger.error(f"Startup health check failed: {e}")
    
    # Start background health monitoring
    health_task = asyncio.create_task(periodic_health_check())
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    yield
    
    # Shutdown tasks
    logger.info("Python worker shutting down...")
    health_task.cancel()
    cleanup_task.cancel()
    
    # Cancel active tasks
    for task_id in list(task_manager.active_tasks.keys()):
        evaluation_tasks[task_id]["status"] = "cancelled"
        evaluation_tasks[task_id]["error"] = "Service shutdown"
        evaluation_tasks[task_id]["updated_at"] = datetime.now().isoformat()
    
    task_manager.task_executor.shutdown(wait=True)
    logger.info("Python worker shutdown complete")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="EvalOps OpenAI Evals Worker - Enhanced",
    description="Reliable Python worker service for running OpenAI Evals evaluations",
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS for Node.js communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception in {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "error_id": str(uuid.uuid4())}
    )

# Resilient OpenAI client with retry logic
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((openai.RateLimitError, openai.APITimeoutError))
)
async def create_openai_client():
    """Create OpenAI client with retry logic"""
    return openai.OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        timeout=30.0,
        max_retries=2
    )

# Background tasks
async def periodic_health_check():
    """Periodic health monitoring"""
    while True:
        try:
            await health_monitor.check_health()
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Periodic health check error: {e}")
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)

async def periodic_cleanup():
    """Periodic cleanup of expired tasks and resources"""
    while True:
        try:
            task_manager.cleanup_old_tasks()
            
            # Force garbage collection if memory usage is high
            memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
            if memory_mb > MAX_MEMORY_MB * 0.8:
                logger.warning(f"High memory usage: {memory_mb}MB, forcing garbage collection")
                gc.collect()
            
            await asyncio.sleep(300)  # 5 minutes
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Periodic cleanup error: {e}")
            await asyncio.sleep(300)

# Enhanced OpenAI client will be initialized dynamically

# In-memory task storage (use Redis/database in production)
evaluation_tasks: Dict[str, Dict] = {}

class EvaluationRequest(BaseModel):
    """Enhanced request model for running evaluations"""
    eval_spec_id: str = Field(..., description="Evaluation specification ID")
    dataset_samples: List[Dict[str, Any]] = Field(..., description="Dataset samples to evaluate")
    model_configuration: Dict[str, Any] = Field(..., description="Model configuration (provider, model, params)")
    evaluation_type: str = Field(default="model_graded", description="Type of evaluation to run")
    grading_criteria: Optional[Dict[str, Any]] = Field(None, description="Custom grading criteria")
    timeout_seconds: Optional[int] = Field(default=1800, description="Task timeout in seconds")
    retry_failed_samples: bool = Field(default=True, description="Retry failed samples")
    max_retries: int = Field(default=3, description="Maximum retry attempts per sample")
    
    @field_validator('dataset_samples')
    @classmethod
    def validate_samples(cls, v):
        if not v or len(v) == 0:
            raise ValueError("Dataset samples cannot be empty")
        if len(v) > 1000:
            raise ValueError("Too many samples (max 1000 per request)")
        return v
    
    @field_validator('timeout_seconds')
    @classmethod
    def validate_timeout(cls, v):
        if v and (v < 60 or v > 3600):
            raise ValueError("Timeout must be between 60 and 3600 seconds")
        return v
    
class EvaluationResponse(BaseModel):
    """Response model for evaluation results"""
    task_id: str
    status: str
    message: str

class TaskStatus(BaseModel):
    """Task status model"""
    task_id: str
    status: str
    progress: float
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str

@app.get("/")
async def root():
    """Basic health check endpoint"""
    return {
        "service": "EvalOps OpenAI Evals Worker - Enhanced",
        "version": "2.0.0",
        "status": "healthy" if health_monitor.health_status["service"] == "healthy" else "degraded",
        "timestamp": datetime.now().isoformat(),
        "uptime_seconds": time.time() - startup_time
    }

@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint"""
    await health_monitor.check_health()
    return health_monitor.health_status

@app.get("/health/live")
async def liveness_probe():
    """Kubernetes liveness probe - basic service availability"""
    return {"status": "alive", "timestamp": datetime.now().isoformat()}

@app.get("/health/ready")
async def readiness_probe():
    """Kubernetes readiness probe - ready to accept traffic"""
    health = await health_monitor.check_health()
    
    if health["service"] == "healthy" and health["openai_api"] in ["healthy", "degraded"]:
        return {"status": "ready", "details": health}
    else:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "details": health}
        )

@app.get("/metrics")
async def get_metrics():
    """Prometheus-style metrics endpoint"""
    active_running = len([t for t in evaluation_tasks.values() if t["status"] == "running"])
    active_pending = len([t for t in evaluation_tasks.values() if t["status"] == "pending"])
    active_completed = len([t for t in evaluation_tasks.values() if t["status"] == "completed"])
    active_failed = len([t for t in evaluation_tasks.values() if t["status"] == "failed"])
    
    process = psutil.Process()
    memory_mb = process.memory_info().rss / 1024 / 1024
    
    return {
        "tasks_running": active_running,
        "tasks_pending": active_pending,
        "tasks_completed": active_completed,
        "tasks_failed": active_failed,
        "tasks_total": len(evaluation_tasks),
        "memory_usage_mb": round(memory_mb, 2),
        "cpu_usage_percent": round(process.cpu_percent(), 2),
        "circuit_breaker_state": circuit_breaker.get_state()["state"],
        "uptime_seconds": time.time() - startup_time
    }

@app.post("/evaluate", response_model=EvaluationResponse)
async def create_evaluation(request: EvaluationRequest, background_tasks: BackgroundTasks):
    """Create a new evaluation task with enhanced reliability"""
    
    # Check if service can accept new tasks
    if not task_manager.can_accept_task():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Too many active tasks ({len(task_manager.active_tasks)}/{MAX_CONCURRENT_TASKS}). Please try again later."
        )
    
    # Check circuit breaker
    cb_state = circuit_breaker.get_state()
    if cb_state["state"] == "OPEN":
        last_failure = cb_state["metrics"]["last_failure_time"]
        time_since_failure = time.time() - (last_failure or 0)
        if time_since_failure < cb_state["config"]["recovery_timeout"]:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service temporarily unavailable due to repeated failures. Please try again later."
            )
        # Circuit breaker will transition to HALF_OPEN automatically in the call
    
    # Check system resources
    memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
    if memory_mb > MAX_MEMORY_MB:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"High memory usage ({memory_mb:.1f}MB). Please try again later."
        )
    
    task_id = str(uuid.uuid4())
    
    # Initialize enhanced task with metadata
    task = {
        "task_id": task_id,
        "status": "pending",
        "progress": 0.0,
        "request": request.dict(),
        "results": None,
        "error": None,
        "retry_count": 0,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "timeout_at": (datetime.now() + timedelta(seconds=request.timeout_seconds or TASK_TIMEOUT_SECONDS)).isoformat(),
        "metadata": {
            "samples_total": len(request.dataset_samples),
            "samples_completed": 0,
            "samples_failed": 0,
            "start_memory_mb": memory_mb
        }
    }
    
    evaluation_tasks[task_id] = task
    task_manager.add_task(task_id, task)
    
    # Start evaluation in background with enhanced error handling
    background_tasks.add_task(run_openai_evaluation_enhanced, task_id, request)
    
    logger.info(f"Created evaluation task {task_id} with {len(request.dataset_samples)} samples")
    
    return EvaluationResponse(
        task_id=task_id,
        status="pending",
        message=f"Evaluation task created with {len(request.dataset_samples)} samples"
    )

@app.get("/tasks/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Get status of a specific evaluation task"""
    if task_id not in evaluation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = evaluation_tasks[task_id]
    return TaskStatus(**task)

@app.get("/tasks", response_model=List[TaskStatus])
async def list_tasks(status: Optional[str] = None, limit: int = 50):
    """List evaluation tasks with optional status filter"""
    tasks = list(evaluation_tasks.values())
    
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    
    # Sort by creation time, newest first
    tasks.sort(key=lambda x: x["created_at"], reverse=True)
    
    return [TaskStatus(**task) for task in tasks[:limit]]

async def run_openai_evaluation_enhanced(task_id: str, request: EvaluationRequest):
    """Enhanced evaluation runner with robust error handling, recovery, and cancellation support"""
    task = evaluation_tasks[task_id]
    
    try:
        # Update task status
        task["status"] = "running"
        task["updated_at"] = datetime.now().isoformat()
        
        logger.info(f"Starting enhanced evaluation task {task_id} with {len(request.dataset_samples)} samples")
        
        # Check for cancellation before starting
        if task_manager.is_cancelled(task_id):
            raise asyncio.CancelledError("Task was cancelled before execution")
        
        # Create timeout context
        timeout_seconds = request.timeout_seconds or TASK_TIMEOUT_SECONDS
        cancellation_event = task_manager._cancellation_events.get(task_id)
        
        # Run evaluation with timeout and cancellation support
        try:
            # Create cancellation-aware wrapper
            async def run_with_cancellation():
                # Periodically check for cancellation
                async def cancellation_checker():
                    while True:
                        if task_manager.is_cancelled(task_id) or (cancellation_event and cancellation_event.is_set()):
                            raise asyncio.CancelledError("Task was cancelled during execution")
                        await asyncio.sleep(0.5)  # Check every 500ms
                
                # Run evaluation and cancellation checker concurrently
                evaluation_task = asyncio.create_task(_run_evaluation_with_retries(task_id, request))
                cancellation_task = asyncio.create_task(cancellation_checker())
                
                # Wait for either evaluation completion or cancellation
                done, pending = await asyncio.wait([evaluation_task, cancellation_task], return_when=asyncio.FIRST_COMPLETED)
                
                # Cancel any pending tasks
                for task in pending:
                    task.cancel()
                
                # Return the result of the completed task
                completed_task = done.pop()
                return await completed_task
            
            results = await asyncio.wait_for(
                run_with_cancellation(),
                timeout=timeout_seconds
            )
            
            # Final cancellation check
            if task_manager.is_cancelled(task_id):
                raise asyncio.CancelledError("Task was cancelled before completion")
            
            # Update task with results
            task["status"] = "completed"
            task["progress"] = 1.0
            task["results"] = results
            task["updated_at"] = datetime.now().isoformat()
            task["metadata"]["samples_completed"] = results.get("total_samples", 0)
            
            logger.info(f"Evaluation task {task_id} completed successfully: {results.get('summary', {})}")
            
        except asyncio.CancelledError:
            task["status"] = "cancelled"
            task["error"] = "Task was cancelled"
            task["updated_at"] = datetime.now().isoformat()
            logger.info(f"Evaluation task {task_id} was cancelled")
            
        except asyncio.TimeoutError:
            raise Exception(f"Evaluation timed out after {timeout_seconds} seconds")
        
    except Exception as e:
        logger.error(f"Evaluation task {task_id} failed: {str(e)}", exc_info=True)
        
        # Update task with error
        task["status"] = "failed"
        task["error"] = str(e)
        task["updated_at"] = datetime.now().isoformat()
        
        # Try to extract partial results if available
        try:
            if hasattr(e, 'partial_results'):
                partial_results = getattr(e, 'partial_results')
                task["results"] = partial_results
                if isinstance(partial_results, dict) and "detailed_results" in partial_results:
                    task["metadata"]["samples_completed"] = len(partial_results["detailed_results"])
        except:
            pass  # Ignore partial results extraction errors
        
    finally:
        # Clean up task from active tasks
        task_manager.remove_task(task_id)

async def _run_evaluation_with_retries(task_id: str, request: EvaluationRequest):
    """Run evaluation with sample-level retry logic"""
    
    # Determine evaluation method
    if request.evaluation_type == "model_graded":
        return await run_model_graded_evaluation(task_id, request)
    elif request.evaluation_type == "exact_match":
        return await run_exact_match_evaluation_enhanced(task_id, request)
    elif request.evaluation_type == "similarity":
        return await run_similarity_evaluation(task_id, request)
    else:
        raise ValueError(f"Unsupported evaluation type: {request.evaluation_type}")

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError))
)
async def _make_openai_request_with_retry(client, **kwargs):
    """Make OpenAI request with automatic retry for transient failures"""
    try:
        if "chat" in str(kwargs.get('method', '')):
            return await asyncio.to_thread(client.chat.completions.create, **kwargs.get('params', {}))
        elif "embedding" in str(kwargs.get('method', '')):
            return await asyncio.to_thread(client.embeddings.create, **kwargs.get('params', {}))
        else:
            # Default to chat completion
            return await asyncio.to_thread(client.chat.completions.create, **kwargs.get('params', {}))
    except Exception as e:
        logger.warning(f"OpenAI request failed, retrying: {e}")
        raise

async def run_model_graded_evaluation(task_id: str, request: EvaluationRequest) -> Dict[str, Any]:
    """Run model-graded evaluation using OpenAI's hosted Evals API"""
    
    # Prepare evaluation configuration
    eval_name = f"evalops_eval_{request.eval_spec_id}_{task_id[:8]}"
    
    # Create resilient OpenAI client
    client = await create_openai_client()
    
    # Create evaluation using OpenAI Evals API  
    eval_config = client.evals.create(
        name=eval_name,
        data_source_config={
            "type": "custom",
            "item_schema": {
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                    "expected_output": {"type": "string"}
                }
            },
            "include_sample_schema": True
        },
        testing_criteria=[{
            "type": "score_model",
            "name": "Quality Grader",
            "model": "gpt-4o",
            "input": [
                {"role": "system", "content": "You are an expert evaluator. Grade the response quality on a scale of 1-5, where 5 is excellent and 1 is poor. Consider accuracy, helpfulness, and clarity."},
                {"role": "user", "content": "Input: {{item.input}}\nExpected: {{item.expected_output}}\nActual: {{sample.output}}\n\nGrade this response:"}
            ],
            "range": [1, 5],
            "pass_threshold": 3.0
        }]
    )
    
    # Update progress
    evaluation_tasks[task_id]["progress"] = 0.3
    
    # Prepare data source from samples
    data_items = []
    for sample in request.dataset_samples:
        data_items.append({
            "item": {
                "input": sample.get("input", ""),
                "expected_output": sample.get("expected_output", "")
            }
        })
    
    # Run evaluation
    run = client.evals.runs.create(
        name=f"{eval_name}_run",
        eval_id=eval_config.id,
        data_source={
            "type": "completions",
            "source": {
                "type": "file_content",
                "content": data_items
            },
            "input_messages": {
                "type": "template",
                "template": [{
                    "type": "message",
                    "role": "user",
                    "content": {"type": "input_text", "text": "{{item.input}}"}
                }]
            },
            "model": request.model_configuration.get("model", "gpt-4"),
            "sampling_params": {
                "temperature": request.model_configuration.get("temperature", 0.7),
                "max_tokens": request.model_configuration.get("max_tokens", 1000)
            }
        }
    )
    
    # Update progress
    evaluation_tasks[task_id]["progress"] = 0.6
    
    # Poll for results
    while True:
        run_status = client.evals.runs.retrieve(run.id)
        evaluation_tasks[task_id]["progress"] = 0.6 + (0.4 * (run_status.progress or 0))
        
        if run_status.status in ["completed", "failed"]:
            break
        
        await asyncio.sleep(2)  # Poll every 2 seconds
    
    if run_status.status == "failed":
        raise Exception(f"OpenAI Evals run failed: {run_status.error}")
    
    # Process results
    results = {
        "eval_id": eval_config.id,
        "run_id": run.id,
        "status": run_status.status,
        "total_samples": len(request.dataset_samples),
        "scores": run_status.results.get("scores", []) if run_status.results else [],
        "summary": run_status.results.get("summary", {}) if run_status.results else {},
        "pass_rate": run_status.results.get("pass_rate", 0) if run_status.results else 0,
        "average_score": run_status.results.get("average_score", 0) if run_status.results else 0
    }
    
    return results

async def run_exact_match_evaluation_enhanced(task_id: str, request: EvaluationRequest) -> Dict[str, Any]:
    """Enhanced exact match evaluation with retry logic and error handling"""
    
    total_samples = len(request.dataset_samples)
    correct_matches = 0
    detailed_results = []
    failed_samples = []
    
    # Create resilient OpenAI client
    client = await create_openai_client()
    
    for i, sample in enumerate(request.dataset_samples):
        # Update progress
        evaluation_tasks[task_id]["progress"] = (i + 1) / total_samples
        evaluation_tasks[task_id]["metadata"]["samples_completed"] = i
        
        input_text = sample.get("input", "")
        expected_output = sample.get("expected_output", "")
        
        retry_count = 0
        max_retries = request.max_retries if request.retry_failed_samples else 1
        sample_success = False
        
        while retry_count < max_retries and not sample_success:
            try:
                # Get model response with timeout
                response = await asyncio.wait_for(
                    _make_openai_request_with_retry(
                        client,
                        method="chat",
                        params={
                            "model": request.model_configuration.get("model", "gpt-4"),
                            "messages": [{"role": "user", "content": input_text}],
                            "temperature": request.model_configuration.get("temperature", 0.7),
                            "max_tokens": request.model_configuration.get("max_tokens", 1000),
                            "timeout": 60.0
                        }
                    ),
                    timeout=90.0
                )
                
                actual_output = response.choices[0].message.content.strip() if response.choices[0].message.content else ""
                
                # Exact match comparison with normalization
                is_match = _normalize_text_for_comparison(actual_output) == _normalize_text_for_comparison(expected_output)
                if is_match:
                    correct_matches += 1
                
                detailed_results.append({
                    "sample_index": i,
                    "input": input_text,
                    "expected": expected_output,
                    "actual": actual_output,
                    "match": is_match,
                    "score": 1.0 if is_match else 0.0,
                    "retry_count": retry_count,
                    "processing_time": response.usage.total_tokens if hasattr(response, 'usage') else None
                })
                
                sample_success = True
                
            except Exception as e:
                retry_count += 1
                logger.warning(f"Sample {i} failed (attempt {retry_count}/{max_retries}): {e}")
                
                if retry_count >= max_retries:
                    failed_samples.append({
                        "sample_index": i,
                        "input": input_text,
                        "expected": expected_output,
                        "error": str(e),
                        "retry_count": retry_count
                    })
                    
                    # Add failed sample to results
                    detailed_results.append({
                        "sample_index": i,
                        "input": input_text,
                        "expected": expected_output,
                        "actual": None,
                        "match": False,
                        "score": 0.0,
                        "error": str(e),
                        "retry_count": retry_count
                    })
                else:
                    # Wait before retry with exponential backoff
                    wait_time = min(2 ** retry_count, 30)
                    await asyncio.sleep(wait_time)
    
    # Calculate statistics
    successful_samples = total_samples - len(failed_samples)
    accuracy = correct_matches / successful_samples if successful_samples > 0 else 0.0
    success_rate = successful_samples / total_samples if total_samples > 0 else 0.0
    
    # Update final metadata
    evaluation_tasks[task_id]["metadata"]["samples_failed"] = len(failed_samples)
    
    return {
        "evaluation_type": "exact_match",
        "total_samples": total_samples,
        "successful_samples": successful_samples,
        "failed_samples_count": len(failed_samples),
        "correct_matches": correct_matches,
        "accuracy": accuracy,
        "success_rate": success_rate,
        "pass_rate": accuracy * success_rate,  # Penalize for failures
        "detailed_results": detailed_results,
        "failed_samples": failed_samples,
        "summary": {
            "accuracy": f"{accuracy:.1%}",
            "success_rate": f"{success_rate:.1%}",
            "samples_processed": f"{successful_samples}/{total_samples}",
            "overall_score": accuracy * success_rate
        }
    }

def _normalize_text_for_comparison(text: str) -> str:
    """Normalize text for more lenient exact match comparison"""
    if not text:
        return ""
    
    return ' '.join(text.lower().strip().split())

async def run_similarity_evaluation(task_id: str, request: EvaluationRequest) -> Dict[str, Any]:
    """Run semantic similarity evaluation"""
    
    total_samples = len(request.dataset_samples)
    total_similarity = 0.0
    detailed_results = []
    
    for i, sample in enumerate(request.dataset_samples):
        # Update progress and check for cancellation
        progress = i / total_samples
        evaluation_tasks[task_id]["progress"] = progress
        task_manager.update_task_progress(task_id, progress)
        
        # Check if task was cancelled
        if task_manager.is_cancelled(task_id):
            raise asyncio.CancelledError("Task was cancelled during execution")
        
        input_text = sample.get("input", "")
        expected_output = sample.get("expected_output", "")
        
        # Create resilient OpenAI client
        client = await create_openai_client()
        
        # Get model response with circuit breaker protection
        async def get_chat_completion():
            return await asyncio.to_thread(
                client.chat.completions.create,
                model=request.model_configuration.get("model", "gpt-4"),
                messages=[{"role": "user", "content": input_text}],
                temperature=request.model_configuration.get("temperature", 0.7),
                max_tokens=request.model_configuration.get("max_tokens", 1000)
            )
        
        response = await circuit_breaker.call(get_chat_completion)
        actual_output = response.choices[0].message.content.strip() if response.choices[0].message.content else ""
        
        # Get embeddings for similarity comparison with circuit breaker protection
        async def get_expected_embedding():
            return await asyncio.to_thread(
                client.embeddings.create,
                model="text-embedding-3-small",
                input=expected_output
            )
        
        async def get_actual_embedding():
            return await asyncio.to_thread(
                client.embeddings.create,
                model="text-embedding-3-small",
                input=actual_output
            )
        
        expected_embedding = await circuit_breaker.call(get_expected_embedding)
        actual_embedding = await circuit_breaker.call(get_actual_embedding)
        
        # Calculate cosine similarity
        import numpy as np
        
        expected_vec = np.array(expected_embedding.data[0].embedding)
        actual_vec = np.array(actual_embedding.data[0].embedding)
        
        similarity = np.dot(expected_vec, actual_vec) / (
            np.linalg.norm(expected_vec) * np.linalg.norm(actual_vec)
        )
        
        total_similarity += similarity
        
        detailed_results.append({
            "input": input_text,
            "expected": expected_output,
            "actual": actual_output,
            "similarity": float(similarity),
            "score": float(similarity)
        })
    
    average_similarity = total_similarity / total_samples if total_samples > 0 else 0.0
    
    return {
        "evaluation_type": "similarity",
        "total_samples": total_samples,
        "average_similarity": average_similarity,
        "pass_rate": average_similarity,
        "detailed_results": detailed_results
    }

if __name__ == "__main__":
    # Run the FastAPI server
    port = int(os.getenv("PYTHON_WORKER_PORT", "5055"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
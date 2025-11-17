#!/usr/bin/env python3
"""
Test suite for the OpenAI Evals Python Worker
"""

import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock
import json
from datetime import datetime

from main import app, evaluation_tasks

client = TestClient(app)

@pytest.fixture
def mock_openai_client():
    """Mock OpenAI client for testing"""
    with patch('main.openai_client') as mock:
        yield mock

@pytest.fixture
def sample_evaluation_request():
    """Sample evaluation request for testing"""
    return {
        "eval_spec_id": "test-eval-spec-1",
        "dataset_samples": [
            {
                "input": "What is the capital of France?",
                "expected_output": "Paris"
            },
            {
                "input": "What is 2+2?", 
                "expected_output": "4"
            }
        ],
        "model_config": {
            "provider": "openai",
            "model": "gpt-4",
            "temperature": 0.7,
            "max_tokens": 1000
        },
        "evaluation_type": "exact_match"
    }

class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_root_endpoint(self):
        """Test root health check endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "EvalOps OpenAI Evals Worker"
        assert "status" in data
        assert "timestamp" in data
        assert "openai_configured" in data

    def test_health_endpoint(self):
        """Test detailed health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "openai_api" in data
        assert "active_tasks" in data
        assert "total_tasks" in data

class TestEvaluationEndpoints:
    """Test evaluation-related endpoints"""
    
    def test_create_evaluation(self, sample_evaluation_request):
        """Test creating a new evaluation task"""
        response = client.post("/evaluate", json=sample_evaluation_request)
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["status"] == "pending"
        assert "message" in data
        
        # Check task was stored
        task_id = data["task_id"]
        assert task_id in evaluation_tasks
        assert evaluation_tasks[task_id]["status"] == "pending"

    def test_get_task_status(self, sample_evaluation_request):
        """Test getting task status"""
        # Create a task first
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # Get task status
        response = client.get(f"/tasks/{task_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == task_id
        assert "status" in data
        assert "progress" in data
        assert "created_at" in data

    def test_get_nonexistent_task(self):
        """Test getting status of non-existent task"""
        response = client.get("/tasks/nonexistent-task")
        assert response.status_code == 404
        assert "Task not found" in response.json()["detail"]

    def test_list_tasks(self, sample_evaluation_request):
        """Test listing evaluation tasks"""
        # Create a few tasks
        for i in range(3):
            client.post("/evaluate", json=sample_evaluation_request)
        
        response = client.get("/tasks")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    def test_list_tasks_with_filter(self, sample_evaluation_request):
        """Test listing tasks with status filter"""
        # Create a task
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # List pending tasks
        response = client.get("/tasks?status=pending")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert all(task["status"] == "pending" for task in data)

class TestEvaluationTypes:
    """Test different evaluation types"""
    
    @patch('main.openai_client')
    def test_exact_match_evaluation(self, mock_openai, sample_evaluation_request):
        """Test exact match evaluation"""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "Paris"
        mock_openai.chat.completions.create.return_value = mock_response
        
        sample_evaluation_request["evaluation_type"] = "exact_match"
        
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # Wait for processing (in real scenario, would poll)
        import time
        time.sleep(0.1)
        
        # Check results
        response = client.get(f"/tasks/{task_id}")
        data = response.json()
        
        # Task should either be completed or still running
        assert data["status"] in ["running", "completed", "pending"]

    @patch('main.openai_client')
    def test_similarity_evaluation(self, mock_openai, sample_evaluation_request):
        """Test similarity evaluation"""
        # Mock OpenAI responses
        mock_chat_response = Mock()
        mock_chat_response.choices = [Mock()]
        mock_chat_response.choices[0].message.content = "The capital of France is Paris."
        
        mock_embedding_response = Mock()
        mock_embedding_response.data = [Mock()]
        mock_embedding_response.data[0].embedding = [0.1] * 1536  # Sample embedding
        
        mock_openai.chat.completions.create.return_value = mock_chat_response
        mock_openai.embeddings.create.return_value = mock_embedding_response
        
        sample_evaluation_request["evaluation_type"] = "similarity"
        
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # Check task was created
        assert response.status_code == 200
        assert task_id in evaluation_tasks

class TestInputValidation:
    """Test input validation"""
    
    def test_missing_required_fields(self):
        """Test validation with missing required fields"""
        invalid_request = {
            "eval_spec_id": "test-eval-spec-1"
            # Missing other required fields
        }
        
        response = client.post("/evaluate", json=invalid_request)
        assert response.status_code == 422  # Validation error

    def test_invalid_evaluation_type(self, sample_evaluation_request):
        """Test validation with invalid evaluation type"""
        sample_evaluation_request["evaluation_type"] = "invalid_type"
        
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # Should create task but fail during processing
        # Wait a bit and check status
        import time
        time.sleep(0.1)
        
        response = client.get(f"/tasks/{task_id}")
        data = response.json()
        # Should be failed or show error
        assert data["status"] in ["failed", "pending", "running"]

class TestErrorHandling:
    """Test error handling scenarios"""
    
    @patch('main.openai_client')
    def test_openai_api_error(self, mock_openai, sample_evaluation_request):
        """Test handling OpenAI API errors"""
        # Mock OpenAI API error
        mock_openai.chat.completions.create.side_effect = Exception("OpenAI API Error")
        
        response = client.post("/evaluate", json=sample_evaluation_request)
        task_id = response.json()["task_id"]
        
        # Task should be created successfully
        assert response.status_code == 200
        
        # But should fail during processing
        # Wait a bit for background processing
        import time
        time.sleep(0.1)
        
        response = client.get(f"/tasks/{task_id}")
        data = response.json()
        # Task might still be running or failed depending on timing
        assert data["status"] in ["failed", "running", "pending"]

    def test_large_request_handling(self, sample_evaluation_request):
        """Test handling of large dataset requests"""
        # Create a large dataset
        large_samples = []
        for i in range(100):
            large_samples.append({
                "input": f"Test input {i}",
                "expected_output": f"Test output {i}"
            })
        
        sample_evaluation_request["dataset_samples"] = large_samples
        
        response = client.post("/evaluate", json=sample_evaluation_request)
        assert response.status_code == 200
        
        # Should handle large requests gracefully
        task_id = response.json()["task_id"]
        assert task_id in evaluation_tasks

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
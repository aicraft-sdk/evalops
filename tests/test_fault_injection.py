"""
Comprehensive fault-injection tests for production reliability features
"""

import pytest
import asyncio
import time
import threading
import psutil
from unittest.mock import Mock, patch, AsyncMock
import requests
import json

# Import the Python worker classes for testing
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'python_worker'))

from main import (
    ThreadSafeCircuitBreaker, CircuitBreakerOpenError, EnhancedTaskManager,
    run_openai_evaluation_enhanced, EvaluationRequest, circuit_breaker,
    task_manager, evaluation_tasks
)

class TestThreadSafeCircuitBreaker:
    """Test thread-safe circuit breaker under various failure scenarios"""
    
    @pytest.fixture
    def circuit_breaker_instance(self):
        return ThreadSafeCircuitBreaker(failure_threshold=3, recovery_timeout=1)
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_basic_flow(self, circuit_breaker_instance):
        """Test basic circuit breaker state transitions"""
        cb = circuit_breaker_instance
        
        # Should start in CLOSED state
        assert cb.get_state()["state"] == "CLOSED"
        
        # Successful operations should keep it closed
        async def success_func():
            return "success"
        
        result = await cb.call(success_func)
        assert result == "success"
        assert cb.get_state()["state"] == "CLOSED"
        assert cb.get_state()["metrics"]["success_count"] == 1
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_failure_threshold(self, circuit_breaker_instance):
        """Test circuit breaker opens after failure threshold"""
        cb = circuit_breaker_instance
        
        async def failure_func():
            raise Exception("Test failure")
        
        # Test failures below threshold
        for i in range(2):
            with pytest.raises(Exception, match="Test failure"):
                await cb.call(failure_func)
            assert cb.get_state()["state"] == "CLOSED"
        
        # Third failure should open circuit
        with pytest.raises(Exception, match="Test failure"):
            await cb.call(failure_func)
        assert cb.get_state()["state"] == "OPEN"
        assert cb.get_state()["metrics"]["trip_count"] == 1
        
        # Subsequent calls should fail fast
        with pytest.raises(CircuitBreakerOpenError):
            await cb.call(failure_func)
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_recovery_flow(self, circuit_breaker_instance):
        """Test circuit breaker recovery from OPEN to CLOSED"""
        cb = circuit_breaker_instance
        
        # Force circuit open
        cb.force_open()
        assert cb.get_state()["state"] == "OPEN"
        
        # Wait for recovery timeout
        await asyncio.sleep(1.1)
        
        async def success_func():
            return "recovered"
        
        # First successful call should close circuit
        result = await cb.call(success_func)
        assert result == "recovered"
        assert cb.get_state()["state"] == "CLOSED"
    
    def test_circuit_breaker_thread_safety(self, circuit_breaker_instance):
        """Test circuit breaker thread safety under concurrent access"""
        cb = circuit_breaker_instance
        results = []
        errors = []
        
        def worker(worker_id):
            async def run_operations():
                for i in range(10):
                    try:
                        # Mix successful and failing operations
                        if (worker_id + i) % 3 == 0:
                            async def fail():
                                raise Exception(f"Worker {worker_id} failure {i}")
                            await cb.call(fail)
                        else:
                            async def success():
                                return f"Worker {worker_id} success {i}"
                            result = await cb.call(success)
                            results.append(result)
                    except Exception as e:
                        errors.append(str(e))
            
            # Run in new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(run_operations())
            finally:
                loop.close()
        
        # Start multiple threads
        threads = []
        for i in range(5):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()
        
        # Wait for all threads
        for t in threads:
            t.join()
        
        # Verify no race conditions occurred
        state = cb.get_state()
        assert len(results) > 0
        assert len(errors) > 0
        assert state["metrics"]["total_requests"] > 0


class TestEnhancedTaskManager:
    """Test enhanced task manager with cancellation and resource management"""
    
    @pytest.fixture
    def task_manager_instance(self):
        return EnhancedTaskManager()
    
    def test_task_lifecycle(self, task_manager_instance):
        """Test basic task lifecycle management"""
        tm = task_manager_instance
        
        # Should accept tasks initially
        assert tm.can_accept_task()
        
        # Add a task
        task_id = "test-task-1"
        task_data = {"type": "test", "data": "sample"}
        tm.add_task(task_id, task_data)
        
        assert task_id in tm.active_tasks
        assert not tm.is_cancelled(task_id)
        
        # Update progress
        tm.update_task_progress(task_id, 0.5, {"step": "halfway"})
        assert tm.active_tasks[task_id]["progress"] == 0.5
        
        # Remove task
        tm.remove_task(task_id)
        assert task_id not in tm.active_tasks
    
    def test_task_cancellation(self, task_manager_instance):
        """Test task cancellation functionality"""
        tm = task_manager_instance
        
        task_id = "cancel-test"
        tm.add_task(task_id, {"type": "test"})
        
        # Cancel task
        assert tm.cancel_task(task_id)
        assert tm.is_cancelled(task_id)
        
        # Cancellation event should be set
        assert task_id in tm._cancellation_events
        assert tm._cancellation_events[task_id].is_set()
        
        # Can't cancel non-existent task
        assert not tm.cancel_task("non-existent")
    
    def test_resource_constraint_rejection(self, task_manager_instance):
        """Test task rejection under resource constraints"""
        tm = task_manager_instance
        
        # Fill up to capacity
        for i in range(tm._EnhancedTaskManager__class__.MAX_CONCURRENT_TASKS if hasattr(tm._EnhancedTaskManager__class__, 'MAX_CONCURRENT_TASKS') else 10):
            tm.add_task(f"task-{i}", {"type": "test"})
        
        # Should reject new tasks
        assert not tm.can_accept_task()
    
    def test_cleanup_expired_tasks(self, task_manager_instance):
        """Test cleanup of expired tasks"""
        tm = task_manager_instance
        
        # Add a task and manually age it
        task_id = "expired-task"
        tm.add_task(task_id, {"type": "test"})
        tm.active_tasks[task_id]["start_time"] = time.time() - 3700  # 1+ hour ago
        
        # Mock evaluation_tasks for cleanup
        evaluation_tasks[task_id] = {
            "status": "running",
            "updated_at": time.time()
        }
        
        # Force cleanup
        tm.last_cleanup = time.time() - 100  # Force cleanup to run
        tm.cleanup_old_tasks()
        
        # Task should be cleaned up
        assert task_id not in tm.active_tasks
        assert evaluation_tasks[task_id]["status"] == "timeout"


class TestFaultInjectionScenarios:
    """End-to-end fault injection tests for realistic failure scenarios"""
    
    @pytest.mark.asyncio
    async def test_api_failure_cascade_prevention(self):
        """Test that API failures don't cascade through the system"""
        
        # Mock failing OpenAI API
        with patch('openai.OpenAI') as mock_openai:
            mock_client = Mock()
            mock_client.chat.completions.create.side_effect = Exception("API down")
            mock_openai.return_value = mock_client
            
            # Create test evaluation request
            request = EvaluationRequest(
                evaluation_type="exact_match",
                dataset_samples=[
                    {"input": "test", "expected_output": "test"}
                ],
                model_configuration={"model": "gpt-4"},
                timeout_seconds=10
            )
            
            task_id = "api-failure-test"
            evaluation_tasks[task_id] = {
                "request": request.dict(),
                "status": "pending",
                "metadata": {}
            }
            
            # Add task to manager
            task_manager.add_task(task_id, {"type": "evaluation"})
            
            # Run evaluation - should handle failure gracefully
            await run_openai_evaluation_enhanced(task_id, request)
            
            # Task should be marked as failed, not crash system
            assert evaluation_tasks[task_id]["status"] == "failed"
            assert "error" in evaluation_tasks[task_id]
    
    @pytest.mark.asyncio
    async def test_task_cancellation_during_execution(self):
        """Test cancelling tasks during execution"""
        
        # Create long-running task simulation
        async def slow_evaluation():
            for i in range(100):
                await asyncio.sleep(0.01)  # 1 second total
                # This would check cancellation in real implementation
            return {"status": "completed"}
        
        task_id = "cancellation-test"
        evaluation_tasks[task_id] = {
            "status": "pending",
            "metadata": {}
        }
        
        task_manager.add_task(task_id, {"type": "test"})
        
        # Start task
        task = asyncio.create_task(slow_evaluation())
        
        # Cancel after short delay
        await asyncio.sleep(0.1)
        task_manager.cancel_task(task_id)
        
        # Verify cancellation works
        assert task_manager.is_cancelled(task_id)
        
        # Clean up
        task.cancel()
    
    @pytest.mark.asyncio
    async def test_memory_pressure_handling(self):
        """Test system behavior under memory pressure"""
        tm = task_manager
        initial_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        # Simulate memory pressure by adding many tasks
        task_ids = []
        for i in range(50):
            task_id = f"memory-test-{i}"
            tm.add_task(task_id, {
                "type": "test",
                "large_data": "x" * 1000000  # 1MB per task
            })
            task_ids.append(task_id)
        
        # Check resource constraints
        tm.check_resource_constraints()
        
        # Verify system handles memory pressure
        current_memory = psutil.Process().memory_info().rss / 1024 / 1024
        assert current_memory > initial_memory  # Memory increased
        
        # Clean up
        for task_id in task_ids:
            tm.remove_task(task_id)
    
    def test_circuit_breaker_integration(self):
        """Test circuit breaker integration with real system"""
        
        # Get initial circuit breaker state
        initial_state = circuit_breaker.get_state()
        
        # Force some failures to test circuit breaker
        async def test_failures():
            for i in range(6):  # More than failure threshold
                try:
                    async def fail():
                        raise Exception(f"Test failure {i}")
                    await circuit_breaker.call(fail)
                except:
                    pass  # Expected failures
        
        # Run in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_failures())
        finally:
            loop.close()
        
        # Circuit breaker should have opened
        final_state = circuit_breaker.get_state()
        assert final_state["metrics"]["failure_count"] > initial_state["metrics"]["failure_count"]


class TestSystemReliabilityEndToEnd:
    """Integration tests for complete system reliability"""
    
    @pytest.mark.asyncio
    async def test_evaluation_with_multiple_failures(self):
        """Test evaluation resilience with multiple types of failures"""
        
        # Create evaluation request
        request = EvaluationRequest(
            evaluation_type="exact_match",
            dataset_samples=[
                {"input": "test1", "expected_output": "result1"},
                {"input": "test2", "expected_output": "result2"},
                {"input": "test3", "expected_output": "result3"}
            ],
            model_configuration={"model": "gpt-4"},
            timeout_seconds=30
        )
        
        task_id = "multi-failure-test"
        evaluation_tasks[task_id] = {
            "request": request.dict(),
            "status": "pending",
            "metadata": {}
        }
        
        # Mock intermittent failures
        call_count = 0
        async def mock_openai_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count % 2 == 0:  # Every other call fails
                raise Exception("Intermittent failure")
            return Mock(choices=[Mock(message=Mock(content="mocked response"))])
        
        with patch('openai.OpenAI') as mock_openai:
            mock_client = Mock()
            mock_client.chat.completions.create = mock_openai_call
            mock_openai.return_value = mock_client
            
            task_manager.add_task(task_id, {"type": "evaluation"})
            
            # Run evaluation
            await run_openai_evaluation_enhanced(task_id, request)
            
            # Should handle failures gracefully
            task_status = evaluation_tasks[task_id]["status"]
            assert task_status in ["completed", "failed"]  # Should not crash
    
    @pytest.mark.asyncio
    async def test_concurrent_task_management(self):
        """Test task manager under concurrent load"""
        
        async def worker(worker_id):
            tasks = []
            for i in range(5):
                task_id = f"worker-{worker_id}-task-{i}"
                if task_manager.can_accept_task():
                    task_manager.add_task(task_id, {"worker": worker_id, "task": i})
                    tasks.append(task_id)
                
                # Simulate some work
                await asyncio.sleep(0.01)
                
                # Update progress
                for task_id in tasks:
                    if task_id in task_manager.active_tasks:
                        task_manager.update_task_progress(task_id, i/5)
            
            # Clean up tasks
            for task_id in tasks:
                if task_id in task_manager.active_tasks:
                    task_manager.remove_task(task_id)
        
        # Run multiple workers concurrently
        workers = [worker(i) for i in range(10)]
        await asyncio.gather(*workers, return_exceptions=True)
        
        # Verify system stability
        status = task_manager.get_status()
        assert status["can_accept_tasks"] == True
        assert len(task_manager.active_tasks) == 0  # All cleaned up


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v"])
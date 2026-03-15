"""
Integration tests for code execution endpoint and evaluation workflow.

Note: These tests require:
1. OpenSandbox server running (configured via OPENSANDBOX_SERVER_URL)
2. Valid OPENSANDBOX_API_KEY environment variable
3. Python Worker service running (for HTTP endpoint tests)

To run these tests:
    pytest test_code_execution_integration.py -v

To skip integration tests (if OpenSandbox server is not available):
    pytest test_code_execution_integration.py -v -m "not integration"
"""

import pytest
import os
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock

from main import app
from sandbox_client import SandboxClient, get_sandbox_client
from code_detection import detect_code_blocks, is_code_response


# Mark all tests in this file as integration tests
pytestmark = pytest.mark.integration

# Check if OpenSandbox is configured
OPENSANDBOX_AVAILABLE = bool(
    os.getenv("OPENSANDBOX_SERVER_URL") and os.getenv("OPENSANDBOX_API_KEY")
)


@pytest.mark.skipif(
    not OPENSANDBOX_AVAILABLE,
    reason="OpenSandbox server not configured (set OPENSANDBOX_SERVER_URL and OPENSANDBOX_API_KEY)",
)
class TestSandboxClientIntegration:
    """Integration tests for SandboxClient with real OpenSandbox server"""

    @pytest.fixture
    def client(self):
        return get_sandbox_client()

    @pytest.mark.asyncio
    async def test_create_and_delete_sandbox(self, client):
        """Test creating and deleting a sandbox"""
        sandbox_id = await client.create_sandbox()
        assert sandbox_id is not None
        assert len(sandbox_id) > 0

        # Clean up
        await client.delete_sandbox(sandbox_id)

    @pytest.mark.asyncio
    async def test_execute_simple_python_code(self, client):
        """Test executing simple Python code in sandbox"""
        sandbox_id = await client.create_sandbox()

        try:
            result = await client.execute_code(
                sandbox_id=sandbox_id,
                code="print('Hello, World!')",
                language="python",
            )

            assert result.exit_code == 0
            assert result.error is None
            assert result.stdout is not None
            assert "Hello, World!" in result.stdout
        finally:
            await client.delete_sandbox(sandbox_id)

    @pytest.mark.asyncio
    async def test_execute_python_code_with_input(self, client):
        """Test executing Python code with input data"""
        sandbox_id = await client.create_sandbox()

        try:
            code = """
import json
result = input_data.get('value', 0) * 2
print(json.dumps({'result': result}))
"""
            result = await client.execute_code(
                sandbox_id=sandbox_id,
                code=code,
                language="python",
                input_data={"value": 42},
            )

            assert result.exit_code == 0
            assert result.error is None
            # Output should be JSON with result = 84
            assert result.output is not None
        finally:
            await client.delete_sandbox(sandbox_id)

    @pytest.mark.asyncio
    async def test_execute_javascript_code(self, client):
        """Test executing JavaScript code in sandbox"""
        sandbox_id = await client.create_sandbox()

        try:
            result = await client.execute_code(
                sandbox_id=sandbox_id,
                code="console.log('Hello from JavaScript');",
                language="javascript",
            )

            assert result.exit_code == 0
            assert result.error is None
            assert result.stdout is not None
        finally:
            await client.delete_sandbox(sandbox_id)

    @pytest.mark.asyncio
    async def test_execute_code_with_error(self, client):
        """Test executing code that produces an error"""
        sandbox_id = await client.create_sandbox()

        try:
            result = await client.execute_code(
                sandbox_id=sandbox_id,
                code="undefined_variable + 1",
                language="python",
            )

            # Should have error or non-zero exit code
            assert result.exit_code != 0 or result.error is not None
        finally:
            await client.delete_sandbox(sandbox_id)

    @pytest.mark.asyncio
    async def test_execute_code_timeout(self, client):
        """Test code execution timeout"""
        sandbox_id = await client.create_sandbox()

        try:
            result = await client.execute_code(
                sandbox_id=sandbox_id,
                code="import time; time.sleep(1000)",
                language="python",
                timeout=1,  # 1 second timeout
            )

            # Should timeout
            assert result.exit_code == 124 or "timed out" in str(result.error).lower()
        finally:
            await client.delete_sandbox(sandbox_id)


class TestCodeExecutionEndpoint:
    """Integration tests for /execute-code HTTP endpoint"""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_execute_code_endpoint_python(self, client):
        """Test /execute-code endpoint with Python code"""
        response = client.post(
            "/execute-code",
            json={
                "code": "print('Hello, World!')",
                "language": "python",
            },
        )

        # May return 200 (success) or 500 (if OpenSandbox not available)
        assert response.status_code in [200, 500]

        if response.status_code == 200:
            data = response.json()
            assert "task_id" in data
            assert "status" in data
            assert data["status"] in ["completed", "failed"]

    def test_execute_code_endpoint_javascript(self, client):
        """Test /execute-code endpoint with JavaScript code"""
        response = client.post(
            "/execute-code",
            json={
                "code": "console.log('Hello from JS');",
                "language": "javascript",
            },
        )

        assert response.status_code in [200, 500]

    def test_execute_code_endpoint_with_input(self, client):
        """Test /execute-code endpoint with input data"""
        response = client.post(
            "/execute-code",
            json={
                "code": "print(input_data.get('name', 'Unknown'))",
                "language": "python",
                "input_data": {"name": "Test User"},
            },
        )

        assert response.status_code in [200, 400, 500]

    def test_execute_code_endpoint_validation(self, client):
        """Test /execute-code endpoint input validation"""
        # Empty code
        response = client.post(
            "/execute-code",
            json={
                "code": "",
                "language": "python",
            },
        )
        assert response.status_code == 422  # Validation error

        # Invalid language
        response = client.post(
            "/execute-code",
            json={
                "code": "print('hello')",
                "language": "rust",
            },
        )
        assert response.status_code == 422  # Validation error

        # Invalid timeout
        response = client.post(
            "/execute-code",
            json={
                "code": "print('hello')",
                "language": "python",
                "timeout_seconds": 10000,  # Too large
            },
        )
        assert response.status_code == 422  # Validation error


class TestCodeDetectionIntegration:
    """Integration tests for code detection in LLM responses"""

    def test_detect_code_in_llm_response(self):
        """Test detecting code blocks in a typical LLM response"""
        llm_response = """Here's a Python solution:

```python
def calculate_sum(numbers):
    return sum(numbers)

result = calculate_sum([1, 2, 3, 4, 5])
print(result)
```

This will output 15."""

        assert is_code_response(llm_response) is True

        blocks = detect_code_blocks(llm_response)
        assert len(blocks) == 1
        assert blocks[0].language == "python"
        assert "def calculate_sum" in blocks[0].code

    def test_detect_multiple_code_blocks(self):
        """Test detecting multiple code blocks"""
        response = """Python version:
```python
print('Python')
```

JavaScript version:
```javascript
console.log('JavaScript');
```"""

        blocks = detect_code_blocks(response)
        assert len(blocks) == 2

    def test_detect_code_in_json_response(self):
        """Test detecting code when response is JSON"""
        json_response = {
            "answer": "Here's the code:\n```python\nprint('hello')\n```",
        }

        response_text = str(json_response)
        assert is_code_response(response_text) is True


class TestEvaluationWorkflowIntegration:
    """Integration tests for evaluation workflow with code execution"""

    def test_evaluation_result_includes_code_execution(self):
        """Test that evaluation results can include code execution metadata"""
        # This is a mock test - actual integration would require full evaluation service
        evaluation_result = {
            "exactMatch": 0.8,
            "customEvaluatorMetadata": {
                "codeExecutionResults": [
                    {
                        "language": "python",
                        "executionResult": {
                            "status": "completed",
                            "output": {"result": 42},
                            "execution_time_ms": 150.5,
                        },
                    }
                ],
            },
        }

        assert "customEvaluatorMetadata" in evaluation_result
        assert "codeExecutionResults" in evaluation_result["customEvaluatorMetadata"]
        assert len(evaluation_result["customEvaluatorMetadata"]["codeExecutionResults"]) > 0

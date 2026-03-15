"""
Unit tests for sandbox_client.py
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import os

from sandbox_client import (
    SandboxClient,
    SandboxConfig,
    ExecutionResult,
    get_sandbox_client,
)


class TestSandboxConfig:
    """Test SandboxConfig dataclass"""

    def test_default_config(self):
        config = SandboxConfig()
        assert config.cpu == "1.0"
        assert config.memory == "512Mi"
        assert config.timeout == 300
        assert config.network_policy == "deny_all"
        assert config.allowed_domains is None

    def test_custom_config(self):
        config = SandboxConfig(
            cpu="2.0",
            memory="1Gi",
            timeout=600,
            network_policy="allow_all",
            allowed_domains=["example.com"],
        )
        assert config.cpu == "2.0"
        assert config.memory == "1Gi"
        assert config.timeout == 600
        assert config.network_policy == "allow_all"
        assert config.allowed_domains == ["example.com"]


class TestSandboxClient:
    """Test SandboxClient class"""

    @pytest.fixture
    def mock_sandbox(self):
        sandbox = AsyncMock()
        sandbox.id = "test-sandbox-id"
        sandbox.files = AsyncMock()
        sandbox.commands = AsyncMock()
        sandbox.kill = AsyncMock()
        sandbox.close = AsyncMock()
        return sandbox

    @pytest.fixture
    def client(self):
        with patch.dict(
            os.environ,
            {
                "OPENSANDBOX_SERVER_URL": "http://localhost:8080",
                "OPENSANDBOX_API_KEY": "test-api-key",
            },
        ):
            return SandboxClient()

    def test_init_with_env_vars(self):
        with patch.dict(
            os.environ,
            {
                "OPENSANDBOX_SERVER_URL": "http://test:8080",
                "OPENSANDBOX_API_KEY": "test-key",
                "OPENSANDBOX_DEFAULT_CPU": "2.0",
                "OPENSANDBOX_DEFAULT_MEMORY": "1Gi",
                "OPENSANDBOX_DEFAULT_TIMEOUT": "600",
            },
        ):
            client = SandboxClient()
            assert client.api_url == "http://test:8080"
            assert client.api_key == "test-key"
            assert client.default_config.cpu == "2.0"
            assert client.default_config.memory == "1Gi"
            assert client.default_config.timeout == 600

    def test_init_with_custom_config(self):
        custom_config = SandboxConfig(cpu="3.0", memory="2Gi")
        client = SandboxClient(default_config=custom_config)
        assert client.default_config.cpu == "3.0"
        assert client.default_config.memory == "2Gi"

    @pytest.mark.asyncio
    async def test_create_sandbox_success(self, client, mock_sandbox):
        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)
            mock_sandbox.id = "test-sandbox-123"

            sandbox_id = await client.create_sandbox()

            assert sandbox_id == "test-sandbox-123"
            mock_sandbox_class.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_sandbox_with_config(self, client, mock_sandbox):
        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)
            mock_sandbox.id = "test-sandbox-456"

            config = {"cpu": "2.0", "memory": "1Gi"}
            sandbox_id = await client.create_sandbox(config=config)

            assert sandbox_id == "test-sandbox-456"

    @pytest.mark.asyncio
    async def test_create_sandbox_failure(self, client):
        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(
                side_effect=Exception("Connection failed")
            )

            with pytest.raises(Exception) as exc_info:
                await client.create_sandbox()

            assert "Sandbox creation failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_code_python_success(self, client, mock_sandbox):
        mock_result = Mock()
        mock_result.stdout = '{"result": "success"}'
        mock_result.stderr = ""
        mock_result.exit_code = 0

        mock_sandbox.files.write = AsyncMock()
        mock_sandbox.commands.run = AsyncMock(return_value=mock_result)

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            result = await client.execute_code(
                sandbox_id="test-id",
                code="print('hello')",
                language="python",
            )

            assert result.exit_code == 0
            assert result.error is None
            assert result.output == {"result": "success"}
            mock_sandbox.files.write.assert_called_once()
            mock_sandbox.commands.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_code_javascript_success(self, client, mock_sandbox):
        mock_result = Mock()
        mock_result.stdout = "hello world"
        mock_result.stderr = ""
        mock_result.exit_code = 0

        mock_sandbox.files.write = AsyncMock()
        mock_sandbox.commands.run = AsyncMock(return_value=mock_result)

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            result = await client.execute_code(
                sandbox_id="test-id",
                code="console.log('hello world')",
                language="javascript",
            )

            assert result.exit_code == 0
            assert result.error is None
            assert result.stdout == "hello world"

    @pytest.mark.asyncio
    async def test_execute_code_with_input_data(self, client, mock_sandbox):
        mock_result = Mock()
        mock_result.stdout = "processed"
        mock_result.stderr = ""
        mock_result.exit_code = 0

        mock_sandbox.files.write = AsyncMock()
        mock_sandbox.commands.run = AsyncMock(return_value=mock_result)

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            result = await client.execute_code(
                sandbox_id="test-id",
                code="print(input_data['key'])",
                language="python",
                input_data={"key": "value"},
            )

            assert result.exit_code == 0
            # Verify input_data was injected into code
            write_call = mock_sandbox.files.write.call_args
            assert "input_data" in write_call[0][1]

    @pytest.mark.asyncio
    async def test_execute_code_validation_failure(self, client):
        invalid_code = "def incomplete_function("  # Invalid syntax

        result = await client.execute_code(
            sandbox_id="test-id",
            code=invalid_code,
            language="python",
        )

        assert result.exit_code == 1
        assert result.error is not None
        assert "validation failed" in result.error.lower()

    @pytest.mark.asyncio
    async def test_execute_code_timeout(self, client, mock_sandbox):
        mock_sandbox.files.write = AsyncMock()
        mock_sandbox.commands.run = AsyncMock(
            side_effect=asyncio.TimeoutError()
        )

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            result = await client.execute_code(
                sandbox_id="test-id",
                code="import time; time.sleep(1000)",
                language="python",
                timeout=1,
            )

            assert result.exit_code == 124
            assert "timed out" in result.error.lower()

    @pytest.mark.asyncio
    async def test_execute_code_execution_error(self, client, mock_sandbox):
        mock_result = Mock()
        mock_result.stdout = ""
        mock_result.stderr = "SyntaxError: invalid syntax"
        mock_result.exit_code = 1

        mock_sandbox.files.write = AsyncMock()
        mock_sandbox.commands.run = AsyncMock(return_value=mock_result)

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            result = await client.execute_code(
                sandbox_id="test-id",
                code="print('hello'",  # Missing closing paren
                language="python",
            )

            assert result.exit_code == 1
            assert result.error is not None

    @pytest.mark.asyncio
    async def test_delete_sandbox_success(self, client, mock_sandbox):
        mock_sandbox.kill = AsyncMock()
        mock_sandbox.close = AsyncMock()

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            await client.delete_sandbox("test-sandbox-id")

            mock_sandbox.kill.assert_called_once()
            mock_sandbox.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_sandbox_failure_continues(self, client, mock_sandbox):
        mock_sandbox.kill = AsyncMock(side_effect=Exception("Delete failed"))

        with patch("sandbox_client.Sandbox") as mock_sandbox_class:
            mock_sandbox_class.create = AsyncMock(return_value=mock_sandbox)

            # Should not raise exception
            await client.delete_sandbox("test-sandbox-id")

    def test_validate_code_python_valid(self, client):
        valid_code = "def hello():\n    print('world')"
        is_valid, errors = client.validate_code(valid_code, "python")
        assert is_valid is True
        assert len(errors) == 0

    def test_validate_code_python_invalid(self, client):
        invalid_code = "def incomplete("
        is_valid, errors = client.validate_code(invalid_code, "python")
        assert is_valid is False
        assert len(errors) > 0

    def test_validate_code_javascript_valid(self, client):
        valid_code = "function hello() { console.log('world'); }"
        is_valid, errors = client.validate_code(valid_code, "javascript")
        assert is_valid is True
        assert len(errors) == 0

    def test_validate_code_javascript_invalid_braces(self, client):
        invalid_code = "function hello() { console.log('world');"
        is_valid, errors = client.validate_code(invalid_code, "javascript")
        assert is_valid is False
        assert any("braces" in error.lower() for error in errors)

    def test_validate_code_empty(self, client):
        is_valid, errors = client.validate_code("", "python")
        assert is_valid is False
        assert any("empty" in error.lower() for error in errors)

    def test_validate_code_unsupported_language(self, client):
        is_valid, errors = client.validate_code("some code", "rust")
        assert is_valid is False
        assert any("unsupported" in error.lower() for error in errors)

    def test_merge_config(self, client):
        custom_config = {"cpu": "2.0", "timeout": 600}
        merged = client._merge_config(custom_config)

        assert merged.cpu == "2.0"
        assert merged.timeout == 600
        assert merged.memory == client.default_config.memory  # Uses default

    def test_parse_output_json(self, client):
        json_output = '{"key": "value", "number": 42}'
        parsed = client._parse_output(json_output)
        assert isinstance(parsed, dict)
        assert parsed["key"] == "value"
        assert parsed["number"] == 42

    def test_parse_output_string(self, client):
        string_output = "hello world"
        parsed = client._parse_output(string_output)
        assert parsed == "hello world"

    def test_parse_output_empty(self, client):
        parsed = client._parse_output("")
        assert parsed is None


class TestGetSandboxClient:
    """Test get_sandbox_client function"""

    def test_get_sandbox_client_singleton(self):
        client1 = get_sandbox_client()
        client2 = get_sandbox_client()
        assert client1 is client2

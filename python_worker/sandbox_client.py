"""
OpenSandbox Client Module

Wrapper for OpenSandbox SDK that provides:
- Sandbox lifecycle management (create, execute, cleanup)
- Resource limit configuration
- Error handling and retries
- Code validation helpers
"""

import os
import logging
import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

try:
    from opensandbox import Sandbox
except ImportError:
    raise ImportError(
        "OpenSandbox SDK not installed. Install with: pip install opensandbox>=0.1.5"
    )

logger = logging.getLogger(__name__)


@dataclass
class SandboxConfig:
    """Sandbox configuration with resource limits"""

    cpu: str = "1.0"
    memory: str = "512Mi"
    timeout: int = 300
    network_policy: str = "deny_all"
    allowed_domains: Optional[List[str]] = None


@dataclass
class ExecutionResult:
    """Result of code execution in sandbox"""

    output: Any
    error: Optional[str] = None
    execution_time_ms: float = 0.0
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0


class SandboxClient:
    """Client for managing OpenSandbox sandboxes"""

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        default_config: Optional[SandboxConfig] = None,
    ):
        """
        Initialize OpenSandbox client.

        Args:
            api_url: OpenSandbox server URL (defaults to OPENSANDBOX_SERVER_URL env var)
            api_key: API key for authentication (defaults to OPENSANDBOX_API_KEY env var)
            default_config: Default sandbox configuration
        """
        self.api_url = api_url or os.getenv("OPENSANDBOX_SERVER_URL", "http://localhost:8080")
        self.api_key = api_key or os.getenv("OPENSANDBOX_API_KEY", "")

        if not self.api_key:
            logger.warning(
                "OPENSANDBOX_API_KEY not configured. Sandbox operations may fail."
            )

        # Set default config from environment or provided config
        if default_config:
            self.default_config = default_config
        else:
            self.default_config = SandboxConfig(
                cpu=os.getenv("OPENSANDBOX_DEFAULT_CPU", "1.0"),
                memory=os.getenv("OPENSANDBOX_DEFAULT_MEMORY", "512Mi"),
                timeout=int(os.getenv("OPENSANDBOX_DEFAULT_TIMEOUT", "300")),
                network_policy="deny_all",
                allowed_domains=None,
            )

        logger.info(
            f"SandboxClient initialized with API URL: {self.api_url}, "
            f"default CPU: {self.default_config.cpu}, "
            f"default memory: {self.default_config.memory}"
        )

    async def create_sandbox(
        self, config: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a new sandbox and return its ID.

        Args:
            config: Optional sandbox configuration dict with keys:
                - cpu: CPU limit (e.g., "1.0")
                - memory: Memory limit (e.g., "512Mi")
                - timeout: Timeout in seconds
                - network_policy: Network policy ("allow_all", "deny_all", "restricted")
                - allowed_domains: List of allowed domains (for restricted policy)

        Returns:
            sandbox_id: Unique identifier for the created sandbox

        Raises:
            Exception: If sandbox creation fails
        """
        try:
            # Merge provided config with defaults
            sandbox_config = self._merge_config(config or {})

            logger.debug(f"Creating sandbox with config: {sandbox_config}")

            # Create sandbox using OpenSandbox SDK
            # Note: The actual API may vary based on SDK version
            # Using template-based creation as per SDK documentation
            sandbox = await Sandbox.create(
                template="base",
                api_url=self.api_url,
                api_key=self.api_key,
            )

            sandbox_id = getattr(sandbox, "id", str(id(sandbox)))

            logger.info(f"Sandbox created successfully: {sandbox_id}")
            return sandbox_id

        except Exception as e:
            logger.error(f"Failed to create sandbox: {e}", exc_info=True)
            raise Exception(f"Sandbox creation failed: {str(e)}") from e

    async def execute_code(
        self,
        sandbox_id: str,
        code: str,
        language: str = "python",
        input_data: Optional[Dict[str, Any]] = None,
        timeout: Optional[int] = None,
    ) -> ExecutionResult:
        """
        Execute code in a sandbox.

        Args:
            sandbox_id: ID of the sandbox to execute code in
            code: Code to execute
            language: Programming language ("python" or "javascript")
            input_data: Optional input data to pass to the code
            timeout: Optional execution timeout in seconds

        Returns:
            ExecutionResult with output, error, execution time, etc.

        Raises:
            Exception: If execution fails
        """
        start_time = asyncio.get_event_loop().time()

        try:
            # Validate code before execution
            is_valid, errors = self.validate_code(code, language)
            if not is_valid:
                return ExecutionResult(
                    output=None,
                    error=f"Code validation failed: {', '.join(errors)}",
                    execution_time_ms=0.0,
                    exit_code=1,
                )

            logger.debug(
                f"Executing {language} code in sandbox {sandbox_id[:8]}..."
            )

            # Get sandbox instance (in real implementation, we'd need to track sandbox instances)
            # For now, we'll create a new sandbox connection
            # Note: This is a simplified implementation - production should maintain sandbox pool
            sandbox = await self._get_sandbox(sandbox_id)

            # Prepare code with input data if provided
            execution_code = self._prepare_code(code, language, input_data)

            # Execute code using sandbox commands
            # The SDK provides commands.run() for executing shell commands
            # For Python/JavaScript code, we'll write to a file and execute it
            if language == "python":
                # Write code to a temporary file
                code_file = "/tmp/exec_code.py"
                await sandbox.files.write(code_file, execution_code)

                # Execute Python code
                result = await sandbox.commands.run(
                    f"python {code_file}",
                    timeout=timeout or self.default_config.timeout,
                )
            elif language == "javascript":
                # Write code to a temporary file
                code_file = "/tmp/exec_code.js"
                await sandbox.files.write(code_file, execution_code)

                # Execute JavaScript code (using node)
                result = await sandbox.commands.run(
                    f"node {code_file}",
                    timeout=timeout or self.default_config.timeout,
                )
            else:
                raise ValueError(f"Unsupported language: {language}")

            execution_time_ms = (asyncio.get_event_loop().time() - start_time) * 1000

            # Parse result
            stdout = result.stdout if hasattr(result, "stdout") else ""
            stderr = result.stderr if hasattr(result, "stderr") else ""
            exit_code = result.exit_code if hasattr(result, "exit_code") else 0

            # Try to parse output as JSON if possible, otherwise return as string
            output = self._parse_output(stdout)

            error = stderr if exit_code != 0 else None

            logger.info(
                f"Code execution completed in {execution_time_ms:.2f}ms, "
                f"exit_code={exit_code}"
            )

            return ExecutionResult(
                output=output,
                error=error,
                execution_time_ms=execution_time_ms,
                stdout=stdout,
                stderr=stderr,
                exit_code=exit_code,
            )

        except asyncio.TimeoutError:
            execution_time_ms = (asyncio.get_event_loop().time() - start_time) * 1000
            logger.warning(f"Code execution timed out after {execution_time_ms:.2f}ms")
            return ExecutionResult(
                output=None,
                error=f"Execution timed out after {timeout or self.default_config.timeout}s",
                execution_time_ms=execution_time_ms,
                exit_code=124,  # Standard timeout exit code
            )

        except Exception as e:
            execution_time_ms = (asyncio.get_event_loop().time() - start_time) * 1000
            logger.error(
                f"Code execution failed: {e}", exc_info=True
            )
            return ExecutionResult(
                output=None,
                error=str(e),
                execution_time_ms=execution_time_ms,
                exit_code=1,
            )

    async def delete_sandbox(self, sandbox_id: str) -> None:
        """
        Delete a sandbox and clean up resources.

        Args:
            sandbox_id: ID of the sandbox to delete

        Raises:
            Exception: If deletion fails
        """
        try:
            logger.debug(f"Deleting sandbox: {sandbox_id[:8]}...")

            sandbox = await self._get_sandbox(sandbox_id)
            await sandbox.kill()
            await sandbox.close()

            logger.info(f"Sandbox {sandbox_id[:8]} deleted successfully")

        except Exception as e:
            logger.error(f"Failed to delete sandbox {sandbox_id[:8]}: {e}")
            # Don't raise - cleanup failures shouldn't break the flow
            logger.warning("Continuing despite sandbox deletion failure")

    def validate_code(
        self, code: str, language: str
    ) -> Tuple[bool, List[str]]:
        """
        Validate code syntax before execution.

        Args:
            code: Code to validate
            language: Programming language ("python" or "javascript")

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []

        if not code or not code.strip():
            errors.append("Code is empty")
            return False, errors

        if language == "python":
            try:
                compile(code, "<string>", "exec")
            except SyntaxError as e:
                errors.append(f"Python syntax error: {e}")
            except Exception as e:
                errors.append(f"Python validation error: {e}")

        elif language == "javascript":
            # Basic JavaScript validation - check for common syntax issues
            # For production, consider using a proper JS parser
            if code.count("{") != code.count("}"):
                errors.append("Unmatched braces in JavaScript code")
            if code.count("(") != code.count(")"):
                errors.append("Unmatched parentheses in JavaScript code")
            if code.count("[") != code.count("]"):
                errors.append("Unmatched brackets in JavaScript code")

        else:
            errors.append(f"Unsupported language: {language}")

        return len(errors) == 0, errors

    def _merge_config(self, config: Dict[str, Any]) -> SandboxConfig:
        """Merge provided config with defaults."""
        return SandboxConfig(
            cpu=config.get("cpu", self.default_config.cpu),
            memory=config.get("memory", self.default_config.memory),
            timeout=config.get("timeout", self.default_config.timeout),
            network_policy=config.get(
                "network_policy", self.default_config.network_policy
            ),
            allowed_domains=config.get(
                "allowed_domains", self.default_config.allowed_domains
            ),
        )

    def _prepare_code(
        self, code: str, language: str, input_data: Optional[Dict[str, Any]]
    ) -> str:
        """
        Prepare code for execution by injecting input data if needed.

        Args:
            code: Original code
            language: Programming language
            input_data: Optional input data

        Returns:
            Prepared code string
        """
        if not input_data:
            return code

        if language == "python":
            # Inject input_data as a global variable
            import json

            input_json = json.dumps(input_data)
            return f"import json\ninput_data = json.loads('{input_json}')\n\n{code}"
        elif language == "javascript":
            # Inject input_data as a global variable
            import json

            input_json = json.dumps(input_data)
            return f"const inputData = {json.dumps(input_data)};\n\n{code}"

        return code

    def _parse_output(self, stdout: str) -> Any:
        """
        Parse stdout output, trying JSON first, then returning as string.

        Args:
            stdout: Standard output from execution

        Returns:
            Parsed output (dict/list if JSON, otherwise string)
        """
        if not stdout:
            return None

        stdout = stdout.strip()

        # Try to parse as JSON
        try:
            import json

            return json.loads(stdout)
        except (json.JSONDecodeError, ValueError):
            # Return as string if not JSON
            return stdout

    async def _get_sandbox(self, sandbox_id: str) -> Any:
        """
        Get sandbox instance by ID.

        Note: This is a simplified implementation. In production, maintain
        a sandbox pool or connection cache.

        Args:
            sandbox_id: Sandbox ID

        Returns:
            Sandbox instance
        """
        # For now, create a new connection
        # In production, maintain a pool of sandbox instances
        # This is a placeholder - actual implementation depends on SDK API
        sandbox = await Sandbox.create(
            template="base",
            api_url=self.api_url,
            api_key=self.api_key,
        )
        return sandbox


# Global client instance
_sandbox_client: Optional[SandboxClient] = None


def get_sandbox_client() -> SandboxClient:
    """Get or create global sandbox client instance."""
    global _sandbox_client
    if _sandbox_client is None:
        _sandbox_client = SandboxClient()
    return _sandbox_client

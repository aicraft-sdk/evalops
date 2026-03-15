"""
Code Detection Utility

Utilities to detect code blocks in LLM responses and extract executable code.
"""

import re
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class CodeBlock:
    """Represents a detected code block"""

    language: str
    code: str
    start_index: int
    end_index: int


def detect_code_blocks(text: str) -> List[CodeBlock]:
    """
    Detect code blocks in text (markdown code fences and inline code).

    Args:
        text: Text to search for code blocks

    Returns:
        List of CodeBlock objects
    """
    code_blocks = []

    # Pattern for markdown code fences: ```language\ncode\n```
    markdown_pattern = re.compile(
        r"```(\w+)?\n(.*?)```", re.DOTALL | re.MULTILINE
    )

    for match in markdown_pattern.finditer(text):
        language = match.group(1) or "unknown"
        code = match.group(2).strip()
        start_index = match.start()
        end_index = match.end()

        code_blocks.append(
            CodeBlock(
                language=language.lower(),
                code=code,
                start_index=start_index,
                end_index=end_index,
            )
        )

    # Also check for inline code blocks (single backticks)
    # These are less common for executable code but we'll detect them
    inline_pattern = re.compile(r"`([^`]+)`")
    for match in inline_pattern.finditer(text):
        code = match.group(1).strip()
        # Only consider inline code if it looks like executable code
        # (contains keywords, operators, etc.)
        if _looks_like_executable_code(code):
            code_blocks.append(
                CodeBlock(
                    language="unknown",
                    code=code,
                    start_index=match.start(),
                    end_index=match.end(),
                )
            )

    return code_blocks


def extract_code_from_markdown(text: str) -> List[str]:
    """
    Extract code strings from markdown code fences.

    Args:
        text: Text containing markdown code blocks

    Returns:
        List of code strings
    """
    code_blocks = detect_code_blocks(text)
    return [block.code for block in code_blocks]


def is_code_response(response: str) -> bool:
    """
    Check if a response contains executable code.

    Args:
        response: LLM response text

    Returns:
        True if response contains code blocks
    """
    code_blocks = detect_code_blocks(response)
    return len(code_blocks) > 0


def detect_python_code(text: str) -> List[str]:
    """
    Detect and extract Python code blocks from text.

    Args:
        text: Text to search for Python code

    Returns:
        List of Python code strings
    """
    code_blocks = detect_code_blocks(text)
    python_blocks = [
        block.code
        for block in code_blocks
        if block.language in ["python", "py", "unknown"]
        and _looks_like_python_code(block.code)
    ]
    return python_blocks


def detect_javascript_code(text: str) -> List[str]:
    """
    Detect and extract JavaScript code blocks from text.

    Args:
        text: Text to search for JavaScript code

    Returns:
        List of JavaScript code strings
    """
    code_blocks = detect_code_blocks(text)
    js_blocks = [
        block.code
        for block in code_blocks
        if block.language
        in ["javascript", "js", "typescript", "ts", "node", "unknown"]
        and _looks_like_javascript_code(block.code)
    ]
    return js_blocks


def _looks_like_executable_code(code: str) -> bool:
    """
    Heuristic to determine if a string looks like executable code.

    Args:
        code: Code string to check

    Returns:
        True if it looks like executable code
    """
    if not code or len(code) < 3:
        return False

    # Check for common code patterns
    code_indicators = [
        "=",  # Assignment
        "(",  # Function calls
        "[",  # Arrays/lists
        "{",  # Objects/dicts
        "def ",  # Python function
        "function",  # JavaScript function
        "import ",  # Imports
        "return ",  # Returns
        "if ",  # Conditionals
        "for ",  # Loops
        "class ",  # Classes
    ]

    code_lower = code.lower()
    return any(indicator in code_lower for indicator in code_indicators)


def _looks_like_python_code(code: str) -> bool:
    """
    Heuristic to determine if code looks like Python.

    Args:
        code: Code string to check

    Returns:
        True if it looks like Python code
    """
    python_indicators = [
        "def ",
        "import ",
        "from ",
        "print(",
        "if __name__",
        "class ",
        "lambda ",
        "try:",
        "except ",
        "with ",
        "async def",
        "await ",
    ]

    code_lower = code.lower()
    has_python_keywords = any(
        keyword in code_lower for keyword in python_indicators
    )

    # Check for Python-specific syntax
    has_python_syntax = (
        ":" in code and ("def " in code_lower or "if " in code_lower or "for " in code_lower)
    ) or "import " in code_lower

    return has_python_keywords or has_python_syntax


def _looks_like_javascript_code(code: str) -> bool:
    """
    Heuristic to determine if code looks like JavaScript.

    Args:
        code: Code string to check

    Returns:
        True if it looks like JavaScript code
    """
    js_indicators = [
        "function ",
        "const ",
        "let ",
        "var ",
        "=>",
        "console.log",
        "require(",
        "import ",
        "export ",
        "async function",
        "await ",
        "Promise",
        "() =>",
    ]

    code_lower = code.lower()
    has_js_keywords = any(keyword in code_lower for keyword in js_indicators)

    # Check for JavaScript-specific syntax
    has_js_syntax = (
        "{" in code
        and ("function" in code_lower or "=>" in code or "const " in code_lower)
    ) or "console." in code_lower

    return has_js_keywords or has_js_syntax


def get_executable_code_blocks(
    text: str, supported_languages: Optional[List[str]] = None
) -> List[CodeBlock]:
    """
    Get executable code blocks from text, filtered by supported languages.

    Args:
        text: Text to search for code
        supported_languages: List of supported languages (e.g., ["python", "javascript"]).
                             If None, returns all detected code blocks.

    Returns:
        List of CodeBlock objects for executable code
    """
    code_blocks = detect_code_blocks(text)

    if not supported_languages:
        return code_blocks

    # Filter by supported languages
    supported_languages_lower = [lang.lower() for lang in supported_languages]
    filtered_blocks = []

    for block in code_blocks:
        # Check if language matches
        if block.language in supported_languages_lower:
            filtered_blocks.append(block)
        elif block.language == "unknown":
            # For unknown language, use heuristics
            if "python" in supported_languages_lower and _looks_like_python_code(
                block.code
            ):
                block.language = "python"
                filtered_blocks.append(block)
            elif (
                "javascript" in supported_languages_lower
                and _looks_like_javascript_code(block.code)
            ):
                block.language = "javascript"
                filtered_blocks.append(block)

    return filtered_blocks

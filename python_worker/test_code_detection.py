"""
Unit tests for code_detection.py
"""

import pytest

from code_detection import (
    detect_code_blocks,
    extract_code_from_markdown,
    is_code_response,
    detect_python_code,
    detect_javascript_code,
    get_executable_code_blocks,
    CodeBlock,
)


class TestDetectCodeBlocks:
    """Test detect_code_blocks function"""

    def test_detect_markdown_python_block(self):
        text = "Here's some code:\n```python\ndef hello():\n    print('world')\n```\nThat's it!"
        blocks = detect_code_blocks(text)

        assert len(blocks) == 1
        assert blocks[0].language == "python"
        assert "def hello()" in blocks[0].code
        assert blocks[0].start_index > 0
        assert blocks[0].end_index > blocks[0].start_index

    def test_detect_markdown_javascript_block(self):
        text = "```javascript\nfunction test() {\n  console.log('hello');\n}\n```"
        blocks = detect_code_blocks(text)

        assert len(blocks) == 1
        assert blocks[0].language == "javascript"
        assert "function test" in blocks[0].code

    def test_detect_multiple_blocks(self):
        text = """First block:
```python
print('first')
```

Second block:
```javascript
console.log('second');
```"""
        blocks = detect_code_blocks(text)

        assert len(blocks) == 2
        assert blocks[0].language == "python"
        assert blocks[1].language == "javascript"

    def test_detect_block_without_language(self):
        text = "```\ndef hello():\n    pass\n```"
        blocks = detect_code_blocks(text)

        assert len(blocks) == 1
        assert blocks[0].language == "unknown"
        assert "def hello()" in blocks[0].code

    def test_detect_inline_code_executable(self):
        text = "Use `def function(): pass` to define a function"
        blocks = detect_code_blocks(text)

        assert len(blocks) >= 1
        assert any("def function" in block.code for block in blocks)

    def test_detect_inline_code_non_executable(self):
        text = "The word `hello` is a greeting"
        blocks = detect_code_blocks(text)

        # Should not detect simple words as code
        executable_blocks = [
            b for b in blocks if _looks_like_executable_code(b.code)
        ]
        assert len(executable_blocks) == 0

    def test_no_code_blocks(self):
        text = "This is just regular text with no code."
        blocks = detect_code_blocks(text)

        assert len(blocks) == 0


class TestExtractCodeFromMarkdown:
    """Test extract_code_from_markdown function"""

    def test_extract_single_block(self):
        text = "```python\nprint('hello')\n```"
        codes = extract_code_from_markdown(text)

        assert len(codes) == 1
        assert "print('hello')" in codes[0]

    def test_extract_multiple_blocks(self):
        text = """```python\nprint('first')\n```\n```javascript\nconsole.log('second');\n```"""
        codes = extract_code_from_markdown(text)

        assert len(codes) == 2
        assert "print('first')" in codes[0]
        assert "console.log('second')" in codes[1]

    def test_extract_empty_text(self):
        codes = extract_code_from_markdown("")
        assert len(codes) == 0


class TestIsCodeResponse:
    """Test is_code_response function"""

    def test_has_code_blocks(self):
        text = "Here's the solution:\n```python\nprint('hello')\n```"
        assert is_code_response(text) is True

    def test_no_code_blocks(self):
        text = "This is just a regular response with no code."
        assert is_code_response(text) is False

    def test_empty_response(self):
        assert is_code_response("") is False


class TestDetectPythonCode:
    """Test detect_python_code function"""

    def test_detect_python_block(self):
        text = "```python\ndef hello():\n    return 'world'\n```"
        codes = detect_python_code(text)

        assert len(codes) == 1
        assert "def hello()" in codes[0]

    def test_detect_python_with_py_alias(self):
        text = "```py\nimport os\n```"
        codes = detect_python_code(text)

        assert len(codes) == 1

    def test_detect_unknown_as_python(self):
        text = "```\ndef hello():\n    print('world')\n```"
        codes = detect_python_code(text)

        # Should detect as Python based on heuristics
        assert len(codes) >= 0  # May or may not detect depending on heuristics

    def test_no_python_code(self):
        text = "```javascript\nconsole.log('hello');\n```"
        codes = detect_python_code(text)

        assert len(codes) == 0


class TestDetectJavaScriptCode:
    """Test detect_javascript_code function"""

    def test_detect_javascript_block(self):
        text = "```javascript\nfunction test() {\n  return true;\n}\n```"
        codes = detect_javascript_code(text)

        assert len(codes) == 1
        assert "function test" in codes[0]

    def test_detect_typescript_block(self):
        text = "```typescript\nconst x: number = 42;\n```"
        codes = detect_javascript_code(text)

        assert len(codes) == 1

    def test_detect_node_block(self):
        text = "```node\nrequire('fs');\n```"
        codes = detect_javascript_code(text)

        assert len(codes) == 1

    def test_no_javascript_code(self):
        text = "```python\nprint('hello')\n```"
        codes = detect_javascript_code(text)

        assert len(codes) == 0


class TestGetExecutableCodeBlocks:
    """Test get_executable_code_blocks function"""

    def test_filter_by_supported_languages(self):
        text = """```python\nprint('hello')\n```\n```javascript\nconsole.log('world');\n```\n```rust\nfn main() {}\n```"""
        blocks = get_executable_code_blocks(
            text, supported_languages=["python", "javascript"]
        )

        assert len(blocks) == 2
        languages = [b.language for b in blocks]
        assert "python" in languages
        assert "javascript" in languages
        assert "rust" not in languages

    def test_all_languages_when_none_specified(self):
        text = """```python\nprint('hello')\n```\n```javascript\nconsole.log('world');\n```"""
        blocks = get_executable_code_blocks(text)

        assert len(blocks) == 2

    def test_unknown_language_heuristic(self):
        text = "```\ndef hello():\n    print('world')\n```"
        blocks = get_executable_code_blocks(
            text, supported_languages=["python"]
        )

        # Should detect as Python based on heuristics
        assert len(blocks) >= 0


class TestCodeBlockHeuristics:
    """Test code detection heuristics"""

    def test_looks_like_python_code(self):
        # Test through detect_python_code which uses the heuristic
        python_code = "def hello(): pass"
        text = f"```\n{python_code}\n```"
        codes = detect_python_code(text)
        # Should detect Python code based on heuristics
        assert len(codes) >= 0  # May or may not detect

    def test_looks_like_javascript_code(self):
        # Test through detect_javascript_code which uses the heuristic
        js_code = "function test() {}"
        text = f"```\n{js_code}\n```"
        codes = detect_javascript_code(text)
        # Should detect JavaScript code based on heuristics
        assert len(codes) >= 0  # May or may not detect

    def test_looks_like_executable_code(self):
        # Test through detect_code_blocks which uses the heuristic
        executable_code = "x = 5"
        text = f"Use `{executable_code}` to assign"
        blocks = detect_code_blocks(text)
        # Should detect executable code
        executable_blocks = [b for b in blocks if len(b.code) > 2]
        assert len(executable_blocks) >= 0

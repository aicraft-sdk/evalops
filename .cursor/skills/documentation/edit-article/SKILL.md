---
name: edit-article
description: Edit articles by dividing into sections, respecting information dependencies, and rewriting with clarity and flow. Use maximum 240 characters per paragraph. Use when editing articles, documentation, PRDs, RFCs, or any long-form written content.
---

# Edit Article

Edit articles systematically by dividing into sections, respecting information dependencies, and rewriting for clarity and flow.

## Process

### 1. Divide into Sections

First, divide the article into sections based on its headings. Think about the main points you want to make during those sections.

Consider that information is a directed acyclic graph, and that pieces of information can depend on other pieces of information. Make sure that the order of the sections and their contents respects these dependencies.

Confirm the sections with the user.

### 2. Rewrite Each Section

For each section:

**2a. Rewrite the section** to improve clarity, coherence, and flow. Use maximum 240 characters per paragraph.

**Guidelines:**

- One main idea per paragraph
- Short, focused sentences
- Clear transitions between paragraphs
- Respect information dependencies (don't reference concepts before they're introduced)
- Maintain the author's voice and intent

**2b. Review with user** - Show the rewritten section and ask for feedback before proceeding to the next section.

## Paragraph Length Rule

**Maximum 240 characters per paragraph** - This ensures:

- Scannability
- Easier comprehension
- Better mobile reading experience
- Focused ideas

If a paragraph exceeds 240 characters, split it into multiple paragraphs, each with a clear focus.

## Information Dependency

When rewriting, respect the dependency graph:

- **Foundational concepts** come first
- **Dependent concepts** come after their dependencies
- **Examples** follow the concepts they illustrate
- **Advanced topics** build on basics

If you find a dependency violation, either:

1. Reorder sections to fix it
2. Add a brief forward reference ("We'll cover X in detail later, but for now...")
3. Move the dependent content to a later section

## Example

**Before:**

```
Authentication is critical for security. We use JWT tokens which are stateless and scalable. Refresh tokens stored in HTTP-only cookies prevent XSS attacks. CSRF protection via SameSite cookies ensures requests are legitimate.
```

**After:**

```
Authentication is critical for security. We use JWT tokens for stateless, scalable authentication.

Refresh tokens are stored in HTTP-only cookies. This prevents XSS attacks by making tokens inaccessible to JavaScript.

CSRF protection uses SameSite cookies. This ensures requests originate from legitimate sources.
```

## When to Use

- Editing PRDs before implementation
- Polishing RFCs
- Improving documentation clarity
- Refining blog posts or articles
- Making technical content more accessible

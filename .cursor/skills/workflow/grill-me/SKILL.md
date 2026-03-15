---
name: grill-me
description: Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. Use when user wants rigorous clarification, needs design decisions resolved, or mentions "grill me", "interview me", or "ask me questions".
---

# Grill Me

Interview the user relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

## When to Use

Use this skill when:

- User says "grill me", "interview me", or "ask me questions"
- A plan or design has ambiguous decisions
- Multiple implementation options exist and need clarification
- User wants rigorous validation before proceeding
- Dependencies between decisions need to be resolved

## Approach

### 1. Identify Decision Points

Before interviewing, identify all decision points in the plan:

- Architectural choices
- API design decisions
- Data model questions
- Integration approaches
- Testing strategies
- Performance considerations

### 2. Walk the Decision Tree

For each decision point:

- Ask specific, probing questions
- Explore implications of each option
- Identify dependencies (Decision A affects Decision B)
- Resolve dependencies in order (blockers first)

### 3. Drill Down

Don't accept vague answers. Follow up with:

- "What does that mean in practice?"
- "How would that work with [related decision]?"
- "What if [edge case]?"
- "Why this approach over [alternative]?"

### 4. Document Decisions

As decisions are made, document:

- The decision
- Rationale
- Dependencies resolved
- Alternatives considered

### 5. Verify Understanding

Before moving on, confirm:

- "So to summarize: [decision summary]"
- "Does that match your understanding?"
- "Any other aspects we should clarify?"

## Example Flow

```
You: "For authentication, are you using JWT tokens or session-based?"

User: "JWT tokens."

You: "How will you handle token refresh? Will you use refresh tokens or just re-authenticate?"

User: "Refresh tokens."

You: "Where will you store refresh tokens? In a database or HTTP-only cookies?"

User: "HTTP-only cookies."

You: "How will you handle CSRF protection with cookies? Will you use CSRF tokens or SameSite cookies?"

[... continues until all authentication decisions are resolved ...]
```

## Anti-Patterns

- Don't accept "I don't know" without exploring options
- Don't skip dependencies - resolve them in order
- Don't move on until both parties have shared understanding
- Don't make assumptions - ask explicitly

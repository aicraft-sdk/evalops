interface JudgePromptTemplate {
  name: string;
  category: 'llm_judge';
  content: string;
  description: string;
  variables: string[];
}

export class PromptTemplateService {
  // Pre-built LLM judge prompt templates
  static readonly JUDGE_TEMPLATES: JudgePromptTemplate[] = [
    {
      name: "Quality Assessment Judge",
      category: 'llm_judge',
      content: `You are an expert evaluator assessing response quality.

Task: Rate how well the AI response answers the given question.

Question: {{item.input}}
Expected Answer: {{sample.expected}}
AI Response: {{sample.output}}

Evaluation Criteria:
1. Accuracy: Is the response factually correct?
2. Completeness: Does it fully address the question?
3. Clarity: Is it clear and well-structured?
4. Relevance: Does it stay on topic?

Provide a score from 0 to 100 where:
- 0-20: Poor (incorrect, irrelevant, or incomprehensible)
- 21-40: Below Average (partially correct but significant issues)
- 41-60: Average (correct but incomplete or unclear)
- 61-80: Good (mostly correct and clear)
- 81-100: Excellent (accurate, complete, and well-presented)

Score: [Your numerical score]`,
      description: "Comprehensive quality assessment for general Q&A responses",
      variables: ["item.input", "sample.expected", "sample.output"]
    },
    {
      name: "Factual Accuracy Judge",
      category: 'llm_judge',
      content: `You are a fact-checking expert evaluating response accuracy.

Question: {{item.input}}
Expected Answer: {{sample.expected}}
AI Response: {{sample.output}}

Focus only on factual accuracy:
- Are the facts in the AI response correct?
- Does it contradict the expected answer on key facts?
- Are there any misleading or false statements?

Rate from 0 to 100:
- 100: All facts are accurate
- 80-99: Mostly accurate with minor inaccuracies
- 60-79: Generally accurate but some notable errors
- 40-59: Mixed accuracy, significant errors present
- 20-39: Many inaccuracies, unreliable information
- 0-19: Mostly or entirely inaccurate

Score: [Your numerical score]`,
      description: "Focuses specifically on factual correctness and accuracy",
      variables: ["item.input", "sample.expected", "sample.output"]
    },
    {
      name: "Helpfulness Judge",
      category: 'llm_judge',
      content: `You are evaluating how helpful the AI response is to the user.

User Question: {{item.input}}
Expected Answer: {{sample.expected}}
AI Response: {{sample.output}}

Assess helpfulness by considering:
1. Does it directly address the user's need?
2. Is it actionable and practical?
3. Would this response solve the user's problem?
4. Is the tone appropriate and supportive?

Rate from 0 to 100:
- 90-100: Extremely helpful, directly solves the problem
- 70-89: Very helpful, addresses most needs
- 50-69: Moderately helpful, partially addresses the question
- 30-49: Somewhat helpful but limited value
- 10-29: Minimally helpful, doesn't address core needs
- 0-9: Not helpful at all

Score: [Your numerical score]`,
      description: "Evaluates how helpful and practical the response is for users",
      variables: ["item.input", "sample.expected", "sample.output"]
    },
    {
      name: "Conciseness Judge",
      category: 'llm_judge',
      content: `You are evaluating response conciseness and efficiency.

Question: {{item.input}}
Expected Answer: {{sample.expected}}
AI Response: {{sample.output}}

Evaluate conciseness:
- Does it answer completely without being wordy?
- Is every sentence necessary?
- Could it convey the same information more briefly?
- Does it avoid unnecessary repetition?

Rate from 0 to 100:
- 90-100: Perfect balance, comprehensive yet concise
- 70-89: Good balance, minor wordiness
- 50-69: Adequate but could be more concise
- 30-49: Somewhat wordy, contains unnecessary content
- 10-29: Very wordy, significant redundancy
- 0-9: Extremely verbose, poor signal-to-noise ratio

Score: [Your numerical score]`,
      description: "Assesses whether responses are appropriately concise without losing information",
      variables: ["item.input", "sample.expected", "sample.output"]
    },
    {
      name: "Tone and Style Judge",
      category: 'llm_judge',
      content: `You are evaluating the tone and communication style of the AI response.

Question: {{item.input}}
Expected Answer: {{sample.expected}}
AI Response: {{sample.output}}

Assess communication quality:
- Is the tone appropriate for the context?
- Is it professional yet conversational?
- Does it match the expected style?
- Is it engaging and easy to understand?

Rate from 0 to 100:
- 90-100: Excellent tone, perfectly appropriate style
- 70-89: Good tone, appropriate for most contexts
- 50-69: Acceptable tone, minor style issues
- 30-49: Somewhat inappropriate tone or style
- 10-29: Poor tone, significant style problems
- 0-9: Very inappropriate tone or style

Score: [Your numerical score]`,
      description: "Evaluates communication style, tone, and appropriateness",
      variables: ["item.input", "sample.expected", "sample.output"]
    },
    {
      name: "Creative Comparison Judge",
      category: 'llm_judge',
      content: `You are comparing creative outputs for originality and quality.

Prompt: {{item.input}}
Reference Output: {{sample.expected}}
AI Output: {{sample.output}}

Evaluate the AI output against the reference for:
1. Creativity and originality
2. Relevance to the prompt
3. Overall quality and execution
4. Unique insights or perspectives

Rate from 0 to 100:
- 90-100: Highly creative, exceeds reference quality
- 70-89: Creative and well-executed, matches or slightly exceeds reference
- 50-69: Adequately creative, comparable to reference
- 30-49: Limited creativity, below reference quality
- 10-29: Poor creativity, significantly below reference
- 0-9: No creativity, much inferior to reference

Score: [Your numerical score]`,
      description: "Specialized for evaluating creative content like writing, stories, or artistic responses",
      variables: ["item.input", "sample.expected", "sample.output"]
    }
  ];

  static getTemplatesByCategory(category: string): JudgePromptTemplate[] {
    return this.JUDGE_TEMPLATES.filter(template => template.category === category);
  }

  static getAllTemplates(): JudgePromptTemplate[] {
    return this.JUDGE_TEMPLATES;
  }

  static getTemplate(name: string): JudgePromptTemplate | undefined {
    return this.JUDGE_TEMPLATES.find(template => template.name === name);
  }
}
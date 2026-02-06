"""
LLM-as-Judge Evaluator for FastMCP

Uses an LLM to evaluate RAG system outputs when ground truth labels are unavailable.
Evaluates:
- Context validity: Does retrieved context answer the query?
- Answer faithfulness: Is the answer grounded in the context?
- Answer relevancy: Does the answer address the query?
- Hallucination detection: Does the answer contain unsupported claims?
"""

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Any, Tuple
import requests


class JudgmentResult(Enum):
    """Possible judgment outcomes."""
    VALID = "valid"
    INVALID = "invalid"
    PARTIAL = "partial"
    UNKNOWN = "unknown"


@dataclass
class JudgmentScore:
    """Score from LLM-as-judge evaluation."""
    result: JudgmentResult
    score: float  # 0.0 to 1.0
    reasoning: str
    confidence: float = 1.0


@dataclass  
class LLMJudgeResult:
    """Complete evaluation result from LLM judge."""
    context_validity: JudgmentScore
    answer_faithfulness: JudgmentScore
    answer_relevancy: JudgmentScore
    overall_score: float
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "context_validity": {
                "result": self.context_validity.result.value,
                "score": round(self.context_validity.score, 2),
                "reasoning": self.context_validity.reasoning,
            },
            "answer_faithfulness": {
                "result": self.answer_faithfulness.result.value,
                "score": round(self.answer_faithfulness.score, 2),
                "reasoning": self.answer_faithfulness.reasoning,
            },
            "answer_relevancy": {
                "result": self.answer_relevancy.result.value,
                "score": round(self.answer_relevancy.score, 2),
                "reasoning": self.answer_relevancy.reasoning,
            },
            "overall_score": round(self.overall_score, 2),
        }


class LLMJudge:
    """
    LLM-based evaluator for RAG outputs.
    
    Uses a language model to assess quality of retrieval and generation
    when ground truth labels are not available.
    """
    
    # Ollama API endpoint
    DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"
    DEFAULT_MODEL = "llama3.2:3b"
    
    # Evaluation prompts
    CONTEXT_VALIDITY_PROMPT = """You are an expert evaluator assessing whether retrieved context can answer a question.

Question: {question}

Retrieved Context:
{context}

Evaluate: Does this context contain sufficient information to answer the question?

Respond with EXACTLY this JSON format:
{{
    "judgment": "VALID" or "PARTIAL" or "INVALID",
    "score": <float 0.0-1.0>,
    "reasoning": "<one sentence explanation>"
}}

Rules:
- VALID (1.0): Context fully contains the answer
- PARTIAL (0.5): Context has some relevant info but incomplete  
- INVALID (0.0): Context is irrelevant or missing key information"""

    FAITHFULNESS_PROMPT = """You are an expert evaluator checking if an answer is grounded in the given context.

Question: {question}

Context:
{context}

Answer: {answer}

Evaluate: Is every claim in the answer supported by the context? Check for hallucinations.

Respond with EXACTLY this JSON format:
{{
    "judgment": "VALID" or "PARTIAL" or "INVALID",
    "score": <float 0.0-1.0>,
    "reasoning": "<one sentence about faithfulness and any hallucinations>"
}}

Rules:
- VALID (1.0): All claims are directly supported by context
- PARTIAL (0.3-0.7): Some claims supported, some unsupported
- INVALID (0.0): Major claims are unsupported or contradicted"""

    RELEVANCY_PROMPT = """You are an expert evaluator checking if an answer addresses the question.

Question: {question}

Answer: {answer}

Evaluate: Does this answer directly and completely address the question asked?

Respond with EXACTLY this JSON format:
{{
    "judgment": "VALID" or "PARTIAL" or "INVALID",
    "score": <float 0.0-1.0>,
    "reasoning": "<one sentence about how well the answer addresses the question>"
}}

Rules:
- VALID (1.0): Answer directly and completely addresses the question
- PARTIAL (0.3-0.7): Answer partially addresses the question or is incomplete
- INVALID (0.0): Answer is off-topic or doesn't address the question"""

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        ollama_url: str = DEFAULT_OLLAMA_URL,
        timeout: int = 60
    ):
        """
        Initialize the LLM judge.
        
        Args:
            model: Ollama model name to use for evaluation
            ollama_url: Ollama API endpoint URL
            timeout: Request timeout in seconds
        """
        self.model = model
        self.ollama_url = ollama_url
        self.timeout = timeout
    
    def _query_llm(self, prompt: str) -> str:
        """Send a prompt to the LLM and get response."""
        try:
            response = requests.post(
                self.ollama_url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1}  # Low temp for consistent evals
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json().get("response", "")
        except requests.RequestException as e:
            return f'{{"judgment": "UNKNOWN", "score": 0.5, "reasoning": "LLM query failed: {str(e)}"}}'
    
    def _parse_judgment(self, response: str) -> JudgmentScore:
        """Parse LLM response into a JudgmentScore."""
        try:
            # Extract JSON from response
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if not json_match:
                return JudgmentScore(
                    result=JudgmentResult.UNKNOWN,
                    score=0.5,
                    reasoning="Failed to parse LLM response",
                    confidence=0.0
                )
            
            data = json.loads(json_match.group())
            
            # Parse judgment
            judgment_str = data.get("judgment", "UNKNOWN").upper()
            if judgment_str == "VALID":
                result = JudgmentResult.VALID
            elif judgment_str == "PARTIAL":
                result = JudgmentResult.PARTIAL
            elif judgment_str == "INVALID":
                result = JudgmentResult.INVALID
            else:
                result = JudgmentResult.UNKNOWN
            
            # Parse score
            score = float(data.get("score", 0.5))
            score = max(0.0, min(1.0, score))  # Clamp to [0, 1]
            
            # Parse reasoning
            reasoning = data.get("reasoning", "No reasoning provided")
            
            return JudgmentScore(
                result=result,
                score=score,
                reasoning=reasoning,
                confidence=1.0
            )
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            return JudgmentScore(
                result=JudgmentResult.UNKNOWN,
                score=0.5,
                reasoning=f"Parse error: {str(e)}",
                confidence=0.0
            )
    
    def evaluate_context_validity(
        self,
        question: str,
        context: str
    ) -> JudgmentScore:
        """
        Evaluate if retrieved context can answer the question.
        
        Args:
            question: The user's query
            context: Retrieved context chunks (concatenated)
            
        Returns:
            JudgmentScore with validity assessment
        """
        prompt = self.CONTEXT_VALIDITY_PROMPT.format(
            question=question,
            context=context[:3000]  # Limit context length
        )
        response = self._query_llm(prompt)
        return self._parse_judgment(response)
    
    def evaluate_faithfulness(
        self,
        question: str,
        context: str,
        answer: str
    ) -> JudgmentScore:
        """
        Evaluate if answer is grounded in context (no hallucinations).
        
        Args:
            question: The user's query
            context: Retrieved context chunks
            answer: Generated answer
            
        Returns:
            JudgmentScore with faithfulness assessment
        """
        prompt = self.FAITHFULNESS_PROMPT.format(
            question=question,
            context=context[:3000],
            answer=answer[:1000]
        )
        response = self._query_llm(prompt)
        return self._parse_judgment(response)
    
    def evaluate_relevancy(
        self,
        question: str,
        answer: str
    ) -> JudgmentScore:
        """
        Evaluate if answer addresses the question.
        
        Args:
            question: The user's query
            answer: Generated answer
            
        Returns:
            JudgmentScore with relevancy assessment
        """
        prompt = self.RELEVANCY_PROMPT.format(
            question=question,
            answer=answer[:1000]
        )
        response = self._query_llm(prompt)
        return self._parse_judgment(response)
    
    def evaluate(
        self,
        question: str,
        context: str,
        answer: str
    ) -> LLMJudgeResult:
        """
        Run full evaluation on a RAG output.
        
        Args:
            question: The user's query
            context: Retrieved context chunks
            answer: Generated answer
            
        Returns:
            LLMJudgeResult with all evaluation scores
        """
        context_validity = self.evaluate_context_validity(question, context)
        faithfulness = self.evaluate_faithfulness(question, context, answer)
        relevancy = self.evaluate_relevancy(question, answer)
        
        # Compute overall score (weighted average)
        overall_score = (
            context_validity.score * 0.3 +
            faithfulness.score * 0.4 +
            relevancy.score * 0.3
        )
        
        return LLMJudgeResult(
            context_validity=context_validity,
            answer_faithfulness=faithfulness,
            answer_relevancy=relevancy,
            overall_score=overall_score
        )
    
    def batch_evaluate(
        self,
        samples: List[Dict[str, str]]
    ) -> Tuple[List[LLMJudgeResult], Dict[str, float]]:
        """
        Evaluate multiple samples and compute aggregate metrics.
        
        Args:
            samples: List of dicts with 'question', 'context', 'answer' keys
            
        Returns:
            Tuple of (individual results, aggregate metrics dict)
        """
        results = []
        total_context = 0.0
        total_faithfulness = 0.0
        total_relevancy = 0.0
        total_overall = 0.0
        
        for sample in samples:
            result = self.evaluate(
                question=sample["question"],
                context=sample["context"],
                answer=sample["answer"]
            )
            results.append(result)
            
            total_context += result.context_validity.score
            total_faithfulness += result.answer_faithfulness.score
            total_relevancy += result.answer_relevancy.score
            total_overall += result.overall_score
        
        n = len(samples) if samples else 1
        
        aggregate = {
            "avg_context_validity": round(total_context / n, 4),
            "avg_faithfulness": round(total_faithfulness / n, 4),
            "avg_relevancy": round(total_relevancy / n, 4),
            "avg_overall": round(total_overall / n, 4),
            "num_samples": len(samples),
        }
        
        return results, aggregate


class PairwiseJudge:
    """
    LLM-based pairwise comparison for A/B testing.
    
    Compares two answers to determine which is better.
    Useful for evaluating model improvements.
    """
    
    PAIRWISE_PROMPT = """You are an expert evaluator comparing two answers to a question.

Question: {question}

Answer A: {answer_a}

Answer B: {answer_b}

Which answer is better? Consider accuracy, completeness, and clarity.

Respond with EXACTLY this JSON format:
{{
    "winner": "A" or "B" or "TIE",
    "reasoning": "<one sentence explanation>",
    "confidence": <float 0.5-1.0>
}}"""

    def __init__(
        self,
        model: str = "llama3.2:3b",
        ollama_url: str = "http://localhost:11434/api/generate"
    ):
        self.model = model
        self.ollama_url = ollama_url
    
    def compare(
        self,
        question: str,
        answer_a: str,
        answer_b: str
    ) -> Dict[str, Any]:
        """
        Compare two answers and determine the winner.
        
        Args:
            question: The question both answers respond to
            answer_a: First answer
            answer_b: Second answer
            
        Returns:
            Dict with winner, reasoning, and confidence
        """
        prompt = self.PAIRWISE_PROMPT.format(
            question=question,
            answer_a=answer_a[:1000],
            answer_b=answer_b[:1000]
        )
        
        try:
            response = requests.post(
                self.ollama_url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1}
                },
                timeout=60
            )
            response.raise_for_status()
            result_text = response.json().get("response", "")
            
            # Parse JSON
            json_match = re.search(r'\{[^{}]*\}', result_text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return {
                    "winner": data.get("winner", "TIE"),
                    "reasoning": data.get("reasoning", ""),
                    "confidence": float(data.get("confidence", 0.5))
                }
        except Exception as e:
            pass
        
        return {"winner": "TIE", "reasoning": f"Evaluation failed", "confidence": 0.0}

"""
RAGAS Integration for FastMCP

Provides integration with the RAGAS (Retrieval Augmented Generation Assessment) framework
for comprehensive RAG evaluation.

RAGAS Metrics:
- Answer Relevancy: How relevant is the answer to the question?
- Context Precision: Are retrieved chunks relevant?
- Context Recall: Did we retrieve all necessary information?
- Faithfulness: Is the answer grounded in context?

Reference: https://github.com/explodinggradients/ragas
"""

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import requests


@dataclass
class RAGASScores:
    """Container for RAGAS evaluation scores."""
    answer_relevancy: float
    context_precision: float
    context_recall: float
    faithfulness: float
    overall_score: float  # Weighted average
    
    def to_dict(self) -> Dict[str, float]:
        return {
            "answer_relevancy": round(self.answer_relevancy, 4),
            "context_precision": round(self.context_precision, 4),
            "context_recall": round(self.context_recall, 4),
            "faithfulness": round(self.faithfulness, 4),
            "overall_score": round(self.overall_score, 4),
        }


class RAGASEvaluator:
    """
    RAGAS-style evaluator using local LLM.
    
    Implements core RAGAS metrics without external dependencies,
    using Ollama for LLM-based evaluation.
    
    This is a lightweight implementation. For production use with full
    RAGAS features, install: pip install ragas
    """
    
    # Prompts adapted from RAGAS methodology
    ANSWER_RELEVANCY_PROMPT = """Given a question and an answer, evaluate how relevant the answer is to the question.

Question: {question}
Answer: {answer}

Rate the relevancy on a scale of 0 to 1:
- 1.0: Answer directly and completely addresses the question
- 0.7-0.9: Answer mostly addresses the question with minor gaps
- 0.4-0.6: Answer partially addresses the question
- 0.1-0.3: Answer barely relates to the question
- 0.0: Answer is completely irrelevant

Respond with ONLY a JSON object:
{{"score": <float 0.0-1.0>, "reason": "<brief explanation>"}}"""

    CONTEXT_PRECISION_PROMPT = """Given a question and retrieved context chunks, evaluate how precise the retrieval was.

Question: {question}

Retrieved Context:
{context}

Evaluate: What fraction of the retrieved chunks are actually relevant to answering the question?

Rate precision from 0 to 1:
- 1.0: All chunks are highly relevant
- 0.5: Half the chunks are relevant
- 0.0: No chunks are relevant

Respond with ONLY a JSON object:
{{"score": <float 0.0-1.0>, "relevant_chunks": <count>, "total_chunks": <count>}}"""

    CONTEXT_RECALL_PROMPT = """Given a question, ground truth answer, and retrieved context, evaluate recall.

Question: {question}
Ground Truth Answer: {ground_truth}

Retrieved Context:
{context}

Evaluate: Does the retrieved context contain all information needed to produce the ground truth answer?

Rate recall from 0 to 1:
- 1.0: Context contains all necessary information
- 0.5: Context contains about half the needed information
- 0.0: Context lacks the necessary information

Respond with ONLY a JSON object:
{{"score": <float 0.0-1.0>, "missing_info": "<what's missing if any>"}}"""

    FAITHFULNESS_PROMPT = """Evaluate if the answer is faithful to (supported by) the given context.

Question: {question}
Context: {context}
Answer: {answer}

For each claim in the answer, check if it's supported by the context.

Rate faithfulness from 0 to 1:
- 1.0: All claims are directly supported by context
- 0.5: Half the claims are supported
- 0.0: No claims are supported (hallucination)

Respond with ONLY a JSON object:
{{"score": <float 0.0-1.0>, "unsupported_claims": ["<list any unsupported claims>"]}}"""

    def __init__(
        self,
        model: str = "llama3.2:3b",
        ollama_url: str = "http://localhost:11434/api/generate",
        timeout: int = 60
    ):
        """
        Initialize the RAGAS evaluator.
        
        Args:
            model: Ollama model to use
            ollama_url: Ollama API endpoint
            timeout: Request timeout in seconds
        """
        self.model = model
        self.ollama_url = ollama_url
        self.timeout = timeout
        
        # Try to import actual RAGAS library
        self._ragas_available = False
        try:
            import ragas
            self._ragas_available = True
            print("✅ RAGAS library available - using native implementation")
        except ImportError:
            print("⚠️  RAGAS library not installed - using LLM-based approximation")
            print("   For full RAGAS: pip install ragas")
    
    def _query_llm(self, prompt: str) -> str:
        """Send prompt to LLM and get response."""
        try:
            response = requests.post(
                self.ollama_url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.0}  # Deterministic for evals
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json().get("response", "")
        except requests.RequestException as e:
            return f'{{"score": 0.5, "error": "{str(e)}"}}'
    
    def _parse_score(self, response: str) -> Tuple[float, Dict[str, Any]]:
        """Parse score from LLM JSON response."""
        try:
            # Extract JSON from response
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                score = float(data.get("score", 0.5))
                score = max(0.0, min(1.0, score))  # Clamp to [0, 1]
                return score, data
        except (json.JSONDecodeError, ValueError):
            pass
        return 0.5, {"error": "Parse failed"}
    
    def evaluate_answer_relevancy(
        self,
        question: str,
        answer: str
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Evaluate how relevant the answer is to the question.
        
        This is independent of context - just question vs answer.
        """
        prompt = self.ANSWER_RELEVANCY_PROMPT.format(
            question=question,
            answer=answer[:1500]
        )
        response = self._query_llm(prompt)
        return self._parse_score(response)
    
    def evaluate_context_precision(
        self,
        question: str,
        context: str
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Evaluate precision of retrieved context.
        
        High precision = most retrieved chunks are relevant.
        """
        prompt = self.CONTEXT_PRECISION_PROMPT.format(
            question=question,
            context=context[:3000]
        )
        response = self._query_llm(prompt)
        return self._parse_score(response)
    
    def evaluate_context_recall(
        self,
        question: str,
        context: str,
        ground_truth: str
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Evaluate recall of retrieved context.
        
        High recall = context contains information needed for ground truth answer.
        Requires ground truth answer for comparison.
        """
        prompt = self.CONTEXT_RECALL_PROMPT.format(
            question=question,
            ground_truth=ground_truth,
            context=context[:3000]
        )
        response = self._query_llm(prompt)
        return self._parse_score(response)
    
    def evaluate_faithfulness(
        self,
        question: str,
        context: str,
        answer: str
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Evaluate faithfulness of answer to context.
        
        High faithfulness = answer is grounded in context (no hallucinations).
        """
        prompt = self.FAITHFULNESS_PROMPT.format(
            question=question,
            context=context[:3000],
            answer=answer[:1500]
        )
        response = self._query_llm(prompt)
        return self._parse_score(response)
    
    def evaluate(
        self,
        question: str,
        context: str,
        answer: str,
        ground_truth: Optional[str] = None,
        use_ragas_library: bool = True
    ) -> RAGASScores:
        """
        Run full RAGAS evaluation on a single sample.
        
        Args:
            question: User's query
            context: Retrieved context chunks
            answer: Generated answer
            ground_truth: Optional expected answer (needed for context recall)
            use_ragas_library: Try to use native RAGAS library if available
            
        Returns:
            RAGASScores with all metrics
        """
        # Try native RAGAS library first if available
        if use_ragas_library and self._ragas_available:
            try:
                from ragas.metrics import (
                    answer_relevancy,
                    context_precision,
                    context_recall,
                    faithfulness,
                )
                from datasets import Dataset
                
                data = {
                    "question": [question],
                    "answer": [answer],
                    "contexts": [[context]],
                    "ground_truth": [ground_truth or ""],
                }
                dataset = Dataset.from_dict(data)
                
                # Evaluate with RAGAS metrics
                result = {
                    "answer_relevancy": answer_relevancy.score(dataset)[0] if answer_relevancy else 0.0,
                    "context_precision": context_precision.score(dataset)[0] if context_precision else 0.0,
                    "context_recall": context_recall.score(dataset)[0] if context_recall and ground_truth else 0.0,
                    "faithfulness": faithfulness.score(dataset)[0] if faithfulness else 0.0,
                }
                
                overall = (
                    result["answer_relevancy"] * 0.25 +
                    result["context_precision"] * 0.25 +
                    (result["context_recall"] * 0.25 if ground_truth else 0.0) +
                    result["faithfulness"] * 0.25
                )
                
                return RAGASScores(
                    answer_relevancy=result["answer_relevancy"],
                    context_precision=result["context_precision"],
                    context_recall=result.get("context_recall", 0.0),
                    faithfulness=result["faithfulness"],
                    overall_score=overall
                )
            except Exception as e:
                print(f"⚠️  RAGAS library evaluation failed: {e}. Falling back to LLM-based evaluation.")
        
        # Fall back to LLM-based evaluation
        # Evaluate each metric
        relevancy_score, _ = self.evaluate_answer_relevancy(question, answer)
        precision_score, _ = self.evaluate_context_precision(question, context)
        faithfulness_score, _ = self.evaluate_faithfulness(question, context, answer)
        
        # Context recall requires ground truth
        if ground_truth:
            recall_score, _ = self.evaluate_context_recall(
                question, context, ground_truth
            )
        else:
            recall_score = 0.0  # Can't compute without ground truth
        
        # Compute overall score (weighted average)
        # Weights: relevancy 0.25, precision 0.25, recall 0.25, faithfulness 0.25
        if ground_truth:
            overall = (
                relevancy_score * 0.25 +
                precision_score * 0.25 +
                recall_score * 0.25 +
                faithfulness_score * 0.25
            )
        else:
            # Without ground truth, redistribute recall weight
            overall = (
                relevancy_score * 0.33 +
                precision_score * 0.33 +
                faithfulness_score * 0.34
            )
        
        return RAGASScores(
            answer_relevancy=relevancy_score,
            context_precision=precision_score,
            context_recall=recall_score,
            faithfulness=faithfulness_score,
            overall_score=overall
        )
    
    def evaluate_batch(
        self,
        samples: List[Dict[str, Any]],
        use_ragas_library: bool = True
    ) -> Tuple[List[RAGASScores], Dict[str, float]]:
        """
        Evaluate multiple samples and compute aggregates.
        
        Args:
            samples: List of dicts with keys:
                     - question (required)
                     - context (required)
                     - answer (required)
                     - ground_truth (optional)
            use_ragas_library: Try to use native RAGAS library if available
        
        Returns:
            Tuple of (individual scores, aggregate metrics)
        """
        # Try native RAGAS library first for batch evaluation if available
        if use_ragas_library and self._ragas_available:
            try:
                ragas_result = self.evaluate_with_ragas_library(samples)
                if ragas_result is not None:
                    # Convert RAGAS results to our format
                    results = []
                    for i, sample in enumerate(samples):
                        scores = RAGASScores(
                            answer_relevancy=ragas_result[i].get("answer_relevancy", 0.0),
                            context_precision=ragas_result[i].get("context_precision", 0.0),
                            context_recall=ragas_result[i].get("context_recall", 0.0),
                            faithfulness=ragas_result[i].get("faithfulness", 0.0),
                            overall_score=(
                                ragas_result[i].get("answer_relevancy", 0.0) * 0.25 +
                                ragas_result[i].get("context_precision", 0.0) * 0.25 +
                                ragas_result[i].get("context_recall", 0.0) * 0.25 +
                                ragas_result[i].get("faithfulness", 0.0) * 0.25
                            )
                        )
                        results.append(scores)
                    
                    # Compute aggregates
                    aggregates = {
                        "avg_answer_relevancy": sum(r.answer_relevancy for r in results) / len(results),
                        "avg_context_precision": sum(r.context_precision for r in results) / len(results),
                        "avg_context_recall": sum(r.context_recall for r in results) / len(results),
                        "avg_faithfulness": sum(r.faithfulness for r in results) / len(results),
                        "avg_overall_ragas": sum(r.overall_score for r in results) / len(results),
                        "num_samples": len(samples),
                        "num_with_ground_truth": sum(1 for s in samples if s.get("ground_truth")),
                    }
                    return results, aggregates
            except Exception as e:
                print(f"⚠️  RAGAS library batch evaluation failed: {e}. Falling back to LLM-based evaluation.")
        
        # Fall back to LLM-based evaluation
        results = []
        totals = {
            "relevancy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "faithfulness": 0.0,
            "overall": 0.0,
        }
        recall_count = 0
        
        for sample in samples:
            scores = self.evaluate(
                question=sample["question"],
                context=sample["context"],
                answer=sample["answer"],
                ground_truth=sample.get("ground_truth"),
                use_ragas_library=False
            )
            results.append(scores)
            
            totals["relevancy"] += scores.answer_relevancy
            totals["precision"] += scores.context_precision
            totals["faithfulness"] += scores.faithfulness
            totals["overall"] += scores.overall_score
            
            if sample.get("ground_truth"):
                totals["recall"] += scores.context_recall
                recall_count += 1
        
        n = len(samples) if samples else 1
        
        aggregates = {
            "avg_answer_relevancy": totals["relevancy"] / n,
            "avg_context_precision": totals["precision"] / n,
            "avg_context_recall": totals["recall"] / recall_count if recall_count else 0.0,
            "avg_faithfulness": totals["faithfulness"] / n,
            "avg_overall_ragas": totals["overall"] / n,
            "num_samples": len(samples),
            "num_with_ground_truth": recall_count,
        }
        
        return results, aggregates
    
    def evaluate_with_ragas_library(
        self,
        samples: List[Dict[str, Any]]
    ) -> Optional[Dict[str, float]]:
        """
        Use the actual RAGAS library if available.
        
        Requires: pip install ragas datasets
        
        Args:
            samples: List of dicts with question, context, answer, ground_truth
            
        Returns:
            RAGAS scores dict or None if library not available
        """
        if not self._ragas_available:
            return None
        
        try:
            from datasets import Dataset
            from ragas import evaluate
            from ragas.metrics import (
                answer_relevancy,
                context_precision,
                context_recall,
                faithfulness,
            )
            
            # Format for RAGAS
            data = {
                "question": [s["question"] for s in samples],
                "answer": [s["answer"] for s in samples],
                "contexts": [[s["context"]] for s in samples],  # RAGAS expects list of contexts
                "ground_truth": [s.get("ground_truth", "") for s in samples],
            }
            dataset = Dataset.from_dict(data)
            
            # Run RAGAS evaluation
            result = evaluate(
                dataset,
                metrics=[
                    answer_relevancy,
                    context_precision,
                    context_recall,
                    faithfulness,
                ],
            )
            
            return result
            
        except Exception as e:
            print(f"RAGAS library evaluation failed: {e}")
            return None


def create_synthetic_qa_dataset(
    documents: List[str],
    num_questions_per_doc: int = 3,
    model: str = "llama3.2:3b",
    ollama_url: str = "http://localhost:11434/api/generate"
) -> List[Dict[str, str]]:
    """
    Generate synthetic QA pairs from documents for evaluation.
    
    This is useful when you don't have labeled test data.
    
    Args:
        documents: List of document texts
        num_questions_per_doc: Number of questions to generate per document
        model: LLM model to use for generation
        ollama_url: Ollama API endpoint
        
    Returns:
        List of dicts with question, answer, context keys
    """
    GENERATION_PROMPT = """Based on the following document, generate {n} question-answer pairs.
Each question should be answerable from the document content.

Document:
{document}

Generate exactly {n} Q&A pairs in this JSON format:
[
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}}
]

Focus on factual questions with clear answers from the text."""

    synthetic_data = []
    
    for doc in documents:
        prompt = GENERATION_PROMPT.format(
            n=num_questions_per_doc,
            document=doc[:3000]  # Limit document length
        )
        
        try:
            response = requests.post(
                ollama_url,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.7}
                },
                timeout=120
            )
            response.raise_for_status()
            result = response.json().get("response", "")
            
            # Extract JSON array
            json_match = re.search(r'\[.*\]', result, re.DOTALL)
            if json_match:
                qa_pairs = json.loads(json_match.group())
                for qa in qa_pairs:
                    synthetic_data.append({
                        "question": qa.get("question", ""),
                        "answer": qa.get("answer", ""),
                        "context": doc,
                        "ground_truth": qa.get("answer", ""),
                    })
        except Exception as e:
            print(f"Failed to generate QA for document: {e}")
            continue
    
    return synthetic_data

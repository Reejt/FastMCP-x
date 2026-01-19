"""
FastMCP Evaluation Framework

Provides metrics and benchmarks for RAG system evaluation:
- Retrieval metrics: recall@K, precision@K, hit_rate, MRR
- Answer quality metrics: F1, Exact Match (EM), BLEU
- LLM-as-judge: faithfulness, relevancy, context validity
- RAGAS integration: answer relevancy, context precision/recall
"""

from evaluation.metrics import (
    RetrievalMetrics,
    AnswerMetrics,
    compute_f1,
    compute_exact_match,
    compute_recall_at_k,
    compute_precision_at_k,
    compute_mrr,
)
from evaluation.llm_judge import LLMJudge
from evaluation.benchmark import BenchmarkRunner, BenchmarkResult
from evaluation.ragas_eval import RAGASEvaluator

__all__ = [
    "RetrievalMetrics",
    "AnswerMetrics", 
    "LLMJudge",
    "BenchmarkRunner",
    "BenchmarkResult",
    "RAGASEvaluator",
    "compute_f1",
    "compute_exact_match",
    "compute_recall_at_k",
    "compute_precision_at_k",
    "compute_mrr",
]

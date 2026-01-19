"""
Evaluation Metrics for FastMCP RAG System

Implements retrieval and answer quality metrics:
- Retrieval: recall@K, precision@K, hit_rate, MRR (Mean Reciprocal Rank)
- Answer: F1, Exact Match (EM), token-level precision/recall
- Text similarity: BLEU, ROUGE-L (optional)
"""

import re
import string
from collections import Counter
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple, Dict, Any


def normalize_text(text: str) -> str:
    """
    Normalize text for comparison: lowercase, remove punctuation/articles, compress whitespace.
    Standard normalization used in SQuAD evaluation.
    """
    # Lowercase
    text = text.lower()
    
    # Remove punctuation
    text = text.translate(str.maketrans("", "", string.punctuation))
    
    # Remove articles
    articles = {"a", "an", "the"}
    tokens = text.split()
    tokens = [t for t in tokens if t not in articles]
    
    # Compress whitespace
    text = " ".join(tokens)
    
    return text.strip()


def get_tokens(text: str) -> List[str]:
    """Tokenize normalized text into words."""
    return normalize_text(text).split()


# ============================================================================
# Answer Quality Metrics (F1, Exact Match)
# ============================================================================

def compute_exact_match(prediction: str, ground_truth: str) -> float:
    """
    Compute Exact Match (EM) score.
    
    Returns 1.0 if normalized prediction equals normalized ground truth, else 0.0.
    
    Args:
        prediction: Model's predicted answer
        ground_truth: Expected correct answer
        
    Returns:
        1.0 for exact match, 0.0 otherwise
    """
    return float(normalize_text(prediction) == normalize_text(ground_truth))


def compute_f1(prediction: str, ground_truth: str) -> float:
    """
    Compute token-level F1 score between prediction and ground truth.
    
    F1 = 2 * (precision * recall) / (precision + recall)
    
    This is the standard SQuAD F1 metric.
    
    Args:
        prediction: Model's predicted answer
        ground_truth: Expected correct answer
        
    Returns:
        F1 score between 0.0 and 1.0
    """
    pred_tokens = get_tokens(prediction)
    truth_tokens = get_tokens(ground_truth)
    
    if not pred_tokens and not truth_tokens:
        return 1.0
    if not pred_tokens or not truth_tokens:
        return 0.0
    
    pred_counter = Counter(pred_tokens)
    truth_counter = Counter(truth_tokens)
    
    # Count common tokens
    common = pred_counter & truth_counter
    num_common = sum(common.values())
    
    if num_common == 0:
        return 0.0
    
    precision = num_common / len(pred_tokens)
    recall = num_common / len(truth_tokens)
    
    f1 = 2 * precision * recall / (precision + recall)
    return f1


def compute_precision_recall(prediction: str, ground_truth: str) -> Tuple[float, float]:
    """
    Compute token-level precision and recall.
    
    Args:
        prediction: Model's predicted answer
        ground_truth: Expected correct answer
        
    Returns:
        Tuple of (precision, recall)
    """
    pred_tokens = get_tokens(prediction)
    truth_tokens = get_tokens(ground_truth)
    
    if not pred_tokens and not truth_tokens:
        return 1.0, 1.0
    if not pred_tokens:
        return 0.0, 0.0
    if not truth_tokens:
        return 0.0, 0.0
    
    pred_counter = Counter(pred_tokens)
    truth_counter = Counter(truth_tokens)
    
    common = pred_counter & truth_counter
    num_common = sum(common.values())
    
    precision = num_common / len(pred_tokens) if pred_tokens else 0.0
    recall = num_common / len(truth_tokens) if truth_tokens else 0.0
    
    return precision, recall


# ============================================================================
# Retrieval Metrics (Recall@K, Precision@K, Hit Rate, MRR)
# ============================================================================

def compute_recall_at_k(
    retrieved_ids: List[str],
    relevant_ids: Set[str],
    k: int
) -> float:
    """
    Compute Recall@K: proportion of relevant items found in top-K results.
    
    Recall@K = |retrieved@K ∩ relevant| / |relevant|
    
    Args:
        retrieved_ids: List of retrieved document/chunk IDs (ordered by rank)
        relevant_ids: Set of ground truth relevant IDs
        k: Number of top results to consider
        
    Returns:
        Recall score between 0.0 and 1.0
    """
    if not relevant_ids:
        return 1.0  # No relevant items means perfect recall
    
    retrieved_at_k = set(retrieved_ids[:k])
    hits = len(retrieved_at_k & relevant_ids)
    
    return hits / len(relevant_ids)


def compute_precision_at_k(
    retrieved_ids: List[str],
    relevant_ids: Set[str],
    k: int
) -> float:
    """
    Compute Precision@K: proportion of top-K results that are relevant.
    
    Precision@K = |retrieved@K ∩ relevant| / K
    
    Args:
        retrieved_ids: List of retrieved document/chunk IDs (ordered by rank)
        relevant_ids: Set of ground truth relevant IDs
        k: Number of top results to consider
        
    Returns:
        Precision score between 0.0 and 1.0
    """
    if k == 0:
        return 0.0
    
    retrieved_at_k = set(retrieved_ids[:k])
    hits = len(retrieved_at_k & relevant_ids)
    
    return hits / k


def compute_hit_rate(
    retrieved_ids: List[str],
    relevant_ids: Set[str],
    k: int
) -> float:
    """
    Compute Hit Rate@K: 1.0 if any relevant item appears in top-K, else 0.0.
    
    Also known as "Success@K" or binary recall.
    
    Args:
        retrieved_ids: List of retrieved document/chunk IDs (ordered by rank)
        relevant_ids: Set of ground truth relevant IDs
        k: Number of top results to consider
        
    Returns:
        1.0 if hit, 0.0 otherwise
    """
    if not relevant_ids:
        return 1.0
    
    retrieved_at_k = set(retrieved_ids[:k])
    return float(bool(retrieved_at_k & relevant_ids))


def compute_mrr(
    retrieved_ids: List[str],
    relevant_ids: Set[str]
) -> float:
    """
    Compute Mean Reciprocal Rank (MRR).
    
    MRR = 1 / rank of first relevant result (0 if no relevant found)
    
    Args:
        retrieved_ids: List of retrieved document/chunk IDs (ordered by rank)
        relevant_ids: Set of ground truth relevant IDs
        
    Returns:
        Reciprocal rank between 0.0 and 1.0
    """
    for i, doc_id in enumerate(retrieved_ids):
        if doc_id in relevant_ids:
            return 1.0 / (i + 1)
    return 0.0


def compute_ndcg_at_k(
    retrieved_ids: List[str],
    relevance_scores: Dict[str, float],
    k: int
) -> float:
    """
    Compute Normalized Discounted Cumulative Gain (NDCG@K).
    
    Useful when relevance is graded (not binary).
    
    Args:
        retrieved_ids: List of retrieved document/chunk IDs (ordered by rank)
        relevance_scores: Dict mapping doc_id -> relevance score (e.g., 0, 1, 2, 3)
        k: Number of top results to consider
        
    Returns:
        NDCG score between 0.0 and 1.0
    """
    import math
    
    def dcg(scores: List[float]) -> float:
        return sum(
            (2 ** score - 1) / math.log2(i + 2)
            for i, score in enumerate(scores)
        )
    
    # Get relevance scores for retrieved docs
    retrieved_scores = [
        relevance_scores.get(doc_id, 0.0) 
        for doc_id in retrieved_ids[:k]
    ]
    
    # Ideal ranking (sorted by relevance)
    ideal_scores = sorted(relevance_scores.values(), reverse=True)[:k]
    
    actual_dcg = dcg(retrieved_scores)
    ideal_dcg = dcg(ideal_scores)
    
    if ideal_dcg == 0:
        return 0.0
    
    return actual_dcg / ideal_dcg


# ============================================================================
# Metric Aggregators
# ============================================================================

@dataclass
class RetrievalMetrics:
    """Container for retrieval evaluation metrics."""
    
    recall_at_1: float = 0.0
    recall_at_3: float = 0.0
    recall_at_5: float = 0.0
    recall_at_10: float = 0.0
    precision_at_1: float = 0.0
    precision_at_3: float = 0.0
    precision_at_5: float = 0.0
    precision_at_10: float = 0.0
    hit_rate_at_1: float = 0.0
    hit_rate_at_5: float = 0.0
    mrr: float = 0.0
    ndcg_at_5: float = 0.0
    ndcg_at_10: float = 0.0
    num_samples: int = 0
    
    @classmethod
    def compute(
        cls,
        retrieved_ids: List[str],
        relevant_ids: Set[str],
        relevance_scores: Optional[Dict[str, float]] = None
    ) -> "RetrievalMetrics":
        """
        Compute all retrieval metrics for a single query.
        
        Args:
            retrieved_ids: Ordered list of retrieved document IDs
            relevant_ids: Set of relevant document IDs (ground truth)
            relevance_scores: Optional graded relevance for NDCG
            
        Returns:
            RetrievalMetrics instance with all computed metrics
        """
        metrics = cls(
            recall_at_1=compute_recall_at_k(retrieved_ids, relevant_ids, 1),
            recall_at_3=compute_recall_at_k(retrieved_ids, relevant_ids, 3),
            recall_at_5=compute_recall_at_k(retrieved_ids, relevant_ids, 5),
            recall_at_10=compute_recall_at_k(retrieved_ids, relevant_ids, 10),
            precision_at_1=compute_precision_at_k(retrieved_ids, relevant_ids, 1),
            precision_at_3=compute_precision_at_k(retrieved_ids, relevant_ids, 3),
            precision_at_5=compute_precision_at_k(retrieved_ids, relevant_ids, 5),
            precision_at_10=compute_precision_at_k(retrieved_ids, relevant_ids, 10),
            hit_rate_at_1=compute_hit_rate(retrieved_ids, relevant_ids, 1),
            hit_rate_at_5=compute_hit_rate(retrieved_ids, relevant_ids, 5),
            mrr=compute_mrr(retrieved_ids, relevant_ids),
            num_samples=1,
        )
        
        if relevance_scores:
            metrics.ndcg_at_5 = compute_ndcg_at_k(retrieved_ids, relevance_scores, 5)
            metrics.ndcg_at_10 = compute_ndcg_at_k(retrieved_ids, relevance_scores, 10)
        
        return metrics
    
    def __add__(self, other: "RetrievalMetrics") -> "RetrievalMetrics":
        """Aggregate metrics from multiple samples."""
        return RetrievalMetrics(
            recall_at_1=self.recall_at_1 + other.recall_at_1,
            recall_at_3=self.recall_at_3 + other.recall_at_3,
            recall_at_5=self.recall_at_5 + other.recall_at_5,
            recall_at_10=self.recall_at_10 + other.recall_at_10,
            precision_at_1=self.precision_at_1 + other.precision_at_1,
            precision_at_3=self.precision_at_3 + other.precision_at_3,
            precision_at_5=self.precision_at_5 + other.precision_at_5,
            precision_at_10=self.precision_at_10 + other.precision_at_10,
            hit_rate_at_1=self.hit_rate_at_1 + other.hit_rate_at_1,
            hit_rate_at_5=self.hit_rate_at_5 + other.hit_rate_at_5,
            mrr=self.mrr + other.mrr,
            ndcg_at_5=self.ndcg_at_5 + other.ndcg_at_5,
            ndcg_at_10=self.ndcg_at_10 + other.ndcg_at_10,
            num_samples=self.num_samples + other.num_samples,
        )
    
    def average(self) -> "RetrievalMetrics":
        """Compute average metrics across all samples."""
        if self.num_samples == 0:
            return self
        n = self.num_samples
        return RetrievalMetrics(
            recall_at_1=self.recall_at_1 / n,
            recall_at_3=self.recall_at_3 / n,
            recall_at_5=self.recall_at_5 / n,
            recall_at_10=self.recall_at_10 / n,
            precision_at_1=self.precision_at_1 / n,
            precision_at_3=self.precision_at_3 / n,
            precision_at_5=self.precision_at_5 / n,
            precision_at_10=self.precision_at_10 / n,
            hit_rate_at_1=self.hit_rate_at_1 / n,
            hit_rate_at_5=self.hit_rate_at_5 / n,
            mrr=self.mrr / n,
            ndcg_at_5=self.ndcg_at_5 / n,
            ndcg_at_10=self.ndcg_at_10 / n,
            num_samples=n,
        )
    
    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary for logging/serialization."""
        return {
            "recall@1": round(self.recall_at_1, 4),
            "recall@3": round(self.recall_at_3, 4),
            "recall@5": round(self.recall_at_5, 4),
            "recall@10": round(self.recall_at_10, 4),
            "precision@1": round(self.precision_at_1, 4),
            "precision@3": round(self.precision_at_3, 4),
            "precision@5": round(self.precision_at_5, 4),
            "precision@10": round(self.precision_at_10, 4),
            "hit_rate@1": round(self.hit_rate_at_1, 4),
            "hit_rate@5": round(self.hit_rate_at_5, 4),
            "mrr": round(self.mrr, 4),
            "ndcg@5": round(self.ndcg_at_5, 4),
            "ndcg@10": round(self.ndcg_at_10, 4),
            "num_samples": self.num_samples,
        }


@dataclass
class AnswerMetrics:
    """Container for answer quality metrics."""
    
    exact_match: float = 0.0
    f1: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    num_samples: int = 0
    
    @classmethod
    def compute(cls, prediction: str, ground_truth: str) -> "AnswerMetrics":
        """
        Compute all answer quality metrics for a single prediction.
        
        Args:
            prediction: Model's predicted answer
            ground_truth: Expected correct answer
            
        Returns:
            AnswerMetrics instance with all computed metrics
        """
        precision, recall = compute_precision_recall(prediction, ground_truth)
        return cls(
            exact_match=compute_exact_match(prediction, ground_truth),
            f1=compute_f1(prediction, ground_truth),
            precision=precision,
            recall=recall,
            num_samples=1,
        )
    
    @classmethod
    def compute_multi_reference(
        cls, 
        prediction: str, 
        ground_truths: List[str]
    ) -> "AnswerMetrics":
        """
        Compute metrics with multiple valid ground truths (max over all).
        
        Args:
            prediction: Model's predicted answer
            ground_truths: List of valid answers (take max score)
            
        Returns:
            AnswerMetrics with best scores across references
        """
        if not ground_truths:
            return cls(num_samples=1)
        
        best_em = max(compute_exact_match(prediction, gt) for gt in ground_truths)
        best_f1 = max(compute_f1(prediction, gt) for gt in ground_truths)
        
        best_precision = 0.0
        best_recall = 0.0
        for gt in ground_truths:
            p, r = compute_precision_recall(prediction, gt)
            if p > best_precision:
                best_precision = p
            if r > best_recall:
                best_recall = r
        
        return cls(
            exact_match=best_em,
            f1=best_f1,
            precision=best_precision,
            recall=best_recall,
            num_samples=1,
        )
    
    def __add__(self, other: "AnswerMetrics") -> "AnswerMetrics":
        """Aggregate metrics from multiple samples."""
        return AnswerMetrics(
            exact_match=self.exact_match + other.exact_match,
            f1=self.f1 + other.f1,
            precision=self.precision + other.precision,
            recall=self.recall + other.recall,
            num_samples=self.num_samples + other.num_samples,
        )
    
    def average(self) -> "AnswerMetrics":
        """Compute average metrics across all samples."""
        if self.num_samples == 0:
            return self
        n = self.num_samples
        return AnswerMetrics(
            exact_match=self.exact_match / n,
            f1=self.f1 / n,
            precision=self.precision / n,
            recall=self.recall / n,
            num_samples=n,
        )
    
    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary for logging/serialization."""
        return {
            "exact_match": round(self.exact_match, 4),
            "f1": round(self.f1, 4),
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "num_samples": self.num_samples,
        }


# ============================================================================
# BLEU Score (optional, for generation quality)
# ============================================================================

def compute_bleu(prediction: str, reference: str, max_n: int = 4) -> float:
    """
    Compute BLEU score (simplified version without brevity penalty smoothing).
    
    For production use, consider using sacrebleu or nltk.translate.bleu_score.
    
    Args:
        prediction: Generated text
        reference: Reference text
        max_n: Maximum n-gram size (default 4 for BLEU-4)
        
    Returns:
        BLEU score between 0.0 and 1.0
    """
    import math
    
    pred_tokens = get_tokens(prediction)
    ref_tokens = get_tokens(reference)
    
    if not pred_tokens:
        return 0.0
    
    # Compute n-gram precisions
    precisions = []
    for n in range(1, max_n + 1):
        pred_ngrams = Counter(
            tuple(pred_tokens[i:i+n]) for i in range(len(pred_tokens) - n + 1)
        )
        ref_ngrams = Counter(
            tuple(ref_tokens[i:i+n]) for i in range(len(ref_tokens) - n + 1)
        )
        
        if not pred_ngrams:
            precisions.append(0.0)
            continue
        
        clipped = sum(
            min(count, ref_ngrams.get(ngram, 0))
            for ngram, count in pred_ngrams.items()
        )
        precisions.append(clipped / sum(pred_ngrams.values()))
    
    # Geometric mean of precisions
    if 0 in precisions:
        return 0.0
    
    log_precisions = [math.log(p) for p in precisions]
    geo_mean = math.exp(sum(log_precisions) / len(log_precisions))
    
    # Brevity penalty
    bp = 1.0 if len(pred_tokens) >= len(ref_tokens) else math.exp(
        1 - len(ref_tokens) / len(pred_tokens)
    )
    
    return bp * geo_mean


def compute_rouge_l(prediction: str, reference: str) -> float:
    """
    Compute ROUGE-L F1 score based on Longest Common Subsequence.
    
    Args:
        prediction: Generated text
        reference: Reference text
        
    Returns:
        ROUGE-L F1 score between 0.0 and 1.0
    """
    pred_tokens = get_tokens(prediction)
    ref_tokens = get_tokens(reference)
    
    if not pred_tokens or not ref_tokens:
        return 0.0
    
    # Compute LCS length using dynamic programming
    m, n = len(pred_tokens), len(ref_tokens)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if pred_tokens[i-1] == ref_tokens[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    
    lcs_length = dp[m][n]
    
    precision = lcs_length / m
    recall = lcs_length / n
    
    if precision + recall == 0:
        return 0.0
    
    return 2 * precision * recall / (precision + recall)

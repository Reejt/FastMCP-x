"""
Tests for FastMCP Evaluation Framework

Tests metrics computation, LLM judge, and benchmark runner.
"""

import pytest
from typing import Dict, Any


class TestAnswerMetrics:
    """Tests for answer quality metrics."""
    
    def test_exact_match_identical(self):
        """Test EM with identical strings."""
        from evaluation.metrics import compute_exact_match
        
        assert compute_exact_match("hello world", "hello world") == 1.0
    
    def test_exact_match_normalized(self):
        """Test EM with normalization (case, punctuation, articles)."""
        from evaluation.metrics import compute_exact_match
        
        # Should match after normalization
        assert compute_exact_match("The Answer!", "answer") == 1.0
        assert compute_exact_match("A Big Cat", "big cat") == 1.0
    
    def test_exact_match_different(self):
        """Test EM with different strings."""
        from evaluation.metrics import compute_exact_match
        
        assert compute_exact_match("hello", "goodbye") == 0.0
    
    def test_f1_identical(self):
        """Test F1 with identical strings."""
        from evaluation.metrics import compute_f1
        
        assert compute_f1("the quick brown fox", "the quick brown fox") == 1.0
    
    def test_f1_partial_overlap(self):
        """Test F1 with partial token overlap."""
        from evaluation.metrics import compute_f1
        
        # "quick brown" and "slow brown" share "brown"
        f1 = compute_f1("quick brown", "slow brown")
        assert 0.0 < f1 < 1.0
        
        # More overlap = higher F1
        f1_high = compute_f1("quick brown fox", "quick brown dog")
        assert f1_high > f1
    
    def test_f1_no_overlap(self):
        """Test F1 with no token overlap."""
        from evaluation.metrics import compute_f1
        
        assert compute_f1("hello", "goodbye") == 0.0
    
    def test_f1_empty_strings(self):
        """Test F1 edge cases with empty strings."""
        from evaluation.metrics import compute_f1
        
        assert compute_f1("", "") == 1.0  # Both empty = perfect match
        assert compute_f1("hello", "") == 0.0
        assert compute_f1("", "hello") == 0.0


class TestRetrievalMetrics:
    """Tests for retrieval quality metrics."""
    
    def test_recall_at_k_perfect(self):
        """Test recall when all relevant docs are retrieved."""
        from evaluation.metrics import compute_recall_at_k
        
        retrieved = ["a", "b", "c", "d", "e"]
        relevant = {"a", "b"}
        
        assert compute_recall_at_k(retrieved, relevant, k=5) == 1.0
        assert compute_recall_at_k(retrieved, relevant, k=2) == 1.0
    
    def test_recall_at_k_partial(self):
        """Test recall when only some relevant docs retrieved in top-K."""
        from evaluation.metrics import compute_recall_at_k
        
        retrieved = ["a", "x", "b", "y", "z"]
        relevant = {"a", "b", "c"}  # c not in retrieved
        
        # At k=5: found 2/3
        assert compute_recall_at_k(retrieved, relevant, k=5) == 2/3
        
        # At k=1: found 1/3
        assert compute_recall_at_k(retrieved, relevant, k=1) == 1/3
    
    def test_recall_at_k_none(self):
        """Test recall when no relevant docs in top-K."""
        from evaluation.metrics import compute_recall_at_k
        
        retrieved = ["x", "y", "z"]
        relevant = {"a", "b"}
        
        assert compute_recall_at_k(retrieved, relevant, k=3) == 0.0
    
    def test_precision_at_k(self):
        """Test precision@K computation."""
        from evaluation.metrics import compute_precision_at_k
        
        retrieved = ["a", "x", "b", "y", "z"]
        relevant = {"a", "b", "c"}
        
        # At k=5: 2 relevant out of 5 retrieved
        assert compute_precision_at_k(retrieved, relevant, k=5) == 2/5
        
        # At k=1: 1 relevant out of 1 retrieved
        assert compute_precision_at_k(retrieved, relevant, k=1) == 1.0
    
    def test_hit_rate(self):
        """Test hit rate (binary recall)."""
        from evaluation.metrics import compute_hit_rate
        
        # Hit
        retrieved = ["x", "a", "y"]
        relevant = {"a"}
        assert compute_hit_rate(retrieved, relevant, k=3) == 1.0
        
        # No hit
        retrieved = ["x", "y", "z"]
        assert compute_hit_rate(retrieved, relevant, k=3) == 0.0
    
    def test_mrr(self):
        """Test Mean Reciprocal Rank."""
        from evaluation.metrics import compute_mrr
        
        relevant = {"target"}
        
        # Target at position 1: MRR = 1/1
        assert compute_mrr(["target", "x", "y"], relevant) == 1.0
        
        # Target at position 2: MRR = 1/2
        assert compute_mrr(["x", "target", "y"], relevant) == 0.5
        
        # Target at position 3: MRR = 1/3
        assert compute_mrr(["x", "y", "target"], relevant) == pytest.approx(1/3)
        
        # Target not found: MRR = 0
        assert compute_mrr(["x", "y", "z"], relevant) == 0.0


class TestRetrievalMetricsClass:
    """Tests for RetrievalMetrics aggregation class."""
    
    def test_compute_single(self):
        """Test computing metrics for a single query."""
        from evaluation.metrics import RetrievalMetrics
        
        retrieved = ["a", "b", "c", "d", "e"]
        relevant = {"a", "c"}
        
        metrics = RetrievalMetrics.compute(retrieved, relevant)
        
        assert metrics.recall_at_5 == 1.0  # Both found in top 5
        assert metrics.precision_at_5 == 2/5
        assert metrics.mrr == 1.0  # First relevant at position 1
        assert metrics.num_samples == 1
    
    def test_aggregation(self):
        """Test aggregating metrics from multiple queries."""
        from evaluation.metrics import RetrievalMetrics
        
        m1 = RetrievalMetrics(recall_at_5=1.0, mrr=1.0, num_samples=1)
        m2 = RetrievalMetrics(recall_at_5=0.5, mrr=0.5, num_samples=1)
        
        combined = m1 + m2
        assert combined.num_samples == 2
        
        avg = combined.average()
        assert avg.recall_at_5 == 0.75
        assert avg.mrr == 0.75


class TestAnswerMetricsClass:
    """Tests for AnswerMetrics aggregation class."""
    
    def test_compute_single(self):
        """Test computing metrics for a single prediction."""
        from evaluation.metrics import AnswerMetrics
        
        metrics = AnswerMetrics.compute("the quick fox", "quick brown fox")
        
        assert 0 < metrics.f1 < 1  # Partial match
        assert metrics.exact_match == 0.0
        assert metrics.num_samples == 1
    
    def test_multi_reference(self):
        """Test metrics with multiple valid answers."""
        from evaluation.metrics import AnswerMetrics
        
        prediction = "42"
        references = ["42", "forty-two", "forty two"]
        
        metrics = AnswerMetrics.compute_multi_reference(prediction, references)
        
        assert metrics.exact_match == 1.0  # Matches first reference
        assert metrics.f1 == 1.0


class TestTextSimilarityMetrics:
    """Tests for BLEU and ROUGE-L."""
    
    def test_bleu_identical(self):
        """Test BLEU with identical text."""
        from evaluation.metrics import compute_bleu
        
        bleu = compute_bleu("the cat sat on mat", "the cat sat on mat")
        assert bleu > 0.9
    
    def test_bleu_different(self):
        """Test BLEU with different text."""
        from evaluation.metrics import compute_bleu
        
        bleu = compute_bleu("hello world", "goodbye moon")
        assert bleu < 0.1
    
    def test_rouge_l_identical(self):
        """Test ROUGE-L with identical text."""
        from evaluation.metrics import compute_rouge_l
        
        rouge = compute_rouge_l("the quick brown fox", "the quick brown fox")
        assert rouge == 1.0
    
    def test_rouge_l_partial(self):
        """Test ROUGE-L with partial match."""
        from evaluation.metrics import compute_rouge_l
        
        # LCS = "quick fox"
        rouge = compute_rouge_l("the quick fox jumps", "quick brown fox")
        assert 0 < rouge < 1


class TestBenchmark:
    """Tests for benchmark infrastructure."""
    
    def test_test_dataset_creation(self):
        """Test creating a test dataset."""
        from evaluation.benchmark import TestDataset, TestCase
        
        dataset = TestDataset("test")
        dataset.add(TestCase(
            id="q1",
            question="What is 2+2?",
            expected_answer="4"
        ))
        
        assert len(dataset) == 1
        assert dataset.test_cases[0].question == "What is 2+2?"
    
    def test_qa_pair_convenience(self):
        """Test add_qa_pair convenience method."""
        from evaluation.benchmark import TestDataset
        
        dataset = TestDataset("test")
        dataset.add_qa_pair("What color is the sky?", "blue")
        
        assert len(dataset) == 1
        assert dataset.test_cases[0].expected_answer == "blue"
    
    def test_sanity_dataset(self):
        """Test pre-built sanity check dataset."""
        from evaluation.benchmark import create_fastmcp_sanity_dataset
        
        dataset = create_fastmcp_sanity_dataset()
        
        assert len(dataset) >= 5
        assert any(tc.category == "retrieval" for tc in dataset)
    
    def test_benchmark_result_to_dict(self):
        """Test BenchmarkResult serialization."""
        from evaluation.benchmark import BenchmarkResult
        
        result = BenchmarkResult(
            name="test",
            timestamp="2024-01-01",
            num_samples=10,
            avg_answer_f1=0.85,
            avg_answer_em=0.7,
            avg_retrieval_recall_at_5=0.9,
            avg_retrieval_mrr=0.8,
            avg_llm_judge_score=0.75,
            avg_latency_ms=150.5,
            results_by_category={},
            individual_results=[]
        )
        
        d = result.to_dict()
        assert d["metrics"]["answer_f1"] == 0.85
        assert d["metrics"]["retrieval_recall@5"] == 0.9


class TestLLMJudge:
    """Tests for LLM-as-judge (mocked)."""
    
    def test_judgment_parsing(self):
        """Test parsing LLM judge responses."""
        from evaluation.llm_judge import LLMJudge, JudgmentResult
        
        judge = LLMJudge()
        
        # Test valid response parsing
        response = '{"judgment": "VALID", "score": 0.9, "reasoning": "Good answer"}'
        result = judge._parse_judgment(response)
        
        assert result.result == JudgmentResult.VALID
        assert result.score == 0.9
        assert "Good answer" in result.reasoning
    
    def test_judgment_parsing_invalid_json(self):
        """Test handling of invalid JSON responses."""
        from evaluation.llm_judge import LLMJudge, JudgmentResult
        
        judge = LLMJudge()
        
        result = judge._parse_judgment("This is not JSON")
        
        assert result.result == JudgmentResult.UNKNOWN
        assert result.confidence == 0.0


class TestRAGASEvaluator:
    """Tests for RAGAS integration (mocked)."""
    
    def test_ragas_scores_to_dict(self):
        """Test RAGASScores serialization."""
        from evaluation.ragas_eval import RAGASScores
        
        scores = RAGASScores(
            answer_relevancy=0.85,
            context_precision=0.9,
            context_recall=0.8,
            faithfulness=0.95,
            overall_score=0.875
        )
        
        d = scores.to_dict()
        assert d["answer_relevancy"] == 0.85
        assert d["faithfulness"] == 0.95


# Integration test (requires Ollama running)
@pytest.mark.integration
class TestIntegration:
    """Integration tests requiring Ollama."""
    
    def test_llm_judge_real(self):
        """Test LLM judge with real Ollama."""
        from evaluation.llm_judge import LLMJudge
        
        judge = LLMJudge()
        
        result = judge.evaluate(
            question="What is the capital of France?",
            context="France is a country in Europe. Paris is the capital of France.",
            answer="The capital of France is Paris."
        )
        
        # Should get reasonable scores
        assert result.context_validity.score >= 0.5
        assert result.answer_faithfulness.score >= 0.5
        assert result.answer_relevancy.score >= 0.5

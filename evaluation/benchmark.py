"""
Benchmark Runner for FastMCP

Provides infrastructure for running evaluation benchmarks:
- Test dataset management (synthetic and real examples)
- Benchmark execution with multiple metrics
- Result aggregation and reporting
- Regression tracking over time
"""

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from evaluation.metrics import (
    AnswerMetrics,
    RetrievalMetrics,
    compute_exact_match,
    compute_f1,
    compute_recall_at_k,
)
from evaluation.llm_judge import LLMJudge, LLMJudgeResult


@dataclass
class TestCase:
    """A single test case for evaluation."""
    id: str
    question: str
    expected_answer: Optional[str] = None  # For EM/F1 computation
    expected_answers: Optional[List[str]] = None  # Multiple valid answers
    relevant_doc_ids: Optional[Set[str]] = None  # For retrieval metrics
    context: Optional[str] = None  # Ground truth context
    category: str = "general"  # For grouping results
    difficulty: str = "medium"  # easy/medium/hard
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TestResult:
    """Result of running a single test case."""
    test_id: str
    question: str
    generated_answer: str
    retrieved_context: str
    retrieved_doc_ids: List[str]
    answer_metrics: Optional[AnswerMetrics] = None
    retrieval_metrics: Optional[RetrievalMetrics] = None
    llm_judge_result: Optional[LLMJudgeResult] = None
    latency_ms: float = 0.0
    success: bool = True
    error: Optional[str] = None


@dataclass
class BenchmarkResult:
    """Aggregated results from a benchmark run."""
    name: str
    timestamp: str
    num_samples: int
    avg_answer_f1: float
    avg_answer_em: float
    avg_retrieval_recall_at_5: float
    avg_retrieval_mrr: float
    avg_llm_judge_score: float
    avg_latency_ms: float
    results_by_category: Dict[str, Dict[str, float]]
    individual_results: List[TestResult]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "name": self.name,
            "timestamp": self.timestamp,
            "num_samples": self.num_samples,
            "metrics": {
                "answer_f1": round(self.avg_answer_f1, 4),
                "answer_em": round(self.avg_answer_em, 4),
                "retrieval_recall@5": round(self.avg_retrieval_recall_at_5, 4),
                "retrieval_mrr": round(self.avg_retrieval_mrr, 4),
                "llm_judge_score": round(self.avg_llm_judge_score, 4),
                "avg_latency_ms": round(self.avg_latency_ms, 2),
            },
            "by_category": self.results_by_category,
        }
    
    def save(self, filepath: str):
        """Save results to JSON file."""
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
    
    def print_summary(self):
        """Print a formatted summary of results."""
        print("\n" + "=" * 60)
        print(f"📊 BENCHMARK RESULTS: {self.name}")
        print("=" * 60)
        print(f"Timestamp: {self.timestamp}")
        print(f"Samples: {self.num_samples}")
        print()
        print("Answer Quality:")
        print(f"  • F1 Score:     {self.avg_answer_f1:.4f}")
        print(f"  • Exact Match:  {self.avg_answer_em:.4f}")
        print()
        print("Retrieval Quality:")
        print(f"  • Recall@5:     {self.avg_retrieval_recall_at_5:.4f}")
        print(f"  • MRR:          {self.avg_retrieval_mrr:.4f}")
        print()
        print("LLM Judge:")
        print(f"  • Overall:      {self.avg_llm_judge_score:.4f}")
        print()
        print(f"Avg Latency: {self.avg_latency_ms:.2f}ms")
        print("=" * 60 + "\n")


class TestDataset:
    """
    Manages test datasets for evaluation.
    
    Supports loading from files or creating synthetic examples.
    """
    
    def __init__(self, name: str):
        self.name = name
        self.test_cases: List[TestCase] = []
    
    def add(self, test_case: TestCase):
        """Add a test case to the dataset."""
        self.test_cases.append(test_case)
    
    def add_qa_pair(
        self,
        question: str,
        answer: str,
        relevant_docs: Optional[Set[str]] = None,
        category: str = "general"
    ):
        """Convenience method to add a simple Q&A pair."""
        self.test_cases.append(TestCase(
            id=f"qa_{len(self.test_cases)}",
            question=question,
            expected_answer=answer,
            relevant_doc_ids=relevant_docs,
            category=category
        ))
    
    def load_from_json(self, filepath: str):
        """Load test cases from a JSON file."""
        with open(filepath, "r") as f:
            data = json.load(f)
        
        for item in data.get("test_cases", []):
            self.test_cases.append(TestCase(
                id=item.get("id", f"test_{len(self.test_cases)}"),
                question=item["question"],
                expected_answer=item.get("answer"),
                expected_answers=item.get("answers"),
                relevant_doc_ids=set(item.get("relevant_docs", [])),
                context=item.get("context"),
                category=item.get("category", "general"),
                difficulty=item.get("difficulty", "medium"),
                metadata=item.get("metadata", {})
            ))
    
    def save_to_json(self, filepath: str):
        """Save test cases to a JSON file."""
        data = {
            "name": self.name,
            "test_cases": [
                {
                    "id": tc.id,
                    "question": tc.question,
                    "answer": tc.expected_answer,
                    "answers": tc.expected_answers,
                    "relevant_docs": list(tc.relevant_doc_ids or []),
                    "context": tc.context,
                    "category": tc.category,
                    "difficulty": tc.difficulty,
                    "metadata": tc.metadata,
                }
                for tc in self.test_cases
            ]
        }
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
    
    def filter_by_category(self, category: str) -> "TestDataset":
        """Return a new dataset with only the specified category."""
        filtered = TestDataset(f"{self.name}_{category}")
        filtered.test_cases = [tc for tc in self.test_cases if tc.category == category]
        return filtered
    
    def __len__(self) -> int:
        return len(self.test_cases)
    
    def __iter__(self):
        return iter(self.test_cases)


# Pre-built synthetic test datasets
def create_fastmcp_sanity_dataset() -> TestDataset:
    """
    Create a small sanity-check dataset for FastMCP.
    
    Contains 10 test cases covering common RAG scenarios.
    """
    dataset = TestDataset("fastmcp_sanity")
    
    # Document retrieval tests
    dataset.add(TestCase(
        id="retrieval_1",
        question="What is FastMCP?",
        expected_answer="FastMCP is a Model Context Protocol server for document-aware queries",
        category="retrieval",
        difficulty="easy"
    ))
    
    dataset.add(TestCase(
        id="retrieval_2", 
        question="What embedding model does FastMCP use?",
        expected_answer="all-MiniLM-L6-v2 with 384 dimensions",
        category="retrieval",
        difficulty="medium"
    ))
    
    dataset.add(TestCase(
        id="retrieval_3",
        question="How does semantic search work in FastMCP?",
        expected_answer="pgvector similarity search using the cosine distance operator",
        category="retrieval",
        difficulty="medium"
    ))
    
    # Summarization tests
    dataset.add(TestCase(
        id="summary_1",
        question="Summarize the main features of FastMCP",
        expected_answers=[
            "document ingestion, semantic search, LLM queries, web search",
            "FastMCP provides document ingestion, semantic search, and LLM-powered queries"
        ],
        category="summarization",
        difficulty="medium"
    ))
    
    # Multi-hop reasoning tests
    dataset.add(TestCase(
        id="multihop_1",
        question="If I upload a PDF, what steps does FastMCP take to make it searchable?",
        expected_answer="extracts text, chunks content, generates embeddings, stores in pgvector",
        category="reasoning",
        difficulty="hard"
    ))
    
    # Conversational tests
    dataset.add(TestCase(
        id="conv_1",
        question="What was mentioned in the previous message?",
        expected_answer="",  # Depends on context
        category="conversational",
        difficulty="medium",
        metadata={"requires_history": True}
    ))
    
    # Code-related tests
    dataset.add(TestCase(
        id="code_1",
        question="How do I add a new MCP tool?",
        expected_answer="use the @mcp.tool decorator in server/main.py",
        category="code",
        difficulty="medium"
    ))
    
    # Edge cases
    dataset.add(TestCase(
        id="edge_1",
        question="What is the capital of France?",
        expected_answer="Paris",
        category="out_of_domain",
        difficulty="easy"
    ))
    
    dataset.add(TestCase(
        id="edge_2",
        question="",  # Empty query
        expected_answer="",
        category="edge_case",
        difficulty="easy"
    ))
    
    dataset.add(TestCase(
        id="edge_3",
        question="a" * 5000,  # Very long query
        expected_answer="",
        category="edge_case",
        difficulty="easy"
    ))
    
    return dataset


class BenchmarkRunner:
    """
    Executes benchmarks against a RAG system.
    
    Orchestrates test execution, metric computation, and result aggregation.
    """
    
    def __init__(
        self,
        query_function: Callable[[str], Dict[str, Any]],
        use_llm_judge: bool = True,
        llm_judge_model: str = "llama3:8b",
        results_dir: str = "evaluation/results"
    ):
        """
        Initialize the benchmark runner.
        
        Args:
            query_function: Function that takes a question and returns
                           {"answer": str, "context": str, "doc_ids": List[str]}
            use_llm_judge: Whether to run LLM-as-judge evaluations
            llm_judge_model: Model to use for LLM judge
            results_dir: Directory to save results
        """
        self.query_function = query_function
        self.use_llm_judge = use_llm_judge
        self.results_dir = results_dir
        
        if use_llm_judge:
            self.llm_judge = LLMJudge(model=llm_judge_model)
        else:
            self.llm_judge = None
    
    def run_single(self, test_case: TestCase) -> TestResult:
        """Run evaluation on a single test case."""
        start_time = time.time()
        
        try:
            # Execute query
            result = self.query_function(test_case.question)
            
            generated_answer = result.get("answer", "")
            retrieved_context = result.get("context", "")
            retrieved_doc_ids = result.get("doc_ids", [])
            
            latency_ms = (time.time() - start_time) * 1000
            
            # Compute answer metrics
            answer_metrics = None
            if test_case.expected_answers:
                answer_metrics = AnswerMetrics.compute_multi_reference(
                    generated_answer, test_case.expected_answers
                )
            elif test_case.expected_answer:
                answer_metrics = AnswerMetrics.compute(
                    generated_answer, test_case.expected_answer
                )
            
            # Compute retrieval metrics
            retrieval_metrics = None
            if test_case.relevant_doc_ids:
                retrieval_metrics = RetrievalMetrics.compute(
                    retrieved_doc_ids, test_case.relevant_doc_ids
                )
            
            # Run LLM judge
            llm_judge_result = None
            if self.llm_judge and generated_answer and retrieved_context:
                llm_judge_result = self.llm_judge.evaluate(
                    test_case.question,
                    retrieved_context,
                    generated_answer
                )
            
            return TestResult(
                test_id=test_case.id,
                question=test_case.question,
                generated_answer=generated_answer,
                retrieved_context=retrieved_context,
                retrieved_doc_ids=retrieved_doc_ids,
                answer_metrics=answer_metrics,
                retrieval_metrics=retrieval_metrics,
                llm_judge_result=llm_judge_result,
                latency_ms=latency_ms,
                success=True
            )
            
        except Exception as e:
            return TestResult(
                test_id=test_case.id,
                question=test_case.question,
                generated_answer="",
                retrieved_context="",
                retrieved_doc_ids=[],
                latency_ms=(time.time() - start_time) * 1000,
                success=False,
                error=str(e)
            )
    
    def run(
        self,
        dataset: TestDataset,
        benchmark_name: Optional[str] = None
    ) -> BenchmarkResult:
        """
        Run evaluation on a full dataset.
        
        Args:
            dataset: TestDataset to evaluate
            benchmark_name: Optional name for this benchmark run
            
        Returns:
            BenchmarkResult with aggregated metrics
        """
        name = benchmark_name or dataset.name
        results: List[TestResult] = []
        
        # Track aggregates
        total_f1 = 0.0
        total_em = 0.0
        total_recall = 0.0
        total_mrr = 0.0
        total_llm_score = 0.0
        total_latency = 0.0
        
        answer_count = 0
        retrieval_count = 0
        llm_count = 0
        
        category_metrics: Dict[str, Dict[str, List[float]]] = {}
        
        print(f"\n🚀 Running benchmark: {name}")
        print(f"   Test cases: {len(dataset)}")
        print("-" * 40)
        
        for i, test_case in enumerate(dataset):
            print(f"   [{i+1}/{len(dataset)}] {test_case.id}...", end=" ")
            
            result = self.run_single(test_case)
            results.append(result)
            
            if result.success:
                print("✓")
            else:
                print(f"✗ ({result.error})")
            
            # Aggregate answer metrics
            if result.answer_metrics:
                total_f1 += result.answer_metrics.f1
                total_em += result.answer_metrics.exact_match
                answer_count += 1
            
            # Aggregate retrieval metrics
            if result.retrieval_metrics:
                total_recall += result.retrieval_metrics.recall_at_5
                total_mrr += result.retrieval_metrics.mrr
                retrieval_count += 1
            
            # Aggregate LLM judge
            if result.llm_judge_result:
                total_llm_score += result.llm_judge_result.overall_score
                llm_count += 1
            
            total_latency += result.latency_ms
            
            # Track by category
            cat = test_case.category
            if cat not in category_metrics:
                category_metrics[cat] = {"f1": [], "em": [], "llm": []}
            
            if result.answer_metrics:
                category_metrics[cat]["f1"].append(result.answer_metrics.f1)
                category_metrics[cat]["em"].append(result.answer_metrics.exact_match)
            if result.llm_judge_result:
                category_metrics[cat]["llm"].append(result.llm_judge_result.overall_score)
        
        # Compute averages
        n = len(dataset) if dataset else 1
        
        results_by_category = {}
        for cat, metrics in category_metrics.items():
            results_by_category[cat] = {
                "avg_f1": sum(metrics["f1"]) / len(metrics["f1"]) if metrics["f1"] else 0.0,
                "avg_em": sum(metrics["em"]) / len(metrics["em"]) if metrics["em"] else 0.0,
                "avg_llm": sum(metrics["llm"]) / len(metrics["llm"]) if metrics["llm"] else 0.0,
                "count": len(metrics["f1"]) or len(metrics["llm"]) or 0,
            }
        
        benchmark_result = BenchmarkResult(
            name=name,
            timestamp=datetime.now().isoformat(),
            num_samples=len(dataset),
            avg_answer_f1=total_f1 / answer_count if answer_count else 0.0,
            avg_answer_em=total_em / answer_count if answer_count else 0.0,
            avg_retrieval_recall_at_5=total_recall / retrieval_count if retrieval_count else 0.0,
            avg_retrieval_mrr=total_mrr / retrieval_count if retrieval_count else 0.0,
            avg_llm_judge_score=total_llm_score / llm_count if llm_count else 0.0,
            avg_latency_ms=total_latency / n,
            results_by_category=results_by_category,
            individual_results=results
        )
        
        # Save results
        results_path = os.path.join(
            self.results_dir,
            f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        benchmark_result.save(results_path)
        print(f"\n📁 Results saved to: {results_path}")
        
        return benchmark_result


def compare_benchmarks(
    result_a: BenchmarkResult,
    result_b: BenchmarkResult
) -> Dict[str, float]:
    """
    Compare two benchmark results to track regression/improvement.
    
    Args:
        result_a: Baseline benchmark result
        result_b: New benchmark result
        
    Returns:
        Dict with percentage changes for each metric
    """
    def pct_change(old: float, new: float) -> float:
        if old == 0:
            return 100.0 if new > 0 else 0.0
        return ((new - old) / old) * 100
    
    return {
        "f1_change_%": pct_change(result_a.avg_answer_f1, result_b.avg_answer_f1),
        "em_change_%": pct_change(result_a.avg_answer_em, result_b.avg_answer_em),
        "recall_change_%": pct_change(
            result_a.avg_retrieval_recall_at_5, 
            result_b.avg_retrieval_recall_at_5
        ),
        "mrr_change_%": pct_change(result_a.avg_retrieval_mrr, result_b.avg_retrieval_mrr),
        "llm_judge_change_%": pct_change(
            result_a.avg_llm_judge_score,
            result_b.avg_llm_judge_score
        ),
        "latency_change_%": pct_change(
            result_a.avg_latency_ms,
            result_b.avg_latency_ms
        ),
    }

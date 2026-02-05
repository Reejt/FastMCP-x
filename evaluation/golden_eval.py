#!/usr/bin/env python3
"""
FastMCP Golden Dataset Evaluation Pipeline

Runs the full RAG pipeline against the golden dataset and produces
a comprehensive evaluation report with actionable insights.

Usage:
    python -m evaluation.golden_eval
    python -m evaluation.golden_eval --output report.json
    python -m evaluation.golden_eval --verbose
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation.metrics import (
    AnswerMetrics,
    RetrievalMetrics,
    compute_f1,
    compute_exact_match,
    compute_recall_at_k,
)
from evaluation.llm_judge import LLMJudge


# ============================================================================
# Data Structures
# ============================================================================

@dataclass
class GoldenTestCase:
    """A single golden test case."""
    id: str
    question: str
    ground_truth: str
    source_doc_id: str
    category: str = "general"
    difficulty: str = "medium"


@dataclass
class EvaluationResult:
    """Result of evaluating a single test case."""
    test_id: str
    question: str
    ground_truth: str
    source_doc_id: str
    
    # RAG outputs
    generated_answer: str = ""
    retrieved_chunks: List[str] = field(default_factory=list)
    retrieved_doc_ids: List[str] = field(default_factory=list)
    retrieved_scores: List[float] = field(default_factory=list)
    
    # Metrics
    recall_at_5: float = 0.0
    f1_score: float = 0.0
    exact_match: float = 0.0
    faithfulness_score: float = 0.0
    
    # Metadata
    latency_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class EvaluationReport:
    """Complete evaluation report."""
    timestamp: str
    num_samples: int
    
    # Aggregate metrics
    avg_recall_at_5: float
    avg_f1: float
    avg_em: float
    avg_faithfulness: float
    avg_latency_ms: float
    
    # Breakdown by category
    by_category: Dict[str, Dict[str, float]]
    by_difficulty: Dict[str, Dict[str, float]]
    
    # Individual results
    results: List[EvaluationResult]
    
    # Issues identified
    low_recall_cases: List[str]  # Test IDs with recall < 0.5
    low_faithfulness_cases: List[str]  # Test IDs with faithfulness < 0.5
    failed_cases: List[str]  # Test IDs that errored


# ============================================================================
# Dataset Loading
# ============================================================================

def load_golden_dataset(filepath: str = None) -> List[GoldenTestCase]:
    """Load the golden evaluation dataset."""
    if filepath is None:
        filepath = os.path.join(
            os.path.dirname(__file__),
            "datasets",
            "golden_dataset.json"
        )
    
    with open(filepath, "r") as f:
        data = json.load(f)
    
    test_cases = []
    for item in data.get("test_cases", []):
        test_cases.append(GoldenTestCase(
            id=item["id"],
            question=item["question"],
            ground_truth=item["ground_truth"],
            source_doc_id=item["source_doc_id"],
            category=item.get("category", "general"),
            difficulty=item.get("difficulty", "medium"),
        ))
    
    return test_cases


# ============================================================================
# RAG Pipeline Interface
# ============================================================================

def query_rag_pipeline(question: str) -> Dict[str, Any]:
    """
    Query the FastMCP RAG pipeline.
    
    Returns:
        Dict with keys:
        - answer: str
        - chunks: List[str] - retrieved text chunks
        - doc_ids: List[str] - source document IDs
        - scores: List[float] - similarity scores
    """
    try:
        from server.query_handler import answer_query, semantic_search_pgvector
        
        # Get retrieval results
        search_results = semantic_search_pgvector(question, top_k=5)
        
        chunks = []
        doc_ids = []
        scores = []
        
        for result in search_results:
            if len(result) >= 3:
                content, similarity, filename = result[:3]
                chunks.append(content)
                doc_ids.append(filename)
                scores.append(float(similarity))
        
        # Get answer
        answer = answer_query(question)
        
        return {
            "answer": answer,
            "chunks": chunks,
            "doc_ids": doc_ids,
            "scores": scores,
        }
        
    except ImportError as e:
        # Fallback for testing without full backend
        return {
            "answer": f"[Mock] Answer for: {question}",
            "chunks": ["Mock chunk 1", "Mock chunk 2"],
            "doc_ids": ["mock_doc.pdf"],
            "scores": [0.8, 0.6],
            "error": f"Backend not available: {e}"
        }
    except Exception as e:
        return {
            "answer": "",
            "chunks": [],
            "doc_ids": [],
            "scores": [],
            "error": str(e)
        }


# ============================================================================
# Evaluation Pipeline
# ============================================================================

class GoldenEvaluator:
    """
    Evaluates the RAG system against the golden dataset.
    """
    
    def __init__(
        self,
        use_llm_judge: bool = True,
        llm_model: str = "llama3:8b",
        verbose: bool = False
    ):
        self.use_llm_judge = use_llm_judge
        self.verbose = verbose
        
        if use_llm_judge:
            self.judge = LLMJudge(model=llm_model)
        else:
            self.judge = None
    
    def evaluate_single(self, test_case: GoldenTestCase) -> EvaluationResult:
        """Evaluate a single test case."""
        start_time = time.time()
        
        # Query RAG pipeline
        rag_result = query_rag_pipeline(test_case.question)
        
        latency_ms = (time.time() - start_time) * 1000
        
        result = EvaluationResult(
            test_id=test_case.id,
            question=test_case.question,
            ground_truth=test_case.ground_truth,
            source_doc_id=test_case.source_doc_id,
            generated_answer=rag_result.get("answer", ""),
            retrieved_chunks=rag_result.get("chunks", []),
            retrieved_doc_ids=rag_result.get("doc_ids", []),
            retrieved_scores=rag_result.get("scores", []),
            latency_ms=latency_ms,
            error=rag_result.get("error"),
        )
        
        # Compute Recall@5 (did we retrieve the source document?)
        source_doc = test_case.source_doc_id.lower()
        retrieved_lower = [d.lower() for d in result.retrieved_doc_ids]
        
        # Check if source doc (or part of it) is in retrieved docs
        source_found = any(
            source_doc in doc or doc in source_doc 
            for doc in retrieved_lower
        )
        result.recall_at_5 = 1.0 if source_found else 0.0
        
        # Compute F1 and EM against ground truth
        result.f1_score = compute_f1(
            result.generated_answer,
            test_case.ground_truth
        )
        result.exact_match = compute_exact_match(
            result.generated_answer,
            test_case.ground_truth
        )
        
        # LLM Judge for faithfulness
        if self.judge and result.retrieved_chunks:
            context = "\n".join(result.retrieved_chunks[:3])
            judge_result = self.judge.evaluate_faithfulness(
                question=test_case.question,
                context=context,
                answer=result.generated_answer
            )
            result.faithfulness_score = judge_result.score
        
        return result
    
    def evaluate_all(
        self,
        test_cases: List[GoldenTestCase]
    ) -> EvaluationReport:
        """Evaluate all test cases and generate report."""
        
        print("\n" + "=" * 60)
        print("🔬 FASTMCP GOLDEN DATASET EVALUATION")
        print("=" * 60)
        print(f"Test cases: {len(test_cases)}")
        print(f"LLM Judge: {'enabled' if self.use_llm_judge else 'disabled'}")
        print("-" * 60)
        
        results: List[EvaluationResult] = []
        
        # Track aggregates
        total_recall = 0.0
        total_f1 = 0.0
        total_em = 0.0
        total_faithfulness = 0.0
        total_latency = 0.0
        faithfulness_count = 0
        
        # Track by category/difficulty
        category_metrics: Dict[str, Dict[str, List[float]]] = {}
        difficulty_metrics: Dict[str, Dict[str, List[float]]] = {}
        
        # Track problem cases
        low_recall_cases = []
        low_faithfulness_cases = []
        failed_cases = []
        
        for i, test_case in enumerate(test_cases):
            status = "⏳"
            print(f"[{i+1:2}/{len(test_cases)}] {test_case.id[:20]:<20}", end=" ")
            
            result = self.evaluate_single(test_case)
            results.append(result)
            
            if result.error:
                status = "❌"
                failed_cases.append(test_case.id)
            else:
                # Update aggregates
                total_recall += result.recall_at_5
                total_f1 += result.f1_score
                total_em += result.exact_match
                total_latency += result.latency_ms
                
                if result.faithfulness_score > 0:
                    total_faithfulness += result.faithfulness_score
                    faithfulness_count += 1
                
                # Track issues
                if result.recall_at_5 < 0.5:
                    low_recall_cases.append(test_case.id)
                if result.faithfulness_score < 0.5 and result.faithfulness_score > 0:
                    low_faithfulness_cases.append(test_case.id)
                
                # Determine status icon
                if result.recall_at_5 >= 0.5 and result.f1_score >= 0.5:
                    status = "✅"
                elif result.recall_at_5 >= 0.5 or result.f1_score >= 0.3:
                    status = "⚠️"
                else:
                    status = "❌"
            
            # Track by category
            cat = test_case.category
            if cat not in category_metrics:
                category_metrics[cat] = {"recall": [], "f1": [], "faith": []}
            category_metrics[cat]["recall"].append(result.recall_at_5)
            category_metrics[cat]["f1"].append(result.f1_score)
            if result.faithfulness_score > 0:
                category_metrics[cat]["faith"].append(result.faithfulness_score)
            
            # Track by difficulty
            diff = test_case.difficulty
            if diff not in difficulty_metrics:
                difficulty_metrics[diff] = {"recall": [], "f1": [], "faith": []}
            difficulty_metrics[diff]["recall"].append(result.recall_at_5)
            difficulty_metrics[diff]["f1"].append(result.f1_score)
            if result.faithfulness_score > 0:
                difficulty_metrics[diff]["faith"].append(result.faithfulness_score)
            
            print(f"{status} R@5:{result.recall_at_5:.2f} F1:{result.f1_score:.2f} Faith:{result.faithfulness_score:.2f}")
            
            if self.verbose and result.f1_score < 0.5:
                print(f"       GT: {test_case.ground_truth[:50]}...")
                print(f"       Got: {result.generated_answer[:50]}...")
        
        # Compute category averages
        by_category = {}
        for cat, metrics in category_metrics.items():
            by_category[cat] = {
                "avg_recall": sum(metrics["recall"]) / len(metrics["recall"]) if metrics["recall"] else 0,
                "avg_f1": sum(metrics["f1"]) / len(metrics["f1"]) if metrics["f1"] else 0,
                "avg_faith": sum(metrics["faith"]) / len(metrics["faith"]) if metrics["faith"] else 0,
                "count": len(metrics["recall"]),
            }
        
        by_difficulty = {}
        for diff, metrics in difficulty_metrics.items():
            by_difficulty[diff] = {
                "avg_recall": sum(metrics["recall"]) / len(metrics["recall"]) if metrics["recall"] else 0,
                "avg_f1": sum(metrics["f1"]) / len(metrics["f1"]) if metrics["f1"] else 0,
                "avg_faith": sum(metrics["faith"]) / len(metrics["faith"]) if metrics["faith"] else 0,
                "count": len(metrics["recall"]),
            }
        
        n = len(test_cases)
        
        report = EvaluationReport(
            timestamp=datetime.now().isoformat(),
            num_samples=n,
            avg_recall_at_5=total_recall / n if n else 0,
            avg_f1=total_f1 / n if n else 0,
            avg_em=total_em / n if n else 0,
            avg_faithfulness=total_faithfulness / faithfulness_count if faithfulness_count else 0,
            avg_latency_ms=total_latency / n if n else 0,
            by_category=by_category,
            by_difficulty=by_difficulty,
            results=results,
            low_recall_cases=low_recall_cases,
            low_faithfulness_cases=low_faithfulness_cases,
            failed_cases=failed_cases,
        )
        
        return report


# ============================================================================
# Report Generation
# ============================================================================

def print_report(report: EvaluationReport):
    """Print a formatted evaluation report."""
    
    def status_icon(value: float, thresholds: Tuple[float, float] = (0.7, 0.5)) -> str:
        if value >= thresholds[0]:
            return "✅"
        elif value >= thresholds[1]:
            return "⚠️"
        else:
            return "❌"
    
    print("\n")
    print("=" * 60)
    print("📊 EVALUATION REPORT")
    print("=" * 60)
    print(f"Timestamp: {report.timestamp}")
    print(f"Samples:   {report.num_samples}")
    print()
    
    # Main metrics
    print("┌─────────────────────────────────────────────────────────┐")
    print("│                    AGGREGATE METRICS                    │")
    print("├─────────────────────────────────────────────────────────┤")
    
    recall_icon = status_icon(report.avg_recall_at_5)
    f1_icon = status_icon(report.avg_f1)
    em_icon = status_icon(report.avg_em, (0.5, 0.3))
    faith_icon = status_icon(report.avg_faithfulness)
    
    print(f"│  Retrieval Recall@5:  {report.avg_recall_at_5:.2f}  {recall_icon}                           │")
    print(f"│  Answer F1:           {report.avg_f1:.2f}  {f1_icon}                           │")
    print(f"│  Exact Match:         {report.avg_em:.2f}  {em_icon}                           │")
    print(f"│  Faithfulness:        {report.avg_faithfulness:.2f}  {faith_icon}                           │")
    print(f"│  Avg Latency:         {report.avg_latency_ms:.0f}ms                              │")
    print("└─────────────────────────────────────────────────────────┘")
    
    # By category
    if report.by_category:
        print("\n📁 BY CATEGORY:")
        print("-" * 50)
        for cat, metrics in sorted(report.by_category.items()):
            icon = status_icon(metrics["avg_f1"])
            print(f"  {cat:<15} R@5:{metrics['avg_recall']:.2f} F1:{metrics['avg_f1']:.2f} Faith:{metrics['avg_faith']:.2f} {icon} (n={metrics['count']})")
    
    # By difficulty
    if report.by_difficulty:
        print("\n📈 BY DIFFICULTY:")
        print("-" * 50)
        for diff in ["easy", "medium", "hard"]:
            if diff in report.by_difficulty:
                metrics = report.by_difficulty[diff]
                icon = status_icon(metrics["avg_f1"])
                print(f"  {diff:<15} R@5:{metrics['avg_recall']:.2f} F1:{metrics['avg_f1']:.2f} Faith:{metrics['avg_faith']:.2f} {icon} (n={metrics['count']})")
    
    # Issues
    print("\n⚠️  ISSUES IDENTIFIED:")
    print("-" * 50)
    
    if report.low_recall_cases:
        print(f"  Low Retrieval ({len(report.low_recall_cases)} cases):")
        for case_id in report.low_recall_cases[:5]:
            print(f"    - {case_id}")
        if len(report.low_recall_cases) > 5:
            print(f"    ... and {len(report.low_recall_cases) - 5} more")
    
    if report.low_faithfulness_cases:
        print(f"  Low Faithfulness ({len(report.low_faithfulness_cases)} cases):")
        for case_id in report.low_faithfulness_cases[:5]:
            print(f"    - {case_id}")
    
    if report.failed_cases:
        print(f"  Failed ({len(report.failed_cases)} cases):")
        for case_id in report.failed_cases[:5]:
            print(f"    - {case_id}")
    
    if not (report.low_recall_cases or report.low_faithfulness_cases or report.failed_cases):
        print("  None! 🎉")
    
    # Recommendations
    print("\n💡 RECOMMENDATIONS:")
    print("-" * 50)
    
    if report.avg_recall_at_5 < 0.7:
        print("  🔍 RETRIEVAL NEEDS WORK:")
        print("     - Check embedding quality (try different models)")
        print("     - Increase top_k or lower similarity threshold")
        print("     - Improve document chunking strategy")
    
    if report.avg_f1 < 0.6:
        print("  📝 ANSWER QUALITY NEEDS WORK:")
        print("     - Improve prompt engineering")
        print("     - Provide more context to LLM")
        print("     - Consider larger/better LLM model")
    
    if report.avg_faithfulness < 0.7:
        print("  🎯 FAITHFULNESS NEEDS WORK:")
        print("     - Add explicit grounding instructions to prompt")
        print("     - Reduce LLM temperature")
        print("     - Filter out low-relevance chunks from context")
    
    if report.avg_recall_at_5 >= 0.7 and report.avg_f1 >= 0.6 and report.avg_faithfulness >= 0.7:
        print("  ✅ System is performing well! Consider:")
        print("     - Adding more edge cases to golden dataset")
        print("     - Testing with real user queries")
        print("     - Setting up regression testing in CI/CD")
    
    print("\n" + "=" * 60 + "\n")


def save_report(report: EvaluationReport, filepath: str):
    """Save report to JSON file."""
    data = {
        "timestamp": report.timestamp,
        "num_samples": report.num_samples,
        "metrics": {
            "retrieval_recall_at_5": round(report.avg_recall_at_5, 4),
            "answer_f1": round(report.avg_f1, 4),
            "exact_match": round(report.avg_em, 4),
            "faithfulness": round(report.avg_faithfulness, 4),
            "avg_latency_ms": round(report.avg_latency_ms, 2),
        },
        "by_category": report.by_category,
        "by_difficulty": report.by_difficulty,
        "issues": {
            "low_recall": report.low_recall_cases,
            "low_faithfulness": report.low_faithfulness_cases,
            "failed": report.failed_cases,
        },
        "individual_results": [
            {
                "test_id": r.test_id,
                "question": r.question,
                "ground_truth": r.ground_truth,
                "generated_answer": r.generated_answer[:500],
                "retrieved_doc_ids": r.retrieved_doc_ids,
                "recall_at_5": r.recall_at_5,
                "f1_score": r.f1_score,
                "exact_match": r.exact_match,
                "faithfulness_score": r.faithfulness_score,
                "latency_ms": r.latency_ms,
            }
            for r in report.results
        ]
    }
    
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"📁 Report saved to: {filepath}")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Run FastMCP Golden Dataset Evaluation"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=None,
        help="Path to golden dataset JSON"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path to save report JSON"
    )
    parser.add_argument(
        "--no-llm-judge",
        action="store_true",
        help="Disable LLM-as-judge (faster but no faithfulness scores)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed output for failed cases"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="llama3:8b",
        help="LLM model for judge"
    )
    
    args = parser.parse_args()
    
    # Load dataset
    test_cases = load_golden_dataset(args.dataset)
    
    # Run evaluation
    evaluator = GoldenEvaluator(
        use_llm_judge=not args.no_llm_judge,
        llm_model=args.model,
        verbose=args.verbose,
    )
    
    report = evaluator.evaluate_all(test_cases)
    
    # Print report
    print_report(report)
    
    # Save if requested
    if args.output:
        save_report(report, args.output)
    else:
        # Auto-save to results dir
        output_path = os.path.join(
            os.path.dirname(__file__),
            "results",
            f"golden_eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        save_report(report, output_path)


if __name__ == "__main__":
    main()

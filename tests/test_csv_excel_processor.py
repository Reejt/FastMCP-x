"""
Test suite for the sophisticated CSV/Excel processing pipeline

Tests cover:
1. Intent detection with various query patterns
2. Code generation from intents
3. Safe code execution
4. Result formatting
5. End-to-end pipeline
"""

import pandas as pd
import numpy as np
import pytest
from server.csv_excel_processor import (
    IntentDetector,
    CodeGenerator,
    SafeCodeExecutor,
    ResultFormatter,
    process_csv_excel_query
)


# Sample test data
@pytest.fixture
def sample_employees_df():
    """Create sample employees DataFrame for testing"""
    return pd.DataFrame({
        'Name': ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank'],
        'City': ['Pune', 'Delhi', 'Pune', 'Mumbai', 'Bangalore', 'Chennai'],
        'Department': ['Engineering', 'Sales', 'Engineering', 'HR', 'Sales', 'Engineering'],
        'Salary': [75000, 85000, 65000, 55000, 95000, 72000],
        'Experience': [3, 5, 2, 4, 6, 3]
    })


@pytest.fixture
def sample_sales_df():
    """Create sample sales DataFrame for testing"""
    return pd.DataFrame({
        'Date': pd.date_range('2024-01-01', periods=20),
        'Region': ['North', 'North', 'South', 'East', 'West'] * 4,
        'Product': ['Widget A', 'Widget B', 'Widget C', 'Widget D', 'Widget E'] * 4,
        'Sales': np.random.randint(1000, 10000, 20),
        'Quarter': ['Q1', 'Q1', 'Q1', 'Q2', 'Q2'] * 4
    })


class TestIntentDetector:
    """Tests for IntentDetector class"""
    
    def test_detect_simple_aggregation(self, sample_employees_df):
        """Test detection of simple aggregation like 'average salary'"""
        query = "What is the average salary?"
        intent = IntentDetector.detect_intent(query, sample_employees_df)
        
        assert len(intent['aggregations']) > 0
        assert intent['aggregations'][0]['type'] == 'average'
        assert intent['aggregations'][0]['column'] == 'Salary'
        assert intent['confidence'] > 0.5
    
    def test_detect_filter_and_aggregation(self, sample_employees_df):
        """Test detection of filter + aggregation like 'average salary in Pune'"""
        query = "What is the average salary in Pune?"
        intent = IntentDetector.detect_intent(query, sample_employees_df)
        
        assert len(intent['aggregations']) > 0
        assert len(intent['filters']) > 0
        assert intent['filters'][0]['column'] == 'City'
        assert 'Pune' in intent['filters'][0]['value']
    
    def test_detect_groupby(self, sample_employees_df):
        """Test detection of GROUP BY like 'sales by region'"""
        query = "Total sales by region?"
        intent = IntentDetector.detect_intent(query, sample_employees_df)
        
        assert len(intent['groupby']) > 0
        assert intent['aggregations'][0]['type'] == 'sum'
    
    def test_detect_top_k(self, sample_employees_df):
        """Test detection of top-k queries"""
        query = "Top 5 highest earning employees?"
        intent = IntentDetector.detect_intent(query, sample_employees_df)
        
        assert intent['limit'] == 5
        assert len(intent['orderby']) > 0
        assert intent['orderby'][0]['direction'] == 'desc'
    
    def test_fuzzy_column_matching(self, sample_employees_df):
        """Test fuzzy matching of column names"""
        # Test exact match
        col = IntentDetector._fuzzy_match_column('Salary', sample_employees_df)
        assert col == 'Salary'
        
        # Test case-insensitive match
        col = IntentDetector._fuzzy_match_column('salary', sample_employees_df)
        assert col == 'Salary'
        
        # Test substring match
        col = IntentDetector._fuzzy_match_column('sal', sample_employees_df)
        assert col == 'Salary'
    
    def test_extract_limit(self):
        """Test extraction of limit from queries"""
        queries = [
            ("Top 10 customers?", 10),
            ("Bottom 3 products?", 3),
            ("Top 100 items?", 100),
            ("Show me top 5?", 5),
        ]
        
        for query, expected_limit in queries:
            limit = IntentDetector._extract_limit(query)
            assert limit == expected_limit


class TestCodeGenerator:
    """Tests for CodeGenerator class"""
    
    def test_generate_simple_aggregation_code(self):
        """Test code generation for simple aggregation"""
        intent = {
            'aggregations': [{'type': 'average', 'column': 'Salary'}],
            'filters': [],
            'groupby': [],
            'orderby': [],
            'limit': None,
            'target_columns': ['Salary']
        }
        
        code = CodeGenerator.generate_code(intent)
        
        assert 'pd.DataFrame' in code
        assert 'average' in code.lower() or 'mean' in code.lower()
        assert 'Salary' in code
    
    def test_generate_filter_code(self):
        """Test code generation for filtering"""
        filter_op = {
            'column': 'City',
            'operator': 'equals',
            'value': 'Pune'
        }
        
        code = CodeGenerator._generate_filter_code(filter_op)
        
        assert 'City' in code
        assert 'Pune' in code
        assert "==" in code or "equals" in code
    
    def test_generate_groupby_code(self):
        """Test code generation for grouping"""
        intent = {
            'aggregations': [{'type': 'sum', 'column': 'Sales'}],
            'groupby': ['Region'],
            'filters': [],
            'orderby': [],
            'limit': None
        }
        
        code = CodeGenerator.generate_code(intent)
        
        assert 'groupby' in code
        assert 'Region' in code
        assert 'sum' in code.lower()
    
    def test_generate_sort_code(self):
        """Test code generation for sorting"""
        intent = {
            'aggregations': [],
            'filters': [],
            'groupby': [],
            'orderby': [{'direction': 'desc'}],
            'limit': 10,
            'target_columns': ['Salary']
        }
        
        code = CodeGenerator.generate_code(intent)
        
        assert 'sort' in code.lower()
        assert 'head' in code


class TestSafeCodeExecutor:
    """Tests for SafeCodeExecutor class"""
    
    def test_validate_safe_code(self):
        """Test that safe code passes validation"""
        code = """
import pandas as pd
result = df['Salary'].mean()
"""
        is_safe, error = SafeCodeExecutor.validate_code(code)
        assert is_safe
        assert error == ""
    
    def test_reject_forbidden_keywords(self):
        """Test that forbidden keywords are detected"""
        forbidden_codes = [
            "exec('print(1)')",
            "eval('1+1')",
            "__import__('os')",
            "open('file.txt')",
        ]
        
        for code in forbidden_codes:
            is_safe, error = SafeCodeExecutor.validate_code(code)
            assert not is_safe
            assert error != ""
    
    def test_reject_unauthorized_imports(self):
        """Test that unauthorized imports are rejected"""
        code = """
import os
result = os.system('ls')
"""
        is_safe, error = SafeCodeExecutor.validate_code(code)
        assert not is_safe
    
    def test_allow_pandas_numpy_imports(self):
        """Test that pandas and numpy imports are allowed"""
        code = """
import pandas as pd
import numpy as np
result = df['col'].mean()
"""
        is_safe, error = SafeCodeExecutor.validate_code(code)
        assert is_safe
    
    def test_execute_simple_aggregation(self, sample_employees_df):
        """Test executing aggregation code"""
        code = """
import pandas as pd
result = pd.DataFrame({'value': [df['Salary'].mean()]})
"""
        result_df, error = SafeCodeExecutor.execute_code(code, sample_employees_df)
        
        assert error is None
        assert result_df is not None
        assert len(result_df) == 1
        assert result_df.iloc[0, 0] > 0
    
    def test_execute_filter_code(self, sample_employees_df):
        """Test executing filter code"""
        code = """
import pandas as pd
result = df[df['City'] == 'Pune'].copy()
"""
        result_df, error = SafeCodeExecutor.execute_code(code, sample_employees_df)
        
        assert error is None
        assert len(result_df) == 2  # Alice and Carol are in Pune
        assert all(result_df['City'] == 'Pune')
    
    def test_execute_groupby_code(self, sample_employees_df):
        """Test executing group by code"""
        code = """
import pandas as pd
result = df.groupby('City')['Salary'].mean().reset_index()
"""
        result_df, error = SafeCodeExecutor.execute_code(code, sample_employees_df)
        
        assert error is None
        assert len(result_df) > 0
        assert 'City' in result_df.columns
        assert 'Salary' in result_df.columns


class TestResultFormatter:
    """Tests for ResultFormatter class"""
    
    def test_format_single_value(self, sample_employees_df):
        """Test formatting a single numeric result"""
        result_df = pd.DataFrame({'value': [72500.0]})
        intent = {'aggregations': [{'type': 'average'}]}
        query = "What is the average salary?"
        
        # Should return a formatted string (we can't test LLM output exactly)
        result = ResultFormatter.format_result(result_df, intent, query)
        assert isinstance(result, str)
        assert len(result) > 0
    
    def test_format_empty_result(self):
        """Test formatting empty results"""
        result_df = pd.DataFrame()
        intent = {}
        query = "Find non-existent data?"
        
        result = ResultFormatter.format_result(result_df, intent, query)
        assert "No results" in result


class TestEndToEnd:
    """End-to-end tests of the full pipeline"""
    
    def test_simple_aggregation_pipeline(self, tmp_path, sample_employees_df):
        """Test complete pipeline for simple aggregation"""
        # Create temporary CSV file
        csv_file = tmp_path / "employees.csv"
        sample_employees_df.to_csv(csv_file, index=False)
        
        # Run query through pipeline
        result = process_csv_excel_query(
            query="What is the average salary?",
            file_path=str(csv_file),
            is_excel=False
        )
        
        assert isinstance(result, str)
        assert len(result) > 0
        # Result should contain a number (the average salary)
        assert any(c.isdigit() for c in result)
    
    def test_filter_and_aggregation_pipeline(self, tmp_path, sample_employees_df):
        """Test pipeline for filter + aggregation"""
        csv_file = tmp_path / "employees.csv"
        sample_employees_df.to_csv(csv_file, index=False)
        
        result = process_csv_excel_query(
            query="Average salary in Pune?",
            file_path=str(csv_file),
            is_excel=False
        )
        
        assert isinstance(result, str)
        assert len(result) > 0
        # Pune employees: Alice (75k), Carol (65k) -> avg = 70k
        assert any(c.isdigit() for c in result)
    
    def test_invalid_file_handling(self):
        """Test handling of invalid file paths"""
        result = process_csv_excel_query(
            query="What is the average salary?",
            file_path="/non/existent/file.csv",
            is_excel=False
        )
        
        assert "Error" in result or "not found" in result.lower()


class TestIntegration:
    """Integration tests with query_handler"""
    
    def test_query_csv_with_context(self, tmp_path, sample_employees_df):
        """Test query_csv_with_context integration"""
        from server.query_handler import query_csv_with_context
        
        csv_file = tmp_path / "employees.csv"
        sample_employees_df.to_csv(csv_file, index=False)
        
        result = query_csv_with_context(
            query="Average salary?",
            file_name="employees.csv",
            file_path=str(csv_file)
        )
        
        assert isinstance(result, str)
        assert len(result) > 0
    
    def test_query_excel_with_context(self, tmp_path, sample_employees_df):
        """Test query_excel_with_context integration"""
        from server.query_handler import query_excel_with_context
        
        excel_file = tmp_path / "employees.xlsx"
        sample_employees_df.to_excel(excel_file, index=False)
        
        result = query_excel_with_context(
            query="Average salary?",
            file_name="employees.xlsx",
            file_path=str(excel_file)
        )
        
        assert isinstance(result, str)
        assert len(result) > 0


# Benchmark tests
class TestPerformance:
    """Performance and benchmark tests"""
    
    def test_intent_detection_speed(self, sample_employees_df):
        """Test that intent detection is fast"""
        import time
        
        start = time.time()
        for _ in range(100):
            IntentDetector.detect_intent(
                "Average salary in Pune?",
                sample_employees_df
            )
        elapsed = time.time() - start
        
        # Should complete 100 intent detections in < 100ms
        assert elapsed < 0.1, f"Intent detection took {elapsed}s for 100 queries"
    
    def test_code_generation_speed(self):
        """Test that code generation is fast"""
        import time
        
        intent = {
            'aggregations': [{'type': 'average', 'column': 'Salary'}],
            'filters': [{'column': 'City', 'operator': 'equals', 'value': 'Pune'}],
            'groupby': [],
            'orderby': [],
            'limit': None,
            'target_columns': ['Salary']
        }
        
        start = time.time()
        for _ in range(100):
            CodeGenerator.generate_code(intent)
        elapsed = time.time() - start
        
        # Should complete 100 code generations in < 50ms
        assert elapsed < 0.05, f"Code generation took {elapsed}s for 100 queries"


if __name__ == '__main__':
    # Run tests with: pytest tests/test_csv_excel_processor.py -v
    pytest.main([__file__, '-v'])

"""
Sophisticated CSV/Excel Processing Module

This module implements a 5-step programmatic reasoning pipeline:
1️⃣ Parse CSV/Excel into DataFrame
2️⃣ Convert user question into structured intent
3️⃣ Generate executable code (silently)
4️⃣ Execute code on the DataFrame
5️⃣ Format results in natural language

This approach ensures accurate, non-hallucinated results by performing
actual computations instead of relying on LLM text generation alone.
"""

import pandas as pd
import numpy as np
import re
from typing import Dict, Any, Tuple, List, Optional
import ast
import io
# NOTE: Lazy import to avoid circular dependency
# from server.query_handler import query_model


class IntentDetector:
    """
    Converts natural language questions into structured intents.
    
    Detects:
    - Filter operations (WHERE clauses)
    - Aggregations (SUM, AVG, COUNT, MIN, MAX)
    - Grouping operations (GROUP BY)
    - Sorting operations (ORDER BY)
    - Top-K operations (LIMIT)
    """
    
    AGGREGATION_KEYWORDS = {
        'sum': ['sum', 'total', 'all', 'altogether'],
        'average': ['average', 'avg', 'mean'],
        'count': ['count', 'how many', 'total number', 'number of'],
        'min': ['minimum', 'min', 'lowest', 'smallest'],
        'max': ['maximum', 'max', 'highest', 'largest'],
        'std': ['standard deviation', 'variance', 'spread'],
    }
    
    FILTER_KEYWORDS = {
        'equals': ['is', 'equals', 'equal to', '=='],
        'greater': ['greater than', '>', 'more than', 'above'],
        'less': ['less than', '<', 'below', 'under'],
        'like': ['contains', 'like', 'includes', 'has'],
        'in': ['in', 'one of', 'either'],
    }
    
    @staticmethod
    def detect_intent(query: str, df: pd.DataFrame):
        """
        Analyze the query and return a structured intent.
        
        Args:
            query: Natural language question
            df: DataFrame to analyze
        
        Returns:
            Intent dict with keys: aggregations, filters, groupby, orderby, limit, target_columns
        """
        query_lower = query.lower()
        
        intent = {
            'aggregations': [],      # [{'type': 'sum', 'column': 'salary'}]
            'filters': [],            # [{'column': 'city', 'operator': 'equals', 'value': 'Pune'}]
            'groupby': [],            # ['department']
            'orderby': [],            # [{'column': 'salary', 'direction': 'desc'}]
            'limit': None,            # 10
            'target_columns': [],     # Columns the user is asking about
            'raw_query': query,
            'confidence': 0.0         # How confident are we in the intent
        }
        
        # Step 1: Detect aggregations
        for agg_type, keywords in IntentDetector.AGGREGATION_KEYWORDS.items():
            for keyword in keywords:
                if keyword in query_lower:
                    # Try to find the column being aggregated
                    target_col = IntentDetector._find_target_column(query, df, keyword)
                    if target_col:
                        intent['aggregations'].append({
                            'type': agg_type,
                            'column': target_col
                        })
                        intent['target_columns'].append(target_col)
                    break
        
        # Step 2: Detect grouping (by, per, for each)
        groupby_patterns = [
            r'(?:grouped?\s+)?by\s+(\w+)',
            r'per\s+(\w+)',
            r'for\s+each\s+(\w+)',
            r'breakdown\s+(?:by|of)\s+(\w+)',
        ]
        
        for pattern in groupby_patterns:
            matches = re.findall(pattern, query_lower)
            for match in matches:
                col = IntentDetector._fuzzy_match_column(match, df)
                if col:
                    intent['groupby'].append(col)
                    if col not in intent['target_columns']:
                        intent['target_columns'].append(col)
                    break
        
        # Step 3: Detect filters
        for filter_type, keywords in IntentDetector.FILTER_KEYWORDS.items():
            for keyword in keywords:
                if keyword in query_lower:
                    # Extract filter condition (column = value)
                    filter_info = IntentDetector._extract_filter(query, df, keyword)
                    if filter_info:
                        intent['filters'].append(filter_info)
                    break
        
        # Step 4: Detect ordering (top, bottom, highest, lowest)
        if any(word in query_lower for word in ['top', 'highest', 'maximum']):
            intent['orderby'].append({'direction': 'desc'})
            intent['limit'] = IntentDetector._extract_limit(query)
        elif any(word in query_lower for word in ['bottom', 'lowest', 'minimum']):
            intent['orderby'].append({'direction': 'asc'})
            intent['limit'] = IntentDetector._extract_limit(query)
        
        # If no target columns detected, include all numeric columns
        if not intent['target_columns']:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            intent['target_columns'] = numeric_cols[:3]  # Limit to 3 columns
        
        # Calculate confidence based on detected components
        components = len([x for x in [
            intent['aggregations'],
            intent['filters'],
            intent['groupby'],
            intent['orderby']
        ] if x])
        intent['confidence'] = min(0.95, 0.3 + (components * 0.2))
        
        return intent
    
    @staticmethod
    def _find_target_column(query: str, df: pd.DataFrame, context_word: str):
        """Find the column being referenced in the context of a keyword"""
        # Look for column names near the keyword
        words = query.lower().split()
        for i, word in enumerate(words):
            if context_word in word:
                # Check words before and after
                for j in range(max(0, i-3), min(len(words), i+4)):
                    col = IntentDetector._fuzzy_match_column(words[j], df)
                    if col:
                        return col
        return None
    
    @staticmethod
    def _fuzzy_match_column(word: str, df: pd.DataFrame):
        """Fuzzy match a word to a DataFrame column"""
        word = word.lower().strip('(),[]{}:;?!')
        
        # Exact match
        if word in df.columns:
            return word
        
        # Case-insensitive match
        for col in df.columns:
            if col.lower() == word:
                return col
        
        # Substring match (prefer longer matches)
        matches = [col for col in df.columns if word in col.lower() or col.lower() in word]
        if matches:
            return max(matches, key=len)
        
        return None
    
    @staticmethod
    def _extract_filter(query: str, df: pd.DataFrame, keyword: str):
        """Extract a filter condition from the query"""
        # Simple extraction: "column keyword value"
        # e.g., "city is Pune" -> {column: 'city', operator: 'equals', value: 'Pune'}
        
        pattern = r'(\w+)\s+' + re.escape(keyword) + r'\s+([^,\.]+?)(?:,|\.|and|or|$)'
        matches = re.findall(pattern, query.lower())
        
        if matches:
            col_name, value = matches[0]
            col = IntentDetector._fuzzy_match_column(col_name, df)
            
            if col:
                operator_map = {
                    'equals': 'equals',
                    'greater': 'greater',
                    'less': 'less',
                    'like': 'like',
                    'in': 'in',
                }
                
                return {
                    'column': col,
                    'operator': operator_map.get(keyword, 'equals'),
                    'value': value.strip()
                }
        
        return None
    
    @staticmethod
    def _extract_limit(query: str) -> int:
        """Extract a limit from queries like 'top 5' or 'bottom 10'"""
        pattern = r'(top|bottom)\s+(\d+)'
        matches = re.findall(pattern, query.lower())
        if matches:
            return int(matches[0][1])
        return 10  # Default


class CodeGenerator:
    """
    Generates executable Python code from structured intents.
    
    This code is NOT passed to the LLM - it's generated based on
    deterministic rules and executed directly on the DataFrame.
    """
    
    @staticmethod
    def generate_code(intent: Dict[str, Any]):
        """
        Generate executable pandas/numpy code from intent.
        
        Returns:
            Python code as a string (safe to execute)
        """
        code_lines = ["import pandas as pd", "import numpy as np", "result = df.copy()"]
        
        # Step 1: Apply filters
        for filter_op in intent['filters']:
            code_lines.append(CodeGenerator._generate_filter_code(filter_op))
        
        # Step 2: Group if needed
        if intent['groupby']:
            code_lines.append(CodeGenerator._generate_groupby_code(intent))
        elif intent['aggregations']:
            # Simple aggregation without grouping
            code_lines.append(CodeGenerator._generate_simple_agg_code(intent))
        
        # Step 3: Sort if needed
        if intent['orderby']:
            code_lines.append(CodeGenerator._generate_sort_code(intent))
        
        # Step 4: Limit results
        if intent['limit']:
            code_lines.append(f"result = result.head({intent['limit']})")
        
        return "\n".join(code_lines)
    
    @staticmethod
    def _generate_filter_code(filter_op: Dict) -> str:
        """Generate filter code"""
        col = filter_op['column']
        op = filter_op['operator']
        val = filter_op['value']
        
        if op == 'equals':
            return f"result = result[result['{col}'].astype(str).str.lower() == '{val.lower()}']"
        elif op == 'greater':
            return f"result = result[pd.to_numeric(result['{col}'], errors='coerce') > {val}]"
        elif op == 'less':
            return f"result = result[pd.to_numeric(result['{col}'], errors='coerce') < {val}]"
        elif op == 'like':
            return f"result = result[result['{col}'].astype(str).str.contains('{val}', case=False, na=False)]"
        elif op == 'in':
            values = [v.strip() for v in val.split(',')]
            return f"result = result[result['{col}'].isin({values})]"
        
        return ""
    
    @staticmethod
    def _generate_groupby_code(intent: Dict) -> str:
        """Generate GROUP BY code with aggregations"""
        groupby_cols = intent['groupby']
        agg_dict = {}
        
        for agg in intent['aggregations']:
            col = agg['column']
            agg_type = agg['type']
            
            if col not in agg_dict:
                agg_dict[col] = []
            
            agg_dict[col].append(agg_type)
        
        # Build aggregation code
        code = f"result = result.groupby({groupby_cols}).agg({{"
        
        agg_specs = []
        for col, funcs in agg_dict.items():
            func_list = ', '.join([f"'{f}'" for f in funcs])
            agg_specs.append(f"'{col}': [{func_list}]")
        
        code += ", ".join(agg_specs)
        code += "}).reset_index()"
        
        return code
    
    @staticmethod
    def _generate_simple_agg_code(intent: Dict) -> str:
        """Generate simple aggregation without grouping"""
        agg_dict = {}
        
        for agg in intent['aggregations']:
            col = agg['column']
            agg_type = agg['type']
            
            if col not in agg_dict:
                agg_dict[col] = []
            
            agg_dict[col].append(agg_type)
        
        code = "result = pd.DataFrame({'value': ["
        
        values = []
        for col, funcs in agg_dict.items():
            for func in funcs:
                if func == 'sum':
                    values.append(f"result['{col}'].sum()")
                elif func == 'average':
                    values.append(f"result['{col}'].mean()")
                elif func == 'count':
                    values.append(f"len(result['{col}'])")
                elif func == 'min':
                    values.append(f"result['{col}'].min()")
                elif func == 'max':
                    values.append(f"result['{col}'].max()")
                elif func == 'std':
                    values.append(f"result['{col}'].std()")
        
        code += ", ".join(values)
        code += "]})"
        
        return code
    
    @staticmethod
    def _generate_sort_code(intent: Dict) -> str:
        """Generate sorting code"""
        if not intent['orderby'] or not intent['target_columns']:
            return ""
        
        col = intent['target_columns'][0]
        direction = intent['orderby'][0]['direction']
        ascending = direction == 'asc'
        
        return f"result = result.sort_values(by='{col}', ascending={ascending})"


class SafeCodeExecutor:
    """
    Safely executes generated code on DataFrames.
    
    Restrictions:
    - Only allows pandas/numpy operations
    - No file I/O
    - No network requests
    - No import statements (only pd, np available)
    """
    
    ALLOWED_MODULES = {'pd', 'np', 'pandas', 'numpy'}
    FORBIDDEN_KEYWORDS = {'__import__', 'exec', 'eval', 'open', 'compile', 'globals', 'locals', 'vars'}
    
    @staticmethod
    def validate_code(code: str):
        """
        Validate that the code is safe to execute.
        
        Returns:
            (is_safe: bool, error_message: str)
        """
        # Check for forbidden keywords
        for keyword in SafeCodeExecutor.FORBIDDEN_KEYWORDS:
            if keyword in code:
                return False, f"Forbidden operation: {keyword}"
        
        # Try to parse as AST
        try:
            ast.parse(code)
        except SyntaxError as e:
            return False, f"Syntax error: {str(e)}"
        
        # Check for dangerous imports
        for line in code.split('\n'):
            if 'import' in line and 'pandas' not in line and 'numpy' not in line:
                return False, f"Unauthorized import: {line}"
        
        return True, ""
    
    @staticmethod
    def execute_code(code: str, df: pd.DataFrame) -> Tuple[pd.DataFrame, str]:
        """
        Execute generated code on DataFrame.
        
        Args:
            code: Generated Python code
            df: Input DataFrame
        
        Returns:
            (result_df: pd.DataFrame, error: str or None)
        """
        # Validate code first
        is_safe, error_msg = SafeCodeExecutor.validate_code(code)
        if not is_safe:
            return None, error_msg
        
        try:
            # Create restricted execution environment
            local_vars = {
                'pd': pd,
                'np': np,
                'df': df.copy(),
                'result': None
            }
            
            # Execute the code
            exec(code, {"__builtins__": {}}, local_vars)
            
            result_df = local_vars.get('result')
            
            if result_df is None:
                return None, "No result produced"
            
            if not isinstance(result_df, pd.DataFrame):
                return None, "Result is not a DataFrame"
            
            return result_df, None
            
        except Exception as e:
            return None, f"Execution error: {str(e)}"


class ResultFormatter:
    """
    Converts DataFrame results into natural language explanations.
    
    Uses the LLM to generate human-readable summaries of computed results,
    but the actual numbers come from the DataFrame, not from the LLM's
    "knowledge" or hallucinations.
    """
    
    @staticmethod
    def format_result(result_df: pd.DataFrame, intent: Dict[str, Any], query: str) -> str:
        """
        Format DataFrame result into natural language.
        
        Args:
            result_df: The computed DataFrame
            intent: The original intent
            query: The original user query
        
        Returns:
            Natural language summary
        """
        if result_df is None or result_df.empty:
            return "No results found matching your criteria."
        
        # Convert result to string representation for LLM
        if len(result_df) == 1 and len(result_df.columns) == 1:
            # Single value - just return it
            value = result_df.iloc[0, 0]
            return ResultFormatter._format_single_value(value, query)
        
        elif len(result_df) == 1:
            # Single row with multiple values
            return ResultFormatter._format_single_row(result_df, query)
        
        elif len(result_df) <= 10:
            # Small result set - include full table
            return ResultFormatter._format_table(result_df, query)
        
        else:
            # Large result set - show summary
            return ResultFormatter._format_summary(result_df, query)
    
    @staticmethod
    def _format_single_value(value: Any, query: str) -> str:
        """Format a single computed value"""
        # Round numeric values
        if isinstance(value, float):
            value = round(value, 2)
        
        # Use LLM to explain the result
        prompt = f"""Based on the computed result, answer the user's question concisely.

User Question: {query}
Computed Result: {value}

Provide a natural, brief answer using the exact computed value. Do not add estimates or approximations."""
        try:
            from server.query_handler import query_model
            return query_model(prompt)
        except ImportError:
            return f"Result: {value}"
    
    @staticmethod
    def _format_single_row(result_df: pd.DataFrame, query: str) -> str:
        """Format a single row result"""
        row_dict = result_df.iloc[0].to_dict()
        data_str = ", ".join([f"{k}: {v}" for k, v in row_dict.items()])
        
        prompt = f"""Based on the computed data, answer the user's question.

User Question: {query}
Data: {data_str}

Provide a clear, natural answer using the exact data provided. Format it as a readable sentence."""
        try:
            from server.query_handler import query_model
            return query_model(prompt)
        except ImportError:
            return f"Data: {data_str}"
    
    @staticmethod
    def _format_table(result_df: pd.DataFrame, query: str) -> str:
        """Format a table result"""
        table_str = result_df.to_string()
        
        prompt = f"""Based on the computed table, answer the user's question.

User Question: {query}
Table:
{table_str}

Summarize the key insights from this table in natural language. Be specific and include the actual numbers."""
        try:
            from server.query_handler import query_model
            return query_model(prompt)
        except ImportError:
            return f"Table Results:\n{table_str}"
    
    @staticmethod
    def _format_summary(result_df: pd.DataFrame, query: str) -> str:
        """Format a large result set summary"""
        # Show first 5 and last 5 rows
        first_rows = result_df.head(5).to_string()
        last_rows = result_df.tail(5).to_string()
        
        summary = f"Showing first 5 of {len(result_df)} results:\n{first_rows}\n\n... ({len(result_df) - 10} more rows) ...\n\nLast 5 results:\n{last_rows}"
        
        prompt = f"""Based on the computed data, answer the user's question.

User Question: {query}
Total Rows: {len(result_df)}
Sample Data:
{summary}

Provide a concise summary of the results with key statistics and insights."""
        try:
            from server.query_handler import query_model
            return query_model(prompt)
        except ImportError:
            return summary


def process_csv_excel_query(query: str, file_path: str, is_excel: bool = False, conversation_history: List = None):
    """
    Main entry point for the sophisticated CSV/Excel processing pipeline.
    
    5-Step Process:
    1️⃣ Parse CSV/Excel into DataFrame
    2️⃣ Convert question into intent
    3️⃣ Generate executable code
    4️⃣ Execute code safely on DataFrame
    5️⃣ Format result in natural language
    
    Args:
        query: User's natural language question
        file_path: Path to CSV or Excel file (can be local path or Supabase storage path)
        is_excel: Whether file is Excel (default: False for CSV)
        conversation_history: Previous messages for context
    
    Returns:
        Natural language answer with actual computed results
    """
    try:
        # Step 1️⃣: Parse file into DataFrame
        # Check if file_path is a Supabase storage path (contains /)
        if '/' in file_path and not file_path.startswith('/'):
            # This looks like a Supabase storage path (e.g., "user_id/timestamp_filename.csv")
            # Download from Supabase Storage
            print(f"📥 Loading file from Supabase Storage: {file_path}")
            try:
                from supabase import create_client
                import os
                
                SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
                SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                
                if not SUPABASE_URL or not SUPABASE_KEY:
                    return "Error: Supabase credentials not configured"
                
                supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                
                # Download file from Supabase Storage
                file_content = supabase.storage.from_('vault_files').download(file_path)
                
                # Load into DataFrame from bytes
                import io
                if is_excel:
                    df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
                else:
                    df = pd.read_csv(io.BytesIO(file_content))
                
                print(f"✅ File loaded from Supabase: {file_path}")
            except Exception as e:
                return f"Error loading file from Supabase: {str(e)}"
        else:
            # Local file path
            print(f"📂 Loading file from local path: {file_path}")
            if is_excel:
                df = pd.read_excel(file_path, sheet_name=0)
            else:
                df = pd.read_csv(file_path)
        
        if df.empty:
            return "Error: File is empty or could not be loaded."
        
        # Step 2️⃣: Detect intent
        intent = IntentDetector.detect_intent(query, df)
        
        # Step 3️⃣: Generate code
        code = CodeGenerator.generate_code(intent)
        
        # Step 4️⃣: Execute code safely
        result_df, error = SafeCodeExecutor.execute_code(code, df)
        
        if error:
            # If code generation fails, fall back to simple LLM approach
            return _fallback_llm_query(query, df, file_path)
        
        # Step 5️⃣: Format results in natural language
        answer = ResultFormatter.format_result(result_df, intent, query)
        
        return answer
        
    except FileNotFoundError:
        return f"Error: File not found: {file_path}"
    except Exception as e:
        return f"Error processing file: {str(e)}"


def _fallback_llm_query(query: str, df: pd.DataFrame, file_path: str) -> str:
    """Fallback to traditional LLM approach if programmatic method fails"""
    # Limit to reasonable size
    sample = df.head(100).to_string()
    file_name = file_path.split('/')[-1] if '/' in file_path else file_path.split('\\')[-1]
    
    prompt = f"""Answer this question based on the data provided:

Question: {query}

File: {file_name}
Columns: {', '.join(df.columns.tolist())}

Data Sample:
{sample}

Provide a clear answer with the specific information requested."""
    try:
        from server.query_handler import query_model
        return query_model(prompt)
    except ImportError:
        return f"Unable to process query due to import error. File: {file_name}, Columns: {', '.join(df.columns.tolist())}"

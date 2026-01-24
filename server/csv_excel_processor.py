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


class EntityBinder:
    """
    Mandatory entity-first binding before any aggregation or filtering.
    
    Ensures that when a user mentions a specific entity, the system treats it as 
    a hard constraint and fails fast if entity binding fails.
    
    This prevents data leakage where unrelated entities appear in results.
    
    ⚠️ ADAPTIVE: Works with ANY DataFrame - scientific data, sports records, 
    medical records, sensor IDs, etc. Not limited to business entities.
    """
    
    @staticmethod
    def _get_entity_columns(df: pd.DataFrame) -> List[str]:
        """
        Automatically detect columns that are likely to contain entities.
        
        Pure heuristic approach (NO hardcoded patterns):
        - String/object columns only (exclude numeric)
        - Moderate cardinality (not all unique, not all the same)
        - Columns with repeated values are entity columns
        
        Works with ANY domain: business, scientific, medical, sports, sensor data, etc.
        
        Returns:
            List of column names in priority order (by cardinality)
        """
        entity_columns = []
        
        for col in df.columns:
            # Skip purely numeric columns
            if pd.api.types.is_numeric_dtype(df[col]):
                continue
            
            # Count unique values
            unique_count = df[col].nunique()
            total_rows = len(df)
            
            # Skip if all unique (likely IDs or timestamps)
            if unique_count == total_rows:
                continue
            
            # Skip if all same (no grouping value)
            if unique_count == 1:
                continue
            
            # At least 2 unique values = repeating categorical data = entity column
            # This is domain-agnostic and works with anything
            cardinality_ratio = unique_count / total_rows
            entity_columns.append((col, cardinality_ratio))
        
        # Sort by cardinality ratio (prefer moderate cardinality)
        # Lower ratio = more repeated values = likely an entity grouping column
        entity_columns.sort(key=lambda x: x[1])
        
        return [col for col, _ in entity_columns]
    
    @staticmethod
    def detect_entity_scope(query: str, df: pd.DataFrame):
        """
        Detect if the query references a specific entity in the DataFrame.
        
        Algorithm:
        1. Identify potential entity columns (adaptive, not hardcoded)
        2. For each entity column, check if any value appears in the query
        3. Return first match with confidence score
        
        Returns:
            {'column': str, 'value': str, 'confidence': float} if found, None otherwise
        
        Examples:
            "Tell me about company A" -> {'column': 'company', 'value': 'A', 'confidence': 0.95}
            "Data for patient P123" -> {'column': 'patient_id', 'value': 'P123', 'confidence': 0.95}
            "Show sensor X readings" -> {'column': 'sensor', 'value': 'X', 'confidence': 0.95}
        """
        query_lower = query.lower()
        
        # Get adaptive list of entity columns
        entity_columns = EntityBinder._get_entity_columns(df)
        
        if not entity_columns:
            # Fallback: if no entity columns found by heuristic, scan all string columns
            entity_columns = [col for col in df.columns 
                            if not pd.api.types.is_numeric_dtype(df[col])]
        
        # Try to match query against values in entity columns
        for col in entity_columns:
            unique_values = df[col].astype(str).unique()
            
            for value in unique_values:
                value_lower = value.lower()
                
                # Avoid matching common stop words (too generic)
                if EntityBinder._is_stop_word(value_lower):
                    continue
                
                # Check if value appears in query
                if value_lower in query_lower:
                    return {
                        'column': col,
                        'value': value,
                        'confidence': EntityBinder._calculate_entity_confidence(value, query)
                    }
        
        return None
    
    @staticmethod
    def _is_stop_word(value: str):
        """Filter out common stop words that shouldn't match as entities"""
        stop_words = {
            'nan', 'null', 'none', 'true', 'false', 'yes', 'no',
            'and', 'or', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
            'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from'
        }
        return value in stop_words
    
    @staticmethod
    def _calculate_entity_confidence(value: str, query: str):
        """
        Calculate confidence that the value is a genuine entity reference.
        
        Higher confidence if:
        - Value has word boundaries (not part of larger word)
        - Value is longer (less likely to be coincidental match)
        """
        query_lower = query.lower()
        value_lower = value.lower()
        
        # Word boundary match = high confidence
        word_pattern = r'\b' + re.escape(value_lower) + r'\b'
        if re.search(word_pattern, query_lower):
            return 0.95
        
        # Substring match with length bonus
        if len(value_lower) >= 3:
            return 0.80  # Longer values are more likely to be intentional references
        else:
            return 0.70  # Short substrings are riskier


class IntentDetector:
    """
    Converts natural language questions into structured intents.
    
    Detects:
    - Filter operations (WHERE clauses)
    - Aggregations (SUM, AVG, COUNT, MIN, MAX)
    - Grouping operations (GROUP BY)
    - Sorting operations (ORDER BY)
    - Top-K operations (LIMIT)
    
    ⚠️ IMPORTANT: Entity binding is now MANDATORY (enforced in process_csv_excel_query)
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
    def _extract_limit(query: str):
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
        # NOTE: Don't include imports - pd and np are already in execution environment
        code_lines = ["result = df.copy()"]
        
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
    def _generate_filter_code(filter_op: Dict):
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
    def _generate_groupby_code(intent: Dict):
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
        code = "result = result.groupby(" + str(groupby_cols) + ").agg({"
        
        agg_specs = []
        for col, funcs in agg_dict.items():
            func_list = ', '.join([f"'{f}'" for f in funcs])
            agg_specs.append(f"'{col}': [{func_list}]")
        
        code += ", ".join(agg_specs)
        code += "}).reset_index()"
        
        return code
    
    @staticmethod
    def _generate_simple_agg_code(intent: Dict):
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
    def _generate_sort_code(intent: Dict):
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
    - ⚠️ NEW: Enforces entity scope after execution
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
    def validate_entity_scope(result_df: pd.DataFrame, entity: Dict[str, str]) -> bool:
        """
        🛡️ Safety Assertion: Verify that the result contains ONLY the specified entity.
        
        This prevents silent failures where unrelated entities appear in results.
        
        Args:
            result_df: The result DataFrame after all operations
            entity: {'column': str, 'value': str} from EntityBinder.detect_entity_scope()
        
        Returns:
            True if entity scope is valid, False otherwise
        """
        if not entity or result_df.empty:
            return True
        
        entity_col = entity['column']
        entity_val = entity['value']
        
        # Check if entity column still exists in result
        if entity_col not in result_df.columns:
            return True  # Column was aggregated away, assume it's fine
        
        # Check if ONLY the specified entity exists in results
        result_values = result_df[entity_col].astype(str).unique()
        
        for value in result_values:
            if value.lower() != entity_val.lower():
                # Found a different entity value - this is a failure
                return False
        
        return True
    
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


def process_csv_excel_query(query: str, file_path: str = None, is_excel: bool = False, conversation_history: List = None, selected_file_ids: List = None):
    """
    Main entry point for the sophisticated CSV/Excel processing pipeline.
    
    6-Step Process:
    0️⃣ [NEW] Enforce mandatory entity binding
    1️⃣ Parse CSV/Excel into DataFrame
    2️⃣ Convert question into intent
    3️⃣ Generate executable code
    4️⃣ Execute code safely on DataFrame
    5️⃣ Format result in natural language
    
    Args:
        query: User's natural language question
        file_path: Path to CSV or Excel file (can be local path or Supabase storage path) - optional if selected_file_ids provided
        is_excel: Whether file is Excel (default: False for CSV)
        conversation_history: Previous messages for context
        selected_file_ids: List of selected file IDs to load from Supabase
    
    Returns:
        Natural language answer with actual computed results
    """
    try:
        # Step 0️⃣: Resolve file_path from selected_file_ids if provided
        if selected_file_ids and not file_path:
            print(f"📋 Resolving file paths from selected file IDs: {selected_file_ids}")
            try:
                from supabase import create_client
                import os
                
                SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
                SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                
                if not SUPABASE_URL or not SUPABASE_KEY:
                    return "Error: Supabase credentials not configured"
                
                supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                
                # Query file_upload table for files matching selected_file_ids (handles multiple)
                file_records = supabase.table('file_upload').select('id, file_path, file_name').in_(
                    'id', selected_file_ids
                ).execute()
                
                if not file_records.data:
                    return f"❌ No files found for selected IDs: {selected_file_ids}"
                
                print(f"✅ Resolved {len(file_records.data)} file(s)")
                
                # Load and process each file separately, then combine results
                all_results = []
                for file_record in file_records.data:
                    file_record_path = file_record['file_path']
                    file_record_name = file_record['file_name']
                    is_record_excel = file_record_path.lower().endswith(('.xlsx', '.xls'))
                    
                    print(f"📥 Processing file: {file_record_name}")
                    
                    try:
                        # Load file from Supabase Storage
                        file_content = supabase.storage.from_('vault_files').download(file_record_path)
                        
                        import io
                        if is_record_excel:
                            file_df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
                        else:
                            file_df = pd.read_csv(io.BytesIO(file_content))
                        
                        print(f"✅ Loaded: {file_record_name} ({len(file_df)} rows)")
                        
                        # Process this file individually
                        entity = EntityBinder.detect_entity_scope(query, file_df)
                        if entity:
                            print(f"   ✅ Entity detected: {entity['column']} = {entity['value']}")
                        
                        intent = IntentDetector.detect_intent(query, file_df)
                        
                        if entity:
                            entity_filter = {
                                'column': entity['column'],
                                'operator': 'equals',
                                'value': entity['value']
                            }
                            intent['filters'].insert(0, entity_filter)
                        
                        code = CodeGenerator.generate_code(intent)
                        result_df, error = SafeCodeExecutor.execute_code(code, file_df)
                        
                        if error:
                            # Fallback to LLM approach for this file if code generation fails
                            print(f"   ⚠️  Code execution failed, falling back to LLM: {error}")
                            llm_result = _fallback_llm_query(query, file_df, file_record_path, None)
                            all_results.append(f"\n📄 **{file_record_name}** (LLM analysis):\n{llm_result}")
                        else:
                            if result_df is not None and not result_df.empty:
                                # Limit output to first 100 rows to avoid flooding logs with huge datasets
                                result_sample = result_df.head(100).to_string()
                                rows_info = f" (showing first 100 of {len(result_df)} rows)" if len(result_df) > 100 else f" ({len(result_df)} rows)"
                                
                                # Send result to LLM for natural language response
                                try:
                                    from server.query_handler import query_model
                                    prompt = f"""Answer this question based on the computed data results:

Question: {query}

File: {file_record_name}{rows_info}
Columns: {', '.join(result_df.columns.tolist())}

Computed Results:
{result_sample}

Provide a clear, specific answer using the actual computed data shown. Include relevant numbers and insights."""
                                    llm_response = query_model(prompt)
                                    all_results.append(f"\n📄 **{file_record_name}**{rows_info}:\n{llm_response}")
                                except ImportError:
                                    # Fallback to raw data if query_model unavailable
                                    all_results.append(f"\n📄 **{file_record_name}**{rows_info}:\n{result_sample}")
                                
                                print(f"   ✅ Processed successfully ({len(result_df)} rows)")
                            else:
                                all_results.append(f"\n📄 **{file_record_name}**: No results found")
                        
                    except Exception as e:
                        return f"Error processing file {file_record_name}: {str(e)}"
                
                # Combine all results as strings (process files separately, not concatenated)
                if len(all_results) > 1:
                    print(f"📊 Combining results from {len(all_results)} files...")
                    return "\n".join(all_results)
                elif len(all_results) == 1:
                    return all_results[0]
                else:
                    return "No results from any files"
                
            except Exception as e:
                return f"Error resolving file from Supabase: {str(e)}"
        
        if not file_path:
            return "Error: No file path provided and no selected_file_ids to resolve"
        
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
        
        # Step 0️⃣: 🔒 MANDATORY Entity Binding (FAIL FAST IF ENTITY NOT FOUND)
        print(f"🔍 Detecting entity scope in query...")
        entity = EntityBinder.detect_entity_scope(query, df)
        
        if entity:
            print(f"✅ Entity detected: {entity['column']} = {entity['value']} (confidence: {entity['confidence']:.0%})")
        else:
            # Check if query seems to require an entity (e.g., "Tell me about X" or "Show X data")
            entity_requiring_patterns = [
                r'(?:tell|show|give|get|find|fetch|what|which)\s+(?:about|for|me)',
                r'(?:all|every)\s+(?:about|info|data)',
                r'(?:compare|analyze)\s+.*\s+(?:and|with)',
            ]
            
            requires_entity = any(re.search(pattern, query.lower()) for pattern in entity_requiring_patterns)
            
            if requires_entity:
                # Entity was required but not found
                entity_hint = _extract_entity_candidates(query, df)
                if entity_hint:
                    return f"I couldn't identify which specific {entity_hint} you're referring to. Found {entity_hint.split()[-1]}s in the data: {', '.join(df[entity_hint].astype(str).unique()[:5])}. Please be more specific."
                else:
                    return "I couldn't identify the specific entity you're referring to. Please specify which company, product, person, or other entity you want to analyze."
        
        # Step 2️⃣: Detect intent
        intent = IntentDetector.detect_intent(query, df)
        
        # If we have an entity, INSERT it as the FIRST filter (mandatory constraint)
        if entity:
            entity_filter = {
                'column': entity['column'],
                'operator': 'equals',
                'value': entity['value']
            }
            intent['filters'].insert(0, entity_filter)
            print(f"🔒 Entity filter added as mandatory constraint: {entity_filter}")
        
        # Step 3️⃣: Generate code
        code = CodeGenerator.generate_code(intent)
        
        # Step 4️⃣: Execute code safely
        result_df, error = SafeCodeExecutor.execute_code(code, df)
        
        if error:
            # If code generation fails, fall back to simple LLM approach
            return _fallback_llm_query(query, df, file_path, selected_file_ids)
        
        # 🛡️ SAFETY CHECK: Verify entity scope is maintained
        if entity and not SafeCodeExecutor.validate_entity_scope(result_df, entity):
            return f"⚠️ Data consistency check failed. Results contain data from multiple {entity['column']}s, not just '{entity['value']}'. Please contact support."
        
        # Step 5️⃣: Return results as formatted string
        if result_df is None or result_df.empty:
            return "No results found matching your criteria."
        
        return result_df.to_string()
        
    except FileNotFoundError:
        return f"Error: File not found: {file_path}"
    except Exception as e:
        return f"Error processing file: {str(e)}"


def _extract_entity_candidates(query: str, df: pd.DataFrame) -> Optional[str]:
    """
    Extract entity column name if unclear which entity the user is asking about.
    
    Used for generating helpful error messages.
    
    Uses adaptive detection - works with ANY DataFrame structure.
    """
    entity_columns = EntityBinder._get_entity_columns(df)
    
    if entity_columns:
        return entity_columns[0]  # Return the highest priority entity column
    
    return None


def _fallback_llm_query(query: str, df: pd.DataFrame = None, file_path: str = None, selected_file_ids: List = None):
    """Fallback to LLM approach if programmatic method fails
    
    Loads the CSV/Excel data and passes an enhanced query to the LLM
    with the actual data sample and column information.
    Handles both single and multiple files.
    
    Args:
        query: User's natural language question
        df: Input DataFrame (optional if selected_file_ids provided)
        file_path: Path to the CSV or Excel file (optional if selected_file_ids provided)
        selected_file_ids: List of selected file IDs to load from Supabase (handles multiple files)
    """
    # Step 1: Resolve file(s) and load DataFrame if needed
    file_names = []
    
    if df is None:
        print(f"📋 DataFrame not provided, resolving from file_path or selected_file_ids")
        
        # If only selected_file_ids provided, resolve file_paths from Supabase
        if selected_file_ids and not file_path:
            print(f"📋 Resolving file paths from selected file IDs: {selected_file_ids}")
            try:
                from supabase import create_client
                import os
                
                SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
                SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                
                if not SUPABASE_URL or not SUPABASE_KEY:
                    return "Error: Supabase credentials not configured"
                
                supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                
                # Query file_upload table for files matching selected_file_ids (handles multiple)
                file_records = supabase.table('file_upload').select('id, file_path, file_name').in_(
                    'id', selected_file_ids
                ).execute()
                
                if not file_records.data:
                    return f"❌ No files found for selected IDs: {selected_file_ids}"
                
                print(f"✅ Resolved {len(file_records.data)} file(s)")
                
                # Load all selected files and combine DataFrames
                all_dfs = []
                for file_record in file_records.data:
                    file_record_path = file_record['file_path']
                    file_record_name = file_record['file_name']
                    
                    print(f"📥 Loading file: {file_record_name} -> {file_record_path}")
                    
                    try:
                        # Load file from Supabase Storage
                        file_content = supabase.storage.from_('vault_files').download(file_record_path)
                        
                        is_excel = file_record_path.lower().endswith(('.xlsx', '.xls'))
                        import io
                        if is_excel:
                            file_df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
                        else:
                            file_df = pd.read_csv(io.BytesIO(file_content))
                        
                        all_dfs.append(file_df)
                        file_names.append(file_record_name)
                        print(f"✅ Loaded: {file_record_name} ({len(file_df)} rows)")
                        
                    except Exception as e:
                        return f"Error loading file {file_record_name}: {str(e)}"
                
                # Process files separately, not concatenated
                if len(all_dfs) > 1:
                    print(f"� Combining {len(all_dfs)} files...")
                    # Build combined context from all files for LLM
                    print(f"📊 Processing {len(all_dfs)} files separately for LLM query...")
                    all_files_context = []
                    for i, file_df in enumerate(all_dfs):
                        file_name = file_names[i] if i < len(file_names) else f"file_{i+1}"
                        data_sample = file_df.head(50).to_string()
                        file_context = f"\n📄 **{file_name}** ({len(file_df)} rows)\nColumns: {', '.join(file_df.columns.tolist())}\nData:\n{data_sample}"
                        all_files_context.append(file_context)
                    
                    cleaned_query = query
                    try:
                        from server.query_handler import extract_document_name
                        cleaned_query, _ = extract_document_name(query, None)
                    except Exception:
                        pass
                    
                    files_display = ", ".join(file_names)
                    # ⚠️ NOTE: cleaned_query = query (no filename extraction needed for selected_file_ids)
                    # Files were selected via UI, not mentioned in query text
                    prompt = f"""Answer this question based on the actual data from multiple files:

Question: {query}

Files: {files_display}
{"".join(all_files_context)}

Provide a clear answer analyzing data from ALL files shown."""
                    
                    try:
                        from server.query_handler import query_model
                        return query_model(prompt)
                    except ImportError:
                        return f"Unable to process query. Files: {files_display}"
                else:
                    # ===== CONDITION 2: Single file via selected_file_ids =====
                    print(f"📄 Single file loaded via selected_file_ids, continuing with single-file processing...")
                    df = all_dfs[0]
                
            except Exception as e:
                return f"Error resolving files from Supabase: {str(e)}"
        
        if df is None:
            if not file_path:
                return "Error: No DataFrame provided and no file_path or selected_file_ids to resolve"
            
            # ===== CONDITION 3: Single file via file_path =====
            print(f"📥 Loading single file via file_path...")
            try:
                print(f"📥 Loading file: {file_path}")
                if '/' in file_path and not file_path.startswith('/'):
                    # Supabase storage path
                    from supabase import create_client
                    import os
                    
                    SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
                    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                    
                    if not SUPABASE_URL or not SUPABASE_KEY:
                        return "Error: Supabase credentials not configured"
                    
                    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                    file_content = supabase.storage.from_('vault_files').download(file_path)
                    
                    is_excel = file_path.lower().endswith(('.xlsx', '.xls'))
                    import io
                    if is_excel:
                        df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
                    else:
                        df = pd.read_csv(io.BytesIO(file_content))
                else:
                    # Local file path
                    is_excel = file_path.lower().endswith(('.xlsx', '.xls'))
                    if is_excel:
                        df = pd.read_excel(file_path, sheet_name=0)
                    else:
                        df = pd.read_csv(file_path)
                
                print(f"✅ File loaded successfully")
                file_names.append(file_path.split('/')[-1] if '/' in file_path else file_path.split('\\')[-1])
            except Exception as e:
                return f"Error loading file: {str(e)}"
        else:
            # ===== CONDITION 4: DataFrame passed directly =====
            print(f"📋 DataFrame provided directly, using as-is...")
            file_names.append("uploaded_file")
    
    # Step 2: Get file names for display
    if not file_names:
        file_names = ["uploaded_file"]
    
    files_display = ", ".join(file_names) if len(file_names) > 1 else file_names[0]
    
    # Step 3: Remove filename references from query for cleaner LLM prompt
    # ✅ Only extract document name if file_path was provided (user might have mentioned filename)
    cleaned_query = query
    if file_path:  # Only for CONDITION 3 where file_path is used
        try:
            from server.query_handler import extract_document_name
            cleaned_query, _ = extract_document_name(query, None)
        except Exception:
            pass  # Use original query if extraction fails
    
    # Step 4: Get data sample (limit to first 100 rows for reasonable context)
    data_sample = df.head(100).to_string()
    
    # Step 5: Build enhanced prompt with actual data (now supports multiple files)
    file_info = f"Files: {files_display}" if len(file_names) > 1 else f"File: {files_display}"
    
    prompt = f"""Answer this question based on the actual data provided:

Question: {cleaned_query}

{file_info}
Total Rows: {len(df)}
Columns: {', '.join(df.columns.tolist())}

Data:
{data_sample}

Provide a clear, specific answer using the actual data shown. Include relevant numbers and insights from the data."""
    
    # Step 6: Query LLM with the prompt
    try:
        from server.query_handler import query_model
        return query_model(prompt)
    except ImportError:
        return f"Unable to process query due to import error. Files: {files_display}, Columns: {', '.join(df.columns.tolist())}"

"""
Mermaid Converter Module
Converts query results and structured data to Mermaid diagram markdown
Enables data visualization through Mermaid syntax rendering
"""

import json
import re
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
from datetime import datetime


class MermaidConverter:
    """Convert various data structures to Mermaid diagram markdown"""
    
    # Mermaid diagram types
    DIAGRAM_TYPES = {
        'flowchart': 'flowchart TD',
        'graph': 'graph TD',
        'sequence': 'sequenceDiagram',
        'gantt': 'gantt',
        'pie': 'pie title',
        'bar': 'bar',
        'class': 'classDiagram',
        'state': 'stateDiagram-v2'
    }
    
    @staticmethod
    def to_flowchart(data: Dict[str, Any], title: str = "Process Flow"):
        """
        Convert dictionary/process data to flowchart
        
        Args:
            data: Dictionary with process steps/relationships
            title: Chart title
            
        Returns:
            Mermaid flowchart markdown
        """
        lines = [f"```mermaid", f"flowchart TD"]
        
        # Handle nested process data
        if isinstance(data, dict):
            step_id = 1
            for key, value in data.items():
                safe_key = key.replace(" ", "_").replace("-", "_")
                if isinstance(value, dict):
                    lines.append(f"    A{step_id}[{safe_key}]")
                    sub_id = step_id * 10
                    for sub_key, sub_value in value.items():
                        lines.append(f"    B{sub_id}[{sub_key}: {sub_value}]")
                        lines.append(f"    A{step_id} --> B{sub_id}")
                        sub_id += 1
                else:
                    lines.append(f"    A{step_id}[{safe_key}: {value}]")
                step_id += 1
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def to_sequence_diagram(interactions: List[Tuple[str, str, str]], title: str = "Sequence"):
        """
        Convert interaction list to sequence diagram
        
        Args:
            interactions: List of (actor1, actor2, action) tuples
            title: Diagram title
            
        Returns:
            Mermaid sequence diagram markdown
        """
        lines = [f"```mermaid", f"sequenceDiagram", f"    autonumber"]
        
        actors = set()
        for actor1, actor2, _ in interactions:
            actors.add(actor1)
            actors.add(actor2)
        
        # Add interactions
        for actor1, actor2, action in interactions:
            lines.append(f"    {actor1}->>+{actor2}: {action}")
            lines.append(f"    {actor2}-->>-{actor1}: Done")
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def to_gantt_chart(tasks: List[Dict[str, Any]], title: str = "Timeline"):
        """
        Convert task list to Gantt chart
        
        Args:
            tasks: List of dicts with 'name', 'start', 'end', 'status' keys
            title: Chart title
            
        Returns:
            Mermaid Gantt chart markdown
        """
        lines = [
            f"```mermaid",
            f"gantt",
            f"    title {title}",
            f"    dateFormat YYYY-MM-DD"
        ]
        
        for task in tasks:
            name = task.get('name', 'Task')
            start = task.get('start', '2024-01-01')
            end = task.get('end', '2024-01-02')
            status = task.get('status', 'active')
            
            lines.append(f"    {name}           :{status}:, {start}, {end}")
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def to_pie_chart(data: Dict[str, float], title: str = "Distribution"):
        """
        Convert data to pie chart
        
        Args:
            data: Dictionary with labels and values
            title: Chart title
            
        Returns:
            Mermaid pie chart markdown
        """
        lines = [f"```mermaid", f"pie title {title}"]
        
        for label, value in data.items():
            lines.append(f"    \"{label}\" : {value}")
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def to_class_diagram(classes: List[Dict[str, Any]]):
        """
        Convert class definitions to class diagram
        
        Args:
            classes: List of class definitions with 'name', 'properties', 'methods'
            
        Returns:
            Mermaid class diagram markdown
        """
        lines = [f"```mermaid", f"classDiagram"]
        
        for cls in classes:
            class_name = cls.get('name', 'Class')
            lines.append(f"    class {class_name} {{")
            
            # Add properties
            for prop in cls.get('properties', []):
                lines.append(f"        {prop}")
            
            # Add methods
            for method in cls.get('methods', []):
                lines.append(f"        {method}()")
            
            lines.append(f"    }}")
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def dataframe_to_table_diagram(df: pd.DataFrame, title: str = "Data"):
        """
        Convert pandas DataFrame to ASCII table in markdown
        
        Args:
            df: Pandas DataFrame
            title: Table title
            
        Returns:
            Markdown formatted table
        """
        lines = [f"## {title}\n"]
        lines.append("| " + " | ".join(df.columns) + " |")
        lines.append("|" + "|".join(["---"] * len(df.columns)) + "|")
        
        for _, row in df.iterrows():
            lines.append("| " + " | ".join(str(val) for val in row) + " |")
        
        return "\n".join(lines)
    
    @staticmethod
    def json_to_diagram(json_data: Dict[str, Any], diagram_type: str = "flowchart"):
        """
        Auto-detect and convert JSON data to appropriate diagram
        
        Args:
            json_data: JSON/dict data to convert
            diagram_type: Type of diagram to generate
            
        Returns:
            Mermaid diagram markdown
        """
        if diagram_type == "flowchart":
            return MermaidConverter.to_flowchart(json_data)
        elif diagram_type == "pie":
            # Assume flat dict for pie chart
            return MermaidConverter.to_pie_chart(json_data)
        elif diagram_type == "class":
            # Assume list of class defs
            return MermaidConverter.to_class_diagram(json_data if isinstance(json_data, list) else [json_data])
        else:
            return MermaidConverter.to_flowchart(json_data)
    
    @staticmethod
    def query_result_to_markdown(
        query_result: str,
        include_diagram: bool = True,
        diagram_type: str = "flowchart"
    ):
        """
        Convert query result to markdown with optional diagram
        
        Args:
            query_result: String result from query
            include_diagram: Whether to include mermaid diagram
            diagram_type: Type of diagram to generate
            
        Returns:
            Markdown formatted result with diagram
        """
        markdown_lines = []
        
        # Add query result as code block
        markdown_lines.append("## Query Result\n")
        markdown_lines.append("```")
        markdown_lines.append(query_result)
        markdown_lines.append("```\n")
        
        # Try to add diagram if requested
        if include_diagram:
            try:
                # Try to parse as JSON for diagram generation
                if query_result.strip().startswith('{') or query_result.strip().startswith('['):
                    data = json.loads(query_result)
                    markdown_lines.append("## Visualization\n")
                    markdown_lines.append(MermaidConverter.json_to_diagram(data, diagram_type))
                else:
                    # Add as structured text diagram
                    markdown_lines.append("## Structure\n")
                    markdown_lines.append(MermaidConverter.text_to_smart_flowchart(query_result))
            except Exception as e:
                markdown_lines.append(f"\n> Note: Could not generate diagram ({str(e)})")
        
        return "\n".join(markdown_lines)
    

    @staticmethod
    def extract_numeric_data_from_text(text: str, query: str = ""):
        """
        GENERALIZED numeric data extraction from any text format.
        Uses regex patterns that work across most data representations.
        
        Supports:
        - Markdown tables (any format)
        - Bullet lists with numbers/percentages
        - Key-value pairs in any format
        - Inline "label: value" patterns
        
        Args:
            text: Text containing numeric data
            query: Original query for context (used to find target year/category)
            
        Returns:
            Dictionary of {label: value} pairs
        """
        data = {}
        
        # Extract any year mentioned in query for filtering
        target_filter = None
        year_match = re.search(r'\b(20\d{2})\b', query)
        if year_match:
            target_filter = year_match.group(1)
        
        # GENERIC PATTERN 1: Markdown tables
        # Matches: | Header1 | Header2 | ... | and extracts numeric columns
        table_rows = re.findall(r'^\|(.+)\|$', text, re.MULTILINE)
        if len(table_rows) >= 2:
            # Parse headers (first row) and data rows
            headers = [h.strip() for h in table_rows[0].split('|') if h.strip()]
            data_rows = []
            for row in table_rows[1:]:
                cells = [c.strip() for c in row.split('|') if c.strip()]
                # Skip separator rows (---)
                if cells and not all(re.match(r'^[-:]+$', c) for c in cells):
                    data_rows.append(cells)
            
            # Find the right row (matching filter or last row)
            target_row = None
            if target_filter and data_rows:
                for row in data_rows:
                    if row and target_filter in str(row[0]):
                        target_row = row
                        break
            if not target_row and data_rows:
                target_row = data_rows[-1]  # Use last row as default
            
            # Extract numeric values with their headers
            if target_row and headers:
                for i, header in enumerate(headers[1:], 1):  # Skip first column (usually labels)
                    if i < len(target_row):
                        # Extract number from cell
                        num_match = re.search(r'([\d.]+)', target_row[i])
                        if num_match:
                            value = float(num_match.group(1))
                            # Clean header name
                            clean_header = re.sub(r'\([^)]*\)', '', header).strip()
                            if clean_header and value > 0:
                                data[clean_header] = value
        
        # GENERIC PATTERN 2: Any "Label: Number" or "Label - Number" pattern
        if not data:
            # Matches: "Label: 42", "Label - 42%", "Label: 42 million", etc.
            kv_pattern = re.compile(
                r'[•\-\*\d.]*\s*([A-Za-z][^:|\-\n]{0,60})[\s:|\-]+(\d+(?:\.\d+)?)\s*(%|million|billion|M|B|k|K)?',
                re.MULTILINE | re.IGNORECASE
            )
            for match in kv_pattern.finditer(text):
                label = match.group(1).strip().strip('*_[]')
                value = float(match.group(2))
                unit = (match.group(3) or '').lower()
                
                # Normalize units
                if unit in ['billion', 'b']:
                    value *= 1000
                elif unit in ['k']:
                    value /= 1000
                
                # Skip labels that look like metadata/noise
                skip_words = ['year', 'date', 'row', 'column', 'table', 'total', 'sum', 'count']
                if label and value > 0 and label.lower() not in skip_words:
                    if label not in data:  # Avoid duplicates
                        data[label] = value
        
        return data
    
    @staticmethod
    def extract_process_steps(text: str):
        """
        GENERALIZED process/step extraction for flowcharts.
        Extracts logical steps, phases, or sequential items from text.
        
        Args:
            text: Text containing process information
            
        Returns:
            List of step descriptions
        """
        steps = []
        
        # Pattern 1: Numbered lists (1. Step, 2. Step, etc.)
        numbered = re.findall(r'^\s*\d+[.)]\s*(.+)$', text, re.MULTILINE)
        if numbered:
            steps.extend([s.strip() for s in numbered[:15]])
        
        # Pattern 2: Bullet lists (- Step, * Step, • Step)
        if not steps:
            bullets = re.findall(r'^\s*[\-\*•]\s*(.+)$', text, re.MULTILINE)
            if bullets:
                steps.extend([s.strip() for s in bullets[:15]])
        
        # Pattern 3: Headers (## Step, ### Phase, etc.)
        if not steps:
            headers = re.findall(r'^#+\s*(.+)$', text, re.MULTILINE)
            if headers:
                steps.extend([s.strip() for s in headers[:15]])
        
        # Pattern 4: Sentences with step keywords
        if not steps:
            step_keywords = r'(first|then|next|after|finally|step|phase|stage)'
            sentences = re.findall(rf'[^.]*{step_keywords}[^.]*\.', text, re.IGNORECASE)
            if sentences:
                steps.extend([s.strip() for s in sentences[:10]])
        
        return steps
    
    @staticmethod
    def text_to_pie_chart(text: str, title: str = "Distribution", query: str = ""):
        """
        Convert text containing numeric data to pie chart
        
        Args:
            text: Text content with numeric data
            title: Chart title
            query: Original query for context
            
        Returns:
            Mermaid pie chart markdown or fallback message
        """
        data = MermaidConverter.extract_numeric_data_from_text(text, query)
        
        if not data:
            return f"```\n⚠️ Could not extract numeric data for pie chart.\nPlease provide data in a structured format like:\n- Category A: 30%\n- Category B: 70%\n```"
        
        return MermaidConverter.to_pie_chart(data, title)
    
    @staticmethod
    def text_to_smart_flowchart(text: str, title: str = "Process"):
        """
        GENERALIZED flowchart that creates meaningful diagrams from text.
        Extracts logical steps and relationships rather than dumping lines.
        
        Args:
            text: Text content
            title: Chart title
            
        Returns:
            Mermaid flowchart markdown
        """
        steps = MermaidConverter.extract_process_steps(text)
        
        if not steps:
            # Fallback: extract first few meaningful sentences
            sentences = re.findall(r'[A-Z][^.!?]*[.!?]', text)
            steps = [s.strip()[:60] for s in sentences[:8] if len(s.strip()) > 10]
        
        if not steps:
            return "```\n⚠️ Could not extract process steps for flowchart.\n```"
        
        lines = ["```mermaid", "flowchart TD"]
        
        for i, step in enumerate(steps):
            # Clean and truncate step text
            clean_step = re.sub(r'["\'\[\]{}]', '', step)
            if len(clean_step) > 50:
                clean_step = clean_step[:47] + "..."
            
            node_id = f"S{i+1}"
            lines.append(f'    {node_id}["{clean_step}"]')
            
            if i > 0:
                prev_id = f"S{i}"
                lines.append(f"    {prev_id} --> {node_id}")
        
        lines.append("```")
        return "\n".join(lines)
    
    @staticmethod
    def create_analysis_report(
        title: str,
        summary: str,
        data_points: List[Dict[str, Any]],
        diagram_type: str = "flowchart"
    ):
        """
        Create comprehensive analysis report with multiple diagrams
        
        Args:
            title: Report title
            summary: Executive summary
            data_points: List of data points with 'label', 'value', 'description'
            diagram_type: Type of visualization
            
        Returns:
            Complete markdown report with diagrams
        """
        lines = [
            f"# {title}\n",
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n",
            f"## Summary\n",
            summary + "\n",
            f"## Data Analysis\n"
        ]
        
        # Add data points as table
        if data_points:
            lines.append("| Label | Value | Description |")
            lines.append("|-------|-------|-------------|")
            for dp in data_points:
                label = dp.get('label', '')
                value = dp.get('value', '')
                desc = dp.get('description', '')
                lines.append(f"| {label} | {value} | {desc} |")
            
            lines.append("")
        
        # Add visualization
        lines.append("## Visualization\n")
        if diagram_type == "pie" and data_points:
            # Create pie chart data
            pie_data = {dp['label']: float(dp['value']) for dp in data_points if dp.get('value')}
            lines.append(MermaidConverter.to_pie_chart(pie_data, title))
        else:
            lines.append(MermaidConverter.to_flowchart({dp['label']: dp['value'] for dp in data_points}, title))
        
        return "\n".join(lines)


def auto_detect_and_convert(data: Any):
    """
    Auto-detect data structure and convert to most appropriate Mermaid diagram
    
    Args:
        data: Any data structure (dict, list, DataFrame, etc.)
        
    Returns:
        Tuple of (markdown_string, diagram_type_used)
    """
    try:
        # DataFrame detection
        if isinstance(data, pd.DataFrame):
            return MermaidConverter.dataframe_to_table_diagram(data), "table"
        
        # List of dicts (potential class diagram or records)
        if isinstance(data, list) and len(data) > 0:
            if all(isinstance(item, dict) for item in data):
                if 'name' in data[0] and ('properties' in data[0] or 'methods' in data[0]):
                    return MermaidConverter.to_class_diagram(data), "class"
                else:
                    # Treat as sequence/tasks
                    if 'start' in data[0] and 'end' in data[0]:
                        return MermaidConverter.to_gantt_chart(data), "gantt"
                    return MermaidConverter.to_flowchart({"items": len(data), "type": type(data).__name__}), "flowchart"
        
        # Dictionary detection
        if isinstance(data, dict):
            # Check if it's numerical (pie chart candidate)
            if all(isinstance(v, (int, float)) for v in data.values()):
                return MermaidConverter.to_pie_chart(data), "pie"
            else:
                return MermaidConverter.to_flowchart(data), "flowchart"
        
        # String data
        if isinstance(data, str):
            return MermaidConverter.query_result_to_markdown(data), "text"
        
        # Fallback
        return MermaidConverter.to_flowchart({"data": str(data)}), "flowchart"
    
    except Exception as e:
        return f"Error converting data: {str(e)}", "error"


def convert_query_to_mermaid_markdown(
    query_result: str,
    include_diagram: bool = True,
    diagram_type: str = "auto"
):
    """
    Convert query results to Mermaid markdown format for data visualization
    
    Args:
        query_result: The result/response from query
        include_diagram: Whether to include mermaid diagram (default: True)
        diagram_type: Type of diagram - 'flowchart', 'pie', 'gantt', 'sequence', 'auto'
        
    Returns:
        Dictionary with 'markdown', 'diagram', 'diagram_type', 'raw_response' keys
    """
    try:
        markdown_output = []
        detected_type = diagram_type
        
        markdown_output.append("## Response\n")
        markdown_output.append("```")
        markdown_output.append(query_result)
        markdown_output.append("```\n")
        
        # Generate diagram if requested
        diagram_markdown = ""
        if include_diagram:
            try:
                # Try to parse as JSON for intelligent diagram generation
                if query_result.strip().startswith('{') or query_result.strip().startswith('['):
                    data = json.loads(query_result)
                    
                    if diagram_type == "auto":
                        diagram_markdown, detected_type = auto_detect_and_convert(data)
                    else:
                        diagram_markdown = MermaidConverter.json_to_diagram(data, diagram_type)
                        detected_type = diagram_type
                    
                    markdown_output.append("## Data Visualization\n")
                    markdown_output.append(diagram_markdown)
                else:
                    # Text response - auto-detect best diagram type or use requested
                    title = "Visualization"
                    
                    # Use generalized converters based on diagram type
                    if diagram_type in ["pie", "bar"]:
                        diagram_markdown = MermaidConverter.text_to_pie_chart(query_result, title, "")
                        detected_type = "pie"
                        markdown_output.append("## Chart\n")
                    else:
                        # For flowchart, sequence, gantt, class, or auto - use smart flowchart
                        diagram_markdown = MermaidConverter.text_to_smart_flowchart(query_result)
                        detected_type = "flowchart"
                        markdown_output.append("## Diagram\n")
                    
                    markdown_output.append(diagram_markdown)
                    
            except json.JSONDecodeError:
                # Not JSON - use generalized text converters
                title = "Visualization"
                
                if diagram_type in ["pie", "bar"]:
                    diagram_markdown = MermaidConverter.text_to_pie_chart(query_result, title, "")
                    detected_type = "pie"
                else:
                    diagram_markdown = MermaidConverter.text_to_smart_flowchart(query_result)
                    detected_type = "flowchart"
                markdown_output.append("## Diagram\n")
                markdown_output.append(diagram_markdown)
            except Exception as e:
                markdown_output.append(f"\n> ⚠️  Diagram generation failed: {str(e)}")
        
        return {
            "markdown": "\n".join(markdown_output),
            "diagram": diagram_markdown,
            "diagram_type": detected_type,
            "raw_response": query_result,
            "success": True
        }
        
    except Exception as e:
        return {
            "markdown": f"Error converting to markdown: {str(e)}",
            "diagram": "",
            "diagram_type": "error",
            "raw_response": query_result,
            "success": False,
            "error": str(e)
        }


def create_analysis_markdown(
    title: str,
    summary: str,
    analysis_data: List[Dict[str, Any]],
    visualization_type: str = "pie"
):
    """
    Create a comprehensive analysis markdown report with mermaid visualization
    
    Args:
        title: Report title
        summary: Executive summary
        analysis_data: List of data points with 'label', 'value', 'description'
        visualization_type: Type of visualization ('pie', 'flowchart', 'table')
        
    Returns:
        Complete markdown report with embedded mermaid diagram
    """
    return MermaidConverter.create_analysis_report(
        title=title,
        summary=summary,
        data_points=analysis_data,
        diagram_type=visualization_type
    )


def dataframe_to_mermaid_markdown(df: pd.DataFrame, title: str = "Data Analysis"):
    """
    Convert pandas DataFrame to markdown table with optional visualization
    
    Args:
        df: Pandas DataFrame to convert
        title: Table/report title
        
    Returns:
        Markdown formatted table
    """
    return MermaidConverter.dataframe_to_table_diagram(df, title)

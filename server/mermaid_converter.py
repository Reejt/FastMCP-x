"""
Mermaid Converter Module
Converts query results and structured data to Mermaid diagram markdown
Enables data visualization through Mermaid syntax rendering
Uses LLM for intelligent diagram generation
"""

import json
import re
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
from datetime import datetime
import asyncio


def clean_mermaid_syntax(mermaid_code: str) -> str:
    """
    Clean and validate Mermaid diagram syntax to fix common issues
    
    Args:
        mermaid_code: Raw Mermaid code string
        
    Returns:
        Cleaned Mermaid code with fixed syntax
    """
    if not mermaid_code:
        return mermaid_code
    
    # Remove code block markers if present
    cleaned = mermaid_code.strip()
    if cleaned.startswith('```mermaid'):
        cleaned = cleaned[10:].strip()
    if cleaned.startswith('```'):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith('```'):
        cleaned = cleaned[:-3].strip()
    
    # Fix common syntax errors
    # 1. Fix ALL variations of broken arrows with spaces
    # CRITICAL: These patterns must run FIRST before any other transformations
    # Common LLM error: "A[Text] - -> B[Text]" should be "A[Text] --> B[Text]"
    
    # Fix patterns with spaces in arrows (most aggressive patterns first)
    cleaned = re.sub(r'\]\s*-\s+->\s*\[', '] --> [', cleaned)  # "] - -> [" -> "] --> ["
    cleaned = re.sub(r'\]\s*-\s+>\s*\[', '] -> [', cleaned)    # "] - > [" -> "] -> ["
    
    # Fix "- ->" pattern variations (space between hyphens and arrow)
    cleaned = re.sub(r'-\s+-\s*>', '-->', cleaned)  # "- -> " or "- ->" with any whitespace
    cleaned = re.sub(r'-\s+>\s*', '->', cleaned)     # "- > " with any whitespace
    
    # Fix exact literal patterns
    cleaned = re.sub(r'- ->', '-->', cleaned)  # Exact match: "- ->" -> "-->"
    cleaned = re.sub(r'- - >', '-->', cleaned)  # Exact match: "- - >" -> "-->"
    cleaned = re.sub(r'-- >', '-->', cleaned)  # Exact match: "-- >" -> "-->"
    cleaned = re.sub(r'- >', '->', cleaned)    # Exact match: "- >" -> "->"
    
    # Final cleanup: Remove any remaining spaces within arrow syntax
    cleaned = re.sub(r'--\s+>', '-->', cleaned)   # "-- >" -> "-->"
    cleaned = re.sub(r'-\s+>', '->', cleaned)     # "- >" -> "->"
    
    # 2. Fix malformed arrows like -->| or ->| (should be --> or ->)
    cleaned = re.sub(r'-->\s*\|(?!\w)', '-->', cleaned)
    cleaned = re.sub(r'->\s*\|(?!\w)', '->', cleaned)
    
    # 3. Fix arrows with labels that have syntax issues
    # Valid: -->|label| or -->|"label"|
    # Fix incomplete arrow labels: -->|label to -->|label|
    # Look for -->| followed by text but not closed with |
    cleaned = re.sub(r'(-->|->)\|([^|\n]+?)(?=\s+\w+\[|\s*$)', r'\1|\2|', cleaned)
    
    # 4. Fix arrows followed by stray pipe without proper label format
    # Replace patterns like "A -->| B" with "A --> B"
    cleaned = re.sub(r'(-->) \| (\w)', r'\1 \2', cleaned)
    cleaned = re.sub(r'(->) \| (\w)', r'\1 \2', cleaned)
    
    # 5. Ensure proper spacing around arrows (but not breaking them apart)
    cleaned = re.sub(r'\s*(-->)\s*', r' \1 ', cleaned)
    cleaned = re.sub(r'\s*(->)\s*', r' \1 ', cleaned)
    
    # 6. Remove duplicate pipes in arrow labels (-->||text|| -> -->|text|)
    cleaned = re.sub(r'\|\|', '|', cleaned)
    
    return cleaned



async def convert_query_to_mermaid_markdown(
    include_diagram: bool = True,
    diagram_type: str = "auto",
    conversation_history: list = None,
    query: str = None
):
    """
    Convert user query to Mermaid markdown format for data visualization.
    Uses LLM to generate mermaid code from the user's query.
    
    Args:
        include_diagram: Whether to include mermaid diagram (default: True)
        diagram_type: Type of diagram - 'flowchart', 'pie', 'gantt', 'sequence', 'auto'
        conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}] (optional)
        query: The original user query (used to generate better diagrams)
        
    Returns:
        Dictionary with 'diagram', 'diagram_type' keys
    """
    
    
    # Extract context from conversation history if available
    conversation_context = ""
    if conversation_history and len(conversation_history) > 0:
        # Get the last user query for context
        for msg in reversed(conversation_history):
            if msg.get('role') == 'user':
                conversation_context = msg.get('content', '')
                break
    
    # Use provided query or extract from conversation history
    if not query and conversation_context:
        query = conversation_context
    
    try:
        diagram_markdown = ""
        detected_type = diagram_type
        
        if include_diagram:
            try:
                # Call LLM to generate mermaid code based on user query and result
                diagram_markdown = await _generate_diagram_with_llm(
                    query=query,
                    diagram_type=diagram_type
                )
                
                if diagram_markdown and "```mermaid" in diagram_markdown:
                    # Extract diagram type from generated mermaid code
                    type_match = re.search(r'```mermaid\n(\w+)', diagram_markdown)
                    if type_match:
                        detected_type = type_match.group(1).lower()
                    
                    return {
                        "diagram": diagram_markdown,
                        "diagram_type": detected_type,
                        "success": True
                    }
                else:
                    # LLM failed to generate diagram, return empty diagram
                    print(f"⚠️ LLM failed to generate diagram")
                    
                    return {
                        "diagram": "",
                        "diagram_type": "none",
                        "success": True
                    }
                
            except Exception as e:
                print(f"⚠️ Diagram generation error: {str(e)}")
                # LLM failed, return empty diagram
                
                return {
                    "diagram": "",
                    "diagram_type": "error",
                    "success": True,
                    "error": str(e)
                }
        
        return {
            "diagram": diagram_markdown,
            "diagram_type": detected_type,
            "success": True
        }
        
    except Exception as e:
        return {
            "diagram": "",
            "diagram_type": "error",
            "success": False,
            "error": str(e)
        }


async def _generate_diagram_with_llm(
    query: str = None,
    diagram_type: str = "auto"
):
    """
    Use LLM twice to generate mermaid diagram code from user query
    
    Args:
        query: The original user question
        diagram_type: Preferred diagram type ('auto', 'flowchart', 'pie', etc.)
        
    Returns:
        Mermaid diagram markdown or empty string if generation fails
    """
    from server.query_handler import query_model
    
    try:
        # Ensure we have content to work with
        if not query:
            print("⚠️ No user query provided for diagram generation")
            return ""
        
        # ============================================
        # SINGLE LLM CALL: Generate Mermaid diagram directly from query
        # ============================================
        print(f"📊 Generating Mermaid diagram from query...")
        
        # Build diagram-specific prompts based on type
        if diagram_type == "pie":
            diagram_system_prompt = """Generate a valid Mermaid PIE CHART following these rules:
1. Start with: pie title "Your Title Here"
2. Use format: "Label" : value
3. NO arrows, NO nodes, NO flowchart syntax
4. Return ONLY the code block wrapped in ```mermaid tags

Example:
```mermaid
pie title Pet Adoption Statistics
    "Dogs" : 45
    "Cats" : 30
    "Birds" : 15
    "Fish" : 10
```"""
        else:
            # Flowchart and other diagram types
            diagram_system_prompt = """Generate valid Mermaid diagram code following these STRICT rules:

CRITICAL ARROW SYNTAX RULES (MOST IMPORTANT):
1. ARROWS MUST BE: --> (two hyphens, one greater-than, NO SPACES ANYWHERE)
2. NEVER use: "- ->", "- >", "-- >", "- - >", or any arrow with spaces
3. CORRECT: A[Start] --> B[End]
4. WRONG: A[Start] - -> B[End]  ❌
5. WRONG: A[Start] - > B[End]   ❌
6. WRONG: A[Start] -- > B[End]  ❌

NODE AND TEXT RULES:
1. Node IDs MUST be simple letters/numbers ONLY: A, B, C, Node1, Node2
2. Node IDs CANNOT contain: spaces, parentheses, special characters, or symbols
3. Put ALL text in square brackets: A[Your Label Here]
4. Use ONLY ASCII characters, NO unicode arrows (→) or special symbols (&)
5. For "and" use "and" not "&"

Example flowchart (COPY THIS ARROW SYNTAX EXACTLY):
```mermaid
flowchart TD
    A[Light Energy] --> B[Chlorophyll]
    B --> C[Light Reactions]
    C --> D[ATP and NADPH]
    D --> E[Calvin Cycle]
    E --> F[CO2 to Glucose]
```"""
        
        diagram_user_prompt = f"Create a {diagram_type} mermaid diagram for this:\n\n{query}"

        # Single LLM call - Generate Mermaid diagram directly
        diagram_response = await query_model(
            system_prompt=diagram_system_prompt,
            user_prompt=diagram_user_prompt,
            timeout=45  # Reduced timeout since it's only one call
        )
        
        print(f"✅ Diagram generation complete")
        print(f"📝 Response (first 500 chars): {str(diagram_response)[:500]}")
        print(f"📝 Full response length: {len(str(diagram_response)) if diagram_response else 0}")
        
        if diagram_response and isinstance(diagram_response, str):
            response_lower = diagram_response.lower().strip()
            
            # Check if response contains mermaid keywords
            has_mermaid_keyword = any(keyword in response_lower for keyword in ['pie', 'flowchart', 'sequencediagram', 'gantt', 'classDiagram', 'stateDiagram', 'graph'])
            
            if not has_mermaid_keyword:
                print(f"⚠️ No mermaid keywords detected in response")
                print(f"📝 Response: {diagram_response[:200]}")
            
            # Extract mermaid code block if present
            mermaid_match = re.search(r'```mermaid\n([\s\S]*?)\n```', diagram_response)
            if mermaid_match:
                mermaid_code = mermaid_match.group(1).strip()
                
                # Debug: Check for broken arrows before cleaning
                if '- ->' in mermaid_code or '- >' in mermaid_code or '-- >' in mermaid_code:
                    print(f"⚠️ Detected broken arrow syntax in LLM output - applying fixes...")
                    print(f"📝 Sample before cleaning: {mermaid_code[:200]}")
                
                # Clean the mermaid syntax
                mermaid_code_cleaned = clean_mermaid_syntax(mermaid_code)
                
                # Debug: Show if cleaning made changes
                if mermaid_code != mermaid_code_cleaned:
                    print(f"✅ Syntax cleaning applied successfully")
                    print(f"📝 Sample after cleaning: {mermaid_code_cleaned[:200]}")
                
                print(f"✅ Matched ```mermaid``` code block and cleaned syntax")
                return f"```mermaid\n{mermaid_code_cleaned}\n```"
            
            # Try without code block markers
            elif diagram_response.strip().startswith('flowchart') or diagram_response.strip().startswith('graph') or diagram_response.strip().startswith('pie') or diagram_response.strip().startswith('sequenceDiagram'):
                print(f"✅ Found raw mermaid code without tags")
                cleaned_code = clean_mermaid_syntax(diagram_response.strip())
                return f"```mermaid\n{cleaned_code}\n```"
            
            # Try finding mermaid code anywhere in response
            else:
                if '```' in diagram_response:
                    print(f"✅ Found code block in response")
                    # Extract and clean any code block
                    code_match = re.search(r'```(?:mermaid)?\n([\s\S]*?)\n```', diagram_response)
                    if code_match:
                        mermaid_code = code_match.group(1).strip()
                        cleaned_code = clean_mermaid_syntax(mermaid_code)
                        return f"```mermaid\n{cleaned_code}\n```"
                    return diagram_response
                elif has_mermaid_keyword:
                    print(f"✅ Found mermaid keyword, wrapping response")
                    cleaned_code = clean_mermaid_syntax(diagram_response.strip())
                    return f"```mermaid\n{cleaned_code}\n```"
                else:
                    print(f"⚠️ Could not extract valid mermaid from response")
                    print(f"📝 Response content: {diagram_response[:300]}")
        
        return ""
        
    except Exception as e:
        print(f"⚠️ LLM diagram generation error: {str(e)}")
        return ""




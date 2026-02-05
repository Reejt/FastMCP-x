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
        # FIRST LLM CALL: Analyze and extract information from user query
        # ============================================
        print(f"📊 LLM Call 1: Analyzing user query...")
        
        analysis_system_prompt = """You are an expert data analyst and information extractor.
Your task is to analyze the provided query and extract the KEY information that should be visualized.
Return a structured analysis that identifies the main concepts, relationships, and data points."""

        analysis_user_prompt = f"Analyze this query and extract key information for visualization:\n\n{query}"

        # First LLM call - Analyze the query
        analysis_result = await query_model(
            system_prompt=analysis_system_prompt,
            user_prompt=analysis_user_prompt,
            timeout=60
        )
        
        if not analysis_result:
            print(f"⚠️ LLM Call 1 failed: No analysis result")
            return ""
        
        print(f"✅ LLM Call 1 complete: Extracted information from query")
        
        # ============================================
        # SECOND LLM CALL: Generate Mermaid diagram from analyzed information
        # ============================================
        print(f"📊 LLM Call 2: Generating Mermaid diagram...")
        
        diagram_system_prompt = "Generate valid Mermaid diagram code. Return ONLY the code block wrapped in ```mermaid tags. No explanation or other text."
        
        diagram_user_prompt = f"Create a {diagram_type} mermaid diagram from this:\n\n{analysis_result}"

        # Second LLM call - Generate Mermaid diagram
        diagram_response = await query_model(
            system_prompt=diagram_system_prompt,
            user_prompt=diagram_user_prompt,
            timeout=60
        )
        
        print(f"✅ LLM Call 2 complete: Generated Mermaid diagram")
        print(f"📝 LLM Call 2 response (first 500 chars): {str(diagram_response)[:500]}")
        print(f"📝 Full response length: {len(str(diagram_response)) if diagram_response else 0}")
        
        if diagram_response and isinstance(diagram_response, str):
            response_lower = diagram_response.lower().strip()
            
            # Check if response contains mermaid keywords
            has_mermaid_keyword = any(keyword in response_lower for keyword in ['pie', 'flowchart', 'sequencediagram', 'gantt', 'classDiagram', 'stateDiagram', 'graph'])
            
            if not has_mermaid_keyword:
                print(f"⚠️ LLM Call 2: No mermaid keywords detected in response")
                print(f"📝 Response: {diagram_response[:200]}")
            
            # Extract mermaid code block if present
            mermaid_match = re.search(r'```mermaid\n([\s\S]*?)\n```', diagram_response)
            if mermaid_match:
                mermaid_code = mermaid_match.group(1).strip()
                print(f"✅ Matched ```mermaid``` code block")
                return f"```mermaid\n{mermaid_code}\n```"
            
            # Try without code block markers
            elif diagram_response.strip().startswith('flowchart') or diagram_response.strip().startswith('graph') or diagram_response.strip().startswith('pie') or diagram_response.strip().startswith('sequenceDiagram'):
                print(f"✅ Found raw mermaid code without tags")
                return f"```mermaid\n{diagram_response.strip()}\n```"
            
            # Try finding mermaid code anywhere in response
            else:
                if '```' in diagram_response:
                    print(f"✅ Found code block in response")
                    return diagram_response
                elif has_mermaid_keyword:
                    print(f"✅ Found mermaid keyword, wrapping response")
                    return f"```mermaid\n{diagram_response.strip()}\n```"
                else:
                    print(f"⚠️ Could not extract valid mermaid from response")
                    print(f"📝 Response content: {diagram_response[:300]}")
        
        return ""
        
    except Exception as e:
        print(f"⚠️ LLM diagram generation error: {str(e)}")
        return ""




"""
Autonomous Agent Module for FastMCP
Implements agentic reasoning and decision-making capabilities
- Takes high-level goals and autonomously decides which tools to use
- Executes tool sequences to accomplish objectives
- Monitors results and iterates when needed
"""

import json
import re
from typing import Any, Dict, List, Optional
from server.query_handler import query_model, answer_query, answer_link_query, query_csv_with_context, query_excel_with_context
from server.document_ingestion import ingest_file
from server.web_search_file import tavily_web_search

# Available tools the agent can call
AVAILABLE_TOOLS = {
    "answer_query": "Search documents and answer questions",
    "web_search": "Search the web for current information",
    "answer_link_query": "Extract and analyze content from a specific URL",
    "query_csv_data": "Query and analyze CSV files with natural language",
    "query_excel_data": "Query and analyze Excel files with natural language",
    "ingest_file": "Upload and process files into the system",
    "list_documents": "List available documents/files in the system"
}

class FastMCPAgent:
    """
    Autonomous agent that reasons about goals and executes tool sequences
    """
    
    def __init__(self, model: str = "llama3.2:1b"):
        self.model = model
        self.max_iterations = 10  # Prevent infinite loops
        self.current_iteration = 0
        self.action_history = []
        
    def plan_actions(self, goal: str, context: Optional[str] = None):
        """
        Use LLM to reason about which tools to use and in what sequence
        
        Args:
            goal: The objective to accomplish
            context: Optional background information
        
        Returns:
            List of planned tool calls with parameters
        """
        
        planning_prompt = f"""You are an intelligent agent that plans tool usage sequences to accomplish goals.

Available tools:
{json.dumps(AVAILABLE_TOOLS, indent=2)}

Goal: {goal}
{f"Context: {context}" if context else ""}

Analyze the goal and plan a sequence of tool calls needed to accomplish it.
Return a JSON array of tool calls in this format:
[
  {{
    "tool": "tool_name",
    "params": {{"param1": "value1", "param2": "value2"}},
    "reason": "Why this tool is needed"
  }},
  ...
]

Only return valid JSON, no other text."""

        try:
            # Use query_model to get LLM response
            result_text = query_model(planning_prompt)
            
            # Extract JSON from response
            json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
            if json_match:
                try:
                    plan = json.loads(json_match.group())
                    print(f"🤖 Agent planned {len(plan)} actions:")
                    for i, action in enumerate(plan, 1):
                        print(f"  {i}. {action.get('tool')} - {action.get('reason')}")
                    return plan
                except json.JSONDecodeError:
                    print(f"Failed to parse plan JSON: {json_match.group()}")
                    return []
        except Exception as e:
            print(f"Error planning actions: {e}")
        
        return []
    
    def execute_tool(self, tool_name: str, params: Dict[str, Any]):
        """
        Execute a tool and return its result
        
        Args:
            tool_name: Name of the tool to execute
            params: Parameters for the tool
        
        Returns:
            Tool execution result
        """
        
        print(f"🔧 Executing: {tool_name}")
        print(f"   Parameters: {json.dumps(params, indent=2)}")
        
        # Connect to actual MCP tools
        try:
            if tool_name == "answer_query":
                # Call actual answer_query function
                result = answer_query(
                    query=params.get("query", ""),
                    conversation_history=json.loads(params.get("conversation_history", "[]")),
                    workspace_id=params.get("workspace_id")
                )
            elif tool_name == "web_search":
                # Call actual web search function
                result = tavily_web_search(
                    query=params.get("query", ""),
                    conversation_history=json.loads(params.get("conversation_history", "[]")),
                    workspace_id=params.get("workspace_id")
                )
            elif tool_name == "answer_link_query":
                # Call actual link query function
                result = answer_link_query(
                    url=params.get("url", ""),
                    query=params.get("query", ""),
                    conversation_history=json.loads(params.get("conversation_history", "[]")),
                    workspace_id=params.get("workspace_id")
                )
            elif tool_name == "query_csv_data":
                # Call actual CSV query function
                result = query_csv_with_context(
                    query=params.get("query", ""),
                    file_name=params.get("file_name", ""),
                    file_path=params.get("file_path", ""),
                    conversation_history=json.loads(params.get("conversation_history", "[]"))
                )
            elif tool_name == "query_excel_data":
                # Call actual Excel query function
                result = query_excel_with_context(
                    query=params.get("query", ""),
                    file_name=params.get("file_name", ""),
                    file_path=params.get("file_path", ""),
                    conversation_history=json.loads(params.get("conversation_history", "[]"))
                )
            elif tool_name == "ingest_file":
                # Call actual file ingestion function
                result = ingest_file(
                    file_path=params.get("file_path", ""),
                    user_id=params.get("user_id", "agent"),
                    workspace_id=params.get("workspace_id"),
                    base64_content=params.get("base64_content"),
                    file_name=params.get("file_name")
                )
            elif tool_name == "list_documents":
                # List available documents
                try:
                    from server.query_handler import supabase_client
                    if supabase_client:
                        files_result = supabase_client.table('file_upload').select('id,file_name,file_size,uploaded_at').limit(20).execute()
                        if files_result and files_result.data:
                            file_list = [f"{f['file_name']} ({f.get('file_size', 0)} bytes)" for f in files_result.data]
                            result = f"Available documents:\n" + "\n".join(file_list)
                        else:
                            result = "No documents found in system"
                    else:
                        result = "Database connection not available"
                except Exception as e:
                    result = f"Error listing documents: {str(e)}"
            else:
                result = f"Unknown tool: {tool_name}"
            
            print(f"   Result: {result[:100]}..." if len(str(result)) > 100 else f"   Result: {result}")
            return result
            
        except Exception as e:
            error_msg = f"Tool execution error: {str(e)}"
            print(f"   ❌ {error_msg}")
            return error_msg
    
    def evaluate_result(self, action: Dict[str, str], result: str, goal: str) -> Dict[str, Any]:
        """
        Use LLM to evaluate if tool result brings us closer to the goal
        
        Args:
            action: The action that was executed
            result: The result from tool execution
            goal: The original goal
        
        Returns:
            Evaluation with success status and next steps
        """
        
        evaluation_prompt = f"""You are evaluating tool execution results.

Original Goal: {goal}
Tool Used: {action.get('tool')}
Tool Result: {result[:500]}

Evaluate:
1. Does this result help achieve the goal? (yes/no)
2. Should we execute more tools? (yes/no)
3. What should we do next? (brief reason)

Return JSON:
{{
  "progress": true/false,
  "goal_achieved": true/false,
  "needs_more_tools": true/false,
  "next_step": "description of what to do"
}}"""

        try:
            # Use query_model to get LLM response
            result_text = query_model(evaluation_prompt)
            
            json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if json_match:
                try:
                    evaluation = json.loads(json_match.group())
                    return evaluation
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            print(f"Error evaluating result: {e}")
        
        # Default evaluation if LLM fails
        return {
            "progress": True,
            "goal_achieved": False,
            "needs_more_tools": True,
            "next_step": "Continue with next planned action"
        }
    
    def run(self, goal: str, context: Optional[str] = None, max_iterations: int = 10) -> Dict[str, Any]:
        """
        Run the autonomous agent to accomplish a goal
        
        Args:
            goal: The objective to accomplish
            context: Optional background information
            max_iterations: Maximum iterations to prevent infinite loops
        
        Returns:
            Agent execution results including history and final outcome
        """
        
        print(f"\n🚀 Starting Agent for goal: {goal}")
        print(f"{'='*60}")
        
        self.max_iterations = max_iterations
        self.current_iteration = 0
        self.action_history = []
        
        # Enhance context with available documents
        enhanced_context = context or ""
        try:
            from server.query_handler import supabase_client
            if supabase_client:
                files_result = supabase_client.table('file_upload').select('id,file_name,file_size,uploaded_at').limit(10).execute()
                if files_result and files_result.data:
                    file_list = ", ".join([f["file_name"] for f in files_result.data])
                    enhanced_context += f"\n\nAvailable documents: {file_list}"
                    print(f"📚 Available documents loaded: {len(files_result.data)} files")
        except Exception as e:
            print(f"Note: Could not fetch available documents: {e}")
        
        # Phase 1: Planning
        plan = self.plan_actions(goal, enhanced_context)
        if not plan:
            return {
                "goal": goal,
                "success": False,
                "error": "Failed to generate action plan",
                "history": []
            }
        
        # Phase 2: Execution with feedback loop
        final_result = None
        goal_achieved = False
        
        for action in plan:
            self.current_iteration += 1
            if self.current_iteration > self.max_iterations:
                print(f"⚠️  Max iterations ({self.max_iterations}) reached")
                break
            
            # Execute tool
            tool_result = self.execute_tool(action.get("tool", ""), action.get("params", {}))
            
            # Record action
            action_record = {
                "iteration": self.current_iteration,
                "tool": action.get("tool"),
                "params": action.get("params"),
                "result": tool_result,
                "timestamp": None
            }
            self.action_history.append(action_record)
            
            # Evaluate result
            evaluation = self.evaluate_result(action, tool_result, goal)
            print(f"  📊 Progress: {evaluation.get('progress')} | Goal Achieved: {evaluation.get('goal_achieved')}")
            
            final_result = tool_result
            goal_achieved = evaluation.get("goal_achieved", False)
            
            # Stop if goal is achieved
            if goal_achieved:
                print(f"✅ Goal achieved!")
                break
        
        print(f"{'='*60}")
        print(f"Agent completed in {self.current_iteration} iterations\n")
        
        return {
            "goal": goal,
            "success": goal_achieved,
            "final_result": final_result,
            "iterations": self.current_iteration,
            "history": self.action_history
        }

# Export agent instance
agent = FastMCPAgent()

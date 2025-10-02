# Handles model switching and querying
from fastmcp import FastMCP
import subprocess


mcp = FastMCP("My MCP Server")
current_model = "gemini"  # Default model

@mcp.tool
def switch_model(model_name: str) -> str:
    global current_model
    current_model = model_name
    return f"Model switched to {model_name}"


def query_model(query: str) -> str:
    """Query the current active model with the provided query."""
    global current_model
    
    if current_model == "gemini":
        try:
            # Call Gemini CLI with the query
            result = subprocess.run(
                ["gemini", "chat", "--message", query],
                capture_output=True,
                text=True,
                check=True,
                timeout=30  # 30 second timeout
            )
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            return f"Gemini query timed out after 30 seconds"
        except subprocess.CalledProcessError as e:
            return f"Gemini CLI error: {e.stderr.strip() if e.stderr else str(e)}"
        except FileNotFoundError:
            return f"Gemini CLI not found. Please ensure Gemini is installed and in PATH."
        except Exception as e:
            return f"Error querying Gemini: {str(e)}"
    
    elif current_model.startswith("llama"):
        try:
            # Call Ollama for Llama models
            result = subprocess.run(
                ["ollama", "run", current_model, query],
                capture_output=True,
                text=True,
                check=True,
                timeout=60  # 60 second timeout for Llama
            )
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            return f"Llama query timed out after 60 seconds"
        except subprocess.CalledProcessError as e:
            return f"Ollama CLI error: {e.stderr.strip() if e.stderr else str(e)}"
        except FileNotFoundError:
            return f"Ollama CLI not found. Please ensure Ollama is installed and in PATH."
        except Exception as e:
            return f"Error querying Llama: {str(e)}"
    
    else:
        # Fallback for unsupported models
        return f"Model '{current_model}' is not supported yet. Supported models: gemini, llama3.2:3b"


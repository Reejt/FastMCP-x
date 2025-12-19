/**
 * CodeChat.tsx
 * Main component for code chat and completions
 * Integrates with FastMCP-x backend
 */

import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";

interface Message {
  role: "user" | "assistant";
  content: string;
  type: "text" | "code";
}

interface CompletionRequest {
  code_context: string;
  language: string;
  file_path: string;
}

interface CompletionResponse {
  completions: string[];
}

interface CodeChatRequest {
  user_message: string;
  code_context: string;
  language: string;
}

interface CodeChatResponse {
  response: string;
}

export function CodeChat() {
  // State for code editor
  const [code, setCode] = useState("def hello(<cursor/>):");
  const [language, setLanguage] = useState("python");
  const [cursorPos, setCursorPos] = useState(0);

  // State for chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [selectedText, setSelectedText] = useState("");

  // Completion hook state
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Chat hook state
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // useCodeCompletion hook logic
  const getCompletion = async (params: CompletionRequest): Promise<CompletionResponse> => {
    setCompletionLoading(true);
    setCompletionError(null);

    try {
      const response = await fetch("/api/chat/completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get completion";
      setCompletionError(errorMessage);
      return { completions: [] };
    } finally {
      setCompletionLoading(false);
    }
  };

  // useCodeChat hook logic
  const codeChatSend = async (params: CodeChatRequest): Promise<CodeChatResponse> => {
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch("/api/chat/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setChatError(errorMessage);
      return { response: "" };
    } finally {
      setChatLoading(false);
    }
  };

  // Get code completion
  const handleGetCompletion = async () => {
    const result = await getCompletion({
      code_context: code,
      language: language,
      file_path: "editor.ts",
    });
    setSuggestions(result.completions);
    setShowSuggestions(true);
  };

  // Apply suggestion to code
  const applySuggestion = (suggestion: string) => {
    const cursorIdx = code.indexOf("<cursor/>");
    if (cursorIdx !== -1) {
      const before = code.substring(0, cursorIdx);
      const after = code.substring(cursorIdx + 9); // 9 = length of "<cursor/>"
      setCode(before + suggestion + after);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Ask about code
  const handleAskAboutCode = async () => {
    if (!userInput.trim()) return;

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: userInput,
      type: "text",
    };
    setMessages([...messages, userMessage]);

    // Get AI response
    const result = await codeChatSend({
      user_message: userInput,
      code_context: selectedText || code,
      language: language,
    });

    // Add assistant message
    const assistantMessage: Message = {
      role: "assistant",
      content: result.response || "No response",
      type: "text",
    };
    setMessages([...messages, userMessage, assistantMessage]);
    setUserInput("");
  };

  // Handle Enter key in chat input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAboutCode();
    }
  };

  return (
    <div className="flex h-screen gap-4 p-4 bg-gray-100">
      {/* Left: Code Editor */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">Code Editor</h2>
          <div className="flex gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-2 py-1 border rounded"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="go">Go</option>
            </select>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={(value: string | undefined) => setCode(value || "")}
            theme="vs-dark"
            onMount={(editor: any) => {
              editor.onDidChangeCursorPosition((e: any) => {
                setCursorPos(e.position.column);
              });
            }}
            onSelection={(selection: any) => {
              if (selection && !selection.isEmpty) {
                setSelectedText(code.substring(selection.startLineNumber - 1, selection.endLineNumber));
              }
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        {/* Completion Button */}
        <div className="p-4 border-t bg-gray-50 flex gap-2">
          <button
            onClick={handleGetCompletion}
            disabled={completionLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {completionLoading ? "⏳ Generating..." : "✨ Get Completion"}
          </button>
          {completionError && <span className="text-red-500 text-sm">{completionError}</span>}
        </div>

        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="border-t bg-gray-50 p-4 max-h-40 overflow-y-auto">
            <h3 className="font-semibold mb-2">Suggestions:</h3>
            <div className="space-y-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => applySuggestion(suggestion)}
                  className="w-full text-left p-2 bg-white border rounded hover:bg-blue-50 font-mono text-sm"
                >
                  <pre className="whitespace-pre-wrap">{suggestion}</pre>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Chat Panel */}
      <div className="w-96 flex flex-col bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold">AI Assistant</h2>
          <p className="text-sm text-gray-500">Ask about your code</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <p>No messages yet</p>
              <p className="text-sm">Ask a question about your code</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg">
                <p className="text-sm">⏳ Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t p-4 space-y-2">
          {chatError && <p className="text-red-500 text-sm">{chatError}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={chatLoading}
            />
            <button
              onClick={handleAskAboutCode}
              disabled={chatLoading || !userInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {selectedText && (
            <p className="text-xs text-gray-500">
              ℹ️ Selected text will be used as context
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodeChat;
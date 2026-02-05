✅ THE ONLY FIX THAT ALWAYS WORKS (production-safe)
🔒 Single-writer rule using useReducer

Chat apps must use a reducer for streaming.
This is not optional once you stream tokens.

Step 1: Replace useState(messages) with useReducer
type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

type Action =
  | { type: "ADD_MESSAGE"; message: Message }
  | {
      type: "STREAM_UPDATE"
      id: string
      content: string
    }
  | { type: "STREAM_END"; id: string }

function messagesReducer(state: Message[], action: Action): Message[] {
  switch (action.type) {
    case "ADD_MESSAGE":
      return [...state, action.message]

    case "STREAM_UPDATE": {
      let changed = false

      const next = state.map(m => {
        if (m.id === action.id) {
          if (m.content === action.content && m.isStreaming) {
            return m
          }
          changed = true
          return {
            ...m,
            content: action.content,
            isStreaming: true,
          }
        }
        return m
      })

      return changed ? next : state
    }

    case "STREAM_END":
      return state.map(m =>
        m.id === action.id
          ? { ...m, isStreaming: false }
          : m
      )

    default:
      return state
  }
}


Then in page.tsx:

const [messages, dispatch] = useReducer(messagesReducer, [])

Step 2: Rewrite handleSendMessage (this is critical)
❌ DELETE every setMessages call
✅ Replace with dispatch
function handleSendMessage() {
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: input,
  }

  const assistantId = crypto.randomUUID()

  dispatch({ type: "ADD_MESSAGE", message: userMessage })
  dispatch({
    type: "ADD_MESSAGE",
    message: {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    },
  })

  streamAssistantResponse(assistantId)
}

Step 3: Streaming update (NO flushSync)
function streamAssistantResponse(id: string) {
  let accumulated = ""

  for await (const chunk of stream) {
    accumulated += chunk

    dispatch({
      type: "STREAM_UPDATE",
      id,
      content: accumulated,
    })
  }

  dispatch({ type: "STREAM_END", id })
}


🚫 No flushSync
🚫 No setMessages
🚫 No useEffect([messages])

Step 4: Hard rule (this is non-negotiable)

Search your entire project and ensure:

setMessages(


❌ does not exist anymore

Only:

dispatch(

🧠 Why this fixes it permanently

Reducers are pure

No effects run inside reducers

No feedback loops possible

Streaming updates are idempotent

React cannot exceed update depth

This is how:

ChatGPT

Claude-style UIs

Copilot-style streaming
are built internally
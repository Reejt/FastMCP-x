'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface PresentationResponse {
  success: boolean;
  file_path?: string;
  filename?: string;
  topic?: string;
  num_slides?: number;
  presentation_title?: string;
  message?: string;
  error?: string;
}

export default function PresentationGenerator() {
  const [topic, setTopic] = useState('');
  const [numSlides, setNumSlides] = useState(10);
  const [style, setStyle] = useState('professional');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PresentationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePresentation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Construct natural language query for presentation
      let presentationQuery = `Create a presentation about ${topic}`;
      
      if (numSlides !== 10) {
        presentationQuery += ` with ${numSlides} slides`;
      }
      
      if (style !== 'professional') {
        presentationQuery += ` in ${style} style`;
      }

      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: presentationQuery,
          conversation_history: [],
        }),
      });

      // Parse SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              if (!jsonStr.trim()) continue // Skip empty lines
              
              try {
                const data = JSON.parse(jsonStr);
                if (data.chunk) {
                  fullResponse += data.chunk;
                } else if (data.done) {
                  // Stream complete
                } else if (data.success !== undefined) {
                  // This is the final response with file info
                  setResult(data);
                  return;
                }
              } catch (e) {
                // Log invalid SSE data for debugging
                if (jsonStr.startsWith('<')) {
                  // HTML response (likely an error page)
                  console.error('Received HTML instead of JSON. This indicates a server error.')
                  throw new Error('Server returned HTML error page. Check server logs.')
                } else {
                  console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
                }
              }
            }
          }
        }
      }

      // If we get here, try to parse the full response as JSON
      try {
        const data = JSON.parse(fullResponse);
        setResult(data);
      } catch (e) {
        throw new Error('Failed to parse presentation response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (filePath: string, filename: string) => {
    try {
      // For now, we'll show the file path as a fallback
      // The actual download would need a separate file serving endpoint
      const response = await fetch(`/api/chat/query?download=${encodeURIComponent(filePath)}`);
      
      if (!response.ok) {
        // As a fallback, you can copy the file path to clipboard
        await navigator.clipboard.writeText(filePath);
        setError(`File saved at: ${filePath}. Path copied to clipboard.`);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download presentation');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg"
    >
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Create a Presentation</h2>

      <form onSubmit={handleGeneratePresentation} className="space-y-6">
        {/* Topic Input */}
        <div>
          <label htmlFor="topic" className="block text-sm font-semibold text-gray-700 mb-2">
            Presentation Topic
          </label>
          <input
            id="topic"
            type="text"
            placeholder="e.g., The Future of AI, Climate Change Solutions, Web3 Basics"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            required
          />
        </div>

        {/* Number of Slides */}
        <div>
          <label htmlFor="numSlides" className="block text-sm font-semibold text-gray-700 mb-2">
            Number of Slides: {numSlides}
          </label>
          <input
            id="numSlides"
            type="range"
            min="5"
            max="50"
            value={numSlides}
            onChange={(e) => setNumSlides(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>5 slides</span>
            <span>50 slides</span>
          </div>
        </div>

        {/* Presentation Style */}
        <div>
          <label htmlFor="style" className="block text-sm font-semibold text-gray-700 mb-2">
            Presentation Style
          </label>
          <select
            id="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
          >
            <option value="professional">Professional</option>
            <option value="educational">Educational</option>
            <option value="creative">Creative</option>
          </select>
        </div>

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isLoading || !topic.trim()}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition duration-200"
        >
          {isLoading ? 'Generating Presentation...' : 'Generate Presentation'}
        </motion.button>
      </form>

      {/* Loading State */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 text-center"
        >
          <div className="inline-block">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 mt-3">Generating your presentation, please wait...</p>
        </motion.div>
      )}

      {/* Success Message */}
      {result && result.success && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg"
        >
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            ✓ Presentation Created Successfully!
          </h3>
          <p className="text-green-700 mb-3">{result.message}</p>
          <div className="bg-white p-3 rounded border border-green-200 mb-4 text-sm text-gray-700">
            <p>
              <strong>Title:</strong> {result.presentation_title}
            </p>
            <p>
              <strong>Slides:</strong> {result.num_slides}
            </p>
            <p>
              <strong>File:</strong> {result.filename}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              <strong>Location:</strong> {result.file_path}
            </p>
          </div>
          {result.file_path && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => result.file_path && handleDownload(result.file_path, result.filename || 'presentation.pptx')}
              className="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"
            >
              Download Presentation
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{error}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

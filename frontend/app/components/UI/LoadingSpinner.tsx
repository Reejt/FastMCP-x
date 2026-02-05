interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--accent-primary)' }}></div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      </div>
    </div>
  )
}

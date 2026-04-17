'use client';

export default function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeStyles = {
    sm: { width: '16px', height: '16px', borderWidth: '2px' },
    md: { width: '24px', height: '24px', borderWidth: '3px' },
    lg: { width: '32px', height: '32px', borderWidth: '4px' },
  };

  return (
    <style>
      {`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .admin-spinner {
          display: inline-block;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: var(--wc-accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}
    </style>
    <div
      className="admin-spinner"
      style={{
        ...sizeStyles[size],
        display: 'inline-block',
      }}
    />
  );
}

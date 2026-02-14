import { useState } from 'react';
import { Lock, User, Zap } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await onLogin(username, password);
    if (!result.success) {
      setError(result.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 mb-4 shadow-lg animate-pulse-glow">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-2">
            Smart Load Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            AC Load & ESP32 Monitoring System
          </p>
        </div>

        {/* Login Form */}
        <div className="rounded-2xl shadow-2xl p-8 glass animate-slide-in" style={{ background: 'var(--bg-card)' }}>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 rounded-lg focus:ring-2 transition-all"
                  style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid rgba(79, 124, 255, 0.2)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Enter username"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 rounded-lg focus:ring-2 transition-all"
                  style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid rgba(79, 124, 255, 0.2)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-4 py-3 rounded-lg animate-fade-in" style={{ 
                background: 'rgba(255, 71, 87, 0.1)', 
                border: '1px solid var(--accent-red)',
                color: 'var(--accent-red)'
              }}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg font-medium focus:outline-none focus:ring-2 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--accent-blue) 0%, #3b5cff 100%)',
                color: 'white'
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {/* Demo Credentials */}
            <div className="text-center text-sm pt-4" style={{ borderTop: '1px solid rgba(79, 124, 255, 0.1)', color: 'var(--text-secondary)' }}>
              <p className="font-medium mb-1">Demo Credentials:</p>
              <p>User: <span className="font-mono font-semibold" style={{ color: 'var(--accent-blue)' }}>demo / demo123</span></p>
              <p>Admin: <span className="font-mono font-semibold" style={{ color: 'var(--accent-blue)' }}>admin / admin123</span></p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

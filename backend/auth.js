/**
 * Demo Authentication Module
 * Hard-coded credentials for demonstration purposes
 * No database required for auth at this stage
 */

// Demo credentials - easily editable
const DEMO_USERS = {
    demo: {
        password: 'demo123',
        role: 'user',
        name: 'Demo User'
    },
    admin: {
        password: 'admin123',
        role: 'admin',
        name: 'Administrator'
    }
};

// Simple session storage (in-memory for demo)
const sessions = new Map();

/**
 * Validate login credentials
 */
function login(username, password) {
    const user = DEMO_USERS[username];
    
    if (!user || user.password !== password) {
        console.log(`❌ Login failed for user: ${username}`);
        return { success: false, message: 'Invalid credentials' };
    }
    
    // Generate simple session token
    const token = generateToken();
    sessions.set(token, {
        username,
        role: user.role,
        name: user.name,
        createdAt: new Date()
    });
    
    console.log(`✅ Login successful: ${username} (${user.role}) - Token: ${token.substring(0, 10)}...`);
    
    return {
        success: true,
        token,
        user: {
            username,
            role: user.role,
            name: user.name
        }
    };
}

/**
 * Validate session token
 */
function validateSession(token) {
    return sessions.get(token) || null;
}

/**
 * Logout - remove session
 */
function logout(token) {
    return sessions.delete(token);
}

/**
 * Generate random token
 */
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Express middleware for authentication
 */
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || token === 'null') {
        // Don't log null tokens (happens on page load with cleared storage)
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const session = validateSession(token);
    if (!session) {
        console.log(`❌ Auth failed: Invalid token: ${token.substring(0, 10)}...`);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    console.log(`✅ Auth success: ${session.username} - ${req.method} ${req.path}`);
    req.user = session;
    next();
}

/**
 * Admin-only middleware
 */
function adminMiddleware(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = {
    login,
    validateSession,
    logout,
    authMiddleware,
    adminMiddleware,
    DEMO_USERS
};

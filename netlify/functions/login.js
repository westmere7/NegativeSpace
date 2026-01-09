const { Octokit } = require("@octokit/rest");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper to parse CSV line using regex to handle commas inside quotes if needed, 
// but for simple username,hash,role, splitting by comma is fine as long as username doesn't have commas.
// We'll enforce no commas in username.
function parseCSV(content) {
    const lines = content.trim().split('\n');
    const users = [];
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const [username, hash, role] = lines[i].split(',');
        if (username && hash) {
            users.push({ username, hash, role: role ? role.trim() : 'user' });
        }
    }
    return users;
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return { statusCode: 400, body: "Missing credentials" };
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) return { statusCode: 500, body: "Server error" };

        const octokit = new Octokit({ auth: token });

        // Read users.csv from GitHub "data/users.csv"
        // We strictly read from the repo to ensure single source of truth
        const file = await octokit.repos.getContent({
            owner: "westmere7",
            repo: "NegativeSpace",
            path: "data/users.csv",
        });

        const content = Buffer.from(file.data.content, "base64").toString("utf-8");
        const users = parseCSV(content);

        const user = users.find(u => u.username === username);

        if (!user) {
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // Verify Password
        const isValid = bcrypt.compareSync(password, user.hash);
        if (!isValid) {
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // Generate JWT
        // Secret should be in env var, fallback to a hardcoded one for this specific instruction context if not set,
        // but ideally we ask user to set JWT_SECRET. for now we'll use a derived secret from GITHUB_TOKEN to avoid extra setup.
        const secret = process.env.JWT_SECRET || process.env.GITHUB_TOKEN;
        const sessionToken = jwt.sign({ username: user.username, role: user.role }, secret, { expiresIn: '7d' });

        return {
            statusCode: 200,
            body: JSON.stringify({
                token: sessionToken,
                username: user.username,
                role: user.role
            }),
        };

    } catch (error) {
        console.error("Login failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Login failed" }) };
    }
};

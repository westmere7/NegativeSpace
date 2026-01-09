const { Octokit } = require("@octokit/rest");
const jwt = require('jsonwebtoken');

// Helper to parse CSV line
function parseCSV(content) {
    const lines = content.trim().split('\n');
    const users = [];
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        // Handle potential glitches if user manually edited with spaces
        if (parts.length >= 3) {
            const username = parts[0].trim();
            const password = parts[1].trim(); // Plain text now
            const role = parts[2].trim();
            if (username && password) {
                users.push({ username, password, role });
            }
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

        // Verify Password (PLAIN TEXT comparison)
        if (user.password !== password) {
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // Generate JWT
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

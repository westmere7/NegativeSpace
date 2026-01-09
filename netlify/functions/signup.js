const { Octokit } = require("@octokit/rest");
const bcrypt = require('bcryptjs');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return { statusCode: 400, body: "Missing credentials" };
        }

        // Basic Username Validation (No commas allowed to protect CSV)
        if (username.includes(',') || username.length < 3) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid username" }) };
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) return { statusCode: 500, body: "Server error" };

        const octokit = new Octokit({ auth: token });
        const owner = "westmere7";
        const repo = "NegativeSpace";
        const path = "data/users.csv";

        // 1. Get current CSV
        let file;
        try {
            file = await octokit.repos.getContent({ owner, repo, path });
        } catch (e) {
            return { statusCode: 500, body: "Database not found" };
        }

        const content = Buffer.from(file.data.content, "base64").toString("utf-8");

        // 2. Check overlap
        // Simple check: does ",username," or "^username," exist?
        // Safer: parse.
        const lines = content.trim().split('\n');
        const existingUser = lines.slice(1).find(line => line.startsWith(username + ','));
        if (existingUser) {
            return { statusCode: 400, body: JSON.stringify({ error: "User already exists" }) };
        }

        // 3. Hash Password
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        // 4. Append
        // Default role is "user"
        const newLine = `\n${username},${hash},user`;
        const newContent = content.trim() + newLine;

        // 5. Commit
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `Signup: ${username}`,
            content: Buffer.from(newContent).toString('base64'),
            sha: file.data.sha
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Signup successful! You can now log in." }),
        };

    } catch (error) {
        console.error("Signup failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Signup failed" }) };
    }
};

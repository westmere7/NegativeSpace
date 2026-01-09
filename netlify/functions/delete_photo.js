const { Octokit } = require("@octokit/rest");
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const { filename } = JSON.parse(event.body);
        if (!filename) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing filename" }) };
        }

        // 1. Verify Session (Admin Only)
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized: Missing token" }) };
        }
        const sessionToken = authHeader.replace('Bearer ', '');
        const secret = process.env.JWT_SECRET || process.env.GITHUB_TOKEN;

        let decoded;
        try {
            decoded = jwt.verify(sessionToken, secret);
        } catch (e) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized: Invalid token" }) };
        }

        if (decoded.role !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: "Forbidden: Admins only" }) };
        }

        // 2. Setup GitHub API
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error" }) };

        const octokit = new Octokit({ auth: token });
        const owner = "westmere7";
        const repo = "NegativeSpace";
        const path = `Photos/${filename}`;

        // 3. Get SHA of file (required for deletion)
        let sha;
        try {
            const file = await octokit.repos.getContent({ owner, repo, path });
            sha = file.data.sha;
        } catch (e) {
            return { statusCode: 404, body: JSON.stringify({ error: "File not found" }) };
        }

        // 4. Delete File
        await octokit.repos.deleteFile({
            owner,
            repo,
            path,
            message: `Delete photo: ${filename}`,
            sha
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Photo deleted successfully" }),
        };

    } catch (error) {
        console.error("Delete failed:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Delete failed" }) };
    }
};

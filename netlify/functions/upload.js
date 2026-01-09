const { Octokit } = require("@octokit/rest");
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { image, filename, folder } = JSON.parse(event.body);

        // validation
        if (!image || !filename) {
            return { statusCode: 400, body: "Missing image or filename" };
        }

        // Verify Session
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: "Unauthorized: Missing token" };
        }
        const sessionToken = authHeader.replace('Bearer ', '');
        const secret = process.env.JWT_SECRET || process.env.GITHUB_TOKEN;

        let decoded;
        try {
            decoded = jwt.verify(sessionToken, secret);
        } catch (e) {
            return { statusCode: 401, body: "Unauthorized: Invalid token" };
        }

        if (decoded.role !== 'admin') {
            return { statusCode: 403, body: "Forbidden: Admins only" };
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            console.error("GITHUB_TOKEN is missing");
            return { statusCode: 500, body: "Server configuration error" };
        }

        const octokit = new Octokit({ auth: token });
        const owner = "westmere7";
        const repo = "NegativeSpace";

        // Sanitize filename and add timestamp to prevent overwrites
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');

        let path;
        if (folder) {
            // Sanitize folder name: Allow alphanumerics, spaces, dashes, dots
            const safeFolder = folder.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
            path = `Photos/${safeFolder}/${Date.now()}-${safeName}`;
        } else {
            path = `Photos/${Date.now()}-${safeName}`;
        }

        // Handle Base64
        let content = image;
        if (image.includes(',')) {
            content = image.split(",")[1];
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `Web Upload: ${safeName} to ${folder || 'Home'}`,
            content: content,
            encoding: "base64",
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Upload successful!" }),
        };
    } catch (error) {
        console.error("Upload failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Upload failed. Check logs." }),
        };
    }
};

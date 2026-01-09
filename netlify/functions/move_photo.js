const { Octokit } = require("@octokit/rest");
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const { filename, targetFolder, currentFolder } = JSON.parse(event.body);

        // Validation
        if (!filename) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing filename" }) };
        }

        // Verify Session
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

        const token = process.env.GITHUB_TOKEN;
        const octokit = new Octokit({ auth: token });
        const owner = "westmere7";
        const repo = "NegativeSpace";

        // Construct Paths
        // "filename" passed from frontend might be full path e.g. "Values/DSC123.jpg" or "DSC123.jpg"
        // Let's assume the frontend sends the *full relative path* as 'filename' for the source,
        // OR sends just the name and we deduce.
        // Better: Frontend sends "currentPath" (e.g. "Furry Friends/Dog.jpg") and "targetFolder" (e.g. "Best Shots").
        // Let's adapt to that.

        const currentPath = filename.startsWith('Photos/') ? filename : `Photos/${filename}`;

        // 1. Get the Source File SHA
        let fileSha;
        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: currentPath,
            });
            fileSha = data.sha;
        } catch (e) {
            return { statusCode: 404, body: JSON.stringify({ error: `Source file not found: ${currentPath}` }) };
        }

        // 2. Get the Blob Content (Base64)
        // We use Git Data API to get the full blob, handling up to 100MB
        const { data: blobData } = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: fileSha,
        });

        // 3. Construct New Path
        const justName = currentPath.split('/').pop();
        // If targetFolder is empty/null -> Home (Photos/file.jpg)
        // If targetFolder is "Home", treat as empty.
        let newPath;
        if (!targetFolder || targetFolder === 'home') {
            newPath = `Photos/${justName}`;
        } else {
            const safeFolder = targetFolder.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
            newPath = `Photos/${safeFolder}/${justName}`;
        }

        if (newPath === currentPath) {
            return { statusCode: 400, body: JSON.stringify({ error: "Source and destination are the same." }) };
        }

        // 4. Create File at New Location
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: newPath,
            message: `Move ${justName} to ${targetFolder || 'Home'}`,
            content: blobData.content,
            encoding: "base64",
        });

        // 5. Delete Old File
        await octokit.repos.deleteFile({
            owner,
            repo,
            path: currentPath,
            message: `Cleanup moved file: ${justName}`,
            sha: fileSha,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Move successful!", newPath: newPath })
        };

    } catch (error) {
        console.error("Move failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Move failed. Check logs." + error.message })
        };
    }
};

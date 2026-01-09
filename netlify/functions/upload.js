const { Octokit } = require("@octokit/rest");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { image, filename } = JSON.parse(event.body);

        // validation
        if (!image || !filename) {
            return { statusCode: 400, body: "Missing image or filename" };
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
        const path = `Photos/${Date.now()}-${safeName}`;

        // The image data comes as "data:image/jpeg;base64,....."
        // We need to strip the prefix
        const content = image.split(",")[1];

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `Web Upload: ${safeName}`,
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

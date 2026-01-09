const { Octokit } = require("@octokit/rest");
const jwt = require("jsonwebtoken");
const piexif = require("piexifjs");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "westmere7";
const REPO_NAME = "NegativeSpace";
const JWT_SECRET = process.env.JWT_SECRET;

const octokit = new Octokit({
    auth: GITHUB_TOKEN,
});

exports.handler = async (event, context) => {
    // 1. Verify Method
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    // 2. Auth Check (Admin Only)
    const token = event.headers.authorization ? event.headers.authorization.split(" ")[1] : null;
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: "Forbidden: Admin access required" }) };
        }
    } catch (err) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid Token" }) };
    }

    const { filename, exifData } = JSON.parse(event.body);

    if (!filename || !exifData) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing filename or exifData" }) };
    }

    try {
        // 3. Fetch current file from GitHub to get SHA and Content
        // We need the raw binary content? No, getFile returns base64 which piexif loves.
        const { data: fileData } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: `Photos/${filename}`,
        });

        // fileData.content is Base64 encoded string of the JPEG
        let base64Img = fileData.content;

        // Prefix for piexif might be needed? Usually it handles raw binary string or "data:image/jpeg;base64,"
        // piexif.load takes a jpeg data string.
        const dataUrl = "data:image/jpeg;base64," + base64Img.replace(/\n/g, "");

        // 4. Load existing EXIF
        let exifObj;
        try {
            exifObj = piexif.load(dataUrl);
        } catch (e) {
            // If no EXIF, create empty structure
            exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": null };
        }

        // 5. Update EXIF Tags
        // Map frontend inputs to EXIF tags
        // https://github.com/hMatoba/piexifjs/blob/master/piexif.js

        // ImageDescription (Title)
        if (exifData.title !== undefined) {
            exifObj["0th"][piexif.ImageIFD.ImageDescription] = exifData.title;
        }

        // Make (Camera Brand)
        if (exifData.make !== undefined) {
            exifObj["0th"][piexif.ImageIFD.Make] = exifData.make;
        }

        // Model (Camera Model)
        if (exifData.model !== undefined) {
            exifObj["0th"][piexif.ImageIFD.Model] = exifData.model;
        }

        // LensModel (Lens)
        if (exifData.lens !== undefined) {
            exifObj["Exif"][piexif.ExifIFD.LensModel] = exifData.lens;
        }

        // ISO (Integer)
        if (exifData.iso) {
            exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = parseInt(exifData.iso);
        }

        // Focal Length (Rational: [num, den])
        // e.g. 35 -> [35, 1]
        // Frontend sends string or number
        if (exifData.focalLength) {
            const val = Math.round(parseFloat(exifData.focalLength));
            exifObj["Exif"][piexif.ExifIFD.FocalLength] = [val, 1];
        }

        // FNumber (Rational)
        // e.g. 1.8 -> [18, 10]
        if (exifData.fNumber) {
            // Avoid floating point precision issues. 1.8 * 10 = 18. 
            // 1.4 -> 14/10. 
            // 11 -> 110/10? Or 11/1. 
            // Robust way:
            let f = parseFloat(exifData.fNumber);
            exifObj["Exif"][piexif.ExifIFD.FNumber] = [Math.round(f * 100), 100];
        }

        // ExposureTime (Rational)
        // e.g. "1/50" -> [1, 50], "0.5" -> [5, 10], "2" -> [2, 1]
        if (exifData.exposureTime) {
            const s = exifData.exposureTime.toString();
            if (s.includes('/')) {
                const part = s.split('/');
                exifObj["Exif"][piexif.ExifIFD.ExposureTime] = [parseInt(part[0]), parseInt(part[1])];
            } else {
                // Decimal?
                const v = parseFloat(s);
                if (v >= 1) {
                    exifObj["Exif"][piexif.ExifIFD.ExposureTime] = [Math.round(v * 100), 100];
                } else {
                    // e.g. 0.02 -> 1/50
                    // 1/v
                    exifObj["Exif"][piexif.ExifIFD.ExposureTime] = [1, Math.round(1 / v)];
                }
            }
        }

        // 6. Dump and Insert
        const exifBytes = piexif.dump(exifObj);
        // Insert into clean base64
        const newBase64 = piexif.insert(exifBytes, dataUrl);
        // Strip data:image/jpeg;base64, prefix for GitHub
        const finalBase64 = newBase64.replace("data:image/jpeg;base64,", "");

        // 7. Push to GitHub
        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: `Photos/${filename}`,
            message: `Update EXIF for ${filename}`,
            content: finalBase64,
            sha: fileData.sha
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "EXIF Updated Successfully" })
        };

    } catch (error) {
        console.error("Update Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

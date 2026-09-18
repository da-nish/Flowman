const fs = require("node:fs");
const path = require("node:path");

const [resultFile, outputDirectory] = process.argv.slice(2);
if (!resultFile || !outputDirectory) {
    console.error("Usage: node scripts/save-responses.js <newman-json-result> <output-directory>");
    process.exit(1);
}

const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
const executions = result.run?.executions || [];
const failuresByCursor = new Map(
    (result.run?.failures || [])
        .filter(failure => failure.at === "request" && failure.cursor?.ref && failure.error?.message)
        .map(failure => [failure.cursor.ref, failure.error.message]),
);

function safePart(value) {
    return String(value || "unnamed")
        .trim()
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "unnamed";
}

function headerValue(headers, name) {
    return (headers || []).find(header => String(header.key).toLowerCase() === name)?.value;
}

function extensionFor(response) {
    const disposition = headerValue(response.header, "content-disposition") || "";
    const filename = disposition.match(/filename\*?=(?:UTF-8''|[\"'])?([^;\"']+)/i)?.[1];
    if (filename) {
        const extension = path.extname(decodeURIComponent(filename.trim()));
        if (extension) return extension.toLowerCase();
    }
    const type = (headerValue(response.header, "content-type") || "").split(";")[0].toLowerCase();
    if (type.includes("json")) return ".json";
    if (type.includes("pdf")) return ".pdf";
    if (type.includes("zip")) return ".zip";
    if (type.startsWith("text/")) return ".txt";
    if (type.includes("png")) return ".png";
    if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
    return ".bin";
}

function responseBody(response) {
    const stream = response.stream;
    if (Buffer.isBuffer(stream)) return stream;
    if (Array.isArray(stream?.data)) return Buffer.from(stream.data);
    if (typeof stream === "string") return Buffer.from(stream);
    return Buffer.alloc(0);
}

function saveMetadata(item) {
    const description = typeof item?.description === "string" ? item.description : item?.description?.content;
    const match = String(description || "").match(/flowman-save-response=true;flowman-scope=([^\s]+)/);
    return match ? { scopeName: decodeURIComponent(match[1]) } : null;
}

let saved = 0;
let requested = 0;
const missingResponses = [];
for (const execution of executions) {
    const metadata = saveMetadata(execution.item);
    if (!metadata) continue;
    requested += 1;
    if (!execution.response) {
        missingResponses.push(`${execution.item.name}: ${failuresByCursor.get(execution.cursor?.ref) || "no HTTP response received"}`);
        continue;
    }
    const iteration = Number(execution.cursor?.iteration ?? 0) + 1;
    const position = Number(execution.cursor?.position ?? saved) + 1;
    // The first level mirrors the folders in the generated Postman collection:
    // an independent-test folder or an individual flow.
    const scopeDirectory = path.join(outputDirectory, safePart(metadata.scopeName));
    const name = `${String(iteration).padStart(3, "0")}__${String(position).padStart(3, "0")}__${safePart(execution.item.name)}__response${extensionFor(execution.response)}`;
    fs.mkdirSync(scopeDirectory, { recursive: true });
    fs.writeFileSync(path.join(scopeDirectory, name), responseBody(execution.response));
    saved += 1;
}

if (requested === 0) {
    console.log("No response files requested: add save: true to an enabled test or flow.");
} else if (saved === 0) {
    console.log(`${requested} request(s) were marked save: true, but Newman received no HTTP responses to save. ${missingResponses.join(" | ")}`);
} else {
    console.log(`Saved ${saved} response file(s) to ${outputDirectory}`);
    if (missingResponses.length) console.log(`${missingResponses.length} marked request(s) had no HTTP response: ${missingResponses.join(" | ")}`);
}

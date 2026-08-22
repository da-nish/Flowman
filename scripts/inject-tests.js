const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const NEWMAN_DIR = path.resolve(__dirname, "..");
const TEST_DIR = path.join(NEWMAN_DIR, "tests");
const OUTPUT_FILE = path.join(NEWMAN_DIR, "collections", "postman_collection.json");

if (!fs.existsSync(TEST_DIR)) {
    console.error(`Missing tests directory: ${TEST_DIR}`);
    process.exit(1);
}

const yamlFiles = fs.readdirSync(TEST_DIR).filter(file => /\.ya?ml$/i.test(file)).sort();
if (yamlFiles.length === 0) {
    console.error(`No YAML test files found in ${TEST_DIR}`);
    process.exit(1);
}

const definition = { testGroups: [], flows: [] };
for (const fileName of yamlFiles) {
    const parsed = YAML.parse(fs.readFileSync(path.join(TEST_DIR, fileName), "utf8")) || {};
    if (Array.isArray(parsed.tests)) {
        definition.testGroups.push({
            name: parsed.folder || path.basename(fileName, path.extname(fileName)),
            tests: parsed.tests,
        });
    }
    if (Array.isArray(parsed.flows)) definition.flows.push(...parsed.flows);
}
console.log(`Loaded ${yamlFiles.length} YAML file(s) from ${TEST_DIR}`);

function requestUrl(request) {
    if (!request.path) throw new Error("Each request requires a path.");
    const requestPath = String(request.path);
    return /^(?:https?:\/\/|\{\{[^{}]+\}\}\/)/i.test(requestPath)
        ? requestPath
        : `{{baseUrl}}/${requestPath.replace(/^\/+/, "")}`;
}

function toPostmanUrl(raw, query) {
    const url = { raw };
    const match = raw.match(/^(https?):\/\/([^/]+)(\/.*)?$/i);
    if (match) {
        url.protocol = match[1];
        url.host = match[2].split(".");
        url.path = (match[3] || "").split("?")[0].split("/").filter(Boolean);
    } else {
        // Keep {{baseUrl}} intact for environment-variable resolution.
        const [host, requestPath = ""] = raw.split(/\/(.*)/s);
        url.host = [host];
        url.path = requestPath.split("?")[0].split("/").filter(Boolean);
    }

    if (query && typeof query === "object") {
        url.query = Object.entries(query).map(([key, value]) => ({ key, value: String(value) }));
        const queryString = url.query.map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
        url.raw = `${raw}${raw.includes("?") ? "&" : "?"}${queryString}`;
    }
    return url;
}

function headersFor(request) {
    const headers = Object.entries(request.headers || {}).map(([key, value]) => ({ key, value: String(value) }));
    if (request.body !== undefined && !headers.some(header => header.key.toLowerCase() === "content-type")) {
        headers.push({ key: "Content-Type", value: "application/json" });
    }
    return headers;
}

function bodyFor(body) {
    if (body === undefined) return undefined;
    return { mode: "raw", raw: JSON.stringify(body), options: { raw: { language: "json" } } };
}

function runtimeValueExpression(value) {
    if (typeof value === "string") {
        const match = value.match(/^\{\{([^{}]+)\}\}$/);
        if (match) return `resolveRuntimeValue(${JSON.stringify(match[1])})`;
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(runtimeValueExpression).join(", ")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${runtimeValueExpression(item)}`).join(", ")}}`;
    }
    return JSON.stringify(value);
}

function generatePreRequestScript(request) {
    const lines = [
        "function resolveRuntimeValue(name) {",
        "    const iterationValue = pm.iterationData.get(name);",
        "    const value = iterationValue !== undefined ? iterationValue : pm.collectionVariables.get(name);",
        "    if (typeof value !== \"string\" || !/^[\\[{]/.test(value)) return value;",
        "    try { return JSON.parse(value); } catch (error) { return value; }",
        "}",
    ];
    if (request.body !== undefined) {
        lines.push(`pm.request.body.raw = JSON.stringify(${runtimeValueExpression(request.body)});`);
    }
    Object.entries(request.headers || {}).forEach(([key, value]) => {
        if (typeof value !== "string" || !/^\{\{[^{}]+\}\}$/.test(value)) return;
        const variable = value.match(/^\{\{([^{}]+)\}\}$/)[1];
        lines.push(`pm.request.headers.upsert({ key: ${JSON.stringify(key)}, value: (function (value) { return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value); })(resolveRuntimeValue(${JSON.stringify(variable)})) });`);
    });
    return lines;
}

function responsePath(sourcePath) {
    const parts = String(sourcePath)
        .replace(/\[\s*(\d+)\s*\]/g, ".$1")
        .replace(/\[\s*(first|last)\s*\]/gi, ".$1")
        .split(".")
        .filter(Boolean);
    // Paths are relative to pm.response.json(). For this API the response body
    // is wrapped as { response: { data: ... } }, so keep `response` intact.
    if (parts[0] === "$") parts.shift();
    return parts;
}

function responseValue(sourcePath) {
    return `${JSON.stringify(responsePath(sourcePath))}.reduce(function (value, key) { if (value == null) return undefined; if (key === "first") return Array.isArray(value) ? value[0] : undefined; if (key === "last") return Array.isArray(value) ? value[value.length - 1] : undefined; return value[key]; }, pm.response.json())`;
}

function generateValueExpression(value) {
    if (typeof value === "string") {
        const match = value.match(/^\{\{([^{}]+)\}\}$/);
        if (match) return `pm.iterationData.get(${JSON.stringify(match[1])})`;
    }
    return JSON.stringify(value);
}

function generateAssertion(assertion) {
    if (assertion.type === "status") {
        return `pm.test("Status is ${assertion.equals}", function () {\n    pm.response.to.have.status(${assertion.equals});\n});`;
    }
    if (assertion.type === "json") {
        const value = responseValue(assertion.path);
        if (assertion.exists === true) {
            return `pm.test(${JSON.stringify(`${assertion.path} exists`)}, function () {\n    pm.expect(${value}).to.not.equal(undefined);\n});`;
        }
        if (Object.prototype.hasOwnProperty.call(assertion, "equals")) {
            return `pm.test(${JSON.stringify(`${assertion.path} equals ${assertion.equals}`)}, function () {\n    pm.expect(${value}).to.eql(${generateValueExpression(assertion.equals)});\n});`;
        }
        if (Object.prototype.hasOwnProperty.call(assertion, "contains")) {
            return `pm.test(${JSON.stringify(`${assertion.path} contains ${assertion.contains}`)}, function () {\n    pm.expect(${value}).to.include(${generateValueExpression(assertion.contains)});\n});`;
        }
    }
    throw new Error(`Unsupported assertion: ${JSON.stringify(assertion)}`);
}

function generateTestScript(step) {
    const assertions = (step.assertions || []).map(generateAssertion);
    const extractions = Object.entries(step.extract || {}).map(([variable, sourcePath]) => {
        const safeVariable = variable.replace(/[^a-zA-Z0-9_]/g, "_");
        return [
            `const extracted_${safeVariable} = ${responseValue(sourcePath)};`,
            `pm.test(${JSON.stringify(`Extract ${variable}`)}, function () {`,
            `    pm.expect(extracted_${safeVariable}, ${JSON.stringify(`Response field ${sourcePath}`)}).to.not.equal(undefined);`,
            "});",
            `pm.collectionVariables.set(${JSON.stringify(variable)}, typeof extracted_${safeVariable} === "object" && extracted_${safeVariable} !== null ? JSON.stringify(extracted_${safeVariable}) : extracted_${safeVariable});`,
        ].join("\n");
    });
    return [...assertions, ...extractions].join("\n\n");
}

function buildItem(step) {
    if (!step.request) throw new Error(`Request "${step.name || "unnamed"}" has no request definition.`);
    const request = step.request;
    const postmanRequest = {
        method: (request.method || "GET").toUpperCase(),
        header: headersFor(request),
        url: toPostmanUrl(requestUrl(request), request.query),
    };
    const body = bodyFor(request.body);
    if (body) postmanRequest.body = body;

    const event = [];
    const delayMs = Number(step.delay || 0) * 1000;
    if (delayMs > 0) event.push({ listen: "prerequest", script: { type: "text/javascript", exec: [`setTimeout(function () { }, ${delayMs});`] } });
    const preRequestScript = generatePreRequestScript(request);
    if (preRequestScript.length) event.push({ listen: "prerequest", script: { type: "text/javascript", exec: preRequestScript } });
    const testScript = generateTestScript(step);
    if (testScript) event.push({ listen: "test", script: { type: "text/javascript", exec: testScript.split("\n") } });

    return { name: step.name || `${postmanRequest.method} ${request.path}`, request: postmanRequest, event, response: [] };
}

const testFolders = definition.testGroups
    .map(group => ({
        name: group.name,
        item: group.tests.filter(test => test.enabled !== false).map(buildItem),
    }))
    .filter(group => group.item.length > 0);
const flowItems = definition.flows
    .filter(flow => flow.enabled !== false)
    .map(flow => ({
        name: flow.name || "Unnamed flow",
        item: (flow.steps || []).filter(step => step.enabled !== false).map(buildItem),
    }));

const collection = {
    info: { name: "YAML Newman Tests", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [...testFolders, ...flowItems],
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
const testCount = testFolders.reduce((count, folder) => count + folder.item.length, 0);
console.log(`Created ${OUTPUT_FILE} with ${testCount} test cases in ${testFolders.length} folder(s) and ${flowItems.length} flows.`);



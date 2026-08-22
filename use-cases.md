# Flowman Use Cases

This document shows practical ways to use Flowman for API validation. Use `guide.md` for the complete key-by-key reference.

## 1. Validate an Independent API

### When to use

Use a standalone test when the request does not depend on a previous request.

### Example

```yaml
folder: Product API Tests

tests:
  - name: Check product
    request:
      method: GET
      path: /product
      query:
        id: "{{userId}}"
    assertions:
      - type: status
        equals: 200
      - type: json
        path: success
        equals: true
      - type: json
        path: product_id
        equals: "{{userId}}"
```

### Result

The request appears in the `Product API Tests` Postman folder. It runs once for every row in `testdata/testdata.json` and checks the status and response fields.

## 2. Run the Same Test with Multiple Data Rows

### When to use

Use iteration data to test the same endpoint with different users, IDs, credentials, or payload values.

### Test data

```json
[
  {
    "userId": 11,
    "email": "qa@example.com",
    "password": "valid-password"
  },
  {
    "userId": 22,
    "email": "second@example.com",
    "password": "another-password"
  }
]
```

### YAML

```yaml
tests:
  - name: Get user product
    request:
      method: GET
      path: /product
      query:
        id: "{{userId}}"
    assertions:
      - type: status
        equals: 200
```

### Result

Newman executes `Get user product` once with `userId` `11` and once with `userId` `22`.

## 3. Test a Login Flow

### When to use

Use a flow when requests must run in order and a later request needs a value from an earlier response.

### Example

```yaml
flows:
  - name: Login and profile flow
    steps:
      - name: Login
        request:
          method: POST
          path: /login
          body:
            email: "{{email}}"
            password: "{{password}}"
        assertions:
          - type: status
            equals: 200
        extract:
          access_token: token
          user_id: user.id

      - name: Get profile
        request:
          method: GET
          path: /profile
          query:
            user_id: "{{user_id}}"
          headers:
            Authorization: "Bearer {{access_token}}"
        assertions:
          - type: status
            equals: 200
```

### Result

The report contains a `Login and profile flow` folder. `Get profile` runs only after `Login` and uses the extracted token and user ID.

## 4. Pass an Extracted Object to a Later Request

### When to use

Use this pattern when an API returns a complete user, profile, or configuration object that a later request needs.

### Example

```yaml
flows:
  - name: Pass user object flow
    steps:
      - name: Login
        request:
          method: POST
          path: /login
          body:
            email: "{{email}}"
            password: "{{password}}"
        assertions:
          - type: status
            equals: 200
        extract:
          user_data: user

      - name: Submit user data
        request:
          method: POST
          path: /user/confirm
          body:
            userdata: "{{user_data}}"
        assertions:
          - type: status
            equals: 200
```

### Result

The extracted object is stored as JSON and restored as an object in the later request body. It is not converted to `[object Object]`.

## 5. Pass an Extracted Object in a Header

### When to use

Use this when an API expects JSON text in a custom header.

### Example

```yaml
flows:
  - name: Custom header flow
    steps:
      - name: Get user
        request:
          method: GET
          path: /user
        assertions:
          - type: status
            equals: 200
        extract:
          user_data: user

      - name: Send user header
        request:
          method: GET
          path: /audit
          headers:
            X-User-Data: "{{user_data}}"
        assertions:
          - type: status
            equals: 200
```

### Result

The header value is sent as JSON text, for example:

```text
{"id":10,"name":"QA User"}
```

HTTP headers are always strings. Use the request body when the server requires a native JSON object.

## 6. Extract an Array Element by Numeric Index

### When to use

Use a numeric index when the required element has a known position. Indexes are zero-based.

### Example

```yaml
flows:
  - name: Extract email by index
    steps:
      - name: Get user
        request:
          method: GET
          path: /user
        assertions:
          - type: status
            equals: 200
        extract:
          first_email: user.emails[0]
          second_email: user.emails[1]

      - name: Use selected email
        request:
          method: POST
          path: /email/verify
          body:
            email: "{{first_email}}"
        assertions:
          - type: status
            equals: 200
```

### Supported forms

```yaml
users[0]
users[1]
users[1].emails[1]
users[0][0]
```

## 7. Extract the First or Last Array Element

### When to use

Use `first` or `last` when the array length changes between responses.

### Example

```yaml
extract:
  first_user: users[first]
  last_user: users[last]
  first_user_email: users[first].emails[0]
  last_user_email: users[last].emails[last]
```

### Supported forms

```yaml
users[first]
users[last]
users[first].emails[0]
users[first].emails[last]
users[last][0]
users[first][last]
```

### Result

- `first` selects index `0`.
- `last` selects the final element.
- Nested object fields and multidimensional arrays can be combined with either selector.
- A missing index or a selector applied to a non-array causes the extraction assertion to fail.

## 8. Test a Negative Login Case

### When to use

Use a standalone test to verify that invalid credentials are rejected.

### Example

```yaml
tests:
  - name: Reject invalid login
    request:
      method: POST
      path: /login
      body:
        email: invalid@example.com
        password: wrong-password
    assertions:
      - type: status
        equals: 401
```

### Result

The test passes only when the API returns `401`. A successful login response causes the test to fail.

## 9. Use a Different Base URL for One API

### When to use

Use a second base URL when one service is hosted on another port, domain, or API gateway.

### Environment

```json
{
  "name": "dev",
  "values": [
    {
      "key": "baseUrl",
      "value": "http://127.0.0.1:8000",
      "enabled": true
    },
    {
      "key": "baseUrlNew",
      "value": "http://127.0.0.1:9988",
      "enabled": true
    }
  ]
}
```

### YAML

```yaml
tests:
  - name: Check product service
    request:
      method: GET
      path: "{{baseUrlNew}}/product"
      query:
        id: "{{userId}}"
    assertions:
      - type: status
        equals: 200
```

### Result

The request is sent to:

```text
http://127.0.0.1:9988/product
```

It is not incorrectly prefixed with `baseUrl`.

## 10. Organize Tests into Custom Report Folders

### When to use

Use a root-level `folder` when the filename is not a useful report folder name.

### Example

```yaml
folder: Catalog Smoke Tests

tests:
  - name: Check product list
    request:
      method: GET
      path: /products
    assertions:
      - type: status
        equals: 200
```

### Result

The report folder is `Catalog Smoke Tests`. Without `folder`, the filename without `.yaml` is used.

## 11. Temporarily Disable a Test, Flow, or Step

### When to use

Use `enabled: false` when an item should remain in source control but should not run.

### Disable a test

```yaml
tests:
  - name: Unavailable endpoint
    enabled: false
    request:
      method: GET
      path: /unavailable
```

### Disable a flow

```yaml
flows:
  - name: Optional flow
    enabled: false
    steps:
      - name: This flow is skipped
        request:
          method: GET
          path: /optional
```

### Disable a flow step

```yaml
flows:
  - name: Partial flow
    steps:
      - name: Login
        request:
          method: POST
          path: /login

      - name: Temporarily skipped profile request
        enabled: false
        request:
          method: GET
          path: /profile
```

Items are enabled by default. Use `enabled`, not `enable`.

## 12. Add a Delay Between Flow Requests

### When to use

Use `delay` when the next request must wait for asynchronous processing, such as job creation, email delivery, or eventual consistency.

### Example

```yaml
flows:
  - name: Wait for report flow
    steps:
      - name: Start report
        request:
          method: POST
          path: /reports
        assertions:
          - type: status
            equals: 202

      - name: Check report status
        delay: 2
        request:
          method: GET
          path: /reports/status
        assertions:
          - type: status
            equals: 200
```

`delay` is expressed in seconds and applies to the flow step.

## 13. Run the Use Cases

Install the required packages:

```sh
npm install yaml
npm install -g newman newman-reporter-htmlextra
```

Generate the Postman collection without running requests:

```sh
node scripts/inject-tests.js
```

Run the default development environment and iteration data:

```sh
bash newman.sh
```

The default script uses:

- `environments/dev.json`
- `testdata/testdata.json`
- `collections/postman_collection.json`
- `reports/newman-report.html`

Run a different environment directly:

```sh
newman run collections/postman_collection.json \
  -e environments/stag.json \
  -d testdata/testdata.json \
  -r htmlextra \
  --reporter-htmlextra-export reports/newman-report.html
```

## 14. Choosing Between Tests and Flows

| Need | Use |
|---|---|
| Validate one independent endpoint | `tests` |
| Run the same request with multiple data rows | `tests` plus iteration data |
| Use a token from a login request | `flows` plus `extract` |
| Pass an extracted object to another request | `flows` plus an exact placeholder |
| Validate invalid credentials | `tests` |
| Wait between dependent requests | `flows` plus `delay` |
| Use a different API host for one request | `{{baseUrlNew}}` at the start of `path` |
| Select an array element | `extract` with `[0]`, `[first]`, or `[last]` |

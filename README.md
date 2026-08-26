# Flowman Readme

Flowman lets you define API tests and ordered API flows in YAML. The YAML files are converted into a Postman collection by `scripts`, then executed by Newman and generate a report. 

It is not only a Newman wrapper. Internally, it uses several components to manage and execute the tests, including the Newman CLI, an HTML report generator, builder scripts, environment and variable JSON files, and shell scripts that handle communication between the different components.

This guide describes the supported YAML structure, configuration keys, variables, assertions, response extraction, object values, array selectors, folders, and execution commands.



## Requirements

- Node.js
- Newman
- A running API to test

Install the dependencies once:

```sh
npm install yaml
npm install -g newman newman-reporter-htmlextra
```


## 1. Project Structure

The important directories and files are:
1. Test cases data stored as JSON files in the `testdata/` directory.
2. Environment data stored as JSON files in the `environments/` directory.
3. Test and flow logic is stored as YAML files in the `tests/` directory.
4. An HTML report is generated in the `generated/reports/` directory.
5. Postman collection is generated in the `generated/collections/` directory.

The `generated/` and its subfolders (`collections/` and `reports/`) should be ignored by Git.

## 2. YAML File Layout

A YAML file can contain either or both of these root-level sections:

```yaml
tests: // Independent API
flows: // Dependent API
```


Standalone API example-

```yaml
tests:
  - name: Check product
    request:
      method: GET
      path: /product
```


Flow example-

```yaml
flows:
  - name: Login to user profile flow
    enabled: true
    steps:
      - name: Flow - Email Login
        request:
          method: POST
          path: /login
          body:

      - name: Flow - PIN Auth
        request:
          method: POST
          path: /pin-auth
          body:
```

It can also contain an optional custom folder name:

```yaml
folder: Product API Tests
```

A file containing `tests` creates one Postman folder. The folder name is:

1. The value of the root-level `folder` key, when provided.
2. Otherwise, the YAML filename without its extension.


## 3. Request Configuration

Every test or flow step with a request uses these keys:

```yaml
request:
  method: POST
  path: /login
  query: {}
  headers: {}
  body: {}
```

### 3.1 `request.method`

The HTTP method. It is converted to uppercase when the Postman collection is generated.

Supported HTTP methods include the normal API methods such as:

```yaml
method: GET
method: POST
method: PUT
method: PATCH
method: DELETE
```

### 3.2 `request.path`

The API path. This key is required.

```yaml
path: /users
```

Relative paths are combined with the environment variable `baseUrl`:

```text
{{baseUrl}}/users
```

An absolute URL can also be used:

```yaml
path: https://api.example.com/users
```

### 3.3 `request.query`

`query` is a map of query-string names and values.

```yaml
query:
  user_id: "{{userId}}"
  active: true
```

The generated request becomes similar to:

```text
/users?user_id=11&active=true
```

Query values are converted to strings because URL query parameters are text values. Use URL-safe scalar values for query parameters.

### 3.4 `request.headers`

`headers` is a map of HTTP header names and values.

```yaml
headers:
  Authorization: "Bearer {{access_token}}"
  X-Request-Source: flowman
```

Header values are strings. A complete object or array placeholder is serialized as JSON text:

```yaml
headers:
  X-User-Data: "{{userobj}}"
```

If a request has a body and no `Content-Type` header, Flowman automatically adds:

```text
Content-Type: application/json
```

### 3.5 `request.body`

`body` defines the JSON request body. It can contain strings, numbers, booleans, arrays, objects, and variable placeholders.

```yaml
body:
  email: "qa@example.com"
  password: "valid-password"
  remember: true
  attempts: 3
```

Nested JSON is supported:

```yaml
body:
  user:
    name: "QA User"
    roles:
      - tester
      - reviewer
```


The generated request becomes similar to:

```text
"user": { 
  "name": "QA User", 
  "roles": ["tester", "reviewer"]
}
```

### 3.6 `request.formdata`

Use `formdata` for multipart requests and file uploads. Each part requires `key` and uses `type: text` with `value`, or `type: file` with `src`:

```yaml
request:
  method: POST
  path: /documents/upload
  formdata:
    - key: title
      type: text
      value: "{{documentTitle}}"
    - key: document
      type: file
      src: testdata/files/document.pdf
```

Relative file paths are resolved from the project directory; absolute paths are also supported. Do not define both `body` and `formdata` on the same request. Newman/Postman creates the multipart boundary automatically.


## 4. Response Assertions

Assertions are placed under a test or flow step:

```yaml
assertions:
  - type: status
    equals: 200
```

The supported assertion types are `status` and `json`.

### 4.1 Status assertion

Checks the HTTP response status code.

```yaml
- type: status
  equals: 200
```

`equals` should be an HTTP status number, such as `200`, `201`, `400`, `401`, or `404`.

### 4.2 JSON assertion with `equals`

Checks a value in the parsed JSON response.

```yaml
- type: json
  path: success
  equals: true
```

Nested response fields use dot notation:

```yaml
- type: json
  path: user.id
  equals: 1
```

The assertion compares the actual JSON value, so YAML types matter. Use `true` for a boolean, `1` for a number, and a quoted value for a string.

### 4.3 JSON assertion with `exists`

Checks that a response path exists and is not `undefined`.

```yaml
- type: json
  path: user.id
  exists: true
```

### 4.4 JSON assertion with `contains`

Checks that a response value contains another value.

```yaml
- type: json
  path: message
  contains: success
```

This is useful for strings and arrays.

## 5. Response Extraction

Use `extract` after assertions in a flow step to save response values for later steps.

```yaml
extract:
  access_token: token
  user_id: user.id
```

The left side is the collection variable name. The right side is the path in the JSON response.

The extracted value is stored after the response is received. Later flow steps can reference it with `{{variable_name}}`.

```yaml
flows:
  - name: Login flow
    steps:
      - name: Login
        request:
          method: POST
          path: /login
          body:
            email: "qa@example.com"
            password: "valid-password"
        assertions:
          - type: status
            equals: 200
        extract:
          access_token: token

      - name: Get profile
        request:
          method: GET
          path: /profile
          headers:
            Authorization: "Bearer {{access_token}}"
        assertions:
          - type: status
            equals: 200
```

Objects and arrays extracted from a response are stored as JSON and restored as objects or arrays when used in later request bodies or complete header placeholders.


## 6. Response Paths and Arrays

Response paths support dot notation, numeric array indexes, and the symbolic selectors `first` and `last`.

Assume this response:

```json
{
  "users": [
    {
      "id": 10,
      "emails": ["first-user@example.com", "backup-user@example.com"]
    },
    {
      "id": 20,
      "emails": ["second-user@example.com"]
    }
  ]
}
```

### 6.1 Numeric indexes

Use zero-based indexes. The first element is index `0`.

```yaml
extract:
  first_user: users[0]
  second_user: users[1]
```

### 6.2 First and last elements

Use `first` when the array length is unknown and you need the first element. Use `last` for the final element.

```yaml
extract:
  first_user: users[first]
  last_user: users[last]
```

### 6.3 Nested array and object paths

Combine array selectors with dot notation:

```yaml
extract:
  second_user_email: users[1].emails[0]
  first_user_first_email: users[first].emails[0]
  first_user_last_email: users[first].emails[last]
```

### 6.4 Multidimensional arrays

Array selectors can be chained without object fields:

```yaml
extract:
  item_a: users[0][0]
  item_b: users[last][0]
  item_c: users[first][last]
```

All supported examples:

```yaml
users[0]
users[1]
users[first]
users[last]
users[1].emails[1]
users[first].emails[0]
users[first].emails[last]
users[0][0]
users[last][0]
users[first][last]
```

Indexes are zero-based. If a numeric index does not exist, or `first`/`last` is used on a non-array value, extraction returns `undefined` and the extraction assertion fails.


## 7. Variables

Use double braces for a complete variable placeholder:

```yaml
"{{userId}}"
```

Variables can come from two places:

1. Iteration data in `testdata/testdata.json`.
2. Collection variables extracted by an earlier step in the same flow.

### 7.1 Iteration data

`testdata/testdata.json` is an array of JSON rows:

```json
[
  {
    "email": "qa@example.com",
    "password": "valid-password",
    "userId": 11,
    "userobj": {
      "data1": "a",
      "data2": "b"
    }
  },
  {
    "email": "second@example.com",
    "password": "another-password",
    "userId": 22,
    "userobj": {
      "data1": "c",
      "data2": "d"
    }
  }
]
```

Newman runs the collection once for each row when `-d testdata/testdata.json` is supplied.

Use scalar values in requests or assertions:

```yaml
query:
  id: "{{userId}}"

assertions:
  - type: json
    path: product_id
    equals: "{{userId}}"
```


### 7.2 Embedded placeholders

Placeholders can be embedded in a larger string:

```yaml
headers:
  Authorization: "Bearer {{access_token}}"
```

Embedded placeholders are text substitutions. To preserve an object or array as a JSON value, use the placeholder as the complete value rather than embedding it in another string.



## 8 `enabled`

Use `enabled: false` to skip one test or flow. Tests are enabled by default.

```yaml
- name: Temporarily skipped product test
  enabled: false
  request:
    method: GET
    path: /product
```

The supported spelling is `enabled`. The `enable` key is not used.


## 9. `delay`

A step can include a numeric `delay` value in seconds. It is converted to milliseconds in the generated Postman pre-request script.

```yaml
- name: Wait before polling
  delay: 2
  request:
    method: GET
    path: /job/status
```

Use delay only on flow steps where a pause between requests is needed.

## 10. Complete Example

```yaml
folder: User API Tests

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

flows:
  - name: Login and retrieve user
    steps:
      - name: Login
        request:
          method: POST
          path: /login
          body:
            email: "{{email}}"
            password: "{{password}}"
            userdata: "{{userobj}}"
        assertions:
          - type: status
            equals: 200
        extract:
          access_token: token
          user: user
          first_email: user.emails[first]
          last_email: user.emails[last]

      - name: Get user
        request:
          method: GET
          path: /users
          query:
            user_id: "{{userId}}"
          headers:
            Authorization: "Bearer {{access_token}}"
            X-User: "{{user}}"
            X-First-Email: "{{first_email}}"
            X-Last-Email: "{{last_email}}"
        assertions:
          - type: status
            equals: 200
          - type: json
            path: user_id
            equals: "{{userId}}"
```

## 11. Environments


Set the API URL in the selected environment file, for example `environments/dev.json`:

```json
{
  "name": "dev",
  "values": [
    {
      "key": "baseUrl",
      "value": "http://127.0.0.1:8000",
      "enabled": true
    }
  ]
}
```


For an API that uses a different base URL, define another environment value and use it at the start of a request path:

```json
{
  "key": "baseUrlNew",
  "value": "http://127.0.0.1:9988",
  "enabled": true
}
```

```yaml
request:
  method: GET
  path: "{{baseUrlNew}}/product"
```


## 12. Supported Features Summary

Flowman currently supports:

- YAML-defined standalone API tests.
- Ordered multi-request API flows.
- HTTP methods such as GET, POST, PUT, PATCH, and DELETE.
- Relative paths using the environment `baseUrl`.
- Absolute request URLs.
- Query parameters.
- Request headers.
- JSON request bodies with nested objects and arrays.
- Iteration data from `testdata/testdata.json`.
- Scalar, object, and array variable substitution.
- Status-code assertions.
- JSON response assertions using `equals`, `exists`, and `contains`.
- Response extraction into collection variables.
- Nested response paths with dot notation.
- Numeric array indexes.
- `first` and `last` array selectors.
- Extraction from multidimensional arrays.
- Reusing extracted values in later flow steps.
- Custom test folders using the root-level `folder` key.
- Separate Postman folders for named flows.
- Selective execution using `enabled: false`.
- HTML reporting through Newman and `newman-reporter-htmlextra`.

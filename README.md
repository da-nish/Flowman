# Flowman

Flowman runs API tests written in YAML with Postman and Newman.

## How It Works

1. Test definitions are stored in `tests/`.
2. `scripts/inject-tests.js` converts the YAML files into a Postman collection.
3. Newman runs the generated collection.
4. An HTML report is created in `reports/`.

The `collections/` and `reports/` folders are generated and ignored by Git.

## Requirements

- Node.js
- Newman
- A running API to test

Install the dependencies once:

```sh
npm install yaml
npm install -g newman newman-reporter-htmlextra
```

## Configure the API

Edit `environments/dev.json` and set `baseUrl` to your API address:

```json
{
  "key": "baseUrl",
  "value": "http://127.0.0.1:8000",
  "enabled": true
}
```

## Write a Test

Add a YAML file to `tests/`:

```yaml
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

Supported assertion types are:

- `status` with `equals`
- `json` with `exists: true`
- `json` with `equals`
- `json` with `contains`

## Run Iterations

Put test rows in `testdata/testdata.json`:

```json
[
  { "username": "user1", "userId": 11 },
  { "username": "user2", "userId": 22 }
]
```

Use a value as `{{userId}}` in a request or assertion. Newman runs the test once for each row in the JSON file.

## Run the Tests

Make sure the API is running, then run:

```sh
./newman.sh
```

The generated report is:

```text
reports/newman-report.html
```

You can also generate the collection without running Newman:

```sh
node scripts/inject-tests.js
```

## Flows

Use `flows` when requests must run in order. A response value can be saved with `extract` and used by a later step:

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
```

Extracted values become collection variables and can be used in later flow steps.

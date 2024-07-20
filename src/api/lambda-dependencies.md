# Lambda Dependencies
These define the permissions and environment variables an API endpoint's lambda function needs in order to work properly. These should be listed under `x-lambda-dependencies` inside endpoint methods.

## Defined Dependencies:

#### `document-metadata-read`
Attaches a policy to the lambda functions role that allows it to read document metadata in DynamoDB, and puts the table name in an environment variable called `DYNAMO_TABLE`.

#### `document-metadata-write`
Attaches a policy to the lambda functions role that allows it to write document metadata in DynamoDB, and puts the table name in an environment variable called `DYNAMO_TABLE`.

#### `cloudfront-signing`
Grants access to the cloudfront URL signing key as an environment variable named `CLOUDFRONT_PRIVATE_KEY`, and the key group id as `CLOUDFRONT_KEY_GROUP`.

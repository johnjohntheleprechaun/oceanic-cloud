# Lambda Dependencies
These define the permissions and environment variables an API endpoint's lambda function needs in order to work properly. These should be listed under `x-lambda-dependencies` inside endpoint methods.

## Defined Dependencies:

#### `document-metadata-read-policy`
Attaches a policy to the lambda functions role that allows it to read document metadata in DynamoDB.

#### `document-metadata-write-policy`
Attaches a policy to the lambda functions role that allows it to write document metadata in DynamoDB.

#### `cloudfront-signing-key`
Grants access to the cloudfront URL signing key as an environment variable named `CLOUDFRONT_PRIVATE_KEY`.
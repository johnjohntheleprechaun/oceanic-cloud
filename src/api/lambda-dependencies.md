# Lambda Dependencies
These define the permissions and environment variables an API endpoint's lambda function needs in order to work properly. These should be listed under `x-lambda-dependencies` inside endpoint methods.

## Defined Dependencies:

#### `document-metadata-read`
Attaches a policy to the lambda functions role that allows it to read document metadata in DynamoDB, and puts the table name in an environment variable called `DYNAMO_TABLE`.

#### `document-metadata-write`
Attaches a policy to the lambda functions role that allows it to write document metadata in DynamoDB, and puts the table name in an environment variable called `DYNAMO_TABLE`.

#### `s3-signing`
Gives the function's role access to the S3 bucket, so that the urls can be signed with the functions credentials. It also puts the name of the S3 bucket in an environment variable called `S3_BUCKET`.

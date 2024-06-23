# Lambda Roles
These define the permissions an API endpoint's lambda function needs in order to work properly. These should be listed under `x-lambda-roles` inside each endpoint method who's lambda function needs permissions.

## Implemented Roles:
Any roles not defined in this list will be ignored.

#### `document-reader`
Grants read access to document metadata

#### `document-writer`
Grants write access to document metadata

#### `document-signer`
Grants access to the cloudfront URL signing private key as an environment variable named `CLOUDFRONT_PRIVATE_KEY`.This allows the function to grant users access to document content.
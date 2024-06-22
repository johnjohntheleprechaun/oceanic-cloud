# Lambda Roles
These define the permissions an API endpoint's lambda function needs in order to work properly. They're formatted as `{resource}-{subresource}-{read/write}`. If `resource` doesn't require and `subresource`, it can be excluded. These should be listed under `x-lambda-roles` inside each endpoint method who's lambda function needs permissions.

## Implemented Roles:
Any role strings that aren't in this list will be ignored. Roles in the list also don't include the `read/write` ending (which is obviously self-explanatory).

#### `dynamo-document`
- Document metadata stored in DynamoDB

#### `dynamo-user`
- User data stored in DynamoDB
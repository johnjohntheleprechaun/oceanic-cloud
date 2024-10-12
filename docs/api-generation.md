# API definition and generation

The code in `src/cdk/constructs/api.ts` generates an API Gateway construct using the definition file (`src/api/definition.yml`) and the typescript files in `src/api/endpoints/`. Defining lambda functions for endpoints is documented [here](/src/api/lambda-dependencies), but what about how it wraps those functions?

The API Gateway construct is a SpecRestApi, with the api gateway openapi extensions inserted dynamically at build-time.

To add a cognito authorizer, you just create a security scheme where `x-amazon-apigateway-authtype = cognito_user_pools`. Any other values will have to be compatible with the API Gateway spec for cognito authorizers, but the template converter currently does not check for that. Tbf, it's kind of irrelevant since it also only supports the one pool...

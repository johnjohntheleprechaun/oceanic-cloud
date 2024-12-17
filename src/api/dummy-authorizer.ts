import {APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerHandler} from "aws-lambda";

export const handler: APIGatewayTokenAuthorizerHandler = async function (event, context): Promise<APIGatewayAuthorizerResult> {
    return {
        principalId: "dummy",
        policyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "execute-api:Invoke",
                    Effect: "Allow",
                    Resource: event.methodArn,
                },
            ],
        },
        context: {
            sub: "00000000-0000-0000-0000-000000000000",
        },
    };
}

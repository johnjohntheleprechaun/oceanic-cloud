import { APIGatewayAuthorizerEvent, APIGatewayAuthorizerHandler, APIGatewayAuthorizerResult, Context } from "aws-lambda";

export const handler: APIGatewayAuthorizerHandler = async (event: APIGatewayAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    console.log(event);
    return {
        principalId: "user",

        policyDocument: {
            Version: "2012-10-17",
            Statement: [{
                Action: "execute-api:Invoke",
                Effect: "Allow",
                Resource: "arn:aws:execute-api:us-west-2:{accountId}:npcy6nlua7/*"
            }]
        }
    }
}
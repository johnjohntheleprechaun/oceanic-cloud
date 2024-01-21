import { APIGatewayTokenAuthorizerHandler } from "aws-lambda";

const arnParser = /^arn:aws:execute-api:[^:]+:[^:]+:[^/]+\/[^/]+/

export const handler: APIGatewayTokenAuthorizerHandler = async (event) => {
    const resourceBase = arnParser.exec(event.methodArn);
    return {
        principalId: "user",

        policyDocument: {
            Version: "2012-10-17",
            Statement: [{
                Action: "execute-api:Invoke",
                Effect: "Allow",
                Resource: `${resourceBase?.[0]}/GET/*` // Just allow full access for now
            }]
        }
    }
}
import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { APIGatewayEventDefaultAuthorizerContext, APIGatewayProxyCognitoAuthorizer, APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";

const tokenRegex = /^(Bearer )?(.+)$/;

const headers = {
    "Access-Control-Allow-Origin": "*"
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.headers["Authorization"]) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "No authorization header present" })
        };
    }
    // extract the actual token
    const tokenMatch = event.headers["Authorization"].match(tokenRegex);
    if (!tokenMatch) {
        return {
            statusCode: 500,
            headers,
            body: "I did an oopsy with the token parsing"
        };
    }
    const tokenData = tokenMatch[2];
    
    const client = new CognitoIdentityClient({ region: process.env["AWS_REGION"] });
    const getIdCommand = new GetIdCommand({
        IdentityPoolId: process.env["IDENTITY_POOL_ID"],
        Logins: {
            [process.env["USER_POOL_PROVIDER_NAME"] as string]: tokenData
        }
    });
    const identityId = await client.send(getIdCommand).then(resp => resp.IdentityId as string);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ id: identityId })
    }
};
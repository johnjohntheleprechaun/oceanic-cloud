import { GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(event)
    }
};
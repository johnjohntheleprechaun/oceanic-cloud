import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
    return {
        statusCode: 200,
        body: "login attempt made"
    }
}
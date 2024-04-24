import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            tableName: process.env.DYNAMO_TABLE,
            bucketName: process.env.BUCKET
        })
    };
};
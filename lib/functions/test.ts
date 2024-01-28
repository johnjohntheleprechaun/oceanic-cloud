import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            tableName: process.env.DYNAMO_TABLE,
            s3Bucket: process.env.BUCKET
        })
    }
};
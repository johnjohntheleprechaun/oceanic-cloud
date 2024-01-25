import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
    console.log("table name:", process.env.DYNAMO_TABLE);
    console.log("table ARN:", process.env.DYNAMO_ARN);
    return {
        statusCode: 200,
        body: JSON.stringify({
            tableName: process.env.DYNAMO_TABLE,
            tableARN: process.env.DYNAMO_ARN
        })
    }
};
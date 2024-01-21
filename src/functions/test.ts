import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";

export const handler = async (): Promise<APIGatewayProxyResult> => {
    const client = new S3Client({});
    const command = new ListBucketsCommand({});
    const resp = await client.send(command);
    return {
        statusCode: 200,
        body: JSON.stringify(resp.Buckets)
    }
};
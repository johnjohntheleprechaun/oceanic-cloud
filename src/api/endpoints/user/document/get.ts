import { AttributeValue, DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DocumentInfo, DocumentAccess } from "../../types/dynamo-types";
import { signDocumentUrls } from "../../utils/signer";

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (
        !event.requestContext.authorizer || !event.requestContext.authorizer.claims.sub ||
        !event.pathParameters || !event.pathParameters.userId || !event.pathParameters.documentId
    ) {
        return {
            statusCode: 500,
            body: ""
        }
    }
    const sub = event.requestContext.authorizer.claims.sub as string;
    const documentId = event.pathParameters.documentId;
    const userId = event.pathParameters.userId;

    // get the document info
    const dynamoClient = new DynamoDBClient();
    const getDocumentCommand = new GetItemCommand({
        TableName: process.env.DATABASE_NAME,
        Key: {
            user: { S: userId },
            id: { S: `document:${documentId}`}
        }
    });
    const resp = await dynamoClient.send(getDocumentCommand);
    const documentInfo = unmarshall(resp.Item as Record<string, AttributeValue>) as DocumentInfo;

    if (userId === sub || documentInfo.authorizedUsers.find(a => a.user === sub)) {
        // congrats you have access, now sign all the URLs
        const permissions: DocumentAccess = userId === sub ? { read: true, write: true } : documentInfo.authorizedUsers.find(a => a.user === sub)?.permissions as DocumentAccess;
        const signedUrls = signDocumentUrls(documentInfo, permissions);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                document: documentInfo,
                signedUrls: signedUrls
            })
        };
    }
    else {
        return {
            statusCode: 403,
            body: ""
        };
    }
};
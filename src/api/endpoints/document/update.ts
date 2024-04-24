import { AttributeValue, DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from "aws-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DocumentInfo, DocumentAccess } from "../../types/dynamo-types";
import { signDocumentUrls } from "../../utils/signer";

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (
        !event.requestContext.authorizer || !event.requestContext.authorizer.claims.sub ||
        !event.pathParameters || !event.pathParameters.userId || !event.pathParameters.documentId ||
        !event.body
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
    if (!resp.Item && sub === userId) {
        // create it
        const newDocument = JSON.parse(event.body);
        newDocument.user = userId;
        newDocument.id = `document:${documentId}`;
        const putDocumentCommand = new PutItemCommand({
            TableName: process.env.DATABASE_NAME,
            Item: marshall(newDocument)
        });
        await dynamoClient.send(putDocumentCommand);

        return {
            statusCode: 201, // new item created, as per the spec for PUT requests
            body: ""
        }
    }
    else if (!resp.Item) {
        // doesn't exist and you aren't the owner
        return {
            statusCode: 404,
            body: ""
        }
    }

    const documentInfo = unmarshall(resp.Item as Record<string, AttributeValue>) as DocumentInfo;

    const authorizedUser = documentInfo.authorizedUsers.find(a => a.user === sub);
    if (userId === sub || (authorizedUser && authorizedUser.permissions.write)) {
        // congrats you have access
        return {
            statusCode: 200,
            body: ""
        }
    }
    else {
        return {
            statusCode: 403,
            body: ""
        };
    }
};
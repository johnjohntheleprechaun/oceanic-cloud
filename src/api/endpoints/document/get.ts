import {DynamoDBClient, GetItemCommand} from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context} from "aws-lambda";
import {unmarshall} from "@aws-sdk/util-dynamodb";
import {DocumentInfo} from "../../schema-types/document";
import {signAttachments, signUrls} from "../../utils/signer";
import {ProxyEvent} from "../../utils/proxy-event";

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (
        !event.pathParameters || !event.pathParameters.user || !event.pathParameters.document
    ) {
        return {
            statusCode: 500,
            body: "some shit broken"
        }
    }
    const sub = ProxyEvent.getUserId(event);
    const documentId = event.pathParameters.document;
    const userId = event.pathParameters.user === "me" ? sub : event.pathParameters.user; // I know this seems redundant, but it's here because in the future document sharing will be allowed (hopefully....)

    // get the document info
    const dynamoClient = new DynamoDBClient();
    const getDocumentCommand = new GetItemCommand({
        TableName: process.env.DYNAMO_TABLE,
        Key: {
            dataTypeUser: {S: `documents:${userId}`},
            id: {S: documentId}
        }
    });
    const resp = await dynamoClient.send(getDocumentCommand) as Record<string, any>;
    const documentInfo = unmarshall(resp.Item) as any;

    if (userId === sub) {
        // congrats you have access!
        const response: DocumentInfo = {
            owner: sub,
            id: documentId,
            ...documentInfo.title && {title: documentInfo.title.toString("base64")},
            type: documentInfo.type,
            created: documentInfo.created,
            updated: documentInfo.updated,
            documentKey: documentInfo.documentKey.toString("base64"),
            signedUrls: await signUrls({owner: sub, document: documentId, canWrite: true}),
            ...documentInfo.attachments && {
                attachments: await signAttachments(sub, documentId, documentInfo.attachments, false)
            },
            ...documentInfo.authorizedUsers && {authorizedUsers: documentInfo.authorizedUsers},
        }

        return {
            statusCode: 200,
            body: JSON.stringify(response),
        };
    }
    else {
        return {
            statusCode: 403,
            body: "unauthorized",
        };
    }
};

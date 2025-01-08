import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context} from "aws-lambda";
import {DocumentCreateRequest} from "../../schema-types/document-create";
import {ConditionalCheckFailedException, PutItemCommand} from "@aws-sdk/client-dynamodb";
import {marshall} from "@aws-sdk/util-dynamodb";
import {DocumentInfo} from "../../schema-types/document";
import {signUrls} from "../../utils/signer";
import {putItemWithSchema} from "../../utils/dynamo";
import {ProxyEvent} from "../../utils/proxy-event";
import dynamoDocumentSchema from "../../compiled-schemas/dynamodb/document.json";

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const document: DocumentCreateRequest = JSON.parse(event.body || "{}");
    console.log(document);
    if (!event.pathParameters || !event.pathParameters.user) {
        return {
            statusCode: 500,
            body: "path parameter setup is fucked",
        }
    }

    // set up vars for stuff :3
    //assert(event.requestContext.authorizer);
    const userId: string = ProxyEvent.getUserId(event);
    if (event.pathParameters.user !== "me" && event.pathParameters.user !== userId) {
        return {
            statusCode: 403,
            body: "you can't create a document for someone else silly goose :p",
        }
    }
    const documentId: string = document.id ? document.id : crypto.randomUUID(); // someone should implement a check to verify that body.id is a valid uuid (technically doesn't matter but I wanna do it anyway)

    const timeNow = Date.now();
    const newDocument = {
        dataTypeUser: `documents:${userId}`,
        id: documentId,
        ...document.title && {title: Buffer.from(document.title, "base64")},
        documentType: document.type,
        documentCreated: document.created ? document.created : timeNow,
        documentUpdated: document.updated ? document.updated : timeNow,
        documentKey: Buffer.from(document.documentKey, "base64"),
        ...document.attachments && {attachments: document.attachments},
        ...document.authorizedUsers && {authorizedUsers: document.authorizedUsers},
    };
    console.log(newDocument)
    // add the document to dynamodb
    const putCommand = new PutItemCommand({
        TableName: process.env["DYNAMO_TABLE"],
        Item: marshall(newDocument),
        ConditionExpression: "attribute_not_exists(id)",
    });
    try {
        await putItemWithSchema(putCommand, dynamoDocumentSchema)
    }
    catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            return {
                statusCode: 409, // conflict
                body: "A document with that ID already exists",
            }
        }
        else {
            return {
                statusCode: 504,
                body: "Internal Server Error",
            }
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            owner: userId,
            id: newDocument.id,
            title: newDocument.title?.toString("base64"),
            type: newDocument.type,
            created: newDocument.created,
            updated: newDocument.updated,
            documentKey: newDocument.documentKey.toString("base64"),
            signedUrls: await signUrls({owner: userId, document: newDocument.id, canWrite: true}),
            attachments: newDocument.attachments?.map(attachment => signUrls({owner: userId, document: newDocument.id, attachment: attachment.id, canWrite: true})),
            authorizedUsers: newDocument.authorizedUsers?.map(user => user.id),
        } as DocumentInfo),
    };
}

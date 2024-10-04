import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context} from "aws-lambda";
import documentCreateSchema from "../../compiled-schemas/document-create.json";
import Ajv from "ajv";
import {DocumentCreateRequest} from "../../schema-types/document-create";
import {ConditionalCheckFailedException, DynamoDBClient, PutItemCommand} from "@aws-sdk/client-dynamodb";
import assert from "assert";
import {marshall} from "@aws-sdk/util-dynamodb";
import addFormats from "ajv-formats";
import {DocumentInfo} from "../../schema-types/document";
import {signUrls} from "../../utils/signer";

const ajv = new Ajv();
addFormats(ajv);
const verifier = ajv.compile(documentCreateSchema);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const document: DocumentCreateRequest = JSON.parse(event.body || "{}");
    if (!verifier(document)) {
        return {
            statusCode: 400,
            body: "request does not match the schema",
        };
    }
    if (!event.pathParameters || !event.pathParameters.user) {
        return {
            statusCode: 500,
            body: "path parameter setup is fucked",
        }
    }

    // set up vars for stuff :3
    const dynamoClient = new DynamoDBClient();
    assert(event.requestContext.authorizer);
    const userId: string = event.requestContext.authorizer.claims.sub;
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
        type: document.type,
        created: document.created ? document.created : timeNow,
        updated: document.updated ? document.updated : timeNow,
        documentKey: Buffer.from(document.documentKey, "base64"),
        ...document.attachments && {attachments: document.attachments},
        ...document.authorizedUsers && {authorizedUsers: document.authorizedUsers},
    };
    // add the document to dynamodb
    const putCommand = new PutItemCommand({
        TableName: process.env["DYNAMO_TABLE"],
        Item: marshall(newDocument),
        ConditionExpression: "attribute_not_exists(id)",
    });
    try {
        const resp = await dynamoClient.send(putCommand);
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

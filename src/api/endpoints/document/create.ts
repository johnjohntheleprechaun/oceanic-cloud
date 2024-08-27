import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context} from "aws-lambda";
import documentCreateSchema from "../../compiled-schemas/document-create.json";
import Ajv from "ajv";
import {DocumentCreate} from "../../schema-types/document-create";
import {ConditionalCheckFailedException, DynamoDBClient, PutItemCommand} from "@aws-sdk/client-dynamodb";
import assert from "assert";
import {marshall} from "@aws-sdk/util-dynamodb";
import addFormats from "ajv-formats";

const ajv = new Ajv();
addFormats(ajv);
const verifier = ajv.compile(documentCreateSchema);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const document: DocumentCreate = JSON.parse(event.body || "{}");
    if (!verifier(document)) {
        return {
            statusCode: 400,
            body: "request does not match the schema",
        };
    }

    // set up vars for stuff :3
    const dynamoClient = new DynamoDBClient();
    assert(event.requestContext.authorizer);
    const userId: string = event.requestContext.authorizer.claims.sub;
    const documentId: string = document.id ? document.id : crypto.randomUUID(); // should implement a check to verify that body.id is a valid uuid (technically doesn't matter but I wanna do it anyway)

    // add the document to dynamodb
    const putCommand = new PutItemCommand({
        TableName: process.env["DYNAMO_TABLE"],
        Item: marshall({
            dataTypeUser: `documents:${userId}`,
            id: documentId,
            ...document.title && {title: Buffer.from(document.title, "base64")},
            type: document.type,
            created: document.created ? document.created : Date.now(),
            updated: document.updated ? document.updated : Date.now(),
            documentKey: Buffer.from(document.documentKey, "base64"),
            ...document.attachments && {attachments: document.attachments},
            ...document.authorizedUsers && {authorizedUsers: document.authorizedUsers},
        }),
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
        body: JSON.stringify({}),
    };
}

import {DynamoDBClient, GetItemCommand, GetItemCommandOutput, PutItemCommand, PutItemCommandOutput} from "@aws-sdk/client-dynamodb";
import {unmarshall} from "@aws-sdk/util-dynamodb";
import addFormats from "ajv-formats";
import Ajv from "ajv";

const ajv = new Ajv();
addFormats(ajv);
ajv.addKeyword({
    keyword: "isBuffer",
    schema: false,
    validate: (data: any) => Buffer.isBuffer(data),
    errors: false,
});

export async function getItemWithSchema(command: GetItemCommand, schema: object, client?: DynamoDBClient): Promise<object> {
    if (!client) {
        client = new DynamoDBClient();
    }
    const resp = await client.send(command);
    if (!resp.Item) {
        // undefined error
        console.log("balls")
        return {};
    }
    const item = unmarshall(resp.Item);

    if (ajv.validate(schema, item)) {
        return item;
    }
    else {
        console.log("bad schema")
        throw new Error();
    }
}

export async function putItemWithSchema(command: PutItemCommand, schema: object, client?: DynamoDBClient): Promise<PutItemCommandOutput> {
    if (!client) {
        client = new DynamoDBClient();
    }
    if (!command.input.Item) {
        // error
        console.log("bad d no itme")
        throw new Error();
    }
    const item = unmarshall(command.input.Item);

    if (ajv.validate(schema, item)) {
        return client.send(command);
    }
    else {
        console.log("no match schema")
        throw new Error();
    }
}

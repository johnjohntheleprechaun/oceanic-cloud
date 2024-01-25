import { AttributeValue, DynamoDBClient, GetItemCommand, ItemResponse, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb"

export async function getUser(uuid: string): Promise<UserIdentity> {
    const dynamo = new DynamoDBClient();
    const command = new GetItemCommand({
        TableName: process.env.DYNAMO_TABLE,
        Key: {
            "user": { "S": uuid },
            "dataType": { "S": "identity" }
        }
    });
    const response = await dynamo.send(command);
    if (response.Item) {
        return UserIdentity.fromDynamo(response.Item);
    }
    else {
        throw new NoSuchUserError(uuid);
    }
}

export async function createUser(username: string, passwordHash: string, publicKey: string, privateKey: string): Promise<UserIdentity> {
    const user = new UserIdentity(crypto.randomUUID(), username, passwordHash, publicKey, privateKey);
    const dynamo = new DynamoDBClient();
    console.log(process.env);
    const command = new PutItemCommand({
        TableName: process.env.DYNAMO_TABLE,
        Item: user.toDynamoItem()
    });
    await dynamo.send(command);
    return user;
}


export class UserIdentity {
    uuid: string
    username: string
    passwordHash: string
    passwordSalt: string
    publicKey: string
    privateKey: string

    constructor (uuid: string, username: string, passwordHash: string, publicKey: string, privateKey: string) {
        this.uuid = uuid;
        this.username = username;
        this.passwordHash = passwordHash;
        this.publicKey = publicKey;
        this.privateKey = privateKey;
    }

    static fromDynamo(dynamoItem: Record<string, AttributeValue>) {
        return new UserIdentity(
            dynamoItem.uuid.S as string,
            dynamoItem.username.S as string,
            dynamoItem.passwordHash.S as string,
            dynamoItem.publicKey.S as string,
            dynamoItem.privateKey.S as string
        )
    }

    public toDynamoItem(): Record<string, AttributeValue> {
        return {
            user: { "S": this.uuid },
            dataType: { "S": "identity" },
            username: { "S": this.username },
            passwordHash: { "S": this.passwordHash },
            publicKey: { "S": this.publicKey },
            privateKey: { "S": this.privateKey }
        }
    }
}

class NoSuchUserError extends Error {
    constructor (uuid: string) {
        super(`User ${uuid} doesn't exist`);
    }
}
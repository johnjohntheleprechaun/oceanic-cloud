import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context} from "aws-lambda";
import documentCreateSchema from "../../compiled-schemas/document-create.json";
import Ajv from "ajv";

const verifier = new Ajv().compile(documentCreateSchema);

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const body = JSON.parse(event.body || "{}");

    if (!verifier(body)) {
        return {
            statusCode: 400,
            body: "",
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify(documentCreateSchema)
    };
}
